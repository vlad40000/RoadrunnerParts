'use client';

/**
 * RoadrunnerParts
 * A premium BOM intelligence dashboard for appliance parts lookup and diagnostics.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ChevronRight,
  X,
  Package,
  Shield,
  ClipboardList,
  Database,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  SearchCheck,
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
  RefreshCcw,
  Image as ImageIcon,
  History,
  TrendingUp,
  BarChart3,
  FileText,
  Copy,
  ExternalLink
} from 'lucide-react';
import { partsData, Part } from './partsData';
import { EbaySummary, EbayDraft } from './features/ebay/schemas';

import { ApplianceDecoder, DecodeResult } from './lib/decoder';
import { computeCurrentMarketValue, ApplianceCondition, ValuationResult } from './lib/valuation';
import { ebaySearchUrl, ebaySoldSearchUrl } from './features/bom/services/ebay-links';
import { 
  SOURCE_TIERS, 
  normalizeModelForSupplier, 
  buildSupplierSearchUrl,
  supplierDisplayName
} from './features/bom/services/source-tier-policy';

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

const normalizeModelId = (value?: string | null) => (value || '').toUpperCase().trim().replace(/\./g, '');

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [bomPassCount, setBomPassCount] = useState(0);
  const [expectedPartCount, setExpectedPartCount] = useState<number | null>(null);

  const selectedSectionLabel = useMemo(() => {
    if (selectedSections.length === 0) return 'All Components';
    if (selectedSections.length === 1) return selectedSections[0];
    return `${selectedSections.length} Categories Selected`;
  }, [selectedSections]);

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);






  // Compatibility state
  const [checkModel, setCheckModel] = useState('');
  const [compatibilityResult, setCompatibilityResult] = useState<{
    isCompatible: boolean;
    suggestions: Part[];
  } | null>(null);



  const [isScanning, setIsScanning] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiParts, setAIParts] = useState<Part[]>([]);
  const [lookupModel, setLookupModel] = useState<string | null>(null);
  const [lookupSerial, setLookupSerial] = useState<string | null>(null);
  const [modelMSRP, setModelMSRP] = useState<number | null>(null);
  const [manufactureInfo, setManufactureInfo] = useState<DecodeResult | null>(null);
  const [applianceCondition, setApplianceCondition] = useState<ApplianceCondition>('good');
  const [valuation, setValuation] = useState<ValuationResult | null>(null);
  const [scanType, setScanType] = useState<'search' | 'compatibility' | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [sortBy, setSortBy] = useState<'id' | 'rating' | 'popularity'>('id');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(true);
  const [activeDetailTab, setActiveDetailTab] = useState<'specs' | 'diag' | 'resale'>('specs');

  // eBay Resale State
  const [ebaySummary, setEbaySummary] = useState<Record<string, EbaySummary>>({});
  const [ebayDrafts, setEbayDrafts] = useState<Record<string, EbayDraft>>({});
  const [isEbayLoading, setIsEbayLoading] = useState<Record<string, boolean>>({});
  const [ebayCaptureText, setEbayCaptureText] = useState('');

  // Manual Distributor Control State
  const [selectedTier, setSelectedTier] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStage, setJobStage] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isDistributorPanelOpen, setIsDistributorPanelOpen] = useState(true);
  const [sourceActionBusy, setSourceActionBusy] = useState<Record<string, boolean>>({});

  const [verifiedStatus, setVerifiedStatus] = useState<Record<string, { state: 'loading' | 'valid' | 'invalid' | null, source?: string }>>({});

  const handleVerifyPart = async (part: Part) => {
    const key = part.partNumber;
    setVerifiedStatus(prev => ({ ...prev, [key]: { state: 'loading' } }));
    
    try {
      const res = await fetch('/api/bom/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partNumber: part.partNumber, model: lookupModel })
      });
      const data = await res.json();
      
      if (data.isValid) {
        setVerifiedStatus(prev => ({ ...prev, [key]: { state: 'valid', source: data.source } }));
        // Update part in aiParts or partsData if we found a price
        if (data.price) {
          setAIParts(prev => prev.map(p => p.partNumber === part.partNumber ? { ...p, price: data.price, priceSource: data.source } : p));
        }
      } else {
        setVerifiedStatus(prev => ({ ...prev, [key]: { state: 'invalid' } }));
      }
    } catch (err) {
      setVerifiedStatus(prev => ({ ...prev, [key]: { state: 'invalid' } }));
    }
  };

  const handleSourceAction = async (
    supplierId: string, 
    task: string, 
    params: { 
      searchUrl?: string; 
      selectedAssemblies?: any[]; 
      pricingSource?: string;
      tierKey?: string;
    } = {}
  ) => {
    if (!lookupModel) return;
    
    setSourceActionBusy(prev => ({ ...prev, [supplierId]: true }));
    try {
      const response = await fetch('/api/bom/source-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          canonicalModel: lookupModel,
          supplier: supplierId,
          task,
          tierKey: params.tierKey,
          searchUrl: params.searchUrl,
          selectedAssemblies: params.selectedAssemblies,
          pricingSource: params.pricingSource,
          brand: manufactureInfo?.brandFamily,
          serial: lookupSerial,
          productType: undefined
        }),
      });

      if (!response.ok) {
        throw new Error(`Source action failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (task === "load_supplier_index" && data?.result?.supplierIndex) {
        const supplierIndex = data.result.supplierIndex;
        setResults((prev: any) => ({
          ...(prev || {}),
          supplier: supplierId,
          tierKey: params.tierKey,
          sourceUrl: params.searchUrl,
          supplierIndex,
          assemblies: supplierIndex.assemblies.map((assembly: any) => ({
            ...assembly,
            selected: false,
          })),
        }));
        return;
      }

      if (data.jobId) {
        setJobId(data.jobId);
        // Initial fetch of job state
        const statusRes = await fetch(`/api/bom/jobs/${data.jobId}`);
        const jobData = await statusRes.json();
        const job = jobData.job;
        if (job) {
          setJobStage(job.stage);
          setJobStatus(job.status);
          setResults(job.result || null);
        }
      }
    } catch (err) {
      console.error("Manual action failed:", err);
      alert("Manual action failed. Check console for details.");
    } finally {
      setSourceActionBusy(prev => ({ ...prev, [supplierId]: false }));
    }
  };

  const toggleAssembly = (assemblyId: string) => {
    setResults((prev: any) => {
      if (!prev || !prev.assemblies) return prev;
      return {
        ...prev,
        assemblies: prev.assemblies.map((a: any) => 
          a.id === assemblyId ? { ...a, selected: !a.selected } : a
        )
      };
    });
  };

  // Poll for background job updates
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bom/jobs/${jobId}`);
        if (!res.ok) return;
        const jobData = await res.json();
        const job = jobData.job;
        if (!job) return;
        
        setJobStage(job.stage);
        setJobStatus(job.status);
        if (job.result) {
          setResults(job.result);
          // If we have new parts, sync them to aiParts
          if (Array.isArray(job.result.parts) && job.result.parts.length > 0) {
            setAIParts(prev => {
              const seen = new Set(prev.map(p => p.partNumber));
              const newParts = job.result.parts.filter((p: any) => !seen.has(p.partNumber));
              if (newParts.length === 0) return prev;
              return [...prev, ...newParts];
            });
          }
        }
      } catch (err) {
        console.error("Polling failed:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  // Removed eBay modal state per request


  // Removed handleSellOnEbay logic per request


  const dynamicSections = useMemo(() => {
    const source = aiParts.length > 0 ? aiParts : partsData;
    const unique = Array.from(new Set(source.map(p => p.section).filter(Boolean)));
    return Array.from(unique).sort();
  }, [aiParts]);






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

  // Video state
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);

  // Image Source Chooser state
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isCompatSourceMenuOpen, setIsCompatSourceMenuOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const expectedCountLookupModelRef = useRef<string | null>(null);
  const expectedCountRequestRef = useRef(0);

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

  const handleCaptureEbayPage = async (part: Part) => {
    if (!ebayCaptureText.trim()) return;
    const key = part.partNumber;
    setIsEbayLoading(prev => ({ ...prev, [key]: true }));

    try {
      // 1. Extract from visible page content
      const extractRes = await fetch('/api/ebay/visible-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: ebayCaptureText })
      });
      const listings = await extractRes.json();

      // 2. Generate summary
      const summaryRes = await fetch('/api/ebay/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings })
      });
      const summary = await summaryRes.json();
      setEbaySummary(prev => ({ ...prev, [key]: summary }));

      // 3. Generate draft
      const draftRes = await fetch('/api/ebay/listing-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          part, 
          summary,
          model: lookupModel 
        })
      });
      const draft = await draftRes.json();
      setEbayDrafts(prev => ({ ...prev, [key]: draft }));
      
      setEbayCaptureText(''); // Clear input after success
    } catch (err) {
      console.error("eBay Intelligence failed", err);
      alert("Failed to process eBay data. Ensure you pasted valid listing text.");
    } finally {
      setIsEbayLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleAILookup = async (modelToSearch?: string, serialToSearch?: string, isExhaustive = false, forceRefresh = false) => {
    const query = modelToSearch || searchTerm;
    if (!query || query.length < 3) return;

    const normalizedQuery = normalizeModelId(query);
    const currentSerial = serialToSearch || lookupSerial;
    const manufactureDate = manufactureInfo?.manufactureYear
      ? `${manufactureInfo.manufactureYear}-${manufactureInfo.timeValue?.value || "01"}`
      : null;

    const currentLookupModelId = normalizeModelId(lookupModel);
    if (currentLookupModelId && currentLookupModelId !== normalizedQuery) {
      setExpectedPartCount(null);
      setSelectedSections([]); // Clear categories on model change
      expectedCountLookupModelRef.current = null;
      expectedCountRequestRef.current += 1;
    }

    const existingParts = [...aiParts];
    const existingPartNumbers = existingParts
      .map((p) => (p.partNumber || "").toUpperCase().trim())
      .filter(Boolean);

    const passNumber = existingParts.length > 0 ? bomPassCount + 1 : 1;

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

    const shouldFetchExpectedCount =
      expectedPartCount === null &&
      expectedCountLookupModelRef.current !== normalizedQuery;

    if (shouldFetchExpectedCount) {
      expectedCountLookupModelRef.current = normalizedQuery;
      const requestId = ++expectedCountRequestRef.current;

      fetch('/api/bom/expected-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: normalizedQuery,
          serial: currentSerial || null,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Expected count lookup failed (${res.status}): ${errorText}`);
          }

          return res.json();
        })
        .then((result) => {
          if (requestId !== expectedCountRequestRef.current) return;
          if (expectedCountLookupModelRef.current !== normalizedQuery) return;

          const total = Number(result?.expectedPartsTotal || 0);
          setExpectedPartCount(total > 0 ? total : null);
        })
        .catch((error) => {
          console.warn('Expected part count lookup failed:', error);
          if (requestId === expectedCountRequestRef.current) {
            expectedCountLookupModelRef.current = null;
          }
        });
    }

    setIsAILoading(true);

    try {
      const response = await fetch('/api/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: query,
          serial: currentSerial || null,
          manufactureDate,
          passNumber,
          passInstruction,
          knownPartNumbers: existingPartNumbers,
          isExhaustive,
          expectedPartCount,
          forceRefresh
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BOM API failed (${response.status}): ${errorText}`);
      }

      const parsed = await response.json();
      const rawParts = Array.isArray(parsed.parts) ? parsed.parts : [];

      const processedParts = rawParts.map((p: any) => ({
        ...p,
        partNumber: (p.partNumber || "").toUpperCase().trim(),
      }));

      const seen = new Set<string>();
      const mergedParts: any[] = [];

      // Add existing parts first, ensuring uniqueness
      for (const p of existingParts) {
        const pn = (p.partNumber || "").toUpperCase().trim();
        if (pn && !seen.has(pn)) {
          seen.add(pn);
          mergedParts.push(p);
        }
      }

      // Add new processed parts
      for (const np of processedParts) {
        const pn = (np.partNumber || "").toUpperCase().trim();
        if (pn && !seen.has(pn)) {
          seen.add(pn);
          mergedParts.push(np);
        }
      }

      // Sort and merge logic
      const finalParts = mergedParts
        .sort((a, b) => {
          const sectionCompare = (a.section || "").localeCompare(b.section || "");
          if (sectionCompare !== 0) return sectionCompare;
          return (a.partNumber || "").localeCompare(b.partNumber || "");
        });

      setAIParts(finalParts);
      setBomPassCount(passNumber);

      if (parsed.modelMSRP) {
        setModelMSRP(parsed.modelMSRP);

        const currentValue = computeCurrentMarketValue(
          parsed.modelMSRP,
          manufactureInfo?.manufactureYear || null,
          manufactureInfo?.timeValue?.unit === "month"
            ? manufactureInfo.timeValue.value
            : null,
          query,
          manufactureInfo?.brandFamily || "Universal",
          applianceCondition,
        );
        setValuation(currentValue);
      }

      setLookupModel(normalizedQuery);
      setViewMode("table");
    } catch (error) {
      console.error("AI Lookup failed:", error);
      alert(error instanceof Error ? error.message : 'AI lookup failed. Please try again.');
    } finally {
      setIsAILoading(false);
    }
  };

  const handleReset = () => {
    setSearchTerm('');
    setLookupModel(null);
    setLookupSerial(null);
    setAIParts([]);
    setBomPassCount(0);
    setExpectedPartCount(null);
    setModelMSRP(null);
    setManufactureInfo(null);
    setValuation(null);
    setVerifiedStatus({});
    setSelectedSections([]);
    setSelectedPart(null);
    setCompatibilityResult(null);
    setCheckModel('');
    setDiagQuery('');
    setDiagResult(null);
    setVideoResult(null);
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
          
          const candidate =
            result?.candidate_identity ??
            result?.candidateIdentity ??
            result?.normalizedIdentity ??
            result?.identity ??
            result;

          const extractedModel =
            result?.modelNumber ??
            result?.model ??
            candidate?.model ??
            candidate?.modelNumber ??
            null;

          const extractedSerial =
            result?.serialNumber ??
            result?.serial ??
            candidate?.serial ??
            candidate?.serialNumber ??
            null;

          const extractedTypeCode =
            result?.typeCode ??
            result?.type_code ??
            candidate?.type_code ??
            candidate?.typeCode ??
            null;

          const extractedPartNumber =
            result?.partNumber ??
            result?.part ??
            candidate?.partNumber ??
            candidate?.part ??
            null;

          if (extractedModel || extractedSerial || extractedPartNumber) {
            lastResult = {
              ...result,
              modelNumber: extractedModel,
              serialNumber: extractedSerial,
              typeCode: extractedTypeCode,
              candidate_identity: candidate,
            };
            break;
          }
        } catch (err) {
          lastError = err;
          continue;
        }
      }

      if (!lastResult) {
        throw lastError instanceof Error
          ? lastError
          : new Error(
              'OCR completed but no model or serial field was mapped. Check the OCR response schema before retaking the photo.'
            );
      }

      // STAGE 2: Preserve Raw Values exactly
      const model = (lastResult.modelNumber || '').toString().trim().toUpperCase().replace(/\./g, '');
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
          setSearchTerm(model);
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
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    const headers = ['Ref ID', 'Part Number', 'Description', 'Price (USD)', 'Price Source', 'Assembly Section'];
    const rows = dataSource.map((part, index) => [
      index + 1,
      part.partNumber,
      `"${part.description.replace(/"/g, '""')}"`,
      hasApprovedPrice(part) ? part.price : '',
      `"${normalizePriceSource(part.priceSource)}"`,
      `"${part.section.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BOM-${lookupModel || 'APPLIANCE'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredParts = useMemo(() => {
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    const filtered = dataSource.filter(part => {
      const matchesSearch =
        part.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.compatibleModels.some(m => m.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesSection =
        selectedSections.length === 0 || selectedSections.includes(part.section);
      
      return matchesSearch && matchesSection;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'popularity') return (b.reviewCount || 0) - (a.reviewCount || 0);
      if (sortBy === 'rating') return (b.avgRating || 0) - (a.avgRating || 0);
      
      const sectionCompare = (a.section || "").localeCompare(b.section || "");
      if (sectionCompare !== 0) return sectionCompare;
      return (a.partNumber || "").localeCompare(b.partNumber || "");
    });
  }, [searchTerm, selectedSections, aiParts, sortBy]);

  const stats = useMemo(() => {
    const dataSource = aiParts.length > 0 ? aiParts : partsData;
    return {
      total: dataSource.length,
      filtered: filteredParts.length,
      sections: dynamicSections.length,
      isAI: aiParts.length > 0
    };
  }, [filteredParts, aiParts, dynamicSections]);

  const isBomComplete = expectedPartCount !== null && aiParts.length >= expectedPartCount;
  
  const selectedExpected = useMemo(() => {
    if (!results?.assemblies) return 0;
    return results.assemblies
      .filter((a: any) => a.selected)
      .reduce((sum: number, a: any) => sum + (a.overrideCount ?? a.supplierCount ?? 0), 0);
  }, [results?.assemblies]);

  const pricingUnlocked = selectedExpected > 0 && aiParts.length >= selectedExpected;
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
              {results?.assemblies ? (
                <>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 flex items-center justify-between">
                    <span>Assembly Selector</span>
                    <button 
                      onClick={() => setResults(null)} 
                      className="text-pro-blue hover:underline"
                    >
                      Reset to Categories
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {results.assemblies.map((assembly: any) => (
                      <button
                        key={assembly.id}
                        onClick={() => toggleAssembly(assembly.id)}
                        className={`w-full text-left px-5 py-3 text-sm font-medium transition-all rounded-xl border flex items-center justify-between group ${assembly.selected
                          ? 'border-pro-blue bg-pro-blue/5 text-pro-blue shadow-sm'
                          : 'border-pro-slate-100 bg-white text-pro-navy hover:border-pro-blue/30'
                          }`}
                      >
                        <span className="truncate pr-2">{assembly.title}</span>
                        <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${assembly.selected ? 'bg-pro-blue border-pro-blue' : 'border-pro-slate-200 bg-pro-slate-50'}`}>
                          {assembly.selected && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  <div className="mt-4 px-2">
                    <button
                      onClick={() => {
                        const selected = results.assemblies.filter((a: any) => a.selected);
                        handleSourceAction(results.supplier, 'extract_selected_assemblies', { 
                          selectedAssemblies: selected, 
                          tierKey: results.tierKey,
                          searchUrl: results.sourceUrl // Use sourceUrl as fallback
                        });
                      }}
                      disabled={!results.assemblies.some((a: any) => a.selected) || sourceActionBusy[results.supplier]}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-pro-blue py-4 text-sm font-black text-white shadow-pro hover:bg-pro-blue/90 disabled:opacity-50 transition-all"
                    >
                      <Zap size={16} className="fill-white" />
                      GO · EXTRACT SELECTED
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedSections([])}
                    className={`w-full text-left px-6 py-3.5 text-lg font-semibold transition-all rounded-lg ${selectedSections.length === 0
                      ? 'bg-pro-navy text-white shadow-pro'
                      : 'text-[#31507c] hover:bg-white hover:text-pro-slate-900'
                      }`}
                  >
                    All Components
                  </button>
                  {dynamicSections.map((section) => {
                    const isActive = selectedSections.includes(section);
                    return (
                      <button
                        key={section}
                        onClick={() => {
                          setSelectedSections(prev => 
                            prev.includes(section) 
                              ? prev.filter(s => s !== section)
                              : [...prev, section]
                          );
                        }}
                        className={`w-full text-left px-6 py-3.5 text-lg font-medium transition-all rounded-lg ${isActive
                          ? 'bg-pro-navy text-white shadow-pro'
                          : 'text-[#31507c] hover:bg-white hover:text-pro-slate-900'
                          }`}
                      >
                        {section}
                      </button>
                    );
                  })}
                </>
              )}
            </nav>
          </section>



          <div className="mt-12 pt-8 border-t border-slate-100">
            <p className="px-6 mb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Advanced Analysis</p>
            <div className="flex flex-col gap-1 px-2">
              <a 
                href="/inventory"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all rounded-lg group"
              >
                <TrendingUp size={16} className="text-slate-400 group-hover:text-blue-600" />
                Inventory Ranking
              </a>
              <a 
                href="/market"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-all rounded-lg group"
              >
                <BarChart3 size={16} className="text-slate-400 group-hover:text-blue-600" />
                Market Intel
              </a>
            </div>
          </div>
        </aside>

        {/* Parts Explorer */}
        <section className="space-y-4 overflow-hidden">
          <div className="flex flex-col gap-6">
            {/* High-Level Stats Bar */}
            <h1 className="lg:hidden text-2xl font-semibold text-[#435572]">{selectedSectionLabel}</h1>

            <div className="grid grid-cols-2 gap-5 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)_240px_82px]">
              <div className="pro-card p-5 rounded-lg flex flex-col gap-2 min-h-[82px]">
                <span className="text-xs font-black text-pro-slate-400 uppercase tracking-[0.2em]">Model</span>
                <span className="text-base font-black text-pro-slate-900 truncate">{lookupModel || 'N/A'}</span>
                {modelMSRP && (
                  <span className="text-[9px] font-bold text-pro-blue">MSRP: ${modelMSRP}</span>
                )}
              </div>

              <div className="pro-card p-5 rounded-lg flex flex-col gap-2 min-h-[82px]">
                <span className="text-xs font-black text-pro-slate-400 uppercase tracking-[0.2em] leading-none">BOM Progress</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-black text-pro-slate-900 leading-none">
                    {aiParts.length}
                    {expectedPartCount !== null && (
                      <span className="text-pro-slate-400">/{expectedPartCount}</span>
                    )}
                  </span>
                  <span className={`text-[10px] font-bold uppercase ${isBomComplete ? 'text-emerald-500' : 'text-pro-blue'}`}>
                    {isBomComplete ? 'Complete' : 'Discovered'}
                  </span>
                </div>
                <button
                  onClick={() => handleAILookup(lookupModel || undefined, undefined, false, true)}
                  disabled={isAILoading}
                  className="mt-1 text-[9px] font-bold text-pro-slate-400 hover:text-pro-blue uppercase tracking-widest flex items-center gap-1 transition-colors"
                >
                  <RefreshCcw size={10} className={isAILoading ? 'animate-spin' : ''} />
                  Force Refresh
                </button>
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
            <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_240px_82px]">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-pro-slate-400" size={19} />
                <input
                  type="text"
                  placeholder="EX: WTW5000DW1, DRAIN PUMP..."
                  className="pro-input h-[54px] pl-12 rounded-lg text-base font-medium placeholder:text-pro-slate-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="hidden lg:flex">
                <button
                  onClick={handleReset}
                  className="pro-button pro-button-secondary h-[54px] w-full rounded-lg px-6 text-base font-black flex items-center justify-center gap-2 hover:bg-pro-slate-100 transition-colors"
                >
                  <RefreshCcw size={18} />
                  <span>RESET DATA</span>
                </button>
              </div>

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
                  <button
                    onClick={handleReset}
                    className="pro-button pro-button-secondary h-[54px] px-4 rounded-lg flex items-center justify-center"
                    title="Reset all fields"
                  >
                    <RefreshCcw size={20} />
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

          </div>

          {/* View Mode and Sorting Controls */}
          <div className="flex items-center justify-between border-y border-pro-slate-200/60 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-pro-slate-400">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-pro-navy outline-none cursor-pointer hover:text-pro-blue transition-colors uppercase"
                >
                  <option value="id">Default (ID)</option>
                  <option value="rating">Top Rated</option>
                  <option value="popularity">Most Popular</option>
                </select>
              </div>
              <div className="h-4 w-px bg-pro-slate-200" />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-pro-navy shadow-pro-md' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
                  title="Grid view"
                >
                  <LayoutGrid size={20} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-pro-navy shadow-pro-md' : 'text-pro-slate-400 hover:text-pro-slate-600'}`}
                  title="List view"
                >
                  <TableIcon size={20} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
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
              <span>{results?.assemblies ? 'Select Assemblies' : selectedSectionLabel}</span>
              <ChevronDown
                size={24}
                className={`transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isCategoryMenuOpen && (
              <nav className="mt-5 rounded-xl bg-white p-4 shadow-pro-md ring-1 ring-pro-slate-100">
                {results?.assemblies ? (
                  <>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                      {results.assemblies.map((assembly: any) => (
                        <button
                          key={assembly.id}
                          onClick={() => toggleAssembly(assembly.id)}
                          className={`w-full text-left px-5 py-4 text-xl font-medium transition-all rounded-xl border flex items-center justify-between ${assembly.selected
                            ? 'border-pro-blue bg-pro-blue/5 text-pro-blue'
                            : 'border-pro-slate-100 bg-white text-pro-navy'
                            }`}
                        >
                          <span className="truncate pr-4">{assembly.title}</span>
                          <div className={`w-6 h-6 rounded border flex items-center justify-center ${assembly.selected ? 'bg-pro-blue border-pro-blue' : 'border-pro-slate-200 bg-pro-slate-50'}`}>
                            {assembly.selected && <CheckCircle2 size={16} className="text-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-6">
                      <button
                        onClick={() => {
                          const selected = results.assemblies.filter((a: any) => a.selected);
                          handleSourceAction(results.supplier, 'extract_selected_assemblies', { 
                            selectedAssemblies: selected, 
                            tierKey: results.tierKey,
                            searchUrl: results.sourceUrl
                          });
                          setIsCategoryMenuOpen(false);
                        }}
                        disabled={!results.assemblies.some((a: any) => a.selected) || sourceActionBusy[results.supplier]}
                        className="w-full flex items-center justify-center gap-3 rounded-2xl bg-pro-blue py-5 text-xl font-black text-white shadow-pro hover:bg-pro-blue/90 disabled:opacity-50"
                      >
                        <Zap size={24} className="fill-white" />
                        GO · EXTRACT SELECTED
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setSelectedSections([]);
                      }}
                      className={`w-full text-left px-5 py-4 text-xl font-semibold transition-all rounded-lg ${selectedSections.length === 0
                        ? 'bg-pro-navy text-white shadow-pro'
                        : 'text-pro-navy hover:bg-pro-slate-100'
                        }`}
                    >
                      All Components
                    </button>
                    {dynamicSections.map((section) => {
                      const isActive = selectedSections.includes(section);
                      return (
                        <button
                          key={section}
                          onClick={() => {
                            setSelectedSections(prev => 
                              prev.includes(section) 
                                ? prev.filter(s => s !== section)
                                : [...prev, section]
                            );
                          }}
                          className={`w-full text-left px-5 py-4 text-xl font-medium transition-all rounded-lg ${isActive
                            ? 'bg-pro-navy text-white shadow-pro'
                            : 'text-pro-navy hover:bg-pro-slate-100'
                            }`}
                        >
                          {section}
                        </button>
                      );
                    })}
                  </>
                )}
              </nav>
            )}
          </div>

          {/* Distributor Control Panel */}
          {lookupModel && (
            <div className="mx-auto max-w-5xl mb-6">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-pro">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-pro-blue" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-pro-navy">
                      Distributor Control Panel
                    </h4>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setSelectedTier(tier)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                          selectedTier === tier 
                            ? 'bg-pro-navy text-white' 
                            : 'bg-pro-slate-50 text-pro-slate-400 hover:bg-pro-slate-100'
                        }`}
                      >
                        Tier {tier}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(() => {
                    const TIER_KEYS = ["tier0", "tier1", "tier2", "tier3"] as const;
                    const activeTierKey = TIER_KEYS[selectedTier];
                    const activeTier = SOURCE_TIERS[activeTierKey];

                    return activeTier?.suppliers.map((supplierId) => {
                      const supplierName = supplierDisplayName(supplierId);
                      const busyKey = `${supplierId}`;
                      const isBusy = sourceActionBusy[busyKey];
                      const supplierModel = normalizeModelForSupplier({
                        supplier: supplierId,
                        model: lookupModel,
                        brand: manufactureInfo?.brandFamily
                      });
                      const siteUrl = buildSupplierSearchUrl({
                        supplier: supplierId,
                        formattedModel: supplierModel,
                        canonicalModel: lookupModel
                      });

                      return (
                        <div key={supplierId} className="rounded-xl border border-pro-slate-100 p-3 bg-white hover:border-pro-blue/20 transition-all">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-black text-pro-navy uppercase truncate pr-2">
                              {supplierName}
                            </span>
                            <a 
                              href={siteUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-pro-slate-300 hover:text-pro-blue"
                              title="Open direct site"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              disabled={isBusy || isAILoading}
                              onClick={() => handleSourceAction(supplierId, 'lock_supplier_target', { searchUrl: siteUrl, tierKey: activeTierKey })}
                              className="rounded-lg bg-pro-slate-50 py-1.5 text-[9px] font-bold text-pro-navy hover:bg-pro-blue/10 disabled:opacity-50"
                            >
                              Lock
                            </button>
                            <button
                              disabled={isBusy || isAILoading}
                              onClick={() => handleSourceAction(supplierId, 'load_supplier_index', { searchUrl: siteUrl, tierKey: activeTierKey })}
                              className="rounded-lg bg-pro-slate-50 py-1.5 text-[9px] font-bold text-pro-navy hover:bg-pro-blue/10 disabled:opacity-50"
                            >
                              Load Index
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Pricing Unlock Section */}
                <div className="mt-4 pt-4 border-t border-pro-slate-100">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-pro-slate-400">Target Coverage</span>
                      <span className="text-xs font-bold text-pro-navy">
                        {aiParts.length} / {selectedExpected || 0} parts found
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!pricingUnlocked || sourceActionBusy['encompass-family']}
                        onClick={() => handleSourceAction('encompass-family', 'price_encompass', { tierKey: 'tier1' })}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                          pricingUnlocked 
                            ? 'bg-emerald-600 text-white shadow-pro hover:bg-emerald-700' 
                            : 'bg-pro-slate-100 text-pro-slate-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        Run Encompass Pricing
                      </button>
                      <button
                        disabled={!pricingUnlocked || sourceActionBusy['partsdr']}
                        onClick={() => handleSourceAction('partsdr', 'price_backup_1', { tierKey: 'tier1' })}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                          pricingUnlocked 
                            ? 'bg-emerald-600 text-white shadow-pro hover:bg-emerald-700' 
                            : 'bg-pro-slate-100 text-pro-slate-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        Run Backup 1 Pricing
                      </button>
                      <button
                        disabled={!pricingUnlocked || sourceActionBusy['appliancepartspros']}
                        onClick={() => handleSourceAction('appliancepartspros', 'price_backup_2', { tierKey: 'tier1' })}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                          pricingUnlocked 
                            ? 'bg-emerald-600 text-white shadow-pro hover:bg-emerald-700' 
                            : 'bg-pro-slate-100 text-pro-slate-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        Run Backup 2 Pricing
                      </button>
                    </div>
                  </div>
                </div>

                {jobId && (
                  <div className="mt-4 pt-4 border-t border-pro-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-bold text-pro-slate-400 uppercase tracking-widest">
                        Active Job: <span className="text-pro-navy">{jobId}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-pro-blue">
                        {jobStage?.replace(/_/g, ' ') || 'running'}
                      </span>
                    </div>
                  </div>
                )}
                
                {results?.issues?.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-2 flex items-center gap-2">
                      <AlertCircle size={10} />
                      Manual Review Flags
                    </div>
                    <ul className="space-y-1">
                      {results.issues.map((issue, idx) => (
                        <li key={idx} className="text-[9px] font-bold text-amber-800 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

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
              {filteredParts.map((part, index) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={`${part.partNumber}-${part.section}-${index}`}
                  onClick={() => setSelectedPart(part)}
                  className="pro-card pro-card-hover p-4 cursor-pointer flex flex-col justify-between rounded-xl h-full"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold text-pro-slate-400 uppercase tracking-widest">
                        Item ID {index + 1}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-pro-slate-900 mb-2 leading-snug group-hover:text-pro-blue transition-colors">
                      {part.description}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-mono text-pro-slate-400 uppercase tracking-tighter">PN: {part.partNumber}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleVerifyPart(part); }}
                        disabled={verifiedStatus[part.partNumber]?.state === 'loading'}
                        className="text-[9px] font-bold text-pro-blue hover:underline disabled:opacity-50"
                      >
                        {verifiedStatus[part.partNumber]?.state === 'loading' ? 'Verifying...' : 'Verify'}
                      </button>
                      {verifiedStatus[part.partNumber]?.state === 'valid' && <ShieldCheck size={10} className="text-emerald-500" />}
                      {verifiedStatus[part.partNumber]?.state === 'invalid' && <ShieldAlert size={10} className="text-rose-500" />}
                    </div>
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
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-pro-slate-50 border-b border-pro-slate-200">
                      <th className="px-4 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          className="rounded border-pro-slate-300 text-pro-blue focus:ring-pro-blue"
                          checked={filteredParts.length > 0 && selectedRowIds.length === filteredParts.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRowIds(filteredParts.map(p => p.partNumber));
                            } else {
                              setSelectedRowIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">OEM Identifier</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Component Description</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest w-32">Market Cost</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest">Assembly</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-[#8aa1c7] uppercase tracking-widest w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pro-slate-100">
                    {filteredParts.map((part, index) => (
                      <tr
                        key={`${part.partNumber}-${part.section}-${index}`}
                        onClick={() => setSelectedPart(part)}
                        className={`hover:bg-pro-slate-50 cursor-pointer transition-colors group ${selectedRowIds.includes(part.partNumber) ? 'bg-pro-blue/5' : ''}`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-pro-slate-300 text-pro-blue focus:ring-pro-blue"
                            checked={selectedRowIds.includes(part.partNumber)}
                            onChange={() => {
                              setSelectedRowIds(prev => 
                                prev.includes(part.partNumber) 
                                  ? prev.filter(id => id !== part.partNumber)
                                  : [...prev, part.partNumber]
                              );
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-pro-navy group-hover:text-pro-blue underline decoration-transparent group-hover:decoration-pro-blue/30 transition-all">{part.partNumber}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleVerifyPart(part); }}
                                disabled={verifiedStatus[part.partNumber]?.state === 'loading'}
                                className="text-[9px] font-bold text-pro-blue hover:underline disabled:opacity-50"
                              >
                                {verifiedStatus[part.partNumber]?.state === 'loading' ? 'Verifying...' : 'Verify'}
                              </button>
                              {verifiedStatus[part.partNumber]?.state === 'valid' && <ShieldCheck size={10} className="text-emerald-500" />}
                              {verifiedStatus[part.partNumber]?.state === 'invalid' && <ShieldAlert size={10} className="text-rose-500" />}
                            </div>
                            <span className="text-[9px] font-bold text-pro-slate-400">ID {index + 1}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-pro-slate-700">{part.description}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            {hasApprovedPrice(part) ? (
                              <>
                                <span className="text-sm font-black text-pro-slate-900">${part.price!.toFixed(2)}</span>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">
                                  {normalizePriceSource(part.priceSource)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-pro-slate-100 text-pro-slate-500 rounded uppercase tracking-tighter">
                            {part.section}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <a
                              href={ebaySearchUrl(part.partNumber)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex h-7 items-center rounded border border-pro-blue bg-white px-3 text-[11px] font-semibold text-pro-blue transition-colors hover:bg-blue-50"
                            >
                              Search eBay
                            </a>
                            <a
                              href={ebaySoldSearchUrl(part.partNumber)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex h-7 items-center rounded border border-pro-slate-200 bg-white px-3 text-[11px] font-semibold text-pro-slate-600 transition-colors hover:bg-pro-slate-50"
                            >
                              Sold Comps
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>



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
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Part Index</span>
                      <span className="text-sm font-mono font-bold text-white/90">{selectedPart.partNumber}</span>
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
              <div className="bg-pro-slate-50 px-6 flex border-b border-pro-slate-100 overflow-x-auto">
                <button
                  onClick={() => setActiveDetailTab('specs')}
                  className={`py-4 px-6 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeDetailTab === 'specs' ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  Technical Specifications
                </button>
                <button
                  onClick={() => setActiveDetailTab('diag')}
                  className={`py-4 px-6 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-b-2 whitespace-nowrap ${activeDetailTab === 'diag' ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  <BrainCircuit size={14} /> Intelligence Analysis
                </button>
                <button
                  onClick={() => setActiveDetailTab('resale')}
                  className={`py-4 px-6 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-b-2 whitespace-nowrap ${activeDetailTab === 'resale' ? 'border-pro-blue text-pro-navy' : 'border-transparent text-pro-slate-400 hover:text-pro-slate-600'}`}
                >
                  <TrendingUp size={14} /> Resale Intelligence
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                {activeDetailTab === 'specs' ? (
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
                                          key={s.partNumber}
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
                ) : activeDetailTab === 'diag' ? (
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
                ) : (
                  <div className="col-span-2 p-8 md:p-10 bg-white space-y-10 min-h-[600px]">
                    <div className="flex flex-col md:flex-row justify-between gap-6 items-start">
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-pro-navy tracking-tight uppercase">eBay Resale Intelligence</h3>
                        <p className="text-[10px] font-bold text-pro-blue uppercase tracking-widest">Automated Market Value Extraction</p>
                      </div>
                      <div className="flex gap-2">
                        <a 
                          href={ebaySearchUrl(selectedPart.partNumber)} 
                          target="_blank" 
                          rel="noreferrer"
                          className="pro-button pro-button-secondary py-2 px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                        >
                          <ExternalLink size={12} /> View Active
                        </a>
                        <a 
                          href={ebaySoldSearchUrl(selectedPart.partNumber)} 
                          target="_blank" 
                          rel="noreferrer"
                          className="pro-button pro-button-secondary py-2 px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                        >
                          <History size={12} /> View Sold
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-pro-slate-400 uppercase tracking-widest block">Capture Search Results</label>
                          <p className="text-[11px] text-pro-slate-500 leading-relaxed">
                            Search eBay using the links above, then press <kbd className="bg-pro-slate-100 px-1.5 py-0.5 rounded border border-pro-slate-200 text-pro-navy font-mono">Ctrl+A</kbd> then <kbd className="bg-pro-slate-100 px-1.5 py-0.5 rounded border border-pro-slate-200 text-pro-navy font-mono">Ctrl+C</kbd> to copy the visible page content and paste it here.
                          </p>
                          <div className="relative">
                            <textarea
                              placeholder="PASTE EBAY PAGE CONTENT HERE..."
                              className="pro-input w-full p-4 min-h-[140px] text-xs font-medium bg-pro-slate-50 resize-none"
                              value={ebayCaptureText}
                              onChange={(e) => setEbayCaptureText(e.target.value)}
                            />
                            <div className="absolute bottom-3 right-3">
                              <button
                                onClick={() => handleCaptureEbayPage(selectedPart)}
                                disabled={isEbayLoading[selectedPart.partNumber] || !ebayCaptureText.trim()}
                                className="pro-button pro-button-primary py-1.5 px-4 shadow-pro-md"
                              >
                                {isEbayLoading[selectedPart.partNumber] ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                                <span>Analyze Market</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {ebaySummary[selectedPart.partNumber] && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pro-card bg-pro-slate-50 border-dashed p-6 rounded-2xl space-y-6"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp size={16} className="text-pro-blue" />
                              <span className="text-[10px] font-black text-pro-navy uppercase tracking-[0.2em]">Market Summary</span>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-pro-slate-400 uppercase tracking-widest">Avg. Sold Price</span>
                                <p className="text-2xl font-black text-pro-navy">${ebaySummary[selectedPart.partNumber].avgSoldPrice.toFixed(2)}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-pro-slate-400 uppercase tracking-widest">Market Velocity</span>
                                <p className={`text-sm font-black uppercase ${
                                  ebaySummary[selectedPart.partNumber].marketVelocity === 'High' ? 'text-emerald-600' : 
                                  ebaySummary[selectedPart.partNumber].marketVelocity === 'Medium' ? 'text-amber-500' : 'text-pro-slate-500'
                                }`}>{ebaySummary[selectedPart.partNumber].marketVelocity}</p>
                              </div>
                            </div>
                            <div className="p-4 bg-white rounded-xl border border-pro-slate-100">
                              <p className="text-[11px] font-medium leading-relaxed text-pro-slate-600">
                                {ebaySummary[selectedPart.partNumber].recommendation}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-pro-blue" />
                            <span className="text-[10px] font-black text-pro-navy uppercase tracking-[0.2em]">Listing Draft</span>
                          </div>
                          {ebayDrafts[selectedPart.partNumber] && (
                            <button 
                              onClick={() => {
                                const draft = ebayDrafts[selectedPart.partNumber];
                                const text = `${draft.title}\n\nSuggested Price: $${draft.suggestedPrice}\n\n${draft.description}\n\nTags: ${draft.tags.join(', ')}`;
                                navigator.clipboard.writeText(text);
                                alert("Draft copied to clipboard!");
                              }}
                              className="text-[10px] font-bold text-pro-blue flex items-center gap-1.5 hover:underline"
                            >
                              <Copy size={12} /> Copy Full Draft
                            </button>
                          )}
                        </div>

                        {ebayDrafts[selectedPart.partNumber] ? (
                          <motion.div 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="pro-card bg-pro-navy p-6 rounded-2xl text-white space-y-6 shadow-pro-lg relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                              <Sparkles size={48} />
                            </div>
                            <div className="space-y-1 relative z-10">
                              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Listing Title</span>
                              <p className="text-xs font-bold leading-tight">{ebayDrafts[selectedPart.partNumber].title}</p>
                            </div>
                            <div className="space-y-1 relative z-10">
                              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Suggested Price</span>
                              <p className="text-xl font-black text-emerald-400">${ebayDrafts[selectedPart.partNumber].suggestedPrice.toFixed(2)}</p>
                            </div>
                            <div className="space-y-1 relative z-10">
                              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Description Preview</span>
                              <div className="text-[10px] font-medium leading-relaxed text-white/70 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap">
                                {ebayDrafts[selectedPart.partNumber].description}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                              {ebayDrafts[selectedPart.partNumber].tags.map(tag => (
                                <span key={tag} className="text-[8px] font-black uppercase px-2 py-0.5 bg-white/10 rounded tracking-widest">#{tag}</span>
                              ))}
                            </div>
                          </motion.div>
                        ) : (
                          <div className="pro-card border-dashed p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 h-[400px]">
                            <div className="w-12 h-12 rounded-full bg-pro-slate-50 flex items-center justify-center text-pro-slate-300 mb-2">
                              <Sparkles size={24} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-pro-navy uppercase tracking-widest">Awaiting Market Analysis</p>
                              <p className="text-[10px] text-pro-slate-400 font-medium leading-relaxed max-w-[200px]">
                                Paste eBay results on the left to generate an AI-optimized listing draft.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
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
          <div className="flex flex-col gap-1 items-end mr-6 pr-6 border-r border-slate-200">
            <a href="/inventory" className="text-[10px] font-black uppercase text-pro-blue hover:underline tracking-widest">Inventory Intelligence</a>
            <a href="/market" className="text-[10px] font-black uppercase text-pro-blue hover:underline tracking-widest">Market Analysis</a>
          </div>
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
    </div>
  );
}
