import { useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, ViewProps } from 'react-native';

/**
 * The time, refreshed `hz` times a second while `active`. Scenes that move
 * with the clock read this instead of calling `Date.now()` in render.
 */
export function useClock(hz: number, active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, Math.max(16, 1000 / hz));
    return () => clearInterval(timer);
  }, [hz, active]);
  return now;
}

export type DragHandlers<T> = {
  /** Called where a touch starts. Return what was grabbed, or null for nothing. */
  grab: (x: number, y: number) => T | null;
  /** Called on every move while something is held. Keep it cheap: it runs per frame. */
  move?: (held: T, x: number, y: number) => void;
  /** Called where the touch ends while something is held. */
  release: (held: T, x: number, y: number) => void;
  /** Called where a touch ends when nothing was grabbed. */
  tap?: (x: number, y: number) => void;
};

/** How far a finger may wander before a press stops counting as a tap. */
const TAP_SLOP = 12;

/** The View props that make it the touch responder. Spread them on the field. */
export type ResponderProps = Required<
  Pick<
    ViewProps,
    | 'onStartShouldSetResponder'
    | 'onMoveShouldSetResponder'
    | 'onResponderGrant'
    | 'onResponderMove'
    | 'onResponderRelease'
    | 'onResponderTerminate'
  >
>;

/**
 * Drag-and-drop over a single view through the gesture responder system, so
 * no gesture root is needed. Coordinates are relative to the view that
 * spreads the returned props, which must be the touch target: give its
 * children `pointerEvents="none"`.
 *
 * The handlers are plain functions rebuilt each render, so they always see
 * the latest state; what is held survives in refs they own.
 */
export function useDrag<T>(handlers: DragHandlers<T>): ResponderProps {
  const held = useRef<T | null>(null);
  const start = useRef({ x: 0, y: 0 });

  const at = (event: GestureResponderEvent) => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  });

  const onGrant = (event: GestureResponderEvent) => {
    start.current = at(event);
    held.current = handlers.grab(start.current.x, start.current.y);
  };
  const onMove = (event: GestureResponderEvent) => {
    if (held.current === null) return;
    const { x, y } = at(event);
    handlers.move?.(held.current, x, y);
  };
  const onRelease = (event: GestureResponderEvent) => {
    const { x, y } = at(event);
    if (held.current !== null) {
      handlers.release(held.current, x, y);
    } else if (
      Math.abs(x - start.current.x) <= TAP_SLOP &&
      Math.abs(y - start.current.y) <= TAP_SLOP
    ) {
      handlers.tap?.(x, y);
    }
    held.current = null;
  };
  const onTerminate = () => {
    held.current = null;
  };

  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: onGrant,
    onResponderMove: onMove,
    onResponderRelease: onRelease,
    onResponderTerminate: onTerminate,
  };
}
