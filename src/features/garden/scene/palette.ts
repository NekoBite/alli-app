/**
 * Season palettes carried over from the Garden Project sketch. The garden is
 * the one bright surface in a dark app — it is meant to read as a window onto
 * the outdoors, so it does not use the brand palette for sky and ground.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type SeasonPalette = {
  sky: string;
  ground: string;
  sun: string;
  soil: string;
  leaf: string;
  grass: string;
  /** Trunk colour. Winter trees are darker so they stand out against snow. */
  trunk: string;
  /** Colour of the fruit a tree carries when a harvest is ripening. */
  fruit: string;
  title: string;
};

export const PALETTES: Record<Season, SeasonPalette> = {
  spring: {
    sky: '#82e4ff',
    ground: '#75b560',
    sun: '#fffa73',
    soil: '#786c4f',
    leaf: '#FEDDFF',
    grass: '#4A8437',
    trunk: '#786c4f',
    fruit: '#8b2a34',
    title: 'Spring garden',
  },
  summer: {
    sky: '#46b7ff',
    ground: '#4A8437',
    sun: '#fffa73',
    soil: '#786c4f',
    leaf: '#75b560',
    grass: '#75b560',
    trunk: '#786c4f',
    fruit: '#ECAD32',
    title: 'Summer garden',
  },
  autumn: {
    sky: '#2595DD',
    ground: '#BC8823',
    sun: '#fffa73',
    soil: '#786c4f',
    leaf: '#BC8823',
    grass: '#ECAD32',
    trunk: '#786c4f',
    fruit: '#C34040',
    title: 'Autumn garden',
  },
  winter: {
    sky: '#f3f3f3',
    ground: '#DBFBFF',
    sun: '#ffffff',
    soil: '#ffffff',
    leaf: '#224A14',
    grass: '#224A14',
    trunk: '#392A0C',
    fruit: '#E7CF50',
    title: 'Winter garden',
  },
};

/** Premium (USDT) trees carry the brand gold so they read as premium at a glance. */
export const PREMIUM_ACCENT = '#C6A664';
/** A tree with no harvests left. */
export const SPENT_TINT = '#8A8F8C';
/** Outline weight, in scene units, matching the sketch's strokeWeight(2). */
export const OUTLINE = '#1B1B1B';

/** Meteorological seasons by month (0 = January). */
export function seasonFor(date: Date = new Date()): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}
