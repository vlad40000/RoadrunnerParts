'use client';

/**
 * RoadrunnerParts
 * A premium BOM intelligence dashboard for appliance parts lookup and diagnostics.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Database,
  RotateCcw,
  ChevronRight,
  X,
  Package,
  Shield,
  ClipboardList,

  CheckCircle2,
  XCircle,
  Star,
  User,
  LogOut,
  MessageSquare,
  AlertCircle,
  Camera,
  Loader2,
  Scan,
  LayoutGrid,
  List as TableIcon,
  Download,
  Printer,
  BrainCircuit,
  Settings,
  Zap,
  ChevronDown,
  MapPin,
  Video,
  FileJson,
  FileSpreadsheet,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { partsData, Part } from './partsData';

import { ApplianceDecoder, DecodeResult } from './lib/decoder';
import { computeCurrentMarketValue, ApplianceCondition, ValuationResult } from './lib/valuation';
import { ebaySearchUrl, ebaySoldSearchUrl } from './features/bom/services/ebay-links';

const decoder = new ApplianceDecoder();
const approvedPriceSources = ['encompass.com', 'searspartsdirect.com', 'fix.com'];

const normalizePriceSource = (value?: string | null) => {
  const source = (value || '').trim().toLowerCase();
  const matched = approvedPriceSources.find((approved) => source.includes(approved)) || '';
  if (value && !matched && value.includes('immigration')) {
    console.warn('DEBUG: Blocked suspicious price source:', value);
  }
  return matched;
};

const hasApprovedPrice = (part: Part) => {
  const normalizedSource = normalizePriceSource(part.priceSource);
  const isApproved = typeof part.price === 'number' && part.price > 0 && Boolean(normalizedSource);
  return isApproved;
};

const marketPriceValue = (part: Part) =>
  typeof part.price === 'number' && part.price > 0 ? part.price : null;

const ebayManualPriceValue = (part: Part) => {
  if (typeof part.ebayPrice === 'number' && part.ebayPrice > 0) return part.ebayPrice;
  if (typeof part.ebay_price === 'number' && part.ebay_price > 0) return part.ebay_price;
  return null;
};

const stripManualEbayDisplayFields = <T extends Record<string, any>>(part: T): T => ({
  ...part,
  ebayPrice: undefined,
  ebay_price: undefined,
  ebayPriceSource: '',
  ebay_price_source: '',
  ebayPriceUrl: '',
  ebay_price_url: '',
});

const parseManualEbayPrice = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[$,]/g, ''));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const match = text.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const fallback = Number(match[1]);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
};

const getPartUrl = (part: Part, ...keys: Array<keyof Part>) => {
  for (const key of keys) {
    const value = String(part[key] || '').trim();
    if (/^https?:\/\//i.test(value)) return value;
  }
  return '';
};

const getDiagramReferenceId = (part: Part) => {
  const value = String(
    part.diagramRef ||
      part.diagram_ref ||
      part.diagramNumber ||
      part.diagram_number ||
      part.callout ||
      part.callout_number ||
      '',
  ).trim();
  return value || 'N/A';
};

const getDiagramReferenceLabel = (part: Part) => `DIAG ID ${getDiagramReferenceId(part)}`;

const normalizeSectionKey = (value?: string | null) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sectionDisplayOverrides: Record<string, string> = {
  'BACKSPLASH BLOWER AND DRIVE ASSEMBLY': 'BACKSPLASH, BLOWER & DRIVE ASSEMBLY',
  'CABINET AND TOP PANEL': 'CABINET & TOP PANEL',
  DRUM: 'DRUM',
  'FRONT PANEL AND DOOR': 'FRONT PANEL & DOOR',
};

const sectionDiagramAssets: Record<string, { label: string; src: string }> = {
  'BACKSPLASH BLOWER AND DRIVE ASSEMBLY': {
    label: 'BACKSPLASH, BLOWER & DRIVE ASSEMBLY',
    src: '/diagrams/HTDX100ED3WW/backsplash-blower-drive-assembly.png',
  },
  'CABINET AND TOP PANEL': {
    label: 'CABINET & TOP PANEL',
    src: '/diagrams/HTDX100ED3WW/cabinet-top-panel.png',
  },
  DRUM: {
    label: 'DRUM',
    src: '/diagrams/HTDX100ED3WW/drum.png',
  },
  'FRONT PANEL AND DOOR': {
    label: 'FRONT PANEL & DOOR',
    src: '/diagrams/HTDX100ED3WW/front-panel-door.png',
  },
};
const htdxCanonicalSectionKeys = [
  'BACKSPLASH BLOWER AND DRIVE ASSEMBLY',
  'CABINET AND TOP PANEL',
  'DRUM',
  'FRONT PANEL AND DOOR',
] as const;

const getSectionDisplayLabel = (section: string) => {
  const key = normalizeSectionKey(section);
  if (sectionDisplayOverrides[key]) return sectionDisplayOverrides[key];
  return section;
};

function AssemblyDiagramPreview({
  diagram,
}: {
  diagram: { label: string; src: string } | null;
}) {
  if (!diagram) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-pro-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pro-slate-400">
            Assembly Diagram
          </p>
          <h2 className="mt-1 text-sm font-black uppercase tracking-tight text-pro-navy">
            {diagram.label}
          </h2>
        </div>
        <ImageIcon size={18} className="text-pro-blue" />
      </div>
      <div className="overflow-hidden rounded-xl border border-pro-slate-100 bg-pro-slate-50">
        <img
          src={diagram.src}
          alt={`${diagram.label} diagram`}
          className="h-auto w-full object-contain"
        />
      </div>
    </div>
  );
}

/**
 * Image processing helpers for the OCR rescue pipeline.
 */
