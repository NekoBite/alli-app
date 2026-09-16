export type GeoPoint = {
  latitude: number;
  longitude: number;
  /** ms since epoch. */
  timestamp: number;
  /** Horizontal accuracy in metres, as reported by the OS. */
  accuracy?: number;
  /** m/s, from the OS where available. */
  speed?: number;
  altitude?: number;
};

export type JogStatus = 'idle' | 'running' | 'paused' | 'finished';

export type JogSession = {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** Accepted GPS fixes, already filtered for accuracy. */
  track: GeoPoint[];
  /** Metres, summed from accepted points only. */
  distanceMetres: number;
  /** Seconds of movement — paused and stationary time excluded. */
  movingSeconds: number;
  /** Steps from the pedometer, used to cross-check GPS distance. */
  steps?: number;
};

/** Why a run was rejected or trimmed. Surfaced to the user verbatim. */
export type RewardFlag =
  | 'pace-too-fast'
  | 'pace-too-slow'
  | 'too-short'
  | 'poor-gps'
  | 'daily-cap-reached'
  | 'step-mismatch';

export type RewardBreakdown = {
  /** Distance that passed validation, in metres. */
  eligibleMetres: number;
  basePoints: number;
  /** Multiplier from streaks, events, or a planted-tree bonus. */
  multiplier: number;
  /** Points before the daily cap. */
  grossPoints: number;
  /** Points actually awarded, after the cap. */
  points: number;
  flags: RewardFlag[];
};

export type JogSummary = JogSession & {
  reward: RewardBreakdown;
  /** Server-confirmed. Until the backend validates, this stays false. */
  confirmed: boolean;
};
