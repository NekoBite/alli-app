import { Circle, Group, Oval, Paint, Rect, RoundedRect } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { OUTLINE } from '../scene/palette';
import { emberX, type Ember, type HazeLayout, type Pile } from './hazeLogic';

type Animated<T> = T | SharedValue<T>;

type Props = {
  layout: HazeLayout;
  now: number;
  piles: Pile[];
  embers: Ember[];
  baled: number;
  /** 0 clear, 1 closed in. */
  haze: number;
  drag: {
    transform: Animated<({ translateX: number } | { translateY: number })[]>;
    opacity: Animated<number>;
  };
};

const RESIDUE = '#D9B85A';
const EMBER = '#FF7A1A';

/** The field for Haze control, drawn from plain values so it can be rendered anywhere. */
export function HazeScene({ layout, now, piles, embers, baled, haze, drag }: Props) {
  const { width, height, horizon, bale } = layout;

  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color="#6E7B8B" />
      <Circle cx={width * 0.2} cy={height * 0.16} r={26} color="#F2C9A0" opacity={0.6} />
      <Rect x={0} y={horizon} width={width} height={height - horizon} color="#5E7A3A" />

      {/* Smoke drifting in from the neighbours' fields. */}
      {[0, 1, 2].map((i) => {
        const drift = ((now / 40 + i * 90) % (width + 120)) - 60;
        return (
          <Circle
            key={`smoke-${i}`}
            cx={drift}
            cy={horizon - 30 - i * 22}
            r={30 + i * 8}
            color="#9AA3AD"
            opacity={0.25}
          />
        );
      })}

      {/* The bale: where residue goes instead of the fire. */}
      <RoundedRect x={bale.x} y={bale.y} width={bale.width} height={bale.height} r={10}>
        <Paint color="#4A6230" />
        <Paint color="#E7CF50" style="stroke" strokeWidth={2} />
      </RoundedRect>
      {Array.from({ length: baled }, (_, i) => (
        <RoundedRect
          key={`bale-${i}`}
          x={bale.x + 8}
          y={bale.y + bale.height - 18 - i * 16}
          width={bale.width - 16}
          height={14}
          r={4}
        >
          <Paint color={RESIDUE} />
          <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
        </RoundedRect>
      ))}

      {piles.map((pile) => (
        <PileSprite key={pile.id} x={pile.x} y={pile.y} />
      ))}

      {embers.map((ember) => {
        const x = emberX(ember, now);
        return (
          <Group key={ember.id}>
            <Circle cx={x} cy={ember.y} r={16} color={EMBER} opacity={0.3} />
            <Circle cx={x} cy={ember.y} r={8}>
              <Paint color={EMBER} />
              <Paint color="#FFD84D" style="stroke" strokeWidth={2} />
            </Circle>
          </Group>
        );
      })}

      <Rect x={0} y={0} width={width} height={height} color="#8C8C8C" opacity={0.15 + 0.6 * haze} />

      <Group transform={drag.transform} opacity={drag.opacity}>
        <PileSprite x={0} y={0} />
      </Group>
    </Group>
  );
}

function PileSprite({ x, y }: { x: number; y: number }) {
  return (
    <Group>
      <Oval x={x - 24} y={y - 10} width={48} height={22}>
        <Paint color={RESIDUE} />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Oval>
      <Oval x={x - 15} y={y - 20} width={30} height={16}>
        <Paint color="#E7CF50" />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </Oval>
    </Group>
  );
}
