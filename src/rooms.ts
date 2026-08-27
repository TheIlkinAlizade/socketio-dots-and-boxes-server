import { randomUUID } from 'crypto';
import { Player, Room } from './types';

const rooms = new Map<string, Room>();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: 5 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(playerName: string): { room: Room; player: Player } {
  const player: Player = {
    id: randomUUID(),
    socketId: null,
    name: playerName,
    connected: true,
    isHost: true,
  };

  const room: Room = {
    code: generateRoomCode(),
    players: new Map([[player.id, player]]),
    playerOrder: [player.id],
    status: 'lobby',
    hostId: player.id,
  };

  rooms.set(room.code, room);
  return { room, player };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function addPlayerToRoom(room: Room, playerName: string): Player {
  const player: Player = {
    id: randomUUID(),
    socketId: null,
    name: playerName,
    connected: true,
    isHost: false,
  };

  room.players.set(player.id, player);
  room.playerOrder.push(player.id);

  return player;
}