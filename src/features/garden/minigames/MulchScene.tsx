import { Circle, Group, Line, Oval, Paint, Rect } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { OUTLINE } from '../scene/palette';
import { dryness, sunPosition, type MulchLayout, type MulchPiece } from './mulchLogic';

/** A plain value or a Reanimated shared value; Skia accepts either. */
type Animated<T> = T | SharedValue<T>;

export type DragSprite = {
  transform: Animated<{ translateX: number }[] | { translateY: number }[] | ({ translateX: number } | { translateY: number })[]>;
  opacity: Animated<number>;
};

type Props = {
  layout: MulchLayout;
  /** 0 at dawn, 1 when the sun is up and time is out. */
  progress: number;
  pieces: MulchPiece[];
  drag: DragSprite;
};

const STRAW = '#E7CF50';
const STRAW_DARK = '#C9A83A';

/** The field for Mulch the roots, drawn from plain values so it can be rendered anywhere. */
export function MulchScene({ layout, progress, pieces, drag }: Props) {
  const { width, height, horizon, ring, pile } = layout;
  const sun = sunPosition(progress, layout);
  const dry = dryness(progress, pieces.length);
  const soil = mix('#5C3D1E', '#C8A878', dry);
  const sky = mix('#F8C471', '#FFE9C7', progress);

  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Circle cx={sun.x} cy={sun.y} r={44} color="#FFD84D" opacity={0.35} />
      <Circle cx={sun.x} cy={sun.y} r={28} color="#FFD84D" />
      <Rect x={0} y={horizon} width={width} height={height - horizon} color="#C9A25C" />

      {/* The soil ring around the roots, baking as the sun climbs. */}
      <Circle cx={ring.cx} cy={ring.cy} r={ring.r}>
        <Paint color={soil} />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Circle>
      {dry > 0.45
        ? cracks(ring).map((crack, i) => (
            <Line
              key={`crack-${i}`}
              p1={crack[0]}
              p2={crack[1]}
              color="#3F2A12"
              strokeWidth={2}
              opacity={Math.min(1, (dry - 0.45) * 3)}
            />
          ))
        : null}

      {/* The trunk the roots belong to. */}
      <Rect x={ring.cx - 14} y={ring.cy - ring.r - 70} width={28} height={ring.r + 70}>
        <Paint color="#786c4f" />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Rect>

      {pieces.map((piece, i) => (
        <Group key={`piece-${i}`} transform={[{ rotate: piece.rotation }]} origin={{ x: piece.x, y: piece.y }}>
          <Straw x={piece.x} y={piece.y} />
        </Group>
      ))}

      {/* The pile to drag from. */}
      <Oval x={pile.cx - pile.r * 1.3} y={pile.cy - pile.r * 0.6} width={pile.r * 2.6} height={pile.r * 1.2}>
        <Paint color={STRAW_DARK} />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Oval>
      <Oval x={pile.cx - pile.r} y={pile.cy - pile.r * 1.1} width={pile.r * 2} height={pile.r * 1.1}>
        <Paint color={STRAW} />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Oval>

      <Group transform={drag.transform} opacity={drag.opacity}>
        <Straw x={0} y={0} />
      </Group>
    </Group>
  );
}

function Straw({ x, y }: { x: number; y: number }) {
  return (
    <Oval x={x - 17} y={y - 7} width={34} height={14}>
      <Paint color={STRAW} />
      <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
    </Oval>
  );
}

function cracks(ring: MulchLayout['ring']): [{ x: number; y: number }, { x: number; y: number }][] {
  const { cx, cy, r } = ring;
  return [
    [{ x: cx - r * 0.7, y: cy - r * 0.2 }, { x: cx - r * 0.2, y: cy + r * 0.3 }],
    [{ x: cx + r * 0.1, y: cy + r * 0.5 }, { x: cx + r * 0.6, y: cy + r * 0.1 }],
    [{ x: cx + r * 0.3, y: cy - r * 0.6 }, { x: cx + r * 0.5, y: cy - r * 0.1 }],
    [{ x: cx - r * 0.4, y: cy + r * 0.6 }, { x: cx - r * 0.1, y: cy + r * 0.8 }],
  ];
}

/** Linear blend of two #rrggbb colours. */
export function mix(from: string, to: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const channel = (i: number) => {
    const a = parseInt(from.slice(i, i + 2), 16);
    const b = parseInt(to.slice(i, i + 2), 16);
    return Math.round(a + (b - a) * k)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
