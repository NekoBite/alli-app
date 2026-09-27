/**
 * The allicoin website palette (its `:root` tokens), as drawn in the ALLI App wireframes
 * (`design/wireframes/`, section 00 · Foundations): warm near-black surfaces, ALLI red-orange
 * accents, a green for "confirmed" and an amber for "needs attention".
 *
 * The app is dark-first. To add a light theme, define a second object with the
 * same keys and select between them in `src/theme/index.ts`.
 */
export const colors = {
  /** App background. */
  bg: '#0A0605',
  /** Raised surface (cards, tab bar, sheets). */
  raised: '#150B09',
  /** Surface one step above `raised` (hero cards, stat tiles, inputs). */
  raised2: '#1B0F0C',

  /** Primary text. */
  ink: '#F6EEEA',
  /** Secondary text, captions. */
  inkDim: '#B8A69E',
  /** Labels, placeholders, inactive tabs. */
  inkFaint: '#7A6862',

  /** Brand red — fills, primary gradient start, icon tiles. */
  red: '#E24522',
  /** Hot red — accents on dark: eyebrows, links, live numbers, gradient end. */
  redHot: '#FF6A3D',
  /** Deep red — large fills that should not glow. */
  redDeep: '#5C1A0C',

  /** Confirmed, qualified, healthy. */
  ok: '#3FBE7A',
  /** Needs attention: low meters, backups, not-qualified, the second ring. */
  warn: '#E8B84B',
  /** Errors. Kept apart from the brand red so a failure never reads as decoration. */
  danger: '#FF5A5A',

  /** Hairline borders. */
  line: 'rgba(226, 69, 34, 0.16)',
  /** Stronger hairline: focused inputs, selected cards. */
  lineStrong: 'rgba(226, 69, 34, 0.32)',
  /** Progress-bar and meter tracks. */
  track: 'rgba(255, 255, 255, 0.07)',
  /** Ghost button fill. */
  ghostFill: 'rgba(255, 255, 255, 0.02)',

  /** Translucent fills. */
  redFill: 'rgba(226, 69, 34, 0.08)',
  pillFill: 'rgba(226, 69, 34, 0.05)',
  okFill: 'rgba(63, 190, 122, 0.10)',
  warnFill: 'rgba(232, 184, 75, 0.08)',
  dangerFill: 'rgba(255, 90, 90, 0.10)',

  /** Foreground on the primary gradient. */
  onRed: '#1A0704',
  /** Foreground on amber. */
  onWarn: '#1C1405',
} as const;

/** The primary gradient: every filled CTA, the active tab and the icon tiles. */
export const gradient = {
  primary: [colors.red, colors.redHot] as const,
};

export type ColorToken = keyof typeof colors;
