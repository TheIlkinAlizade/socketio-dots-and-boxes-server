import { createServer } from 'http';
import { Server } from 'socket.io';
import { addPlayerToRoom, createRoom, getRoom } from './rooms';

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

    ack({ ok: true, roomCode: room.code, playerId: player.id });
  });

  socket.on('join_room', (payload: { roomCode: string; playerName: string }, ack: (res: any) => void) => {
    const room = getRoom(payload.roomCode);

    if (!room) {
      return ack({ ok: false, error: 'Room not found.' });
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

    ack({ ok: true, playerId: player.id });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});