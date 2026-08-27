export interface Player {
  id: string;
  socketId: string | null;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface Room {
  code: string;
  players: Map<string, Player>;
  playerOrder: string[];
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
}