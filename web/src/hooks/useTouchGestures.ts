import { useEffect, useRef, useCallback } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // minimum px to trigger
  edgeOnly?: boolean; // only trigger when starting from screen edge
  edgeWidth?: number; // px from left edge
}

/**
 * Hook for detecting swipe gestures on touch devices.
 * Returns a ref to attach to the element.
 */
export function useSwipeGesture<T extends HTMLElement>(options: SwipeOptions) {
  const ref = useRef<T>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 80,
    edgeOnly = false,
    edgeWidth = 30,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;

      // Edge detection: only track swipes starting from left edge
      if (edgeOnly && touch.clientX > edgeWidth) {
        isSwiping.current = false;
        return;
      }
      isSwiping.current = true;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isSwiping.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }
      isSwiping.current = false;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, edgeOnly, edgeWidth]);

  return ref;
}

/**
 * Hook for detecting long press gestures on touch devices.
 */
export function useLongPress(onLongPress: () => void, duration = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const start = useCallback(
    () => {
      isLongPress.current = false;
      timerRef.current = setTimeout(() => {
        isLongPress.current = true;
        // Vibrate if supported
        if (navigator.vibrate) navigator.vibrate(30);
        onLongPress();
      }, duration);
    },
    [onLongPress, duration],
  );

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop, // cancel on move
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    isLongPress,
  };
}
