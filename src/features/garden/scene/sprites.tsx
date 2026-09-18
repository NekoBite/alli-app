import { Circle, Group, Line, Oval, Paint, Path, Rect, RoundedRect } from '@shopify/react-native-skia';

import type { Health } from '../types';
import {
  DEAD_TINT,
  OUTLINE,
  PREMIUM_ACCENT,
  SPARKLE,
  SPARKLE_GLOW,
  type Season,
  type SeasonPalette,
} from './palette';
import { grassPath, starPath, trianglePath, trunkPath } from './shapes';

/**
 * The plants, ported shape for shape from the Garden Project sketch. Each
 * sprite draws with its base at the origin in sketch units (a full tree is
 * 230 tall); the scene positions and scales them.
 *
 * Every shape gets the sketch's black 2px outline by drawing it twice — once
 * filled, once stroked — via the two Paint children in `<Outlined>`.
 */

const STROKE = 2;

function Outlined({ fill }: { fill: string }) {
  return (
    <>
      <Paint color={fill} />
      <Paint color={OUTLINE} style="stroke" strokeWidth={STROKE} />
    </>
  );
}

function Blob({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return (
    <Circle cx={cx} cy={cy} r={r}>
      <Outlined fill={fill} />
    </Circle>
  );
}

/** A filled circle with no outline — the sketch's `strokeWeight(0)` highlights. */
function Soft({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return <Circle cx={cx} cy={cy} r={r} color={fill} />;
}

type SpriteProps = { palette: SeasonPalette; season: Season };

// --- ground -------------------------------------------------------------

export function SoilMound({ palette }: SpriteProps) {
  return (
    <Oval x={-10} y={-5} width={20} height={10}>
      <Outlined fill={palette.soil} />
    </Oval>
  );
}

export function GrassTuft({ palette, lean }: SpriteProps & { lean: 1 | -1 }) {
  return (
    <Path path={grassPath(0, 0, 1, lean)}>
      <Outlined fill={palette.grass} />
    </Path>
  );
}

// --- growth stages ------------------------------------------------------

/** Just planted: a mound and the first shoot. */
export function Seedling({ palette }: SpriteProps) {
  return (
    <Group>
      <SoilMound palette={palette} season="spring" />
      <Line p1={{ x: 0, y: 0 }} p2={{ x: 0, y: -14 }} color={OUTLINE} strokeWidth={STROKE} />
      <Blob cx={0} cy={-18} r={6} fill={palette.leaf} />
    </Group>
  );
}

/**
 * The sketch's flower, one per season: petals in spring, corn in summer,
 * a pumpkin in autumn and a snowman in winter.
 */
export function Sprout({ palette, season, petal }: SpriteProps & { petal: string }) {
  const size = 30;
  const petalSize = size / 2;
  const spacing = petalSize / 2;

  if (season === 'spring') {
    const y = -size;
    return (
      <Group>
        <SoilMound palette={palette} season={season} />
        <Line p1={{ x: 0, y: 0 }} p2={{ x: 0, y }} color={OUTLINE} strokeWidth={STROKE} />
        <Blob cx={-spacing} cy={y - spacing} r={petalSize / 2} fill={petal} />
        <Blob cx={spacing} cy={y - spacing} r={petalSize / 2} fill={petal} />
        <Blob cx={-spacing} cy={y + spacing} r={petalSize / 2} fill={petal} />
        <Blob cx={spacing} cy={y + spacing} r={petalSize / 2} fill={petal} />
        <Blob cx={0} cy={y} r={petalSize / 2} fill="#fffa73" />
      </Group>
    );
  }

  if (season === 'summer') {
    const y = -size;
    return (
      <Group>
        <SoilMound palette={palette} season={season} />
        <Line p1={{ x: 0, y: 0 }} p2={{ x: 0, y }} color={OUTLINE} strokeWidth={STROKE} />
        <Oval x={-8} y={y - 12} width={16} height={24}>
          <Outlined fill="#75B560" />
        </Oval>
        <Oval x={-spacing - 12} y={y - 4} width={16} height={9}>
          <Outlined fill="#75B560" />
        </Oval>
        <RoundedRect x={-8.75} y={y - spacing - 17.5} width={17.5} height={35} r={8}>
          <Outlined fill="#E7CF50" />
        </RoundedRect>
      </Group>
    );
  }

  if (season === 'autumn') {
    const s = size * 1.5;
    const p = petalSize * 1.5;
    const sp = spacing * 1.5;
    return (
      <Group>
        <Rect x={-sp / 2} y={-s - sp / 2} width={sp} height={sp}>
          <Outlined fill="#75B560" />
        </Rect>
        <Oval x={-sp - sp * 1.4} y={-p * 2} width={sp * 2.8} height={p * 2}>
          <Outlined fill="#ECAD32" />
        </Oval>
        <Oval x={sp - sp * 1.4} y={-p * 2} width={sp * 2.8} height={p * 2}>
          <Outlined fill="#ECAD32" />
        </Oval>
        <Oval x={-sp} y={-p * 2} width={sp * 2} height={p * 2}>
          <Outlined fill="#ECAD32" />
        </Oval>
      </Group>
    );
  }

  // winter: a snowman
  return (
    <Group>
      <Blob cx={0} cy={-petalSize} r={size / 2} fill="#DBFBFF" />
      <Blob cx={0} cy={-petalSize * 2.5} r={size / 2} fill="#DBFBFF" />
      <Soft cx={-spacing * 0.5} cy={-petalSize * 2.8} r={1.5} fill={OUTLINE} />
      <Soft cx={spacing * 0.5} cy={-petalSize * 2.8} r={1.5} fill={OUTLINE} />
      <Path path={trianglePath(0, -petalSize * 2.2, 0, 0)} color="#ECAD32" />
      <Path
        path={`M0 ${-petalSize * 2.7} L0 ${-petalSize * 2.2} L${-size * 0.75} ${-petalSize * 2.45} Z`}
      >
        <Outlined fill="#ECAD32" />
      </Path>
    </Group>
  );
}

/** `drawSapling()`: a stem topped with a tight cluster of leaves. */
export function Sapling({ palette }: SpriteProps) {
  const s = 30;
  const leaf = s / 2;
  const spacing = leaf / 2;
  const y = -s;
  return (
    <Group>
      <SoilMound palette={palette} season="spring" />
      <Line p1={{ x: 0, y: 0 }} p2={{ x: 0, y }} color={OUTLINE} strokeWidth={STROKE} />
      <Rect x={-leaf / 2} y={y + spacing - leaf / 2} width={leaf} height={leaf}>
        <Outlined fill={palette.leaf} />
      </Rect>
      <Blob cx={0} cy={y - spacing * 1.5} r={leaf / 2} fill={palette.leaf} />
      <Blob cx={-spacing} cy={y - (spacing - 3)} r={leaf / 2} fill={palette.leaf} />
      <Blob cx={spacing} cy={y - (spacing - 3)} r={leaf / 2} fill={palette.leaf} />
      <Blob cx={-spacing} cy={y + spacing} r={leaf / 2} fill={palette.leaf} />
      <Blob cx={spacing} cy={y + spacing} r={leaf / 2} fill={palette.leaf} />
      <Soft cx={0} cy={y - 3} r={leaf / 2} fill={palette.leaf} />
      <Rect x={-leaf / 2} y={y + spacing - 1 - leaf / 2} width={leaf} height={leaf} color={palette.leaf} />
    </Group>
  );
}

type TreeProps = SpriteProps & {
  health: Health;
  premium: boolean;
  starPoints: number;
};

/**
 * `drawTree()`: the full tree. Health changes what it wears: a wilting tree
 * yellows and sheds, a retired one stands bare in its own trunk colour, a dead
 * one goes grey.
 */
export function Tree({ palette, season, health, premium, starPoints }: TreeProps) {
  const g = 1;
  const dead = health === 'dead';
  const bare = dead || health === 'retired';
  const leaf = dead ? DEAD_TINT : health === 'wilting' ? palette.leafWilting : palette.leaf;
  const trunk = dead ? DEAD_TINT : palette.trunk;

  return (
    <Group>
      {health === 'wilting' ? <FallenLeaves color={palette.leafWilting} /> : null}
      {health === 'retired' ? <FallenLeaves color={palette.fruit} /> : null}

      <Path path={trunkPath(0, 0, g)}>
        <Outlined fill={trunk} />
      </Path>

      {bare ? (
        <>
          <Line p1={{ x: 0, y: -170 }} p2={{ x: -55, y: -215 }} color={trunk} strokeWidth={8} />
          <Line p1={{ x: 0, y: -150 }} p2={{ x: 50, y: -205 }} color={trunk} strokeWidth={8} />
          <Line p1={{ x: 0, y: -200 }} p2={{ x: 10, y: -240 }} color={trunk} strokeWidth={6} />
        </>
      ) : season === 'winter' ? (
        <>
          <Path path={trianglePath(0, -50, 75, 100)}>
            <Outlined fill={leaf} />
          </Path>
          <Path path={trianglePath(0, -100, 75, 100)}>
            <Outlined fill={leaf} />
          </Path>
          <Path path={trianglePath(0, -150, 60, 80)}>
            <Outlined fill={leaf} />
          </Path>
          <Rect x={-30} y={-155} width={60} height={60} color={leaf} />
          <Rect x={-25} y={-175} width={50} height={50} color={leaf} />
          <Rect x={-20} y={-195} width={40} height={40} color={leaf} />
          <Path path={starPath(0, -230, 10, 25, starPoints)}>
            <Outlined fill={premium ? PREMIUM_ACCENT : '#E7CF50'} />
          </Path>
        </>
      ) : (
        <>
          <Blob cx={15} cy={-155} r={50} fill={leaf} />
          <Blob cx={-35} cy={-175} r={62.5} fill={leaf} />
          <Blob cx={30} cy={-200} r={50} fill={leaf} />
          <Blob cx={-14} cy={-220} r={47.5} fill={leaf} />
          <Blob cx={14} cy={-165} r={45} fill={leaf} />
          <Soft cx={-35} cy={-175} r={37.5} fill={leaf} />
          <Soft cx={40} cy={-200} r={30} fill={leaf} />
          <Soft cx={15} cy={-135} r={25} fill={leaf} />
          {premium ? (
            <Path path={starPath(-14, -258, 8, 17, 5)}>
              <Outlined fill={PREMIUM_ACCENT} />
            </Path>
          ) : null}
        </>
      )}
    </Group>
  );
}

/** Leaves on the ground around the trunk: what a tree in trouble looks like from across the garden. */
function FallenLeaves({ color }: { color: string }) {
  const leaves: readonly (readonly [number, number, number])[] = [
    [-70, 6, 0.4],
    [-42, 14, -0.3],
    [38, 10, 0.6],
    [66, 4, -0.5],
    [90, 14, 0.2],
    [-95, 12, -0.6],
  ];
  return (
    <Group>
      {leaves.map(([x, y, rot]) => (
        <Group key={`${x},${y}`} transform={[{ rotate: rot }]} origin={{ x, y }}>
          <Oval x={x - 9} y={y - 4} width={18} height={8}>
            <Outlined fill={color} />
          </Oval>
        </Group>
      ))}
    </Group>
  );
}

/**
 * A sparkle: one share of the day's stars, waiting to be tapped. Drawn in
 * canvas coordinates, outside the plant's transform, so its hit area matches
 * what `sparkleSpots` reported.
 */
export function Sparkle({ x, y, r, opacity }: { x: number; y: number; r: number; opacity?: number }) {
  return (
    <Group opacity={opacity}>
      <Circle cx={x} cy={y} r={r * 1.5} color={SPARKLE_GLOW} opacity={0.35} />
      <Path path={starPath(x, y, r * 0.42, r, 4)}>
        <Outlined fill={SPARKLE} />
      </Path>
      <Circle cx={x} cy={y} r={r * 0.22} color="#FFFFFF" />
    </Group>
  );
}
