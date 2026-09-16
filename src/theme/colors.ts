/**
 * Palette carried over from the Trilumi / allicoindev design system so the app
 * and the web properties read as one brand.
 *
 * The app is dark-first. To add a light theme, define a second object with the
 * same keys and select between them in `src/theme/index.ts`.
 */
export const colors = {
  /** App background. */
  bg: '#0A0F0D',
  /** Raised surface (cards, sheets, inputs). */
  surface: '#111917',
  /** Surface one step above `surface` (pressed states, nested cards). */
  surfaceAlt: '#18211E',

  /** Primary text. */
  ink: '#E8F2EC',
  /** Secondary text, labels, captions. */
  ink2: '#9FB4AA',
  /** Disabled / placeholder text. */
  ink3: '#5E706A',

  /** Brand green — primary actions, ALLI, "go". */
  green: '#00FF88',
  /** Brand cyan — secondary accent, gradients. */
  cyan: '#00E5FF',
  /** Muted brand green for large fills that should not glow. */
  greenDim: '#0E5C38',
  /** Premium tier (USDT seeds, Visa card). */
  gold: '#C6A664',
  /** Stablecoin accent (USDT). */
  teal: '#2DD4A7',

  /** Hairline borders. */
  line: 'rgba(0, 255, 136, 0.14)',
  /** Neutral hairline where the green tint would be noisy. */
  lineNeutral: 'rgba(232, 242, 236, 0.10)',

  danger: '#FF6B6B',
  warning: '#FFC44D',
  success: '#00FF88',

  /** Translucent fills. */
  greenFill: 'rgba(0, 255, 136, 0.08)',
  goldFill: 'rgba(198, 166, 100, 0.10)',
  dangerFill: 'rgba(255, 107, 107, 0.10)',

  /** On-brand-green foreground (green is bright — text on it must be dark). */
  onGreen: '#062015',
  onGold: '#1C1607',
} as const;

export type ColorToken = keyof typeof colors;
