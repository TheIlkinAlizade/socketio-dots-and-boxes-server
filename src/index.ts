import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  reconnectPlayer,
  markPlayerDisconnected,
  getPlayerList,
  removePlayerFromRoom,
  resetPlayersForRematch,
} from './rooms';
import { createGameState, applyMove, removePlayerFromTurnOrder } from './game';
import { Room } from './types';

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const RECONNECT_GRACE_MS = 30_000;

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: CLIENT_URL } });

const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function timerKey(roomCode: string, playerId: string) {
  return `${roomCode}:${playerId}`;
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
function clearDisconnectTimer(roomCode: string, playerId: string) {
  const key = timerKey(roomCode, playerId);
  const timer = disconnectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(key);
  }
}

function determineWinnerId(room: Room): string | null {
  const active = getPlayerList(room).filter((p) => !p.resigned);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0].id;

  const topScore = Math.max(...active.map((p) => p.score));
  const topScorers = active.filter((p) => p.score === topScore);
  return topScorers.length === 1 ? topScorers[0].id : null;
}

function emitGameOver(room: Room) {
  io.to(room.code).emit('game_over', {
    scores: getPlayerList(room).map((p) => ({ id: p.id, score: p.score })),
    winnerId: determineWinnerId(room),
  });
}

function removePlayerAndHandleEffects(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  if (!room) return;

  if (room.status === 'playing' && room.game) {
    const wasCurrentTurn = room.game.turnOrder[room.game.currentTurnIndex] === playerId;
    removePlayerFromTurnOrder(room.game, playerId);
    if (room.game.turnOrder.length < 2) {
      room.status = 'finished';
      emitGameOver(room);
    } else if (wasCurrentTurn) {
      io.to(room.code).emit('turn_skipped', { skippedPlayerId: playerId, currentTurnIndex: room.game.currentTurnIndex });
    }
  }

  removePlayerFromRoom(room, playerId);
  clearDisconnectTimer(roomCode, playerId);
  io.to(roomCode).emit('player_left', { playerId });

  const stillExists = getRoom(roomCode);
  if (!stillExists) return;

  const connectedCount = stillExists.playerOrder.filter((id) => stillExists.players.get(id)?.connected).length;
  if (connectedCount <= 1 && stillExists.status !== 'lobby') {
    stillExists.status = 'lobby';
    stillExists.game = null;
    io.to(stillExists.code).emit('room_back_to_lobby', { players: getPlayerList(stillExists) });
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_room', (payload: { playerName: string }, ack: (res: any) => void) => {
    const name = payload.playerName?.trim();
    if (!name) return ack({ ok: false, error: 'Name is required.' });

    const { room, player } = createRoom(name);
    player.socketId = socket.id;
    socket.join(room.code);
    socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });

    ack({ ok: true, roomCode: room.code, playerId: player.id, players: getPlayerList(room) });
  });

  socket.on(
    'join_room',
    (payload: { roomCode: string; playerName: string; playerId?: string | null }, ack: (res: any) => void) => {
      const room = getRoom(payload.roomCode);
      if (!room) return ack({ ok: false, error: 'Room not found.' });

      if (payload.playerId && room.players.has(payload.playerId)) {
        const player = reconnectPlayer(room, payload.playerId)!;
        player.socketId = socket.id;
        clearDisconnectTimer(room.code, player.id);

        socket.join(room.code);
        socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
        socket.to(room.code).emit('player_reconnected', { playerId: player.id });

        return ack({ ok: true, playerId: player.id, players: getPlayerList(room), game: room.game, status: room.status });
      }

      if (room.status !== 'lobby') return ack({ ok: false, error: 'Game already in progress.' });

      const name = payload.playerName?.trim();
      if (!name) return ack({ ok: false, error: 'Name is required.' });

      const player = addPlayerToRoom(room, name);
      player.socketId = socket.id;
      socket.join(room.code);
      socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
      socket.to(room.code).emit('player_joined', { player });

      ack({ ok: true, playerId: player.id, players: getPlayerList(room) });
    }
  );

  socket.on('leave_room', () => {
    const link = socketToPlayer.get(socket.id);
    if (!link) return;
    socketToPlayer.delete(socket.id);
    socket.leave(link.roomCode);
    removePlayerAndHandleEffects(link.roomCode, link.playerId);
  });

  socket.on('kick_player', (payload: { playerId: string }, ack: (res: any) => void) => {
    const link = socketToPlayer.get(socket.id);
    if (!link) return ack({ ok: false, error: 'Not in a room.' });

    const room = getRoom(link.roomCode);
    if (!room) return ack({ ok: false, error: 'Room not found.' });
    if (room.hostId !== link.playerId) return ack({ ok: false, error: 'Only the host can kick players.' });
    if (payload.playerId === link.playerId) return ack({ ok: false, error: "You can't kick yourself." });

    const target = room.players.get(payload.playerId);
    if (!target) return ack({ ok: false, error: 'Player not found.' });

    if (target.socketId) {
      io.to(target.socketId).emit('kicked');
      io.sockets.sockets.get(target.socketId)?.leave(room.code);
      socketToPlayer.delete(target.socketId);
    }

    removePlayerAndHandleEffects(room.code, target.id);
    ack({ ok: true });
  });

  socket.on('resign', (_payload: unknown, ack: (res: any) => void) => {
    const link = socketToPlayer.get(socket.id);
    if (!link) return ack({ ok: false, error: 'Not in a room.' });

    const room = getRoom(link.roomCode);
    if (!room || !room.game || room.status !== 'playing') return ack({ ok: false, error: 'No game in progress.' });

    const player = room.players.get(link.playerId);
    if (!player) return ack({ ok: false, error: 'Player not found.' });
    if (player.resigned) return ack({ ok: false, error: 'Already resigned.' });

    player.resigned = true;
    const wasCurrentTurn = room.game.turnOrder[room.game.currentTurnIndex] === link.playerId;
    removePlayerFromTurnOrder(room.game, link.playerId);

    io.to(room.code).emit('player_resigned', { playerId: link.playerId });

    if (room.game.turnOrder.length < 2) {
      room.status = 'finished';
      emitGameOver(room);
    } else if (wasCurrentTurn) {
      io.to(room.code).emit('turn_skipped', { skippedPlayerId: link.playerId, currentTurnIndex: room.game.currentTurnIndex });
    }

    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const link = socketToPlayer.get(socket.id);
    socketToPlayer.delete(socket.id);
    if (!link) return;

    const room = getRoom(link.roomCode);
    if (!room) return;

    markPlayerDisconnected(room, link.playerId);
    io.to(room.code).emit('player_disconnected', { playerId: link.playerId });

    const key = timerKey(room.code, link.playerId);
    const timer = setTimeout(() => {
      disconnectTimers.delete(key);
      const stillRoom = getRoom(link.roomCode);
      const stillPlayer = stillRoom?.players.get(link.playerId);
      if (!stillPlayer || stillPlayer.connected) return;
      removePlayerAndHandleEffects(link.roomCode, link.playerId);
    }, RECONNECT_GRACE_MS);
    disconnectTimers.set(key, timer);
  });

  socket.on('start_game', (payload: { gridWidth?: number; gridHeight?: number }, ack: (res: any) => void) => {
    const link = socketToPlayer.get(socket.id);
    if (!link) return ack({ ok: false, error: 'Not in a room.' });

    const room = getRoom(link.roomCode);
    if (!room) return ack({ ok: false, error: 'Room not found.' });
    if (room.hostId !== link.playerId) return ack({ ok: false, error: 'Only the host can start the game.' });

    const connectedPlayers = room.playerOrder.filter((id) => room.players.get(id)?.connected);
    if (connectedPlayers.length < 2) return ack({ ok: false, error: 'Need at least 2 players.' });

    const width = clamp(payload.gridWidth ?? 5, 3, 9);
    const height = clamp(payload.gridHeight ?? 5, 3, 9);

    room.status = 'playing';
    room.game = createGameState(width, height, connectedPlayers);
    io.to(room.code).emit('game_started', { game: room.game });
    ack({ ok: true });
  });

  socket.on('play_again', (_payload: unknown, ack: (res: any) => void) => {
    const link = socketToPlayer.get(socket.id);
    if (!link) return ack({ ok: false, error: 'Not in a room.' });

    const room = getRoom(link.roomCode);
    if (!room) return ack({ ok: false, error: 'Room not found.' });
    if (room.hostId !== link.playerId) return ack({ ok: false, error: 'Only the host can reset the room.' });

    resetPlayersForRematch(room);
    room.status = 'lobby';
    room.game = null;

    io.to(room.code).emit('room_back_to_lobby', { players: getPlayerList(room) });
    ack({ ok: true });
  });

  socket.on(
    'make_move',
    (payload: { line: { row: number; col: number; orientation: 'horizontal' | 'vertical' } }, ack: (res: any) => void) => {
      const link = socketToPlayer.get(socket.id);
      if (!link) return ack({ ok: false, error: 'Not in a room.' });

      const room = getRoom(link.roomCode);
      if (!room || !room.game || room.status !== 'playing') return ack({ ok: false, error: 'No game in progress.' });

      const { row, col, orientation } = payload.line || {};
      const result = applyMove(room.game, link.playerId, row, col, orientation);
      if (!result.ok) return ack({ ok: false, error: result.error });

      for (const box of result.completedBoxes) {
        const player = room.players.get(box.ownerId);
        if (player) player.score += 1;
      }
      if (room.game.boxesFilled === room.game.totalBoxes) room.status = 'finished';

      io.to(room.code).emit('move_made', {
        line: payload.line,
        drawnBy: link.playerId,
        completedBoxes: result.completedBoxes,
        currentTurnIndex: room.game.currentTurnIndex,
        boxesFilled: room.game.boxesFilled,
        scores: getPlayerList(room).map((p) => ({ id: p.id, score: p.score })),
      });

      if (room.status === 'finished') emitGameOver(room);

      ack({ ok: true });
    }
  );
});

httpServer.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});