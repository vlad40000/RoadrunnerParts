'use client';

/**
 * AppliancePhotoCapture
 *
 * Single universal upload / drag-drop zone.
 * The AI classifies the image on upload — no separate slots needed.
 *
 * Routing:
 *   nameplate → onNameplateFile()
 *   interior / wiring → onFeatureCues() via /api/identity/extract-feature-cues
 *   product photo → onProductFile()
 *   unknown → treated as product photo
 *
 * Props:
 *   onNameplateFile(file)      — called when nameplate detected
 *   onFeatureCues(cues)        — called when interior/wiring cues detected
 *   onProductFile(file)        — optional: listing-photo slot update
 *   externalProductPreview     — controlled preview injected by parent (gallery sync)
 *   compact                    — smaller padding for sidebar mode
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload,
  ScanLine,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Camera,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureCues {
  touchscreenDispenser?: boolean;
  ledInteriorLighting?: boolean;
  invertLinearCompressor?: boolean;
  digitalInverterMotor?: boolean;
  wifiConnected?: boolean;
  thinQEnabled?: boolean;
  homeConnect?: boolean;
  smartThings?: boolean;
  steamCycle?: boolean;
  digitalDisplay?: boolean;
  iceDispenser?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string;
}

type ImageClass = 'nameplate' | 'interior' | 'wiring' | 'product' | 'unknown';

interface AppliancePhotoCaptureProps {
  onNameplateFile?: (file: File) => void;
  onProductFile?: (file: File) => void;
  onFeatureCues?: (cues: FeatureCues | null) => void;
  externalProductPreview?: string | null;
  compact?: boolean;
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const CUE_BADGES: Array<{ key: keyof FeatureCues; label: string; floor: string }> = [
  { key: 'thinQEnabled',           label: 'ThinQ',          floor: '≥2018' },
  { key: 'wifiConnected',          label: 'WiFi',           floor: '≥2017' },
  { key: 'touchscreenDispenser',   label: 'Touchscreen',    floor: '≥2015' },
  { key: 'digitalInverterMotor',   label: 'Inv. Motor',     floor: '≥2013' },
  { key: 'ledInteriorLighting',    label: 'LED Interior',   floor: '≥2013' },
  { key: 'invertLinearCompressor', label: 'Linear Comp.',   floor: '≥2012' },
  { key: 'steamCycle',             label: 'Steam',          floor: '≥2010' },
  { key: 'digitalDisplay',         label: 'Digital Display',floor: '≥2010' },
  { key: 'iceDispenser',           label: 'Ice Dispenser',  floor: 'BOM'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [prefix, data] = result.split(',');
      const mimeType = prefix.match(/data:([^;]+)/)?.[1] || file.type || 'image/jpeg';
      resolve({ base64: data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Lightweight heuristic to pre-classify image before hitting the API */
