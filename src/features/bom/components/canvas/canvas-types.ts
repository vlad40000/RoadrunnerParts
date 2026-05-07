export type CanvasPan = {
  x: number;
  y: number;
};

export type CanvasViewportState = {
  scale: number;
  rotation: number;
  pan: CanvasPan;
  fullscreen: boolean;
};

export const CANVAS_MIN_SCALE = 0.15;
export const CANVAS_MAX_SCALE = 1.1;
export const CANVAS_DEFAULT_SCALE = 1;
export const CANVAS_OVERVIEW_SCALE = 0.35;

export function clampCanvasScale(value: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, value));
}
