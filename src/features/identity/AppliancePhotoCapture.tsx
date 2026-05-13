'use client';

/**
 * AppliancePhotoCapture
 *
 * Renders a 2×2 photo grid:
 *   [Listing Photo]  [Nameplate → OCR]
 *   [Interior]       [Wiring Diagram]
 *
 * Interior and Wiring uploads automatically call /api/identity/extract-feature-cues
 * and surface detected-feature badges with the year floor each implies.
 *
 * Props:
 *   onNameplateFile(file)     — called when nameplate slot changes (for OCR pipeline)
 *   onFeatureCues(cues)       — called whenever cues refresh (interior OR wiring upload)
 *   onProductFile(file)       — optional: called when listing-photo slot changes
 *   compact                   — if true, uses slightly smaller padding (editor sidebar mode)
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Camera,
  ScanLine,
  Refrigerator,
  Zap,
  Loader2,
  CheckCircle,
  ImageIcon,
  AlertTriangle,
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

interface AppliancePhotoCaptureProps {
  onNameplateFile?: (file: File) => void;
  onProductFile?: (file: File) => void;
  onFeatureCues?: (cues: FeatureCues | null) => void;
  compact?: boolean;
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const CUE_BADGES: Array<{ key: keyof FeatureCues; label: string; floor: string }> = [
  { key: 'thinQEnabled',            label: 'ThinQ',          floor: '≥2018' },
  { key: 'wifiConnected',           label: 'WiFi',           floor: '≥2017' },
  { key: 'touchscreenDispenser',    label: 'Touchscreen',    floor: '≥2015' },
  { key: 'digitalInverterMotor',    label: 'Inv. Motor',     floor: '≥2013' },
  { key: 'ledInteriorLighting',     label: 'LED Interior',   floor: '≥2013' },
  { key: 'invertLinearCompressor',  label: 'Linear Comp.',   floor: '≥2012' },
  { key: 'steamCycle',              label: 'Steam',          floor: '≥2010' },
  { key: 'digitalDisplay',          label: 'Digital Display',floor: '≥2010' },
  { key: 'iceDispenser',            label: 'Ice Dispenser',  floor: 'BOM'   },
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

function previewUrl(file: File): string {
  return URL.createObjectURL(file);
}

// ─── Single photo slot ────────────────────────────────────────────────────────

interface SlotConfig {
  label: string;
  sublabel: string;
  borderColor: string;
  hoverBorder: string;
  bgEmpty: string;
  iconBg: string;
  icon: React.ReactNode;
  spinColor: string;
  analyzingText: string;
  analyzingColor: string;
  badge?: React.ReactNode;
}

interface PhotoSlotProps {
  preview: string | null;
  isAnalyzing: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  config: SlotConfig;
  compact: boolean;
}

function PhotoSlot({ preview, isAnalyzing, inputRef, onChange, config, compact }: PhotoSlotProps) {
  const p = compact ? 'p-2' : 'p-3';
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${config.label}`}
      onClick={() => !isAnalyzing && inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      className={[
        'relative aspect-square rounded-2xl border-2 border-dashed cursor-pointer',
        'flex flex-col items-center justify-center overflow-hidden transition-all select-none',
        'active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1',
        preview
          ? config.borderColor + ' focus:ring-blue-400'
          : `border-slate-200 ${config.hoverBorder} ${config.bgEmpty} hover:border-opacity-80 focus:ring-slate-400`,
        isAnalyzing ? 'cursor-wait opacity-80' : '',
      ].join(' ')}
    >
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={config.label}
            className={`w-full h-full object-contain ${isAnalyzing ? 'opacity-40' : ''}`}
          />
          {isAnalyzing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-sm">
                <Loader2 className={`animate-spin mb-1 ${config.spinColor}`} size={18} />
                <span className={`text-[10px] font-bold ${config.analyzingColor}`}>
                  {config.analyzingText}
                </span>
              </div>
            </div>
          )}
          {!isAnalyzing && (
            <div className="absolute inset-0 bg-black/0 hover:bg-black/15 transition-colors flex items-center justify-center group">
              <Camera className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={20} />
            </div>
          )}
          {config.badge && !isAnalyzing && (
            <div className="absolute bottom-2 right-2">{config.badge}</div>
          )}
        </>
      ) : (
        <>
          <div className={`${p} rounded-full shadow-sm mb-1.5 ${config.iconBg}`}>
            {config.icon}
          </div>
          <span className="text-[11px] font-bold text-slate-600 text-center px-1 leading-tight">
            {config.label}
          </span>
          <span className="text-[10px] text-slate-400 text-center leading-tight mt-0.5">
            {config.sublabel}
          </span>
        </>
      )}
      <input
        type="file"
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className="hidden"
        accept="image/*"
        onChange={onChange}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AppliancePhotoCapture({
  onNameplateFile,
  onProductFile,
  onFeatureCues,
  compact = false,
}: AppliancePhotoCaptureProps) {
  const productRef  = useRef<HTMLInputElement>(null);
  const nameplateRef = useRef<HTMLInputElement>(null);
  const interiorRef  = useRef<HTMLInputElement>(null);
  const wiringRef    = useRef<HTMLInputElement>(null);

  const [productPreview, setProductPreview]   = useState<string | null>(null);
  const [nameplatePreview, setNameplatePreview] = useState<string | null>(null);
  const [interiorPreview, setInteriorPreview] = useState<string | null>(null);
  const [wiringPreview, setWiringPreview]     = useState<string | null>(null);

  const [isAnalyzingInterior, setIsAnalyzingInterior] = useState(false);
  const [isAnalyzingWiring, setIsAnalyzingWiring]     = useState(false);

  const [featureCues, setFeatureCues] = useState<FeatureCues | null>(null);
  const [cueError, setCueError] = useState<string | null>(null);

  // Track latest base64 for each cue-relevant slot so we can send both images together
  const interiorB64Ref = useRef<string | null>(null);
  const wiringB64Ref   = useRef<string | null>(null);
  const mimeTypeRef    = useRef<string>('image/jpeg');

  const runFeatureCues = useCallback(async (
    interiorB64: string | null,
    wiringB64: string | null,
    mimeType: string,
  ) => {
    if (!interiorB64 && !wiringB64) return;
    setCueError(null);
    try {
      const res = await fetch('/api/identity/extract-feature-cues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interiorBase64: interiorB64 ?? undefined,
          wiringBase64: wiringB64 ?? undefined,
          mimeType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setCueError(data.error || 'Feature extraction failed');
        return;
      }
      const cues: FeatureCues = data.cues || { confidence: 'low' };
      setFeatureCues(cues);
      onFeatureCues?.(cues);
    } catch (err) {
      setCueError(err instanceof Error ? err.message : 'Network error');
    }
  }, [onFeatureCues]);

  const handleProduct = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProductPreview(previewUrl(file));
    onProductFile?.(file);
  };

  const handleNameplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNameplatePreview(previewUrl(file));
    onNameplateFile?.(file);
  };

  const handleInterior = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setInteriorPreview(previewUrl(file));
    setIsAnalyzingInterior(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      interiorB64Ref.current = base64;
      mimeTypeRef.current = mimeType;
      await runFeatureCues(base64, wiringB64Ref.current, mimeType);
    } finally {
      setIsAnalyzingInterior(false);
    }
  };

  const handleWiring = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setWiringPreview(previewUrl(file));
    setIsAnalyzingWiring(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      wiringB64Ref.current = base64;
      mimeTypeRef.current = mimeType;
      await runFeatureCues(interiorB64Ref.current, base64, mimeType);
    } finally {
      setIsAnalyzingWiring(false);
    }
  };

  const activeCues = featureCues
    ? CUE_BADGES.filter(b => featureCues[b.key] === true)
    : [];

  const gap = compact ? 'gap-2' : 'gap-3';

  return (
    <div className="space-y-3">
      {/* 2×2 grid */}
      <div className={`grid grid-cols-2 ${gap}`}>

        {/* Listing Photo */}
        <PhotoSlot
          preview={productPreview}
          isAnalyzing={false}
          inputRef={productRef}
          onChange={handleProduct}
          compact={compact}
          config={{
            label: 'Listing Photo',
            sublabel: 'Main image',
            borderColor: 'border-blue-400',
            hoverBorder: 'hover:border-blue-300',
            bgEmpty: 'bg-slate-50',
            iconBg: 'bg-white shadow-sm',
            icon: <ImageIcon className="text-slate-400" size={compact ? 16 : 18} />,
            spinColor: 'text-blue-600',
            analyzingText: 'Assessing...',
            analyzingColor: 'text-blue-800',
          }}
        />

        {/* Nameplate */}
        <PhotoSlot
          preview={nameplatePreview}
          isAnalyzing={false}
          inputRef={nameplateRef}
          onChange={handleNameplate}
          compact={compact}
          config={{
            label: 'Scan Nameplate',
            sublabel: 'Auto-fill model/serial',
            borderColor: 'border-indigo-400',
            hoverBorder: 'hover:border-indigo-400',
            bgEmpty: 'bg-indigo-50/30',
            iconBg: 'bg-indigo-100',
            icon: <ScanLine className="text-indigo-600" size={compact ? 16 : 18} />,
            spinColor: 'text-indigo-600',
            analyzingText: 'Reading...',
            analyzingColor: 'text-indigo-800',
            badge: nameplatePreview ? (
              <div className="bg-indigo-600 text-white p-1 rounded-full shadow-lg">
                <ScanLine size={10} />
              </div>
            ) : undefined,
          }}
        />

        {/* Interior */}
        <PhotoSlot
          preview={interiorPreview}
          isAnalyzing={isAnalyzingInterior}
          inputRef={interiorRef}
          onChange={handleInterior}
          compact={compact}
          config={{
            label: 'Interior',
            sublabel: 'Inside + features',
            borderColor: 'border-emerald-400',
            hoverBorder: 'hover:border-emerald-300',
            bgEmpty: 'bg-emerald-50/30',
            iconBg: 'bg-emerald-100',
            icon: <Refrigerator className="text-emerald-600" size={compact ? 16 : 18} />,
            spinColor: 'text-emerald-600',
            analyzingText: 'Scanning...',
            analyzingColor: 'text-emerald-800',
          }}
        />

        {/* Wiring Diagram */}
        <PhotoSlot
          preview={wiringPreview}
          isAnalyzing={isAnalyzingWiring}
          inputRef={wiringRef}
          onChange={handleWiring}
          compact={compact}
          config={{
            label: 'Wiring Diagram',
            sublabel: 'Back or cabinet label',
            borderColor: 'border-amber-400',
            hoverBorder: 'hover:border-amber-300',
            bgEmpty: 'bg-amber-50/30',
            iconBg: 'bg-amber-100',
            icon: <Zap className="text-amber-600" size={compact ? 16 : 18} />,
            spinColor: 'text-amber-500',
            analyzingText: 'Analyzing...',
            analyzingColor: 'text-amber-800',
          }}
        />
      </div>

      {/* Feature cue error */}
      {cueError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {cueError}
        </div>
      )}

      {/* Feature cue badges */}
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

      {/* Analyzing status when no cues yet */}
      {(isAnalyzingInterior || isAnalyzingWiring) && activeCues.length === 0 && !cueError && (
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <Loader2 size={11} className="animate-spin text-emerald-500" />
          Detecting hardware features from photo...
        </div>
      )}
    </div>
  );
}