const rotateImage = async (base64: string, mimeType: string, degrees: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL(mimeType).split(',')[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
};

const cropImage = async (base64: string, mimeType: string, factor = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      const w = img.width * factor;
      const h = img.height * factor;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL(mimeType).split(',')[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
};

const normalizeModelId = (value?: string | null) => (value || '').toUpperCase().trim();
const stripLookupLabel = (value?: string | null) =>
  (value || "").replace(/^\s*(MODEL|PART)\s*#?\s*:?\s*/i, "").trim();
const HOME_DRAFT_STORAGE_KEY = 'roadrunner:home-draft';
const INVENTORY_DB_DOWNLOAD_PATH = '/OriginalUsedAppliancesDB.xlsx';

type EbayManualDraft = {
  price: string;
  url: string;
};

type CurrentEbayItem = {
  partNumber: string;
  diagramId: string;
  description: string;
  supersedes: string;
  price: number | null;
  imageCount: number;
  imageUrl: string;
  imagePath: string;
  status: 'ready_now' | 'photo_pending';
};

type CurrentEbayBatch = {
  generatedAt: string;
  sourceCsv: string;
  totalParts: number;
  readyCount: number;
  pendingCount: number;
  items: CurrentEbayItem[];
};

function formatBatchPrice(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : 'Price pending';
}

function CurrentEbayHomePanel({ batch }: { batch: CurrentEbayBatch | null }) {
  const [showAllPending, setShowAllPending] = useState(false);

  if (!batch || batch.items.length === 0) return null;

  const readyItems = batch.items.filter((item) => item.status === 'ready_now');
  const pendingItems = batch.items.filter((item) => item.status !== 'ready_now');
  const visiblePendingItems = showAllPending ? pendingItems : pendingItems.slice(0, 12);

  return (
    <section className="pro-card overflow-hidden rounded-lg border-pro-slate-200">
      <div className="flex flex-col gap-4 border-b border-pro-slate-200 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Current eBay batch
            </span>
            <span className="rounded-md bg-pro-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-pro-slate-500">
              HTDX100ED3WW
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black uppercase tracking-tight text-pro-navy">
            {batch.readyCount} listings can move now
          </h2>
          <p className="mt-1 text-xs font-semibold text-pro-slate-500">
            Descriptions and prices are loaded from the current 41-part operator CSV. Photo-pending rows stay held.
          </p>
          <a
            href="/ebay_mockup_gallery.html"
            className="mt-3 inline-flex h-9 items-center rounded-md border border-pro-blue bg-white px-3 text-[10px] font-black uppercase tracking-[0.16em] text-pro-blue transition-colors hover:bg-pro-blue hover:text-white"
          >
            Open live mockups
          </a>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-pro-slate-200 bg-pro-slate-50 px-3 py-2">
            <div className="text-lg font-black text-pro-navy">{batch.totalParts}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-pro-slate-400">Scoped</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-lg font-black text-emerald-700">{batch.readyCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Ready</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-lg font-black text-amber-700">{batch.pendingCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-amber-700">Hold</div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="max-h-[460px] overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {readyItems.map((item) => (
              <article key={item.partNumber} className="rounded-lg border border-pro-slate-200 bg-white p-3 shadow-sm">
                <div className="aspect-square overflow-hidden rounded-md border border-pro-slate-100 bg-pro-slate-50">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={`${item.partNumber} ${item.description}`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[10px] font-black uppercase tracking-widest text-pro-slate-300">
                      Photo pending
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-black text-pro-navy">{item.partNumber}</div>
                    <div className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs font-bold leading-snug text-pro-slate-700">
                      {item.description}
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                    Now
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-pro-slate-500">
                  <span>Diag {item.diagramId || 'N/A'}</span>
                  <span className="text-right text-pro-navy">{formatBatchPrice(item.price)}</span>
                  {item.supersedes && <span className="col-span-2 truncate">Supersedes {item.supersedes}</span>}
                  <span className="col-span-2">{item.imageCount} image files</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={ebaySearchUrl(item.partNumber)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-pro-slate-200 bg-white px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider text-pro-slate-600 hover:border-pro-blue hover:text-pro-blue"
                  >
                    Search eBay
                  </a>
                  <a
                    href={ebaySoldSearchUrl(item.partNumber)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-pro-slate-200 bg-white px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider text-pro-slate-600 hover:border-pro-blue hover:text-pro-blue"
                  >
                    Sold comps
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="border-t border-pro-slate-200 bg-pro-slate-50 p-4 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-pro-slate-500">
              Photo pending
            </h3>
            <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
              {pendingItems.length}
            </span>
          </div>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {visiblePendingItems.map((item) => (
              <div key={item.partNumber} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black text-pro-navy">{item.partNumber}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-700">Hold</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-pro-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
          {pendingItems.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAllPending((value) => !value)}
              className="mt-3 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 hover:bg-amber-50"
            >
              {showAllPending ? 'Collapse held items' : `Show all ${pendingItems.length} held items`}
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

export default function App({ currentEbayBatch = null }: { currentEbayBatch?: CurrentEbayBatch | null }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [modelEntry, setModelEntry] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [bomPassCount, setBomPassCount] = useState(0);
  const [expectedPartCount, setExpectedPartCount] = useState<number | null>(null);

  // Search & Results State
  const [isScanning, setIsScanning] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiParts, setAIParts] = useState<Part[]>([]);
  const [lookupModel, setLookupModel] = useState<string | null>(null);
  const [lookupSerial, setLookupSerial] = useState<string | null>(null);
  const [modelMSRP, setModelMSRP] = useState<number | null>(null);
  const [manufactureInfo, setManufactureInfo] = useState<DecodeResult | null>(null);
  const [applianceCondition, setApplianceCondition] = useState<ApplianceCondition>('good');
  const [valuation, setValuation] = useState<ValuationResult | null>(null);
  const [modelMetadata, setModelMetadata] = useState<any>(null);
  const [scanType, setScanType] = useState<'search' | 'compatibility' | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isDbChecking, setIsDbChecking] = useState(false);
  const [dbCheckStatus, setDbCheckStatus] = useState<string | null>(null);
  const [showUnpricedDbRows, setShowUnpricedDbRows] = useState(false);
  const [sortBy, setSortBy] = useState<'id' | 'price_asc' | 'price_desc'>('id');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(true);
  const [isEbayUploadLoading, setIsEbayUploadLoading] = useState(false);
  const [ebayManualDrafts, setEbayManualDrafts] = useState<Record<string, EbayManualDraft>>({});
  const [ebayManualSaving, setEbayManualSaving] = useState<Record<string, boolean>>({});
  const hasModelContext = Boolean(normalizeModelId(stripLookupLabel(lookupModel || modelEntry || "")));

  // Compatibility State
  const [checkModel, setCheckModel] = useState('');
  const [compatibilityResult, setCompatibilityResult] = useState<{
    isCompatible: boolean;
    suggestions: Part[];
  } | null>(null);

  const dynamicSections = useMemo(() => {
    const activeModelNormalized = normalizeModelId(lookupModel || modelEntry || searchTerm);
    if (activeModelNormalized === 'HTDX100ED3WW') {
      return htdxCanonicalSectionKeys.map((key) => sectionDisplayOverrides[key] || key);
    }

    const sectionMap = new Map<string, string>();
    const addSection = (section: unknown) => {
      const raw = String(section || '').trim();
      const key = normalizeSectionKey(raw);
      if (!key || sectionMap.has(key)) return;
      sectionMap.set(key, sectionDisplayOverrides[key] || raw);
    };

    if (modelMetadata?.diagramParse?.visualTruth?.assemblyNames) {
      modelMetadata.diagramParse.visualTruth.assemblyNames.forEach(addSection);
    }

    const source = aiParts.length > 0 ? aiParts : (hasModelContext ? [] : partsData);
    source.forEach((part) => addSection(part.section));

    const preferredOrder = [
      'BACKSPLASH BLOWER AND DRIVE ASSEMBLY',
      'CABINET AND TOP PANEL',
      'DRUM',
      'FRONT PANEL AND DOOR',
      'BASKET AND TUB PARTS',
      'CONSOLE AND WATER INLET PARTS',
      'COVER SHEET AND DOCUMENTATION',
      'GEARCASE MOTOR AND PUMP PARTS',
      'OPTIONAL INSTALLATION PARTS',
      'TOP AND CABINET PARTS',
    ];
    return Array.from(sectionMap.entries())
      .sort((a, b) => {
        const ai = preferredOrder.indexOf(a[0]);
        const bi = preferredOrder.indexOf(b[0]);
        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        }
        return a[1].localeCompare(b[1]);
      })
      .map(([, label]) => label)
      .slice(0, 8);
  }, [aiParts, hasModelContext, lookupModel, modelEntry, modelMetadata, searchTerm]);

  const selectedSectionLabel = useMemo(() => {
    if (selectedSections.length === 0) return 'All Components';
    if (selectedSections.length === 1) return getSectionDisplayLabel(selectedSections[0]);
    return `${selectedSections.length} Components`;
  }, [selectedSections]);

  const toggleSection = (section: string) => {
    setSelectedSections([getSectionDisplayLabel(section)]);
  };

  const selectedSectionKeys = useMemo(
    () => selectedSections.map(normalizeSectionKey).filter(Boolean),
    [selectedSections],
  );

  const activeAssemblyDiagram = useMemo(() => {
    if (selectedSectionKeys.length !== 1) return null;
    return sectionDiagramAssets[selectedSectionKeys[0]] || null;
  }, [selectedSectionKeys]);

  // AI Chat & Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [fieldChatMessages, setFieldChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [isFieldChatLoading, setIsFieldChatLoading] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  // Diagnostics state
  const [diagQuery, setDiagQuery] = useState('');
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [isDiagLoading, setIsDiagLoading] = useState(false);
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [isMainDiagOpen, setIsMainDiagOpen] = useState(false);

  const handleDeepDiagnostic = async () => {
    if (!diagQuery) return;
    setIsDiagLoading(true);
    setDiagResult(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'diagnose',
          query: diagQuery,
          model: lookupModel || 'Not Specified'
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Diagnostic engine failed');
      }
      const result = await response.json();
      setDiagResult(result || "No diagnostic results found.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Diagnostic engine failed. Please try again.");
    } finally {
      setIsDiagLoading(false);
    }
  };

  // Video state
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [isPromptReviewOpen, setIsPromptReviewOpen] = useState(false);
  const [pendingBomPrompt, setPendingBomPrompt] = useState('');
  const [pendingBomRequest, setPendingBomRequest] = useState<{
    model: string;
    normalizedQuery: string;
    serial: string | null;
    manufactureDate: string | null;
    passNumber: number;
    knownPartNumbers: string[];
    isExhaustive: boolean;
    expectedPartCount: number | null;
    existingParts: Part[];
  } | null>(null);

  // Image Source Chooser state
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isCompatSourceMenuOpen, setIsCompatSourceMenuOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const ebayPricingUploadRef = useRef<HTMLInputElement>(null);
  const expectedCountLookupModelRef = useRef<string | null>(null);
  const expectedCountRequestRef = useRef(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HOME_DRAFT_STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved) as {
        searchTerm?: string;
        modelEntry?: string;
        lookupModel?: string;
        lookupSerial?: string;
        checkModel?: string;
      };
      if (draft.searchTerm) setSearchTerm(draft.searchTerm);
      if (draft.modelEntry) setModelEntry(draft.modelEntry);
      if (draft.lookupModel) setLookupModel(draft.lookupModel);
      if (draft.lookupSerial) setLookupSerial(draft.lookupSerial);
      if (draft.checkModel) setCheckModel(draft.checkModel);
    } catch {
      // Draft restore is best-effort only.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HOME_DRAFT_STORAGE_KEY,
        JSON.stringify({
          searchTerm,
          modelEntry,
          lookupModel,
          lookupSerial,
          checkModel,
        }),
      );
    } catch {
      // Draft persistence is best-effort only.
    }
  }, [checkModel, lookupModel, lookupSerial, modelEntry, searchTerm]);


  useEffect(() => {
    if (!lookupModel) {
      setModelMetadata(null);
      return;
    }

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`/api/bom/model-details?model=${encodeURIComponent(lookupModel)}`);
        if (res.ok) {
          const data = await res.json();
          setModelMetadata(data);
          
          // Also set expected count if available
          if (data.trustedTotalPartCount) {
            setExpectedPartCount(data.trustedTotalPartCount);
          }
        }
      } catch (err) {
        console.error('[App] Failed to fetch model metadata:', err);
      }
    };

    fetchMetadata();
  }, [lookupModel]);

  const buildBomPrompt = (query: string, isExhaustive: boolean, passNumber: number, currentKnownPartNumbers: string[]) => {
    let passInstruction = "";
    let promptTitle = "";

    if (!isExhaustive) {
      promptTitle = `Generate a QUICK BOM PASS (approx 40 parts) for appliance model: ${query}.`;
      passInstruction = `
QUICK BOM PASS:
Target approximately 40 valid OEM parts with broad coverage across major categories.
Focus on speed and reliability for the most common serviceable parts.`;
    } else {
      promptTitle = `Generate an ABSOLUTELY EXHAUSTIVE, MASTER-LEVEL Bill of Materials (BOM) for appliance model: ${query}.`;

      if (passNumber === 1) {
        passInstruction = `
COMPLETE BOM PASS (EXHAUSTIVE):
Attempt the most exhaustive BOM possible across all valid OEM/serviceable parts.
No hard cap is required. Include major assemblies, controls, motors, pumps, valves, boards, sensors, panels, wiring, clips, brackets, seals, hardware, supports, covers, and tubing.`;
      } else if (passNumber === 2) {
        passInstruction = `
COMPLETE BOM PASS - FALLBACK CHUNK (Drive & Power):
Focus specifically on MORE parts missed in:
- motors
- gearcase
- pump
- drive components
- sub-harnesses
- wiring
- sub-assembly specific pieces`;
      } else if (passNumber === 3) {
        passInstruction = `
COMPLETE BOM PASS - FALLBACK CHUNK (Control & Structures):
Focus on:
- controls
- boards
- sensors
- internal structure
- basket
- tub
- panels
- brackets
- supports`;
      } else {
        passInstruction = `
COMPLETE BOM PASS - FALLBACK CHUNK (Hardware & Finishing):
Focus on:
- seals
- gaskets
- clips
- retainers
- shields
- covers
- internal tubing
- screws, bolts, and small service hardware`;
      }
    }

    const targetLabel = `${lookupModel ? lookupModel : query} Parts List`;

    return `${promptTitle}
${lookupSerial ? `Serial Number: ${lookupSerial}` : ""}
${manufactureInfo?.manufactureYear ? `Approximate Manufacture Date: ${manufactureInfo.manufactureYear}-${manufactureInfo.timeValue?.value || "01"}` : ""}

CURRENT PASS NUMBER: ${passNumber}

${passInstruction}

KNOWN PART NUMBERS ALREADY FOUND:
${currentKnownPartNumbers.length > 0 ? currentKnownPartNumbers.join(", ") : "NONE"}

First, identify the Brand and Category.
I require the deepest possible OEM service BOM.
Use REAL OEM part numbers for the identified manufacturer.
Categorize strictly into the provided assembly sections.

CRITICAL:
- Search for missing parts that are NOT already in the known list.
- Prefer exact OEM part numbers.
- Focus on completeness.
- Return only valid serviceable or diagram-listed parts.
- Avoid duplicates of known part numbers.

ALSO:
Use GOOGLE SEARCH to verify the EXACT CURRENT RETAIL PRICE for each part.
For EVERY price provided, specify the source website.
Use this required pricing fallback chain:
1. Search SearsPartsDirect.com first.
2. If SearsPartsDirect has no usable price, search Fix.com.
Do not return 0, $0.00, free, blank, placeholder, or estimated prices.
Every returned part MUST include a real positive price and priceSource from searspartsdirect.com, or fix.com.
Set priceSource to exactly "searspartsdirect.com", or "fix.com".
Do not use any other retailer, marketplace, blog, unrelated URL, or manufacturer landing page as a price source.
Continue the fallback chain until a real positive approved-source price is found for every returned part.

User Prompt:
Target: ${targetLabel} as an example it will populate differently
Extract the following schema for every part found:
{
"part_name": "string",
"oem_number": "string",
"price": "number/null",
"status": "string"
}
Use Python to simulate a crawl of the page structure and print the final JSON to the console.
Sort the final JSON alphabetically by part_name before outputting.`;
  };

  const handleAILookup = async (modelToSearch?: string, serialToSearch?: string, isExhaustive = false) => {
    const query = (modelToSearch || modelEntry || lookupModel || searchTerm || "").trim();
    if (!query || query.length < 3) return;

    const normalizedQuery = normalizeModelId(query);
    const activeSerialValue = normalizeModelId(serialToSearch || lookupSerial || null) || null;
    const passNumber = isExhaustive ? (bomPassCount > 0 ? bomPassCount + 1 : 1) : 1;
    const existingParts = Array.isArray(aiParts) ? aiParts : [];
    const knownPartNumbers = existingParts
      .map((part) => normalizeModelId(part.partNumber))
      .filter(Boolean) as string[];

    const requestPayload = {
      model: normalizedQuery,
      normalizedQuery,
      serial: activeSerialValue,
      manufactureDate: manufactureInfo?.manufactureYear
        ? `${manufactureInfo.manufactureYear}-${manufactureInfo.timeValue?.value || "01"}`
        : null,
      passNumber,
      knownPartNumbers,
      isExhaustive,
      expectedPartCount,
      existingParts,
    };

    const promptText = buildBomPrompt(normalizedQuery, isExhaustive, passNumber, knownPartNumbers);
    setPendingBomRequest(requestPayload);
    setPendingBomPrompt(promptText);
    setIsPromptReviewOpen(true);
  };

  const runApprovedBomPrompt = async (requestPayload: any, promptText: string) => {
    setIsAILoading(true);
    try {
      const response = await fetch('/api/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestPayload,
          promptOverride: promptText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BOM API failed (${response.status}): ${errorText}`);
      }

      const parsed = await response.json();
      const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];
      setShowUnpricedDbRows(false);

      const processedParts = rawParts.map((p: any) => ({
        ...stripManualEbayDisplayFields(p),
        partNumber: (p.partNumber || "").toUpperCase().trim(),
      }));

      const mergedParts = [...requestPayload.existingParts];
      const seen = new Set(
        requestPayload.existingParts
          .map((p) => (p.partNumber || "").toUpperCase().trim())
          .filter(Boolean),
      );

      for (const np of processedParts) {
        if (!np.partNumber) continue;
        if (!seen.has(np.partNumber)) {
          seen.add(np.partNumber);
          mergedParts.push(np);
        }
      }

      // Generate stable display IDs based on sorted results
      const finalParts = mergedParts
        .filter(hasApprovedPrice)
        .sort((a, b) => {
          const sectionCompare = (a.section || "").localeCompare(b.section || "");
          if (sectionCompare !== 0) return sectionCompare;
          return (a.partNumber || "").localeCompare(b.partNumber || "");
        })
        .map((part, index) => ({
          ...stripManualEbayDisplayFields(part),
          id: 10001 + index,
        }));

      setAIParts(finalParts);
      setBomPassCount(requestPayload.passNumber);

      if (parsed.modelMSRP) {
        setModelMSRP(parsed.modelMSRP);

        const currentValue = computeCurrentMarketValue(
          parsed.modelMSRP,
          manufactureInfo?.manufactureYear || null,
          manufactureInfo?.timeValue?.unit === "month"
            ? manufactureInfo.timeValue.value
            : null,
          requestPayload.model,
          manufactureInfo?.brandFamily || "Universal",
          applianceCondition,
        );
        setValuation(currentValue);
      }

      setLookupModel(requestPayload.normalizedQuery);
      setViewMode("table");
      setIsPromptReviewOpen(false);
      setPendingBomPrompt('');
      setPendingBomRequest(null);
    } catch (error) {
      console.error("AI Lookup failed:", error);
      alert(error instanceof Error ? error.message : 'AI lookup failed. Please try again.');
    } finally {
      setIsAILoading(false);
    }
  };

  const handleDbCheck = async () => {
    const model = normalizeModelId(stripLookupLabel(modelEntry || lookupModel || ""));
    const partNumber = model ? '' : normalizeModelId(stripLookupLabel(searchTerm));

    if (!model && !partNumber) {
      setDbCheckStatus('Enter a model number or part number.');
      return;
    }

    setIsDbChecking(true);
    setDbCheckStatus(null);

    try {
      const params = new URLSearchParams();
      if (model) params.set('model', model);
      if (partNumber) params.set('partNumber', partNumber);

      const response = await fetch(`/api/bom/db-check?${params.toString()}`, {
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `DB check failed (${response.status})`);
      }

      const rows = Array.isArray(payload.parts) ? payload.parts : [];
      const normalizedRows = rows.map((part: any, index: number) => ({
        ...stripManualEbayDisplayFields(part),
        id: Number(part.id) || index + 1,
        partNumber: normalizeModelId(part.partNumber),
        description: part.description || 'Appliance Part',
        section: part.section || 'Database Evidence',
        compatibleModels: Array.isArray(part.compatibleModels)
          ? part.compatibleModels.filter(Boolean)
          : model
            ? [model]
            : [],
        avgRating: Number(part.avgRating) || 0,
        reviewCount: Number(part.reviewCount) || 0,
      }));

      if (model) {
        setLookupModel(model);
        setModelEntry(model);
      }

      setAIParts(normalizedRows);
      setSelectedSections([]);
      setShowUnpricedDbRows(true);
      setDbCheckStatus(
        normalizedRows.length
          ? `DB match: ${normalizedRows.length} row${normalizedRows.length === 1 ? '' : 's'} from stored evidence.`
          : 'No DB rows found for that model or part number.',
      );
    } catch (error) {
      setDbCheckStatus(error instanceof Error ? error.message : 'DB check failed.');
    } finally {
      setIsDbChecking(false);
    }
  };

  const handleResetIdentity = () => {
    setModelEntry('');
    setSearchTerm('');
    setLookupModel(null);
    setLookupSerial(null);
    setCheckModel('');
    setAIParts([]);
    setSelectedSections([]);
    setShowUnpricedDbRows(false);
    setManufactureInfo(null);
    setModelMetadata(null);
    setExpectedPartCount(null);
    expectedCountLookupModelRef.current = null;
    expectedCountRequestRef.current += 1;
    setDbCheckStatus(null);
  };

  const handleApprovePrompt = async () => {
    if (!pendingBomRequest) return;
    if (!pendingBomPrompt.trim()) {
      alert('Write the prompt before sending.');
      return;
    }
    await runApprovedBomPrompt(pendingBomRequest, pendingBomPrompt);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scanType) return;

    setIsScanning(true);
    
    // Helper to rotate or crop image using canvas
    const transformImage = async (img: HTMLImageElement, rotation: number, crop: boolean): Promise<string> => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      let width = img.width;
      let height = img.height;
      
      if (rotation === 90 || rotation === 270) {
        canvas.width = height;
        canvas.height = width;
      } else {
        canvas.width = width;
        canvas.height = height;
      }
      
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2);
      
      if (crop) {
        // Simple center crop (70% of size)
        const cropCanvas = document.createElement('canvas');
        const cropCtx = cropCanvas.getContext('2d')!;
        const cropW = canvas.width * 0.7;
        const cropH = canvas.height * 0.7;
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        cropCtx.drawImage(canvas, (canvas.width - cropW) / 2, (canvas.height - cropH) / 2, cropW, cropH, 0, 0, cropW, cropH);
        return cropCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      }
      
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    };

    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    };

    try {
      const originalUrl = URL.createObjectURL(file);
      const img = await loadImage(originalUrl);
      
      // Define retry strategy: [rotation, crop]
      const attempts = [
        [0, false],   // Original
        [90, false],  // Rotate 90
        [270, false], // Rotate 270
        [0, true],    // Center crop
        [90, true],   // Crop + Rotate
      ];

      let lastResult = null;
      let lastError: unknown = null;

      for (const [rotation, crop] of attempts) {
        try {
          const base64 = await transformImage(img, rotation as number, crop as boolean);
          
          const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: file.type })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OCR API failed (${response.status}): ${errorData.error || 'Unknown server error'}`);
          }

          const result = await response.json();
          
          if (result.modelNumber || result.serialNumber || result.partNumber) {
            lastResult = result;
            break; // SUCCESS!
          }
        } catch (err) {
          lastError = err;
          continue;
        }
      }

      if (!lastResult) {
        throw lastError instanceof Error ? lastError : new Error('Validation Failure: All extraction attempts failed. Ensure the manufacturer tag is well-lit and the text is sharp.');
      }

      // STAGE 2: Preserve Raw Values exactly
      const model = (lastResult.modelNumber || '').toString().trim().toUpperCase();
      const serial = (lastResult.serialNumber || '').toString().trim().toUpperCase();
      
      if (serial) {
        // Use the server-returned decode result if available
        setManufactureInfo(lastResult.decodeResult || decoder.decode(serial, model));
      }

      if (scanType === 'search') {
        if (model) {
          setAIParts([]);
          setBomPassCount(0);
          setExpectedPartCount(null);
          expectedCountLookupModelRef.current = null;
          expectedCountRequestRef.current += 1;
          
          // STAGE 5: Lookup Cascade
          setModelEntry(model);
          setSearchTerm('');
          setLookupModel(model);
          setLookupSerial(serial);
          
          // Trigger BOM lookup
          handleAILookup(model, serial);
        }
      } else {
        setCheckModel(model);
        setTimeout(() => handleCheckCompatibility(model), 100);
      }
    } catch (error) {
      console.error("Forensic OCR Rescue Pipeline failed", error);
      alert(error instanceof Error ? error.message : "Optical analysis failed. Please enter the data manually.");
    } finally {
      setIsScanning(false);
      setScanType(null);
    }
  };


  useEffect(() => {
    if (selectedPart) {
      setCompatibilityResult(null);
      setCheckModel('');
    }
  }, [selectedPart]);

  useEffect(() => {
    if (modelMSRP) {
      const val = computeCurrentMarketValue(
        modelMSRP,
        manufactureInfo?.manufactureYear || null,
        manufactureInfo?.timeValue?.unit === 'month' ? manufactureInfo.timeValue.value : null,
        lookupModel || '',
        manufactureInfo?.brandFamily || 'Universal',
        applianceCondition
      );
      setValuation(val);
    }
  }, [modelMSRP, manufactureInfo, applianceCondition, lookupModel]);

  const handleManufactureRefresh = () => {
    if (lookupSerial) {
      setIsRecalculating(true);
      setTimeout(() => {
        const decoded = decoder.decode(lookupSerial, lookupModel || '');
        setManufactureInfo(decoded);

        if (modelMSRP) {
          const val = computeCurrentMarketValue(
            modelMSRP,
            decoded.manufactureYear,
            decoded.timeValue?.unit === 'month' ? decoded.timeValue.value : null,
            lookupModel || '',
            decoded.brandFamily,
            applianceCondition
          );
          setValuation(val);
        }
        setIsRecalculating(false);
      }, 400); // Small delay for visual impact
    }
  };



  const handleVideoDiagnostic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsVideoLoading(true);
    setVideoResult(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'video',
          videoData: base64,
          mimeType: file.type,
          model: lookupModel
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Video analysis engine failed');
      }

      const result = await response.json();
      setVideoResult(result || "Video analysis complete, but no specific errors detected.");
    } catch (error) {
      console.error(error);
      alert("Video analysis engine encountered a problem.");
    } finally {
      setIsVideoLoading(false);
    }
  };

  const handleExportCSV = () => {
    const dataSource = aiParts.length > 0
      ? (showUnpricedDbRows ? aiParts : aiParts.filter(hasApprovedPrice))
      : (hasModelContext ? [] : partsData);

    const escapeCsvCell = (value: unknown) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const safeText = (value: unknown) => String(value ?? "");

    const headers = ['Ref ID', 'Part Number', 'Description', 'Price (USD)', 'Price Source', 'eBay Manual Price (USD)', 'eBay Price URL', 'Assembly Section', 'Diagram URL', 'Price URL'];
    const rows = dataSource.map(part => {
      const diagramUrl = getPartUrl(part, 'diagramUrl', 'diagram_url', 'sourceUrl', 'source_url');
      const priceUrl = getPartUrl(part, 'priceUrl', 'price_url');
      const ebayPriceUrl = getPartUrl(part, 'ebayPriceUrl', 'ebay_price_url');
      const ebayPrice = ebayManualPriceValue(part);
      return [
        getDiagramReferenceId(part),
        safeText(part.partNumber),
        safeText(part.description),
        hasApprovedPrice(part) ? part.price : '',
        normalizePriceSource(part.priceSource || part.price_source),
        ebayPrice ?? '',
        safeText(ebayPriceUrl),
        safeText(part.section),
        safeText(diagramUrl),
        safeText(priceUrl)
      ];
    });

    const csvContent = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n');

    const bom = "\uFEFF";
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const rawModel = normalizeModelId(lookupModel || 'APPLIANCE') || 'APPLIANCE';
    const safeFileModel = rawModel.replace(/[^A-Z0-9_-]/gi, '_');
    link.setAttribute('download', `BOM-${safeFileModel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInventorySheet = () => {
    const link = document.createElement('a');
    link.href = INVENTORY_DB_DOWNLOAD_PATH;
    link.download = 'OriginalUsedAppliancesDB.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEbayPricingUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const model = normalizeModelId(lookupModel || modelEntry || searchTerm);
    if (!model) {
      alert('Enter a model before importing eBay pricing.');
      return;
    }

    setIsEbayUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', model);

      const response = await fetch('/api/bom/ebay-pricing/import', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result?.error || 'Failed to import eBay pricing spreadsheet.');
      }

      await handleDbCheck();
      const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
      setDbCheckStatus(
        `eBay pricing import complete: ${result.importedRows} rows from ${file.name}${warningCount ? ` (${warningCount} warning${warningCount === 1 ? '' : 's'})` : ''}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import eBay pricing spreadsheet.';
      setDbCheckStatus(`eBay pricing import failed: ${message}`);
      alert(message);
    } finally {
      setIsEbayUploadLoading(false);
    }
  };

  const ebayDraftKey = (part: Part) => normalizeModelId(part.partNumber || `part-${part.id}`);

  const getEbayManualDraft = (part: Part): EbayManualDraft => {
    const key = ebayDraftKey(part);
    return ebayManualDrafts[key] || { price: '', url: '' };
  };

  const updateEbayManualDraft = (part: Part, patch: Partial<EbayManualDraft>) => {
    const key = ebayDraftKey(part);
    setEbayManualDrafts((current) => ({
      ...current,
      [key]: {
        price: current[key]?.price || '',
        url: current[key]?.url || '',
        ...patch,
      },
    }));
  };

  const handleManualEbaySave = async (part: Part) => {
    const key = ebayDraftKey(part);
    const draft = getEbayManualDraft(part);
    const model = normalizeModelId(lookupModel || modelEntry || '');
    if (!model) {
      alert('Load a model before saving eBay pricing.');
      return;
    }

    const parsedPrice = parseManualEbayPrice(draft.price);
    if (parsedPrice === null) {
      alert('Enter a valid eBay price.');
      return;
    }

    setEbayManualSaving((current) => ({ ...current, [key]: true }));
    try {
      const response = await fetch('/api/bom/ebay-pricing/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          partNumber: part.partNumber,
          price: parsedPrice,
          priceUrl: draft.url.trim() || null,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result?.error || 'Failed to save eBay price.');
      }

      setEbayManualDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      await handleDbCheck();
      setDbCheckStatus(`Saved manual eBay price for ${part.partNumber}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save eBay price.';
      setDbCheckStatus(`eBay manual save failed: ${message}`);
      alert(message);
    } finally {
      setEbayManualSaving((current) => ({ ...current, [key]: false }));
    }
  };

  const filteredParts = useMemo(() => {
    const dataSource = aiParts.length > 0
      ? (showUnpricedDbRows ? aiParts : aiParts.filter(hasApprovedPrice))
      : (hasModelContext ? [] : partsData);
    const normalizedSearch = searchTerm.toLowerCase();
    const filtered = dataSource.filter(part => {
      const matchesSearch =
        !normalizedSearch ||
        part.description.toLowerCase().includes(normalizedSearch) ||
        part.partNumber.toLowerCase().includes(normalizedSearch) ||
        (part.compatibleModels || []).some(m => m.toLowerCase().includes(normalizedSearch));
      const matchesSection =
        selectedSectionKeys.length === 0 || selectedSectionKeys.includes(normalizeSectionKey(part.section));
      return matchesSearch && matchesSection;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'price_desc') {
        const aPrice = marketPriceValue(a);
        const bPrice = marketPriceValue(b);
        if (aPrice === null && bPrice === null) return a.id - b.id;
        if (aPrice === null) return 1;
        if (bPrice === null) return -1;
        if (bPrice !== aPrice) return bPrice - aPrice;
        return a.id - b.id;
      }
      if (sortBy === 'price_asc') {
        const aPrice = marketPriceValue(a);
        const bPrice = marketPriceValue(b);
        if (aPrice === null && bPrice === null) return a.id - b.id;
        if (aPrice === null) return 1;
        if (bPrice === null) return -1;
        if (aPrice !== bPrice) return aPrice - bPrice;
        return a.id - b.id;
      }
      return a.id - b.id;
    });
  }, [searchTerm, selectedSectionKeys, aiParts, sortBy, showUnpricedDbRows, hasModelContext]);

  const stats = useMemo(() => {
    const dataSource = aiParts.length > 0 ? aiParts : (hasModelContext ? [] : partsData);
    return {
      total: dataSource.length,
      filtered: filteredParts.length,
      sections: dynamicSections.length,
      isAI: aiParts.length > 0
    };
  }, [filteredParts, aiParts, dynamicSections.length, hasModelContext]);

  const isBomComplete = expectedPartCount !== null && aiParts.length >= expectedPartCount;
  const completeBomLabel = isBomComplete
    ? `All ${expectedPartCount} Parts Found`
    : expectedPartCount !== null && aiParts.length > 0
      ? `Exhaustive Pass ${bomPassCount + 1} (${aiParts.length}/${expectedPartCount})`
      : aiParts.length > 0
        ? `Exhaustive Pass ${bomPassCount + 1}`
        : 'Complete BOM';

  const handleCheckCompatibility = (modelOverride?: string) => {
    const modelToUse = modelOverride || checkModel;
    if (!selectedPart || !modelToUse) return;

    const normalizedModel = modelToUse.trim().toUpperCase();
    const isCompatible = selectedPart.compatibleModels.some(m =>
      m === normalizedModel || m === 'Universal'
    );

    let suggestions: Part[] = [];
    if (!isCompatible) {
      suggestions = partsData.filter(p =>
        p.section === selectedPart.section &&
        p.partNumber !== selectedPart.partNumber &&
        p.compatibleModels.includes(normalizedModel)
      ).slice(0, 3);
    }

    setCompatibilityResult({ isCompatible, suggestions });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      newRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setIsFieldChatLoading(true);
        try {
          // Convert binary to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            await processAudioNote(base64Audio);
          };
        } catch (err) {
          console.error("Audio processing failed", err);
        } finally {
          setIsFieldChatLoading(false);
          // Cleanup stream
          stream.getTracks().forEach(track => track.stop());
        }
      };

      newRecorder.start();
      setRecorder(newRecorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied", err);
      alert("Microphone access is required for voice notes. Please enable permissions.");
    }
  };

  const stopRecording = () => {
    if (recorder) {
      recorder.stop();
      setIsRecording(false);
      setRecorder(null);
    }
  };

  const processAudioNote = async (base64Data: string) => {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'audio',
          audioData: base64Data,
          mimeType: 'audio/webm'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Transcription failed');
      }

      const transcript = await response.json();
      if (transcript) {

        setFieldChatMessages(prev => [...prev,
        { role: 'user', text: "[Voice Log Recorded]" },
        { role: 'assistant', text: `Captured Note: "${transcript}". I've added this to your technical log.` }
        ]);
      }
    } catch (error) {
      console.error("Transcription error", error);
    }
  };

  const handleFieldAIChat = async (message: string) => {
    if (!message.trim()) return;

    const userMsg = { role: 'user' as const, text: message };
    setFieldChatMessages(prev => [...prev, userMsg]);
    setIsFieldChatLoading(true);

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'chat',
          message,
          context: {
            part: selectedPart,
            model: checkModel || lookupModel
          },
          history: fieldChatMessages
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Field AI Chat failed');
      }

      const result = await response.json();
      setFieldChatMessages(prev => [...prev, { role: 'assistant', text: result || "System error. Please retry." }]);
    } catch (error) {
      console.error("Field AI Chat Error", error);
    } finally {
      setIsFieldChatLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      {/* Professional Header */}
      <header className="bg-white border-b border-pro-slate-200 sticky top-0 z-30">
        <div className="w-full px-5 sm:px-8 h-20 sm:h-[76px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-1.5 cursor-pointer" onClick={() => window.location.reload()}>
              <span className="text-[22px] sm:text-[26px] font-black tracking-[-0.04em] text-pro-navy uppercase leading-none">
                Roadrunner<span className="text-pro-blue">Parts</span>
              </span>
              <span className="text-[11px] sm:text-xs font-black text-pro-slate-400 uppercase tracking-widest bg-pro-slate-100 px-2.5 py-1 rounded-md">
                v2.5
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-5 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-[460px_minmax(0,1fr)] gap-7">
        {/* Professional Sidebar */}
        <aside className="hidden lg:block space-y-8 border-r border-pro-slate-200 pr-6 min-h-[calc(100vh-7rem)]">
          <section>
            <nav className="flex flex-col gap-3">
              <a
                href={`/bom-workflow?${new URLSearchParams({
                  ...(lookupModel || searchTerm ? { model: lookupModel || searchTerm } : {}),
                  ...(lookupSerial ? { serial: lookupSerial } : {}),
                }).toString()}`}
                className="w-full flex items-center gap-3 px-6 py-4 text-sm font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-all rounded-lg border border-emerald-200 mb-4 shadow-sm"
              >
                <Zap size={18} className="fill-emerald-600" />
                COMMAND CONSOLE
              </a>
              <a
                href={`/bom-workflow?${new URLSearchParams({
                  action: 'market_intel',
                  ...(lookupModel || searchTerm ? { model: lookupModel || searchTerm } : {}),
                  ...(lookupSerial ? { serial: lookupSerial } : {}),
                }).toString()}`}
                className="w-full flex items-center gap-3 px-6 py-4 text-sm font-black uppercase tracking-widest text-pro-blue bg-blue-50 hover:bg-blue-100 transition-all rounded-lg border border-blue-200 mb-4 shadow-sm"
              >
                <Database size={18} className="fill-pro-blue" />
                MARKET INTELLIGENCE
              </a>
              <button
                onClick={() => setSelectedSections([])}
                className={`w-full text-left px-6 py-3.5 text-lg font-semibold transition-all rounded-lg ${selectedSections.length === 0
                  ? 'bg-pro-navy text-white shadow-pro'
                  : 'text-[#31507c] hover:bg-white hover:text-pro-slate-900'
                  }`}
              >
                All Components
              </button>
              {dynamicSections.map((section) => (
                <button
                  key={section}
                  onClick={() => toggleSection(section)}
                  className={`w-full text-left px-6 py-3.5 text-lg font-medium transition-all rounded-lg ${selectedSectionKeys.includes(normalizeSectionKey(section))
                    ? 'bg-pro-navy text-white shadow-pro'
                    : 'text-[#31507c] hover:bg-white hover:text-pro-slate-900'
                    }`}
                >
                  {getSectionDisplayLabel(section)}
                </button>
              ))}
            </nav>
          </section>
          <AssemblyDiagramPreview diagram={activeAssemblyDiagram} />
        </aside>

        {/* Parts Explorer */}
        <section className="space-y-4 overflow-hidden">
          <CurrentEbayHomePanel batch={currentEbayBatch} />

          <div className="flex flex-col gap-6">
            <h1 className="lg:hidden text-2xl font-semibold text-[#435572]">{selectedSectionLabel}</h1>

            <div className="grid grid-cols-2 gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_240px_82px]">
              <div className="pro-card p-5 rounded-lg flex flex-col gap-2 min-h-[82px]">
                <span className="text-xs font-black text-pro-slate-400 uppercase tracking-[0.2em]">Model</span>
                <span className="text-base font-black text-pro-slate-900 truncate">{lookupModel || 'N/A'}</span>
                {modelMSRP && (
                  <span className="text-[9px] font-bold text-pro-blue">MSRP: ${modelMSRP}</span>
                )}
              </div>

              <div className="pro-card p-3 rounded-xl flex flex-col gap-0.5 relative group hidden">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest leading-none">Manufactured</span>
                  <button
                    onClick={handleManufactureRefresh}
                    className="p-1 hover:bg-pro-slate-100 rounded text-pro-slate-400 hover:text-pro-blue transition-colors"
                  >
                    <Zap size={10} className={isRecalculating ? 'animate-spin' : ''} />
                  </button>
                </div>
                <span className="text-xs font-bold text-pro-slate-900">
                  {manufactureInfo ? `${manufactureInfo.manufactureYear} • ${manufactureInfo.timeValue?.unit === 'month' ? 'M' : 'W'}${manufactureInfo.timeValue?.value}` : 'UNDETECTED'}
                </span>
                {manufactureInfo && (
                  <span className={`text-[8px] font-black uppercase text-white px-1 rounded-sm w-fit ${manufactureInfo.confidence === 'high' ? 'bg-emerald-500' :
                    manufactureInfo.confidence === 'medium' ? 'bg-pro-blue' : 'bg-amber-500'
                    }`}>{manufactureInfo.confidence} Confidence</span>
                )}
              </div>

              <div className="pro-card p-3 rounded-xl flex flex-col gap-1 hidden">
                <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Market Value</span>
                <span className="text-base font-black text-emerald-600 leading-none">
                  {valuation ? `$${valuation.currentMarketValue.toFixed(2)}` : '--'}
                </span>
                <select
                  className="text-[9px] font-bold text-pro-slate-500 bg-transparent focus:outline-none cursor-pointer uppercase tracking-tighter"
                  value={applianceCondition}
                  onChange={(e) => setApplianceCondition(e.target.value as ApplianceCondition)}
                >
                  <option value="excellent">Mint Condition</option>
                  <option value="good">Standard Use</option>
                  <option value="fair">Well Used</option>
                  <option value="poor">Scrap / Salvage</option>
                </select>
              </div>

              <div className="pro-card p-5 rounded-lg flex flex-col gap-2 min-h-[82px]">
                <span className="text-xs font-black text-pro-slate-400 uppercase tracking-[0.2em] leading-none">Active Serial</span>
                <input
                  type="text"
                  placeholder="ENTER SERIAL #"
                  value={lookupSerial || ''}
                  onChange={(e) => {
                    const s = e.target.value.toUpperCase();
                    setLookupSerial(s);
                    if (s.length > 3) {
                      setManufactureInfo(decoder.decode(s));
                    } else {
                      setManufactureInfo(null);
                    }
                  }}
                  className="bg-transparent text-base font-black text-pro-slate-900 focus:outline-none w-full placeholder:text-pro-slate-300 border-b border-transparent focus:border-pro-blue py-0.5"
                />
              </div>

              <div className="pro-card hidden min-h-[82px] items-center rounded-lg p-3 lg:flex">
                <button
                  className={`pro-button h-[54px] w-full rounded-lg px-6 text-base ${isBomComplete ? 'bg-pro-slate-200 text-pro-slate-500 cursor-not-allowed' : 'pro-button-primary'}`}
                  onClick={() => handleAILookup(undefined, undefined, true)}
                  disabled={isAILoading || isBomComplete}
                  title={isBomComplete ? `All ${expectedPartCount} parts found` : 'Complete BOM Pass (Exhaustive)'}
                >
                  {isAILoading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      <span>{completeBomLabel}</span>
                    </>
                  ) : isBomComplete ? (
                    <>
                      <CheckCircle2 size={16} className="text-pro-emerald" />
                      <span>{completeBomLabel}</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="text-pro-blue" size={22} />
                      <span>{completeBomLabel}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pro-card relative hidden min-h-[82px] items-center justify-center rounded-lg p-3 lg:flex">
                <button
                  onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                  className={`pro-button h-[54px] w-full rounded-lg px-3 ${isScanning ? 'pro-button-primary animate-pulse' : 'pro-button-secondary'}`}
                  title="Scan model tag"
                  disabled={isScanning}
                >
                  {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                </button>

                <AnimatePresence>
                  {isSourceMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white border border-pro-slate-200 rounded-xl shadow-pro-lg z-50 overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          setScanType('search');
                          cameraInputRef.current?.click();
                          setIsSourceMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors border-b border-pro-slate-100"
                      >
                        <Camera size={14} />
                        TAKE PHOTO
                      </button>
                      <button
                        onClick={() => {
                          setScanType('search');
                          uploadInputRef.current?.click();
                          setIsSourceMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors"
                      >
                        <ImageIcon size={14} />
                        UPLOAD IMAGE
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Search and Action Bar */}
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.95fr)_minmax(260px,1fr)_190px_82px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-pro-slate-400" size={19} />
                <input
                  type="text"
                  placeholder="MODEL #: HTDX100ED3WW"
                  className="pro-input h-[54px] pl-12 rounded-lg text-base font-medium placeholder:text-pro-slate-400"
                  value={modelEntry}
                  onChange={(e) => setModelEntry(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (modelEntry || lookupModel).trim().length >= 3) {
                      handleDbCheck();
                    }
                  }}
                />
              </div>

              <div className="relative">
                <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-pro-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="PART #: WE03X29897 OR DRUM BELT"
                  className="pro-input h-[54px] pl-12 rounded-lg text-base font-medium placeholder:text-pro-slate-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (searchTerm.trim().length >= 3 || modelEntry.trim().length >= 3)) {
                      handleDbCheck();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleDbCheck}
                disabled={isDbChecking}
                className="pro-button pro-button-primary h-[54px] rounded-lg px-5 text-sm"
                title="Check stored model and part evidence in the database"
              >
                {isDbChecking ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Checking</span>
                  </>
                ) : (
                  <>
                    <Database size={17} />
                    <span>Check DB</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetIdentity}
                className="pro-button pro-button-secondary h-[54px] w-[54px] justify-center rounded-full px-0 text-pro-slate-500 hover:text-pro-navy"
                title="Reset model and serial"
              >
                <RotateCcw size={22} />
              </button>

              <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-4 lg:hidden">
                <div className="flex gap-2 flex-1 lg:flex-initial">
                  <button
                    className={`pro-button h-[54px] px-8 flex-1 lg:flex-initial rounded-lg text-base ${isBomComplete ? 'bg-pro-slate-200 text-pro-slate-500 cursor-not-allowed' : 'pro-button-primary'}`}
                    onClick={() => handleAILookup(undefined, undefined, true)}
                    disabled={isAILoading || isBomComplete}
                    title={isBomComplete ? `All ${expectedPartCount} parts found` : 'Complete BOM Pass (Exhaustive)'}
                  >
                    {isAILoading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>{completeBomLabel}</span>
                      </>
                    ) : isBomComplete ? (
                      <>
                        <CheckCircle2 size={16} className="text-pro-emerald" />
                        <span>{completeBomLabel}</span>
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="text-pro-blue" size={22} />
                        <span>{completeBomLabel}</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                    className={`pro-button h-[54px] w-full lg:w-[60px] px-3 rounded-lg ${isScanning ? 'pro-button-primary animate-pulse' : 'pro-button-secondary'}`}
                    title="Scan model tag"
                    disabled={isScanning}
                  >
                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                  </button>

                  <AnimatePresence>
                    {isSourceMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-pro-slate-200 rounded-xl shadow-pro-lg z-50 overflow-hidden"
                      >
                        <button
                          onClick={() => {
                            setScanType('search');
                            cameraInputRef.current?.click();
                            setIsSourceMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors border-b border-pro-slate-100"
                        >
                          <Camera size={14} />
                          TAKE PHOTO
                        </button>
                        <button
                          onClick={() => {
                            setScanType('search');
                            uploadInputRef.current?.click();
                            setIsSourceMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors"
                        >
                          <ImageIcon size={14} />
                          UPLOAD IMAGE
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            {dbCheckStatus && (
              <div className="rounded-lg border border-pro-slate-200 bg-white px-4 py-2 text-xs font-semibold text-pro-slate-600">
                {dbCheckStatus}
              </div>
            )}

          </div>

          {/* View Mode and Sorting Controls */}
          <div className="flex items-center justify-between border-y border-pro-slate-200/60 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-3 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-pro-navy shadow-sm' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
                title="Grid view"
              >
                <LayoutGrid size={22} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-3 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-pro-navy shadow-sm' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
                title="List view"
              >
                <TableIcon size={22} />
              </button>
              <button
                onClick={() =>
                  setSortBy((current) => {
                    if (current === 'id') return 'price_desc';
                    if (current === 'price_desc') return 'price_asc';
                    return 'id';
                  })
                }
                className="h-11 rounded-lg border border-pro-slate-200 bg-white px-3 text-xs font-bold uppercase tracking-wider text-pro-slate-600 transition-colors hover:border-pro-blue hover:text-pro-blue"
                title="Toggle price sorting (high to low, low to high, default)"
              >
                {sortBy === 'price_desc' ? 'Price High-Low' : sortBy === 'price_asc' ? 'Price Low-High' : 'Default Sort'}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => ebayPricingUploadRef.current?.click()}
                  disabled={isEbayUploadLoading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-pro-slate-300 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-pro-slate-600 transition-colors hover:border-pro-blue hover:text-pro-blue disabled:opacity-60"
                  title="Upload CSV/XLSX with Part Number + eBay Price to update DB"
                >
                  {isEbayUploadLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                  Upload eBay Sheet
                </button>
                <button
                  onClick={handleDownloadInventorySheet}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-pro-slate-300 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-pro-slate-600 transition-colors hover:border-pro-blue hover:text-pro-blue"
                  title="Download OriginalUsedAppliancesDB.xlsx"
                >
                  <Download size={14} />
                  Download Inventory Sheet
                </button>
                <button
                  onClick={() => window.print()}
                  className="p-3 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                  title="Print BOM"
                >
                  <Printer size={24} />
                </button>
                {stats.isAI && (
                  <>
                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(aiParts, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `BOM-${lookupModel}.json`;
                        a.click();
                      }}
                      className="p-1.5 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                      title="Export JSON"
                    >
                      <FileJson size={16} />
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="p-1.5 text-pro-slate-400 hover:text-pro-slate-900 transition-colors"
                      title="Export CSV"
                    >
                      <FileSpreadsheet size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setIsCategoryMenuOpen((open) => !open)}
              className="flex h-[76px] w-full items-center justify-between rounded-xl border border-pro-blue bg-white px-7 text-2xl font-semibold text-pro-navy shadow-sm"
            >
              <span>{selectedSectionLabel}</span>
              <ChevronDown
                size={24}
                className={`transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isCategoryMenuOpen && (
              <nav className="mt-5 rounded-xl bg-white p-4 shadow-pro-md ring-1 ring-pro-slate-100">
                <button
                  onClick={() => {
                    setSelectedSections([]);
                    setIsCategoryMenuOpen(false);
                  }}
                  className={`w-full text-left px-5 py-4 text-xl font-semibold transition-all rounded-lg ${selectedSections.length === 0
                    ? 'bg-pro-navy text-white shadow-pro'
                    : 'text-pro-navy hover:bg-pro-slate-100'
                    }`}
                >
                  All Components
                </button>
                {dynamicSections.map((section) => (
                  <button
                    key={section}
                    onClick={() => {
                      toggleSection(section);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`w-full text-left px-5 py-4 text-xl font-medium transition-all rounded-lg ${selectedSectionKeys.includes(normalizeSectionKey(section))
                      ? 'bg-pro-navy text-white shadow-pro'
                      : 'text-pro-navy hover:bg-pro-slate-100'
                      }`}
                  >
                    {getSectionDisplayLabel(section)}
                  </button>
                ))}
              </nav>
            )}
            <div className="mt-5">
              <AssemblyDiagramPreview diagram={activeAssemblyDiagram} />
            </div>
          </div>

          {filteredParts.length === 0 ? (
            <div className="pro-card p-16 flex flex-col items-center text-center rounded-2xl border-dashed">
              <div className="w-16 h-16 bg-pro-slate-100 rounded-2xl flex items-center justify-center mb-6">
                <Search size={32} className="text-pro-slate-400" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-pro-slate-900">No matching parts found</h3>
              <p className="text-sm text-pro-slate-500 max-w-sm mb-8 leading-relaxed">
                We couldn't find any components matching <span className="font-semibold text-pro-slate-900">"{searchTerm}"</span> in our local database. You can try an AI-powered deep scan.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleAILookup(searchTerm)}
                  disabled={isAILoading}
                  className="pro-button pro-button-primary px-8"
                >
                  {isAILoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Deep Intelligence Lookup
                </button>
                <button
                  onClick={() => setSearchTerm('')}
                  className="pro-button pro-button-secondary px-8"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredParts.map((part) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={part.id}
                  onClick={() => setSelectedPart(part)}
                  className="pro-card pro-card-hover p-4 cursor-pointer flex flex-col justify-between rounded-xl h-full"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">
                        {getDiagramReferenceLabel(part)}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-pro-slate-900 mb-2 leading-snug group-hover:text-pro-blue transition-colors">
                      {part.description}
                    </h3>
                    <p className="text-[10px] font-mono text-pro-slate-400 uppercase tracking-tighter">PN: {part.partNumber}</p>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-pro-slate-50">
                    <div>
                      {hasApprovedPrice(part) && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-black text-pro-slate-900">${part.price!.toFixed(2)}</span>
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                            {normalizePriceSource(part.priceSource)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-pro-slate-50 flex items-center justify-center text-pro-slate-400 group-hover:bg-pro-blue group-hover:text-white transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="pro-card rounded-lg overflow-hidden border-pro-slate-200">
              <div className="bg-pro-navy px-5 py-2 border-b border-pro-navy flex items-center justify-between text-[10px] text-white font-black tracking-[0.18em] uppercase">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={14} className="text-pro-blue animate-pulse" />
                  Advanced Technical Dataset
                </div>
                <div className="hidden sm:flex items-center gap-2 text-[9px]">
                  RT Engine 3.1 - Neural High-Thinking
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1480px] table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[16rem]" />
                    <col className="w-[38rem]" />
                    <col className="w-[10rem]" />
                    <col className="w-[10rem]" />
                    <col className="w-[13rem]" />
                    <col className="w-[18rem]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-pro-slate-50 border-b border-pro-slate-200">
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">OEM Identifier</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Component Description</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Market Cost</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">eBay Manual</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Assembly</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pro-slate-100">
                    {filteredParts.map((part) => {
                      const activeEbayUrl = ebaySearchUrl(part.partNumber);
                      const soldCompsUrl = ebaySoldSearchUrl(part.partNumber);
                      const manualDraft = getEbayManualDraft(part);
                      const isManualSaving = ebayManualSaving[ebayDraftKey(part)] === true;

                      return (
                        <tr
                          key={part.id}
                          onClick={() => setSelectedPart(part)}
                          className="hover:bg-pro-slate-50 cursor-pointer transition-colors group"
                        >
                        <td className="align-top px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-bold text-pro-navy group-hover:text-pro-blue underline decoration-transparent group-hover:decoration-pro-blue/30 transition-all">{part.partNumber}</span>
                            <span className="text-[9px] font-bold text-pro-slate-400">{getDiagramReferenceLabel(part)}</span>
                          </div>
                        </td>
                        <td className="align-top px-4 py-3 text-xs font-semibold leading-snug text-pro-slate-700">{part.description}</td>
                        <td className="align-top px-4 py-3">
                          <div className="flex flex-col">
                            {hasApprovedPrice(part) ? (
                              <>
                                <span className="text-sm font-black text-pro-slate-900">${part.price!.toFixed(2)}</span>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">
                                  {normalizePriceSource(part.priceSource)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-tight text-pro-slate-400">
                                No verified price
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="align-top px-4 py-3">
                          <div
                            className="flex w-full min-w-[11rem] flex-col gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={manualDraft.price}
                              onChange={(event) => updateEbayManualDraft(part, { price: event.target.value })}
                              placeholder="Enter eBay price"
                              className="h-8 rounded-md border border-pro-slate-200 bg-white px-2 text-[11px] font-semibold text-pro-slate-700 outline-none transition-colors focus:border-pro-blue"
                            />
                            <input
                              type="text"
                              value={manualDraft.url}
                              onChange={(event) => updateEbayManualDraft(part, { url: event.target.value })}
                              placeholder="Paste eBay listing URL"
                              className="h-8 rounded-md border border-pro-slate-200 bg-white px-2 text-[11px] font-medium text-pro-slate-700 outline-none transition-colors focus:border-pro-blue"
                            />
                            <button
                              type="button"
                              onClick={() => handleManualEbaySave(part)}
                              disabled={isManualSaving}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-pro-blue bg-white px-2 text-[10px] font-bold uppercase tracking-wider text-pro-blue transition-colors hover:bg-blue-50 disabled:opacity-60"
                            >
                              {isManualSaving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              Save eBay
                            </button>
                          </div>
                        </td>
                        <td className="align-top px-4 py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-pro-slate-100 text-pro-slate-500 rounded uppercase tracking-tighter">
                            {getSectionDisplayLabel(part.section)}
                          </span>
                        </td>
                          <td className="align-top px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <a
                                href={activeEbayUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex h-7 items-center whitespace-nowrap rounded border border-pro-blue bg-white px-3 text-[11px] font-semibold text-pro-blue transition-colors hover:bg-blue-50"
                              >
                                Search eBay
                              </a>
                              <a
                                href={soldCompsUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex h-7 items-center whitespace-nowrap rounded border border-pro-slate-300 bg-pro-slate-900 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-pro-navy"
                              >
                                Sold Comps
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {isPromptReviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-pro-navy/70 p-4 backdrop-blur-md"
            onClick={() => {
              setIsPromptReviewOpen(false);
              setPendingBomRequest(null);
            }}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              className="pro-card w-full max-w-4xl overflow-hidden rounded-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-pro-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-pro-slate-900">Review Prompt</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-pro-slate-400">
                    Edit before the BOM request is sent
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsPromptReviewOpen(false);
                    setPendingBomRequest(null);
                  }}
                  className="p-2 text-pro-slate-400 transition-colors hover:text-pro-slate-900"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                {pendingBomRequest && (
                  <div className="rounded-xl border border-pro-slate-200 bg-pro-slate-50 px-4 py-3 text-[11px] text-pro-slate-700">
                    <div><span className="font-bold text-pro-slate-900">Model:</span> {pendingBomRequest.model}</div>
                    <div><span className="font-bold text-pro-slate-900">Serial:</span> {pendingBomRequest.serial || 'None'}</div>
                    <div><span className="font-bold text-pro-slate-900">Pass:</span> {pendingBomRequest.passNumber}</div>
                  </div>
                )}
                <textarea
                  value={pendingBomPrompt}
                  onChange={(e) => setPendingBomPrompt(e.target.value)}
                  placeholder="Write the post-OCR prompt here. This exact text will be sent."
                  className="min-h-[320px] w-full rounded-xl border border-pro-slate-200 bg-pro-slate-50 p-4 font-mono text-[12px] leading-6 text-pro-slate-800 outline-none focus:border-pro-blue"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPendingBomPrompt('')}
                    className="pro-button pro-button-secondary px-5"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPromptReviewOpen(false);
                      setPendingBomRequest(null);
                    }}
                    className="pro-button pro-button-secondary px-5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApprovePrompt}
                    disabled={!pendingBomRequest || isAILoading}
                    className="pro-button pro-button-primary px-5"
                  >
                    {isAILoading ? 'Sending...' : 'Approve & Send'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Diagnostic Modal */}
      {/* Professional Global Diagnostic Modal */}
      <AnimatePresence>
        {isMainDiagOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-pro-navy/60 backdrop-blur-md overflow-y-auto"
            onClick={() => setIsMainDiagOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="pro-card bg-white w-full max-w-3xl overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white border-b border-pro-slate-100 p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-pro-slate-100 p-2 rounded-xl">
                    <BrainCircuit className="text-pro-blue" size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-pro-slate-900 leading-tight">AI Diagnostic Interface</h2>
                    <p className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Neural Multi-Path Analysis Engaged</p>
                  </div>
                </div>
                <button onClick={() => setIsMainDiagOpen(false)} className="p-2 text-pro-slate-400 hover:text-pro-slate-900 transition-colors">
                  <X />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Text Diagnostic Input */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Symptom Description</label>
                    <div className="relative">
                      <textarea
                        placeholder="ENTER SYMPTOMS (E.G. NO DRAIN, GRINDING NOISE)..."
                        className="pro-input w-full p-4 min-h-[160px] resize-none"
                        value={diagQuery}
                        onChange={(e) => setDiagQuery(e.target.value)}
                      />
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={() => handleDeepDiagnostic()}
                          disabled={isDiagLoading || !diagQuery}
                          className="pro-button pro-button-primary py-1.5"
                        >
                          {isDiagLoading ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                          <span>Analyze</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Video Diagnostic Input */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Acoustic / Video Analysis</label>
                    <div className="pro-card border-dashed p-6 flex flex-col items-center justify-center text-center hover:bg-pro-slate-50 transition-all cursor-pointer relative h-[160px] rounded-lg">
                      <input
                        type="file"
                        accept="video/*"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={handleVideoDiagnostic}
                      />

                      {isVideoLoading ? (
                        <div className="space-y-2">
                          <Loader2 className="animate-spin text-pro-blue mx-auto" size={24} />
                          <p className="text-[10px] font-bold text-pro-blue uppercase tracking-widest animate-pulse">Processing Stream...</p>
                        </div>
                      ) : (
                        <>
                          <Video className="text-pro-slate-300 mb-2" size={32} />
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-pro-slate-900">Upload Failure Video</p>
                            <p className="text-[9px] font-medium text-pro-slate-400 uppercase leading-tight max-w-[140px]">
                              Analyzing pattern cycles via AI sound detection.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Analysis Result Display */}
                {(diagResult || videoResult) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pro-card bg-pro-navy p-6 rounded-xl relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                      <span className="text-[10px] font-bold text-pro-blue uppercase tracking-widest">Intelligence Report</span>
                      <BrainCircuit size={14} className="text-white/20" />
                    </div>
                    <div className="whitespace-pre-wrap text-white/90 font-medium text-xs leading-relaxed max-h-[300px] overflow-y-auto pr-4 custom-scrollbar">
                      {videoResult || diagResult}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Professional Part Detail Dialog */}
      <AnimatePresence>
        {selectedPart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-pro-navy/60 backdrop-blur-md overflow-y-auto"
            onClick={() => setSelectedPart(null)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="pro-card bg-white w-full max-w-5xl overflow-hidden rounded-2xl my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-pro-navy text-white p-6 md:p-8 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="bg-pro-blue text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">
                      OEM CERTIFIED
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none uppercase">
                    {selectedPart.description}
                  </h2>
                  <div className="flex items-center gap-4 mt-6">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Diag ID</span>
                      <span className="text-sm font-mono font-bold text-white/90">{getDiagramReferenceId(selectedPart)}</span>
                    </div>
                    {hasApprovedPrice(selectedPart) && (
                      <div className="flex flex-col border-l border-white/10 pl-4">
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Market Value</span>
                        <span className="text-2xl font-black text-emerald-400 leading-none">${selectedPart.price!.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedPart(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                  <X />
                </button>
              </div>

              {/* Advanced Diagnostics Tab */}
              <div className="bg-pro-slate-50 px-6 flex border-b border-pro-slate-100">
                <button
                  onClick={() => setShowDiagPanel(false)}
                  className={`py-4 px-6 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${!showDiagPanel ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  Technical Specifications
                </button>
                <button
                  onClick={() => setShowDiagPanel(true)}
                  className={`py-4 px-6 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-b-2 ${showDiagPanel ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  <BrainCircuit size={14} /> Intelligence Analysis
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                {!showDiagPanel ? (
                  <>
                    <div className="p-6 md:p-8 space-y-10 bg-white border-r border-pro-slate-100">
                      <section>
                        <h3 className="pro-section-title flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-pro-blue" />
                          Compatibility Audit
                        </h3>
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="ENTER MODEL NUMBER TO VERIFY"
                                className="pro-input py-2 text-xs font-bold"
                                value={checkModel}
                                onChange={(e) => setCheckModel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCheckCompatibility();
                                }}
                              />
                            </div>
                            <button
                              onClick={() => handleCheckCompatibility()}
                              className="pro-button pro-button-primary shrink-0"
                            >
                              Verify
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => setIsCompatSourceMenuOpen(!isCompatSourceMenuOpen)}
                                className={`pro-button px-3 shrink-0 ${isScanning && scanType === 'compatibility' ? 'pro-button-primary animate-pulse' : 'pro-button-secondary'}`}
                                title="Scan tag to pre-fill model"
                                disabled={isScanning}
                              >
                                {isScanning && scanType === 'compatibility' ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                              </button>

                              <AnimatePresence>
                                {isCompatSourceMenuOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-pro-slate-200 rounded-xl shadow-pro-lg z-50 overflow-hidden"
                                  >
                                    <button
                                      onClick={() => {
                                        setScanType('compatibility');
                                        cameraInputRef.current?.click();
                                        setIsCompatSourceMenuOpen(false);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors border-b border-pro-slate-100"
                                    >
                                      <Camera size={14} />
                                      TAKE PHOTO
                                    </button>
                                    <button
                                      onClick={() => {
                                        setScanType('compatibility');
                                        uploadInputRef.current?.click();
                                        setIsCompatSourceMenuOpen(false);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-pro-slate-600 hover:bg-pro-slate-50 hover:text-pro-blue transition-colors"
                                    >
                                      <ImageIcon size={14} />
                                      UPLOAD IMAGE
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>

                          <AnimatePresence mode="wait">
                            {compatibilityResult && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className={`pro-card p-4 border-dashed rounded-lg ${compatibilityResult.isCompatible
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-red-50 border-red-200 text-red-900'
                                  }`}
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  {compatibilityResult.isCompatible ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                  <span className="text-xs font-bold uppercase tracking-tight">
                                    {compatibilityResult.isCompatible ? 'Validated Compatible' : 'Incompatible Variant'}
                                  </span>
                                </div>

                                {!compatibilityResult.isCompatible && compatibilityResult.suggestions.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-red-100">
                                    <p className="text-[10px] font-bold uppercase mb-3 text-red-700">Recommended Alternatives:</p>
                                    <div className="space-y-2">
                                      {compatibilityResult.suggestions.map(s => (
                                        <button
                                          key={s.id}
                                          onClick={() => setSelectedPart(s)}
                                          className="w-full pro-card p-3 bg-white hover:border-pro-blue flex justify-between items-center rounded-lg shadow-sm"
                                        >
                                          <span className="text-xs font-semibold truncate pr-4 text-pro-slate-900">{s.description}</span>
                                          <span className="text-[10px] font-bold text-pro-blue uppercase">{s.partNumber}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </section>

                      <section>
                        <h3 className="pro-section-title flex items-center gap-2">
                          <AlertCircle size={14} className="text-amber-500" />
                          Engineering Profile
                        </h3>
                        <div className="pro-card bg-pro-slate-50 p-4 space-y-4 rounded-xl border-dashed">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-pro-slate-400 uppercase">Assembly Context</span>
                            <span className="text-xs font-bold text-pro-slate-900 uppercase italic">{selectedPart.section}</span>
                          </div>
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-pro-slate-400 uppercase">Availability</span>
                            <span className="text-xs font-bold text-emerald-600 uppercase flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                              Active Stock
                            </span>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="p-6 md:p-8 bg-pro-slate-50/50 flex flex-col h-full max-h-[700px]">
                      <h3 className="pro-section-title flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={14} className="text-pro-blue" />
                          Field Intelligence Assistant
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                          <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isFieldChatLoading ? 'animate-ping' : ''}`}></div>
                          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Active Relay</span>
                        </div>
                      </h3>

                      <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar min-h-[400px]">
                        {/* Conversation History */}
                        <div className="space-y-3 mb-6 bg-pro-slate-50/50 p-3 rounded-xl border border-pro-slate-100">
                          {fieldChatMessages.length === 0 && (
                            <div className="text-[10px] text-pro-slate-400 text-center py-6 font-bold uppercase tracking-widest italic">
                              Awaiting technical briefing or voice notes...
                            </div>
                          )}
                          {fieldChatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm ${msg.role === 'user'
                                ? 'bg-pro-blue text-white rounded-tr-none'
                                : 'bg-white text-pro-navy rounded-tl-none border border-pro-slate-100'
                                }`}>
                                <div className="flex items-center gap-1.5 mb-1 opacity-60 font-black uppercase text-[8px]">
                                  {msg.role === 'user' ? <User size={8} /> : <Sparkles size={8} />}
                                  {msg.role === 'user' ? 'Technician' : 'Logic Assistant'}
                                </div>
                                {msg.text}
                              </div>
                            </div>
                          ))}
                          {isFieldChatLoading && (
                            <div className="flex justify-start">
                              <div className="bg-white p-2 text-pro-blue animate-pulse rounded-full shadow-sm border border-pro-slate-100">
                                <Loader2 size={12} className="animate-spin" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 p-8 md:p-12 bg-white space-y-8 min-h-[500px]">
                    <div className="flex items-center flex-col md:flex-row gap-6 mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-pro-slate-900 flex items-center justify-center text-white shadow-lg">
                        <Zap size={28} className="text-pro-blue animate-pulse" />
                      </div>
                      <div className="text-center md:text-left">
                        <h3 className="text-xl font-bold text-pro-slate-900 tracking-tight">Assisted Diagnostics</h3>
                        <p className="text-xs font-bold text-pro-blue uppercase tracking-widest">Roadrunner Precision Analysis Active</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">Analyze Symptoms</label>
                      <div className="relative">
                        <textarea
                          placeholder=" DESCRIBE SPECIFIC FAILURE MODES (E.G. ERROR F3, BURNING SMELL DURING CYCLE)..."
                          className="pro-input w-full p-6 text-sm min-h-[160px] bg-pro-slate-50 border-none focus:bg-white"
                          value={diagQuery}
                          onChange={(e) => setDiagQuery(e.target.value)}
                        />
                        <div className="absolute bottom-4 right-4">
                          <button
                            onClick={() => handleDeepDiagnostic()}
                            disabled={isDiagLoading || !diagQuery}
                            className="pro-button pro-button-primary px-6 shadow-pro-md"
                          >
                            {isDiagLoading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                            <span>Generate Logic</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {diagResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="pro-card bg-pro-navy p-6 rounded-2xl relative overflow-hidden"
                      >
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                          <span className="text-[10px] font-bold text-pro-blue uppercase tracking-widest">Trace Diagnostics Report</span>
                        </div>
                        <div className="whitespace-pre-wrap text-white/90 font-medium text-xs leading-relaxed max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                          {diagResult}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto p-12 flex flex-col md:flex-row items-center justify-between border-t border-pro-slate-200 mt-20 text-pro-slate-900 bg-white rounded-t-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-pro-blue"></div>
        <div className="flex items-center gap-6 mb-6 md:mb-0">
          <div className="bg-pro-navy p-3 border border-pro-navy rounded-xl shadow-sm">
            <ClipboardList size={24} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pro-navy">Unified Intelligence Framework</p>
            <p className="text-[10px] font-bold text-pro-slate-400 uppercase">Master Catalog System • Production Build v2.5.0</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold uppercase text-pro-slate-400">Environment</p>
            <p className="text-xs font-bold uppercase text-pro-navy">Secure Cloud Relay</p>
          </div>
          <div className="h-10 w-px bg-pro-slate-200 hidden sm:block"></div>
          <div className="bg-pro-navy text-white px-6 py-2 rounded-full font-bold text-[10px] tracking-widest shadow-md uppercase">
            Validated BOM Data • 2026 Edition
          </div>
        </div>
      </footer>

      {/* Hidden OCR Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={ebayPricingUploadRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleEbayPricingUpload}
      />
    </div>
  );
}
