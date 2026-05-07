"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CANVAS_DEFAULT_SCALE,
  CANVAS_OVERVIEW_SCALE,
  clampCanvasScale,
  type CanvasViewportState,
} from "./canvas-types";
import { useCanvasViewportGestures } from "./useCanvasViewportGestures";

type CanvasViewportProps = {
  children: ReactNode;
  label?: string;
  sourceLabel?: string;
  active?: boolean;
  defaultScale?: number;
  onActivate?: () => void;
};

function createViewportState(scale = CANVAS_OVERVIEW_SCALE): CanvasViewportState {
  return {
    scale: clampCanvasScale(scale),
    rotation: 0,
    pan: { x: 0, y: 0 },
    fullscreen: false,
  };
}

export function CanvasViewport({
  children,
  label = "Canvas",
  sourceLabel,
  active = true,
  defaultScale = CANVAS_OVERVIEW_SCALE,
  onActivate,
}: CanvasViewportProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<CanvasViewportState>(() => createViewportState(defaultScale));

  const fittedScale = useCallback(() => {
    const element = ref.current;
    if (!element) return clampCanvasScale(defaultScale);

    const bounds = element.getBoundingClientRect();
    const screenWidth = window.innerWidth || 3840;
    const screenHeight = window.innerHeight || 2160;
    const fit = Math.min(bounds.width / screenWidth, bounds.height / screenHeight) * 0.94;
    return clampCanvasScale(fit || defaultScale);
  }, [defaultScale]);

  const changeViewport = useCallback((patch: Partial<CanvasViewportState>) => {
    setViewport((current) => ({ ...current, ...patch }));
  }, []);

  const resetViewport = useCallback(() => {
    setViewport({
      scale: fittedScale(),
      rotation: 0,
      pan: { x: 0, y: 0 },
      fullscreen: false,
    });
  }, [fittedScale]);

  const toggleFullscreen = useCallback(() => {
    setViewport((current) => {
      const fullscreen = !current.fullscreen;
      return {
        ...current,
        fullscreen,
        scale: fullscreen ? CANVAS_DEFAULT_SCALE : fittedScale(),
        pan: { x: 0, y: 0 },
      };
    });
  }, [fittedScale]);

  useEffect(() => {
    resetViewport();
  }, [resetViewport]);

  useCanvasViewportGestures({
    ref,
    active,
    scale: viewport.scale,
    rotation: viewport.rotation,
    pan: viewport.pan,
    onChange: changeViewport,
    onReset: resetViewport,
    onFullscreen: toggleFullscreen,
  });

  const transformStyle = useMemo<CSSProperties>(() => ({
    transform: `translate(-50%, -50%) translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.scale}) rotate(${viewport.rotation}deg)`,
    transformOrigin: "center center",
  }), [viewport.pan.x, viewport.pan.y, viewport.rotation, viewport.scale]);

  const zoomOut = useCallback(() => {
    changeViewport({ scale: clampCanvasScale(viewport.scale * 0.85) });
  }, [changeViewport, viewport.scale]);

  const zoomIn = useCallback(() => {
    changeViewport({ scale: clampCanvasScale(viewport.scale * 1.15) });
  }, [changeViewport, viewport.scale]);

  const rotateLeft = useCallback(() => {
    changeViewport({ rotation: viewport.rotation - 15 });
  }, [changeViewport, viewport.rotation]);

  const rotateRight = useCallback(() => {
    changeViewport({ rotation: viewport.rotation + 15 });
  }, [changeViewport, viewport.rotation]);

  const activate = useCallback(() => {
    onActivate?.();
    ref.current?.focus({ preventScroll: true });
  }, [onActivate]);

  return (
    <div
      ref={ref}
      className={`parts-canvas-viewport${active ? " is-active" : ""}${viewport.fullscreen ? " is-fullscreen" : ""}`}
      tabIndex={0}
      onPointerDown={activate}
      data-scale={viewport.scale.toFixed(2)}
    >
      <div className="parts-canvas-toolbar" onPointerDown={(event) => event.stopPropagation()}>
        <span className="parts-canvas-title">{label}</span>
        {sourceLabel ? <span className="parts-canvas-source">{sourceLabel}</span> : null}
        <span className="parts-canvas-readout">{Math.round(viewport.scale * 100)}%</span>
        <button type="button" onClick={zoomOut} aria-label="Zoom canvas out">-</button>
        <button type="button" onClick={zoomIn} aria-label="Zoom canvas in">+</button>
        <button type="button" onClick={rotateLeft} aria-label="Rotate canvas left">-15</button>
        <button type="button" onClick={rotateRight} aria-label="Rotate canvas right">+15</button>
        <button type="button" onClick={resetViewport}>Reset</button>
        <button type="button" onClick={toggleFullscreen}>{viewport.fullscreen ? "Exit" : "Full"}</button>
      </div>
      <div className="parts-canvas-stage" style={transformStyle}>
        {children}
      </div>
    </div>
  );
}
