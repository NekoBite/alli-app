import { Platform, type TextStyle } from 'react-native';

/**
 * The web properties use Space Grotesk (display) + Inter (body). Loading those
 * needs `expo-font` and the font files in `assets/fonts`; until they are added
 * the app uses the platform UI font so nothing blocks on assets.
 *
 * TODO: drop the .ttf files into assets/fonts, load them in app/_layout.tsx with
 * useFonts(), then set `display`/`body` to the loaded family names.
 */
const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const systemFontMedium = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
});

export const fonts = {
  display: systemFontMedium,
  body: systemFont,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const type = {
  hero: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodyStrong: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  /** Numbers that change every tick (timer, distance) — tabular so they don't jitter. */
  metric: {
    fontFamily: fonts.mono,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;
