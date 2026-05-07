"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { clampCanvasScale, type CanvasPan, type CanvasViewportState } from "./canvas-types";

type UseCanvasViewportGesturesArgs = {
  ref: RefObject<HTMLElement | null>;
  active: boolean;
  scale: number;
  rotation: number;
  pan: CanvasPan;
  onChange: (patch: Partial<CanvasViewportState>) => void;
  onReset: () => void;
  onFullscreen: () => void;
};

type Point = { x: number; y: number };

const TAP_MAX_MS = 280;
const DOUBLE_TAP_MS = 320;
const MOVE_TOLERANCE_PX = 12;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function touchPoint(touch: Touch): Point {
  return { x: touch.clientX, y: touch.clientY };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleBetween(a: Point, b: Point) {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

function centroid(touches: TouchList): Point {
  const points = Array.from(touches).map(touchPoint);
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

export function useCanvasViewportGestures({
  ref,
  active,
  scale,
  rotation,
  pan,
  onChange,
  onReset,
  onFullscreen,
}: UseCanvasViewportGesturesArgs) {
  const stateRef = useRef({ scale, rotation, pan, active });
  stateRef.current = { scale, rotation, pan, active };

  const callbacksRef = useRef({ onChange, onReset, onFullscreen });
  callbacksRef.current = { onChange, onReset, onFullscreen };

  const attach = useCallback(() => {
    const element = ref.current;
    if (!element) return () => {};

    let touchCount = 0;
    let touchStartTime = 0;
    let touchStartCentroid: Point | null = null;
    let lastCentroid: Point | null = null;

    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let panAnchor: Point = { x: 0, y: 0 };
    let rotateStartAngle = 0;
    let rotateStartRotation = 0;

    let lastTapTime = 0;

    let spacePressed = false;
    let mouseDragging = false;
    let mouseDragStart: Point = { x: 0, y: 0 };
    let mousePanStart: Point = { x: 0, y: 0 };

    function resetTouchTracking(event: TouchEvent) {
      touchCount = event.touches.length;
      touchStartTime = Date.now();
      touchStartCentroid = event.touches.length ? centroid(event.touches) : null;
      lastCentroid = touchStartCentroid;
    }

    function onTouchStart(event: TouchEvent) {
      if (isEditableTarget(event.target)) return;
      resetTouchTracking(event);

      if (event.touches.length === 2) {
        const first = touchPoint(event.touches[0]);
        const second = touchPoint(event.touches[1]);
        pinchStartDistance = distance(first, second);
        pinchStartScale = stateRef.current.scale;
        rotateStartAngle = angleBetween(first, second);
        rotateStartRotation = stateRef.current.rotation;
        const center = midpoint(first, second);
        panAnchor = {
          x: center.x - stateRef.current.pan.x,
          y: center.y - stateRef.current.pan.y,
        };
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (isEditableTarget(event.target) || !touchStartCentroid || event.touches.length === 0) return;
      const currentCentroid = centroid(event.touches);

      if (event.touches.length === 2) {
        event.preventDefault();
        const first = touchPoint(event.touches[0]);
        const second = touchPoint(event.touches[1]);
        const currentDistance = distance(first, second);
        const center = midpoint(first, second);
        const nextScale = pinchStartDistance > 0
          ? clampCanvasScale((currentDistance / pinchStartDistance) * pinchStartScale)
          : stateRef.current.scale;

        callbacksRef.current.onChange({
          scale: nextScale,
          pan: {
            x: center.x - panAnchor.x,
            y: center.y - panAnchor.y,
          },
          rotation: rotateStartRotation + angleBetween(first, second) - rotateStartAngle,
        });
      }

      lastCentroid = currentCentroid;
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length > 0) return;

      const endedAt = Date.now();
      const duration = endedAt - touchStartTime;
      const start = touchStartCentroid;
      const last = lastCentroid;
      if (!start || !last) return;

      const totalMove = distance(start, last);
      const quickTap = duration <= TAP_MAX_MS && totalMove <= MOVE_TOLERANCE_PX;

      if (touchCount === 4 && quickTap) {
        callbacksRef.current.onFullscreen();
        return;
      }

      if (touchCount === 1 && quickTap) {
        const now = Date.now();
        if (now - lastTapTime <= DOUBLE_TAP_MS) {
          callbacksRef.current.onReset();
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    }

    function onWheel(event: WheelEvent) {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
      callbacksRef.current.onChange({ scale: clampCanvasScale(stateRef.current.scale * zoomFactor) });
    }

    function beginMousePan(event: MouseEvent) {
      mouseDragging = true;
      mouseDragStart = { x: event.clientX, y: event.clientY };
      mousePanStart = { ...stateRef.current.pan };
    }

    function onMouseDown(event: MouseEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.button === 1 || event.button === 2 || (event.button === 0 && spacePressed)) {
        event.preventDefault();
        beginMousePan(event);
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (!mouseDragging) return;
      callbacksRef.current.onChange({
        pan: {
          x: mousePanStart.x + event.clientX - mouseDragStart.x,
          y: mousePanStart.y + event.clientY - mouseDragStart.y,
        },
      });
    }

    function onMouseUp() {
      mouseDragging = false;
    }

    function onContextMenu(event: MouseEvent) {
      if (!isEditableTarget(event.target)) event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!stateRef.current.active || isEditableTarget(event.target)) return;

      if (event.code === "Space") {
        spacePressed = true;
        element.style.cursor = "grab";
      }

      if (event.key === "Escape" && stateRef.current.active) {
        callbacksRef.current.onChange({ fullscreen: false });
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "0") {
        event.preventDefault();
        callbacksRef.current.onReset();
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        callbacksRef.current.onChange({ scale: clampCanvasScale(stateRef.current.scale * 1.15) });
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        callbacksRef.current.onChange({ scale: clampCanvasScale(stateRef.current.scale * 0.85) });
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        spacePressed = false;
        mouseDragging = false;
        element.style.cursor = "auto";
      }
    }

    element.addEventListener("touchstart", onTouchStart, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("mousedown", onMouseDown);
    element.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    element.style.touchAction = "none";

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ref]);

  useEffect(() => attach(), [attach]);
}
