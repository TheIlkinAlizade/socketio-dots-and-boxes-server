import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  reconnectPlayer,
  getPlayerList,
  removePlayerFromRoom,
} from './rooms';

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
});

const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_room', (payload: { playerName: string }, ack: (res: any) => void) => {
    const name = payload.playerName?.trim();
    if (!name) {
      return ack({ ok: false, error: 'Name is required.' });
    }

    const { room, player } = createRoom(name);
    player.socketId = socket.id;

    socket.join(room.code);
    socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });

    ack({
      ok: true,
      roomCode: room.code,
      playerId: player.id,
      players: getPlayerList(room),
    });
  });

  socket.on(
    'join_room',
    (
      payload: { roomCode: string; playerName: string; playerId?: string | null },
      ack: (res: any) => void
    ) => {
      const room = getRoom(payload.roomCode);
      if (!room) {
        return ack({ ok: false, error: 'Room not found.' });
      }

      if (payload.playerId && room.players.has(payload.playerId)) {
        const player = reconnectPlayer(room, payload.playerId)!;
        player.socketId = socket.id;

        socket.join(room.code);
        socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
        socket.to(room.code).emit('player_reconnected', { playerId: player.id });

        return ack({
          ok: true,
          playerId: player.id,
          players: getPlayerList(room),
        });
      }

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Game already in progress.' });
      }

      const name = payload.playerName?.trim();
      if (!name) {
        return ack({ ok: false, error: 'Name is required.' });
      }

      const player = addPlayerToRoom(room, name);
      player.socketId = socket.id;

      socket.join(room.code);
      socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
      socket.to(room.code).emit('player_joined', { player });

      ack({
        ok: true,
        playerId: player.id,
        players: getPlayerList(room),
      });
    }
  );

  socket.on('leave_room', () => {
    handleLeave(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    handleLeave(socket.id);
  });

  socket.on('start_game', (_payload: unknown, ack: (res: any) => void) => {
    ack({ ok: false, error: 'Not implemented yet.' });
  });

  function handleLeave(socketId: string) {
    const link = socketToPlayer.get(socketId);
    if (!link) return;

    const room = getRoom(link.roomCode);
    socketToPlayer.delete(socketId);
    if (!room) return;

    removePlayerFromRoom(room, link.playerId);
    socket.leave(room.code);
    io.to(room.code).emit('player_left', { playerId: link.playerId });
  }
});

httpServer.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});