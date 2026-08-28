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

interface MoveResult {
  ok: true;
  completedBoxes: { row: number; col: number; ownerId: string }[];
}

interface MoveError {
  ok: false;
  error: string;
}

function isLineInBounds(
  game: GameState,
  row: number,
  col: number,
  orientation: 'horizontal' | 'vertical'
): boolean {
  if (orientation === 'horizontal') {
    return row >= 0 && row <= game.gridHeight && col >= 0 && col < game.gridWidth;
  }
  return row >= 0 && row < game.gridHeight && col >= 0 && col <= game.gridWidth;
}

function checkBoxComplete(game: GameState, boxRow: number, boxCol: number): boolean {
  const top = `${boxRow}-${boxCol}`;
  const bottom = `${boxRow + 1}-${boxCol}`;
  const left = `${boxRow}-${boxCol}`;
  const right = `${boxRow}-${boxCol + 1}`;

  const horizontalSet = new Set(game.horizontalLines);
  const verticalSet = new Set(game.verticalLines);

  return (
    horizontalSet.has(top) &&
    horizontalSet.has(bottom) &&
    verticalSet.has(left) &&
    verticalSet.has(right)
  );
}

export function applyMove(
  game: GameState,
  playerId: string,
  row: number,
  col: number,
  orientation: 'horizontal' | 'vertical'
): MoveResult | MoveError {
  const currentPlayerId = game.turnOrder[game.currentTurnIndex];
  if (currentPlayerId !== playerId) {
    return { ok: false, error: 'Not your turn.' };
  }

  if (!isLineInBounds(game, row, col, orientation)) {
    return { ok: false, error: 'Line out of bounds.' };
  }

  const key = `${row}-${col}`;
  const lines = orientation === 'horizontal' ? game.horizontalLines : game.verticalLines;

  if (lines.includes(key)) {
    return { ok: false, error: 'Line already drawn.' };
  }

  lines.push(key);

  const boxesToCheck: { row: number; col: number }[] = [];
  if (orientation === 'horizontal') {
    if (row > 0) boxesToCheck.push({ row: row - 1, col });
    if (row < game.gridHeight) boxesToCheck.push({ row, col });
  } else {
    if (col > 0) boxesToCheck.push({ row, col: col - 1 });
    if (col < game.gridWidth) boxesToCheck.push({ row, col });
  }

  const completedBoxes: { row: number; col: number; ownerId: string }[] = [];
  for (const box of boxesToCheck) {
    if (game.boxOwners[box.row][box.col] === null && checkBoxComplete(game, box.row, box.col)) {
      game.boxOwners[box.row][box.col] = playerId;
      game.boxesFilled += 1;
      completedBoxes.push({ row: box.row, col: box.col, ownerId: playerId });
    }
  }

  if (completedBoxes.length === 0) {
    game.currentTurnIndex = (game.currentTurnIndex + 1) % game.turnOrder.length;
  }

  return { ok: true, completedBoxes };
}

export function removePlayerFromTurnOrder(game: GameState, playerId: string): void {
  const idx = game.turnOrder.indexOf(playerId);
  if (idx === -1) return;

  game.turnOrder.splice(idx, 1);
  if (game.turnOrder.length === 0) return;

  if (idx < game.currentTurnIndex) {
    game.currentTurnIndex -= 1;
  }
  game.currentTurnIndex = game.currentTurnIndex % game.turnOrder.length;
}