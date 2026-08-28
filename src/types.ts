export interface Player {
  id: string;
  socketId: string | null;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  color: string;
}

export interface GameState {
  gridWidth: number;
  gridHeight: number;
  horizontalLines: string[];
  verticalLines: string[];
  boxOwners: (string | null)[][];
  turnOrder: string[];
  currentTurnIndex: number;
  totalBoxes: number;
  boxesFilled: number;
}

export interface Room {
  code: string;
  players: Map<string, Player>;
  playerOrder: string[];
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
  game: GameState | null;
}