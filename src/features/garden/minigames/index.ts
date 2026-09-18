import type { ComponentType } from 'react';

import type { MinigameId } from '../types';
import { CompostGame } from './CompostGame';
import { HazeGame } from './HazeGame';
import { MulchGame } from './MulchGame';
import type { GameProps } from './types';

/**
 * The minigames that exist. A condition whose minigame is not here is shown
 * with its lesson and no button, so nothing on screen is a dead end.
 */
export const GAMES: Partial<Record<MinigameId, ComponentType<GameProps>>> = {
  compost: CompostGame,
  mulch: MulchGame,
  haze: HazeGame,
};

export function hasMinigame(id: MinigameId): boolean {
  return GAMES[id] !== undefined;
}

export function isMinigameId(value: string | undefined): value is MinigameId {
  return value === 'compost' || value === 'mulch' || value === 'haze';
}

export { MinigameShell } from './Shell';
export type { GameProps } from './types';