function heuristicClass(filename: string): ImageClass | null {
  const n = filename.toLowerCase();
  if (/nameplate|serial|label|plate|model/.test(n)) return 'nameplate';
  if (/interior|inside|drum|tub|cavity/.test(n)) return 'interior';
  if (/wiring|wire|diagram|schematic|back/.test(n)) return 'wiring';
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AppliancePhotoCapture({
  onNameplateFile,
  onProductFile,
  onFeatureCues,
  externalProductPreview,
  compact = false,
}: AppliancePhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imageClass, setImageClass] = useState<ImageClass | null>(null);
  const [featureCues, setFeatureCues] = useState<FeatureCues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync external preview (gallery → capture panel)
  useEffect(() => {
    if (externalProductPreview && !preview) {
      setPreview(externalProductPreview);
      setImageClass('product');
    }
  }, [externalProductPreview, preview]);

  const classifyAndRoute = useCallback(async (file: File) => {
    setError(null);
    setFeatureCues(null);
    setImageClass(null);
    setIsAnalyzing(true);

    // Optimistic heuristic so the UI doesn't wait on the API for obvious filenames
    const hint = heuristicClass(file.name);

    const previewURL = URL.createObjectURL(file);
    setPreview(previewURL);

    try {
      const { base64, mimeType } = await fileToBase64(file);

      // ── Step 1: classify image ──────────────────────────────────────────────
      let cls: ImageClass = hint ?? 'unknown';

      if (!hint) {
        try {
          const res = await fetch('/api/identity/classify-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });
          const data = await res.json().catch(() => ({}));
          cls = (data.classification as ImageClass) ?? 'unknown';
        } catch {
          // Classification failure → treat as nameplate (most common upload intent)
          cls = 'nameplate';
        }
      }

      setImageClass(cls);

      // ── Step 2: route to correct handler ────────────────────────────────────
      if (cls === 'nameplate') {
        onNameplateFile?.(file);
      } else if (cls === 'interior' || cls === 'wiring') {
        try {
          const res = await fetch('/api/identity/extract-feature-cues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interiorBase64: cls === 'interior' ? base64 : undefined,
              wiringBase64: cls === 'wiring' ? base64 : undefined,
              mimeType,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            const cues: FeatureCues = data.cues || { confidence: 'low' };
            setFeatureCues(cues);
            onFeatureCues?.(cues);
          } else {
            setError(data.error || 'Feature extraction failed');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } else {
        // product or unknown → listing photo
        onProductFile?.(file);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [onNameplateFile, onProductFile, onFeatureCues]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) classifyAndRoute(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) classifyAndRoute(file);
  };

  const activeCues = featureCues
    ? CUE_BADGES.filter(b => featureCues[b.key] === true)
    : [];

  const p = compact ? 'p-4' : 'p-6';

  // Label that reflects what we detected
  const classLabel: Record<ImageClass, string> = {
    nameplate: 'Nameplate detected — running OCR',
    interior: 'Interior photo — extracting feature cues',
    wiring: 'Wiring diagram — extracting feature cues',
    product: 'Product photo',
    unknown: 'Photo received',
  };

  return (
    <div className="space-y-3">
      {/* ── Universal drop zone ─────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload appliance photo — nameplate, interior, wiring, or product"
        onClick={() => !isAnalyzing && inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          'relative rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none',
          'flex flex-col items-center justify-center overflow-hidden',
          'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
          'active:scale-[0.98]',
          compact ? 'min-h-[140px]' : 'min-h-[200px]',
          p,
          isDragging
            ? 'border-indigo-400 bg-indigo-50/60 scale-[1.01]'
            : preview
              ? 'border-indigo-300 bg-white'
              : 'border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50/20',
          isAnalyzing ? 'cursor-wait' : '',
        ].join(' ')}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Uploaded appliance photo"
              className={`max-h-48 w-full object-contain rounded-xl ${isAnalyzing ? 'opacity-40' : ''}`}
            />

            {isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center bg-white/90 backdrop-blur-sm px-4 py-3 rounded-2xl shadow-md">
                  <Loader2 className="animate-spin text-indigo-600 mb-1.5" size={22} />
                  <span className="text-[11px] font-bold text-indigo-800">
                    {imageClass ? classLabel[imageClass] : 'Classifying image…'}
                  </span>
                </div>
              </div>
            )}

            {!isAnalyzing && imageClass && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <CheckCircle size={11} className="text-emerald-500" />
                {classLabel[imageClass]}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPreview(null); setImageClass(null); setFeatureCues(null); }}
                  className="ml-auto p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
                  aria-label="Remove photo"
                >
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Change photo overlay */}
            {!isAnalyzing && (
              <div className="absolute top-2 right-2">
                <div className="bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow-sm hover:bg-white transition-colors">
                  <Camera size={12} className="text-slate-500" />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`rounded-full bg-indigo-100 ${compact ? 'p-3 mb-2' : 'p-4 mb-3'} shadow-sm`}>
              <Upload className="text-indigo-500" size={compact ? 20 : 26} />
            </div>
            <span className="text-[12px] font-bold text-slate-600 text-center leading-tight">
              Drop a photo or click to upload
            </span>
            <span className="text-[10px] text-slate-400 text-center mt-1 leading-tight px-2">
              Nameplate · Interior · Wiring · Product — AI auto-detects
            </span>
            {isDragging && (
              <div className="absolute inset-0 border-2 border-indigo-400 rounded-2xl bg-indigo-50/40 flex items-center justify-center">
                <span className="text-[12px] font-bold text-indigo-600">Drop to analyze</span>
              </div>
            )}
          </>
        )}

        <input
          type="file"
          ref={inputRef}
          className="hidden"
          accept="image/*"
          onChange={handleChange}
        />
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Feature cue badges ────────────────────────────────────────────────── */}
      {activeCues.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Detected Features — Year Floor Applied
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeCues.map(({ key, label, floor }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700"
              >
                <CheckCircle size={9} className="text-emerald-500" />
                {label}
                <span className="text-emerald-400 font-normal">{floor}</span>
              </span>
            ))}
          </div>
          {featureCues?.confidence === 'low' && (
            <p className="text-[9px] text-amber-600 font-semibold">
              Low confidence — image quality may be limiting detection.
            </p>
          )}
        </div>
      )}

      {/* ── Analyzing status ─────────────────────────────────────────────────── */}
      {isAnalyzing && activeCues.length === 0 && !error && (
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <Loader2 size={11} className="animate-spin text-indigo-500" />
          Detecting image type and routing analysis…
        </div>
      )}
    </div>
  );
}
