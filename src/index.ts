import { createServer } from 'http';
import { Server } from 'socket.io';
import { createRoom, getRoom, addPlayerToRoom, reconnectPlayer, getPlayerList } from './rooms';

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
});

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

      // Reconnect path: this playerId already belongs to the room.
      if (payload.playerId && room.players.has(payload.playerId)) {
        const player = reconnectPlayer(room, payload.playerId)!;
        player.socketId = socket.id;

        socket.join(room.code);
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
      socket.to(room.code).emit('player_joined', { player });

      ack({
        ok: true,
        playerId: player.id,
        players: getPlayerList(room),
      });
    }
  );

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});