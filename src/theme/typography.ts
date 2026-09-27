import { type TextStyle } from 'react-native';

/**
 * The wireframes' three families: Space Grotesk for display and numbers, Inter for body, and
 * JetBrains Mono for labels, eyebrows, addresses and figures in a ledger. The .ttf files come from
 * the @expo-google-fonts packages and are loaded in app/_layout.tsx (`FONT_ASSETS`), which holds
 * the splash until they are ready. Each weight is its own family on Android, so the weight lives in
 * the family name rather than in `fontWeight`.
 */
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const type = {
  /** Big figures: quest steps, stars awarded, balances. */
  hero: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -0.66,
  },
  /** Tab screen titles ("Today", "Garden"). */
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.3,
  },
  /** Pushed screen titles ("Run complete") and card headings. */
  heading: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  /** Stat tile values and list figures. */
  figure: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 23,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  /** Mono label above a value: "STARS TODAY", "RUNS LEFT". */
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** The red eyebrow over a screen title. Pair with `<Eyebrow>`, which draws the rule. */
  eyebrow: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.32,
    textTransform: 'uppercase',
  },
  /** Addresses, amounts in a ledger, small data. */
  mono: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  monoStrong: {
    fontFamily: fonts.monoMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  /** Numbers that change every tick (timer, distance) — tabular so they don't jitter. */
  metric: {
    fontFamily: fonts.display,
    fontSize: 56,
    lineHeight: 62,
    letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;
