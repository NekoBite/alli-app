/** 4pt spacing scale. Use tokens, not raw numbers, in screens. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  /** The wireframes' screen gutter and card padding. */
  gutter: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Corner radii from the wireframes: stat tiles 12, cards 16, icon tiles 10–12. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type Spacing = keyof typeof spacing;
