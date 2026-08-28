import { GameState } from './types';

export function createGameState(gridWidth: number, gridHeight: number, turnOrder: string[]): GameState {
  const boxOwners: (string | null)[][] = Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => null)
  );

  return {
    gridWidth,
    gridHeight,
    horizontalLines: [],
    verticalLines: [],
    boxOwners,
    turnOrder,
    currentTurnIndex: 0,
    totalBoxes: gridWidth * gridHeight,
    boxesFilled: 0,
  };
}