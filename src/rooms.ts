import { randomUUID } from 'crypto';
import { Player, Room } from './types';

const rooms = new Map<string, Room>();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_COLORS = ['#FF5D8F', '#4CC9FF', '#FFB84C', '#3BD671', '#B18CFF', '#FF8A5B'];

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

function colorForIndex(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export function createRoom(playerName: string): { room: Room; player: Player } {
  const player: Player = {
    id: randomUUID(),
    socketId: null,
    name: playerName,
    connected: true,
    isHost: true,
    score: 0,
    color: colorForIndex(0),
  };

  const room: Room = {
    code: generateRoomCode(),
    players: new Map([[player.id, player]]),
    playerOrder: [player.id],
    status: 'lobby',
    hostId: player.id,
    game: null,
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
    score: 0,
    color: colorForIndex(room.playerOrder.length),
  };

  room.players.set(player.id, player);
  room.playerOrder.push(player.id);

  return player;
}

export function reconnectPlayer(room: Room, playerId: string): Player | undefined {
  const player = room.players.get(playerId);
  if (!player) return undefined;
  player.connected = true;
  return player;
}

export function getPlayerList(room: Room): Player[] {
  return room.playerOrder
    .map((id) => room.players.get(id))
    .filter((p): p is Player => Boolean(p));
}

export function removePlayerFromRoom(room: Room, playerId: string): void {
  room.players.delete(playerId);
  room.playerOrder = room.playerOrder.filter((id) => id !== playerId);

  if (room.hostId === playerId && room.playerOrder.length > 0) {
    const newHostId = room.playerOrder[0];
    room.hostId = newHostId;
    const newHost = room.players.get(newHostId);
    if (newHost) newHost.isHost = true;
  }

  if (room.playerOrder.length === 0) {
    rooms.delete(room.code);
  }
}