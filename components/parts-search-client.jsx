'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBomStatusMeta } from '@/src/features/bom/core/bom-status';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Database,
  Download,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  Info,
  Layers,
  Package,
  RefreshCw,
  Search,
  Settings,
  X,
  Zap,
  BarChart3,
} from 'lucide-react';

import LoadingSkeleton from '@/components/loading-skeleton';
import { EncompassUrlPanel } from './EncompassUrlPanel';

const popularModels = ['MVWC565FW0', 'RF28R7351SR', 'WDT730PAHZ'];

function toneClasses(tone) {
  if (tone === 'green') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (tone === 'red') return 'bg-red-50 text-red-700 border-red-100';
  if (tone === 'amber') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-50 text-slate-700 border-slate-100';
}

function getJobChipLabel(statusKey) {
  if (statusKey === 'bom_complete') return 'Verified Job';
  if (statusKey === 'zero_rows' || statusKey === 'failed') return 'Unverified Job';
  return 'Partial Job';
}

function getResultRowCount(results) {
  return Array.isArray(results?.parts) ? results.parts.length : 0;
}

function normalizeResultParts(rawParts = []) {
  return rawParts.map((part) => ({
    section:
      part?.section ||
      part?.category ||
      part?.normalizedCategory ||
      part?.normalizedSection ||
      "Uncategorized",
    diagramNumber:
      part?.diagramNumber ??
      part?.diagram_number ??
      part?.itemNumber ??
      part?.item_number ??
      "",
    originalPartNumber:
      part?.originalPartNumber ||
      part?.original_part_number ||
      part?.partNumber ||
      part?.part_number ||
      null,
    currentServicePartNumber:
      part?.currentServicePartNumber ||
      part?.current_service_part_number ||
      part?.partNumber ||
      part?.part_number ||
      null,
    description:
      part?.description ||
      part?.name ||
      part?.partDescription ||
      part?.part_description ||
      "Appliance Part",
    nlaStatus:
      Boolean(part?.nlaStatus) ||
      Boolean(part?.isNla) ||
      Boolean(part?.discontinued) ||
      false,
    sourceUrl: part?.sourceUrl || part?.url || part?.source_url || "",
    sourceType: part?.sourceType || part?.source_type || "diagram",
    replacementNote: part?.replacementNote || part?.replacement_note || null,
    confidence: typeof part?.confidence === "number" ? part.confidence : 0.95,
    retailPrice: part?.retailPrice ?? null,
    retailPriceText: part?.retailPriceText ?? null,
    retailAvailability: part?.retailAvailability ?? null,
    retailPricingUrl: part?.retailPricingUrl ?? null,
    retailPriceSource: part?.retailPriceSource ?? null,
    retailPriceVerified: part?.retailPriceVerified ?? false,
    retailPricedAt: part?.retailPricedAt ?? null,
  }));
}

function getPricedRowCount(parts) {
  return Array.isArray(parts)
    ? parts.filter((part) => typeof part.retailPrice === 'number').length
    : 0;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toDisplayErrorMessage(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Request failed.';

  const lower = text.toLowerCase();

  const looksLikeHtml =
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.includes('<title>500') ||
    lower.includes('internal server error') ||
    lower.includes('__next_data__');

  if (looksLikeHtml) {
    return 'Extraction failed: server returned an unexpected HTML error page.';
  }

  return text.slice(0, 300);
}

function getIdentityReviewFromJob(job) {
  const identity = job?.identity || {};

  return {
    brand: identity.displayBrand || identity.brand || job?.brand || '',
    resolvedBrand: identity.resolvedBrand || job?.brand || '',
    model: identity.model || job?.model || '',
    serial: identity.serial || job?.serial || '',
    productType: identity.productType || job?.productType || '',
    confidence:
      typeof identity.identityConfidence === 'number'
        ? identity.identityConfidence
        : typeof identity.confidence === 'number'
          ? identity.confidence
          : 0,
    searchConfidence:
      typeof identity.searchConfidence === 'number'
        ? identity.searchConfidence
        : 0,
    familyKey: identity.familyKey || '',
    adapterKey: identity.adapterKey || '',
    expectedPartsTotal: job?.expectedPartsTotal || 0,
    expectedPartsSource: job?.expectedPartsSource || '',
    coveragePct: job?.coveragePct || 0,
    actualUniqueParts: job?.actualUniqueParts || 0,
  };
}

function getBomRowPartNumber(part) {
  return (
    part?.currentServicePartNumber ||
    part?.originalPartNumber ||
    part?.partNumber ||
    part?.part_number ||
    ''
  ).toUpperCase();
}

function ebaySearchUrl(partNumber) {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}`;
}

function ebaySoldSearchUrl(partNumber) {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}&LH_Sold=1&LH_Complete=1`;
}

function CoverageTargetCard({ identity }) {
  if (!identity?.expectedPartsTotal) return null;

  const pct = (identity.coveragePct * 100).toFixed(0);
  const isHealthy = identity.coveragePct >= 0.9;
  const isWarning = identity.coveragePct < 0.75;

  return (
    <div className={`rounded-2xl border p-4 mb-6 transition-all ${isHealthy ? 'border-emerald-200 bg-emerald-50/30' :
        isWarning ? 'border-amber-200 bg-amber-50/30' :
          'border-blue-200 bg-blue-50/30'
      }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className={isHealthy ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-blue-600'} />
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700">BOM Coverage Target</h4>
        </div>
        <div className="text-[10px] font-bold uppercase text-slate-400">Source: {identity.expectedPartsSource}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Target Total</div>
          <div className="text-2xl font-black text-slate-900">{identity.expectedPartsTotal} <span className="text-xs font-normal text-slate-400 italic">parts</span></div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Current Progress</div>
          <div className="text-2xl font-black text-slate-900">{pct}% <span className="text-xs font-normal text-slate-400 italic">({identity.actualUniqueParts} found)</span></div>
        </div>
      </div>

      <div className="mt-4 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${isHealthy ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function EbayMarketPanel({
  part,
  ebayCaptureText,
  setEbayCaptureText,
  ebaySummary,
  ebayDrafts,
  isEbayLoading,
  onAnalyze,
  onClose,
}) {
  if (!part) return null;

  const partNumber = getBomRowPartNumber(part);
  const summary = ebaySummary?.[partNumber];
  const draft = ebayDrafts?.[partNumber];
  const loading = Boolean(isEbayLoading?.[partNumber]);

  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
            eBay Resale Intelligence
          </div>
          <h3 className="mt-1 text-xl font-black text-slate-900">
            {partNumber || 'Unknown Part'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {part.description || part.name || 'Appliance Part'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100"
        >
          Close
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a
          href={ebaySearchUrl(partNumber)}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 hover:border-blue-300 hover:text-blue-600"
        >
          Open Active eBay Search
        </a>

        <a
          href={ebaySoldSearchUrl(partNumber)}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 hover:border-blue-300 hover:text-blue-600"
        >
          Open Sold eBay Comps
        </a>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Paste copied eBay page text
        </label>

        <textarea
          value={ebayCaptureText}
          onChange={(event) => setEbayCaptureText(event.target.value)}
          placeholder="Paste the visible eBay search or sold-comps page text here..."
          className="min-h-[160px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 outline-none focus:border-blue-400 focus:bg-white"
        />

        <button
          type="button"
          onClick={() => onAnalyze(part)}
          disabled={loading || !ebayCaptureText.trim()}
          className="mt-3 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'eBay Resale ↓'}
        </button>
      </div>

      {summary ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Market Summary
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Active</div>
              <div className="text-2xl font-black text-slate-900">
                {summary.activeCount ?? summary.active ?? 0}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Sold</div>
              <div className="text-2xl font-black text-slate-900">
                {summary.soldCount ?? summary.sold ?? 0}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Median Sold</div>
              <div className="text-2xl font-black text-slate-900">
                {typeof summary.medianSoldPrice === 'number'
                  ? `$${summary.medianSoldPrice.toFixed(2)}`
                  : typeof summary.medianPrice === 'number'
                    ? `$${summary.medianPrice.toFixed(2)}`
                    : '—'}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Sell-Through</div>
              <div className="text-2xl font-black text-slate-900">
                {typeof summary.sellThroughRatio === 'number'
                  ? `${summary.sellThroughRatio.toFixed(2)}x`
                  : typeof summary.sellThrough === 'number'
                    ? `${summary.sellThrough.toFixed(2)}x`
                    : '—'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
            Listing Draft
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                Title
              </div>
              <div className="rounded-xl bg-white p-3 text-sm font-bold text-slate-900">
                {draft.title || 'No title generated'}
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                Description
              </div>
              <div className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">
                {draft.description || 'No description generated'}
              </div>
            </div>

            {typeof draft.suggestedPrice === 'number' ? (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                  Suggested Resale Price
                </div>
                <div className="rounded-xl bg-white p-3 text-lg font-black text-slate-900">
                  ${draft.suggestedPrice.toFixed(2)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PartsSearchClient() {
  const [manualModelNumber, setManualModelNumber] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualSerial, setManualSerial] = useState('');
  const [manualProductType, setManualProductType] = useState('');

  const [jobId, setJobId] = useState(null);
  const [jobStage, setJobStage] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  const [identityReview, setIdentityReview] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedSections, setSelectedSections] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [nameplateImageUrl, setNameplateImageUrl] = useState(null);
  const [error, setError] = useState(null);

  const [selectedMarketPart, setSelectedMarketPart] = useState(null);
  const [ebayCaptureText, setEbayCaptureText] = useState('');
  const [ebaySummary, setEbaySummary] = useState({});
  const [ebayDrafts, setEbayDrafts] = useState({});
  const [isEbayLoading, setIsEbayLoading] = useState({});

  const [loadingMode, setLoadingMode] = useState(null); // identity | bom | manual_pdf | groups | extract_group | null
  const [diagramGroups, setDiagramGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingMessage, setPricingMessage] = useState(null);
  const [lastPricedSubset, setLastPricedSubset] = useState([]);
  const [lastPricingSelection, setLastPricingSelection] = useState([]);
  const [countLookupBusy, setCountLookupBusy] = useState(false);
  const [countLookupMessage, setCountLookupMessage] = useState(null);

  const nameplateInputRef = useRef(null);
  const manualPdfInputRef = useRef(null);
  const pollTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  async function readApiResponse(response) {
    const text = await response.text();

    if (!text) return {};

    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object'
        ? parsed
        : { detail: String(parsed) };
    } catch {
      return { detail: text };
    }
  }

  function resetSession() {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    setError(null);
    setResults(null);
    setIdentityReview(null);
    setJobId(null);
    setJobStage(null);
    setJobStatus(null);
    setDiagramGroups([]);
    setActiveGroupId(null);
    setIsComplete(false);
    setSelectedSections([]);
    setSelectedRowIds([]);
    setSearchQuery('');
    setNameplateImageUrl(null);
    setPricingBusy(false);
    setPricingMessage(null);
    setLastPricedSubset([]);
    setLastPricingSelection([]);
    setCountLookupBusy(false);
    setCountLookupMessage(null);
  }

  async function createEmptyJob() {
    const formData = new FormData();

    const res = await fetch('/api/bom/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await readApiResponse(res);
    if (!res.ok) {
      throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'Job creation failed'));
    }

    return data.jobId;
  }

  const pollJob = useCallback((currentJobId, delay = 1200) => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    const tick = async () => {
      try {
        const response = await fetch(`/api/bom/jobs/${currentJobId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          pollTimeoutRef.current = setTimeout(tick, delay);
          return;
        }

        const payload = await response.json();
        const job = payload?.job ?? payload;

        setJobStage(job?.jobStage ?? null);
        setJobStatus(job?.resultStatus ?? null);
        setIdentityReview(job ? getIdentityReviewFromJob(job) : null);
        setResults(job ? getResultsFromJob(job) : null);
        setDiagramGroups(job?.diagramParse?.sections || []);
        setError(job?.errorText || null);

        if (job?.jobStage === 'complete' || job?.jobStage === 'failed') {
          setLoadingMode(null);
          pollTimeoutRef.current = null;
          return;
        }

        pollTimeoutRef.current = setTimeout(tick, delay);
      } catch (err) {
        console.error('Polling error:', err);
        pollTimeoutRef.current = setTimeout(tick, Math.min(delay * 1.5, 5000));
      }
    };

    tick();
  }, []);

  async function startIdentityStage(currentJobId, userHints = {}) {
    // Start polling immediately so user sees state transitions (Queued -> Extracting)
    pollJob(currentJobId);

    // Trigger in background
    fetch('/api/bom/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: currentJobId,
        stage: 'identity',
        userHints,
      }),
    }).catch(err => {
      console.error('Extraction trigger failed:', err);
      setError(err.message);
      setLoadingMode(null);
    });
  }

  async function handleNameplateUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    resetSession();
    setLoadingMode('identity');

    try {
      const formData = new FormData();
      formData.append('identityFiles', file);
      formData.append('runIdentity', '1');
      formData.append('userHints', JSON.stringify({}));

      const res = await fetch('/api/bom/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(
          toDisplayErrorMessage(data?.detail || data?.error || 'Nameplate upload failed')
        );
      }

      setJobId(data.jobId);

      if (data.uploadedFiles?.[0]?.url) {
        setNameplateImageUrl(data.uploadedFiles[0].url);
      }

      if (data.identity) {
        setIdentityReview(getIdentityReviewFromExtractor(data.identity));
        setJobStage('identity_review');
        setLoadingMode(null);
      } else {
        await startIdentityStage(data.jobId);
      }
    } catch (err) {
      console.error('Nameplate processing failed:', err);
      setLoadingMode(null);
      setError(err instanceof Error ? err.message : 'Nameplate processing failed');
    } finally {
      if (nameplateInputRef.current) {
        nameplateInputRef.current.value = '';
      }
    }
  }

  async function handleManualPdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    resetSession();
    setLoadingMode('manual_pdf');

    try {
      const formData = new FormData();
      formData.append('identityFiles', file);

      const res = await fetch('/api/bom/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'Manual upload failed'));
      }

      setJobId(data.jobId);
      await startIdentityStage(data.jobId);
    } catch (uploadError) {
      setLoadingMode(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Manual processing failed');
    } finally {
      if (manualPdfInputRef.current) {
        manualPdfInputRef.current.value = '';
      }
    }
  }

  async function handleLookupExpectedParts() {
    const fallbackModel = identityReview?.model || results?.model || '';
    const model = manualModelNumber.trim() || fallbackModel.trim();

    if (!model) {
      setError('Enter or confirm a model number first.');
      return;
    }

    setError(null);
    setCountLookupMessage(null);
    setCountLookupBusy(true);

    try {
      let currentJobId = jobId;
      if (!currentJobId) {
        currentJobId = await createEmptyJob();
        setJobId(currentJobId);
      }

      const payload = {
        jobId: currentJobId,
        model,
        brand: manualBrand.trim() || identityReview?.brand || results?.brand || undefined,
        serial: manualSerial.trim() || identityReview?.serial || results?.serial || undefined,
        productType: manualProductType.trim() || identityReview?.productType || results?.productType || undefined,
      };

      const res = await fetch('/api/bom/expected-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'Sears count lookup failed'));
      }

      setIdentityReview((prev) => ({
        ...(prev || {}),
        brand: payload.brand || prev?.brand || '',
        resolvedBrand: prev?.resolvedBrand || payload.brand || '',
        model,
        serial: payload.serial || prev?.serial || '',
        productType: payload.productType || prev?.productType || '',
        confidence: typeof prev?.confidence === 'number' ? prev.confidence : 1,
        searchConfidence: typeof prev?.searchConfidence === 'number' ? prev.searchConfidence : 1,
        familyKey: prev?.familyKey || '',
        adapterKey: prev?.adapterKey || '',
        expectedPartsTotal: Number(data?.expectedPartsTotal || 0),
        expectedPartsSource: data?.expectedPartsSource || '',
        coveragePct: prev?.coveragePct || 0,
        actualUniqueParts: prev?.actualUniqueParts || 0,
      }));

      if (data?.found && Number(data?.expectedPartsTotal || 0) > 0) {
        setCountLookupMessage(`SearsPartsDirect exact-match estimate found: ${Number(data.expectedPartsTotal)} parts for ${model}.`);
      } else {
        setCountLookupMessage(`No SearsPartsDirect exact-match part count was found for ${model}, but the model is ready for the normal BOM flow.`);
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Sears count lookup failed');
    } finally {
      setCountLookupBusy(false);
    }
  }

  async function handleManualIdentitySubmit(event) {
    event.preventDefault();

    const trimmedModel = manualModelNumber.trim();
    if (!trimmedModel) return;

    resetSession();
    setLoadingMode('identity');

    try {
      const currentJobId = await createEmptyJob();
      setJobId(currentJobId);

      await startIdentityStage(currentJobId, {
        brand: manualBrand.trim() || undefined,
        model: trimmedModel,
        serial: manualSerial.trim() || undefined,
        productType: manualProductType.trim() || undefined,
      });
    } catch (manualError) {
      setLoadingMode(null);
      setError(manualError instanceof Error ? manualError.message : 'Manual identity failed');
    }
  }

  async function handleBeginCompilation() {
    if (!jobId) {
      setError('A job ID is required before beginning compilation.');
      return;
    }

    setError(null);
    setSelectedSections([]);
    setLoadingMode('bom');

    try {
      // Start polling IMMEDIATELY rather than waiting for the trigger to resolve
      pollJob(jobId);

      const res = await fetch(`/api/bom/jobs/${jobId}/compile`, {
        method: 'POST',
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'BOM compilation failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BOM compilation failed');
      setLoadingMode(null);
    }
  }

  async function handleExtractNextGroup() {
    if (!jobId || !activeGroupId) return;

    setError(null);
    setLoadingMode('extract_group');

    try {
      const res = await fetch(`/api/bom/jobs/${jobId}/groups/${activeGroupId}/extract`, {
        method: 'POST',
      });

      const data = await readApiResponse(res);
      if (!res.ok) {
        throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'Group extraction failed'));
      }

      setResults({
        parts: normalizeResultParts(data.result?.parts || []),
        brand: data.result?.brand,
        model: data.result?.model,
        status: data.result?.status,
        coverage: data.result?.coverage,
        issues: data.result?.issues,
      });

      setDiagramGroups(data.groups || []);
      setActiveGroupId(data.nextGroupId || null);
      setIsComplete(data.isComplete);
      setJobStage(data.job?.jobStage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Group extraction failed');
    } finally {
      setLoadingMode(null);
    }
  }

  function toggleSection(sectionName) {
    setSelectedSections((prev) =>
      prev.includes(sectionName)
        ? prev.filter((value) => value !== sectionName)
        : [...prev, sectionName],
    );
  }

  const sectionOptions = useMemo(() => {
    const rows = Array.isArray(results?.parts) ? results.parts : [];
    return [...new Set(rows.map((row) => cleanText(row.section)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [results]);

  const filteredParts = useMemo(() => {
    let rows = Array.isArray(results?.parts) ? results.parts : [];

    if (selectedSections.length > 0) {
      const wanted = new Set(selectedSections.map((v) => v.toLowerCase()));
      rows = rows.filter((r) => wanted.has(cleanText(r.section).toLowerCase()));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.description?.toLowerCase().includes(q) ||
        (r.currentServicePartNumber || "").toLowerCase().includes(q) ||
        (r.originalPartNumber || "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [results, selectedSections, searchQuery]);

  const [isPricingEnabled, setIsPricingEnabled] = useState(false);

  useEffect(() => {
    setIsPricingEnabled(Boolean(results?.parts && results.parts.length > 0));
  }, [results]);

  const pricedRowCount = useMemo(
    () => getPricedRowCount(results?.parts),
    [results],
  );

  const filteredPricedRowCount = useMemo(
    () => getPricedRowCount(filteredParts),
    [filteredParts],
  );

  async function handleFindPricing() {
    if (!jobId || !isPricingEnabled) {
      return;
    }

    setPricingBusy(true);
    setPricingMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/bom/jobs/${jobId}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSections,
          searchQuery,
          selectedRowIds,
        }),
      });

      const data = await readApiResponse(res);

      if (!res.ok) {
        throw new Error(toDisplayErrorMessage(data?.detail || data?.error || 'Filtered pricing failed'));
      }

      setResults((prev) => ({
        ...prev,
        parts: Array.isArray(data.rows) ? data.rows : prev?.parts || [],
        issues: Array.isArray(data.issues) ? data.issues : prev?.issues || [],
      }));
      setLastPricedSubset(Array.isArray(data.pricedSubsetRows) ? data.pricedSubsetRows : []);
      setLastPricingSelection(Array.isArray(data.selectedSections) ? data.selectedSections : selectedSections);

      setPricingMessage(
        `Priced ${Number(data.pricedRowCount || 0)} filtered row${Number(data.pricedRowCount || 0) === 1 ? '' : 's'}.`,
      );
    } catch (pricingError) {
      setError(
        pricingError instanceof Error ? pricingError.message : 'Filtered pricing failed',
      );
    } finally {
      setPricingBusy(false);
    }
  }

  async function handleCaptureEbayPage(part) {
    const partNumber = getBomRowPartNumber(part);

    if (!partNumber) {
      setError('No part number found for eBay analysis.');
      return;
    }

    if (!ebayCaptureText.trim()) {
      setError('Paste copied eBay page text before analyzing resale data.');
      return;
    }

    setError(null);
    setIsEbayLoading((prev) => ({ ...prev, [partNumber]: true }));

    try {
      const extractRes = await fetch('/api/ebay/visible-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: ebayCaptureText }),
      });

      const extractData = await readApiResponse(extractRes);

      if (!extractRes.ok) {
        throw new Error(
          toDisplayErrorMessage(
            extractData?.detail || extractData?.error || 'eBay page extraction failed',
          ),
        );
      }

      const listings = Array.isArray(extractData?.listings)
        ? extractData.listings
        : Array.isArray(extractData)
          ? extractData
          : [];

      const summaryRes = await fetch('/api/ebay/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings }),
      });

      const summary = await readApiResponse(summaryRes);

      if (!summaryRes.ok) {
        throw new Error(
          toDisplayErrorMessage(summary?.detail || summary?.error || 'eBay summary failed'),
        );
      }

      setEbaySummary((prev) => ({
        ...prev,
        [partNumber]: summary,
      }));

      const draftRes = await fetch('/api/ebay/listing-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part,
          summary,
          model: identityReview?.model || results?.model || '',
        }),
      });

      const draft = await readApiResponse(draftRes);

      if (!draftRes.ok) {
        throw new Error(
          toDisplayErrorMessage(draft?.detail || draft?.error || 'eBay listing draft failed'),
        );
      }

      setEbayDrafts((prev) => ({
        ...prev,
        [partNumber]: draft,
      }));

      setEbayCaptureText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'eBay resale analysis failed');
    } finally {
      setIsEbayLoading((prev) => ({ ...prev, [partNumber]: false }));
    }
  }

  const isLoading = loadingMode !== null;

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900 selection:bg-blue-100">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <div className="overflow-hidden rounded-lg">
              <img src="/logo.png" alt="Road Runner Logo" className="h-10 w-10 object-contain" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">
              Road Runner <span className="text-blue-600">Internal BOM Compiler</span>
            </h1>
          </div>
          <div className="hidden items-center space-x-6 text-sm font-medium text-slate-500 md:flex">
            <span>Nameplate-first intake</span>
            <a
              href="/bom-jobs"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition-all shadow-md"
            >
              <Settings size={14} /> BOM Jobs
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:py-12">
        <section className="mx-auto mb-10 max-w-4xl text-center">
          <h2 className="mb-4 text-3xl font-extrabold text-slate-900 md:text-4xl">
            Compile the full appliance BOM,<br />
            <span className="text-blue-600">starting from the nameplate.</span>
          </h2>
          <p className="mb-8 text-lg text-slate-600">
            Upload a washer, dryer, or refrigerator nameplate first. OCR extracts the appliance identity,
            you review it, then the system compiles the full BOM.
          </p>

          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl text-left">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                <Camera size={14} />
                Step 1 · Nameplate Intake
              </div>

              <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                Upload or capture a nameplate image
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                This is the primary intake path. The job will stop at identity review before BOM compile.
              </p>

              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-100 p-6">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={nameplateInputRef}
                  onChange={handleNameplateUpload}
                />
                <button
                  type="button"
                  onClick={() => nameplateInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-4 font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  {loadingMode === 'identity' ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Reading Nameplate
                    </>
                  ) : (
                    <>
                      <Camera className="h-5 w-5" />
                      Upload Nameplate
                    </>
                  )}
                </button>

                <div className="mt-4 text-xs text-slate-500">
                  Expected output: make, model, serial, type, confidence
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl text-left">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                <Search size={14} />
                Secondary Fallbacks
              </div>

              <form onSubmit={handleManualIdentitySubmit} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Manual Model
                  </label>
                  <input
                    type="text"
                    value={manualModelNumber}
                    onChange={(e) => setManualModelNumber(e.target.value)}
                    placeholder="WDT730PAHZ0"
                    disabled={isLoading}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-md placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder="Brand"
                    disabled={isLoading}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-md placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={manualSerial}
                    onChange={(e) => setManualSerial(e.target.value)}
                    placeholder="Serial"
                    disabled={isLoading}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-md placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <input
                  type="text"
                  value={manualProductType}
                  onChange={(e) => setManualProductType(e.target.value)}
                  placeholder="Type (washer / dryer / refrigerator)"
                  disabled={isLoading}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-md placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <button
                    type="submit"
                    disabled={isLoading || !manualModelNumber.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    {loadingMode === 'identity' && !jobId ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Identifying Appliance...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Identify Appliance
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleLookupExpectedParts}
                    disabled={isLoading || countLookupBusy || !manualModelNumber.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {countLookupBusy ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Checking Part Count...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-4 w-4" />
                        Check Expected Count
                      </>
                    )}
                  </button>
                </div>

                {countLookupMessage ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    {countLookupMessage}
                  </div>
                ) : null}
              </form>

              <div className="my-4 h-px bg-slate-100" />

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Manual PDF fallback
                </label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  ref={manualPdfInputRef}
                  onChange={handleManualPdfUpload}
                />
                <button
                  type="button"
                  onClick={() => manualPdfInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {loadingMode === 'manual_pdf' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Reading Manual
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Upload Owner Manual PDF
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>Popular:</span>
                {popularModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setManualModelNumber(m)}
                    className="underline hover:text-blue-500"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6">
          {jobId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-lg">
              <div className="flex items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 font-bold uppercase tracking-widest text-blue-700">
                  <Package size={13} />
                  Stage: {jobStage?.replace(/_/g, ' ') || 'created'}
                </span>
                {jobStatus ? (
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status: {jobStatus.replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Job ID: {jobId}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="space-y-4">
              <LoadingSkeleton />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-start space-x-4 rounded-2xl border border-red-200 bg-red-50 p-6">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <div>
                <h3 className="text-lg font-bold text-red-800">Job Failed</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && identityReview && !results && (
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                <CheckCircle2 size={14} />
                Step 2 · Identity Review
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100 font-bold text-xs">
                  <Database size={12} />
                  Extracted Identity
                </span>
                {identityReview.resolvedBrand ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                    OEM Route: {identityReview.resolvedBrand}
                  </span>
                ) : null}
                {identityReview.familyKey ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                    Family: {identityReview.familyKey}
                  </span>
                ) : null}
              </div>

              <div className="grid gap-6 md:grid-cols-[300px_1fr]">
                <div className="space-y-4">
                  <div className="aspect-[3/4] rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden relative group">
                    {nameplateImageUrl ? (
                      <img src={nameplateImageUrl} alt="Nameplate Snippet" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 text-[10px] text-center p-6 bg-slate-100 font-bold uppercase tracking-widest leading-relaxed">
                        Nameplate Image<br />Snippet
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors pointer-events-none" />
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                    Original Source Evidence
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 content-start">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Brand</label>
                    <input
                      type="text"
                      value={identityReview.brand}
                      onChange={(e) =>
                        setIdentityReview((prev) => ({ ...prev, brand: e.target.value }))
                      }
                      className={`block w-full rounded-xl border px-4 py-3 text-sm shadow-md transition-all focus:ring-2 focus:ring-blue-100 outline-none ${(identityReview.fieldConfidence?.brand || identityReview.confidence) < 0.85 ? 'border-red-200 bg-red-100 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Model</label>
                    <input
                      type="text"
                      value={identityReview.model}
                      onChange={(e) =>
                        setIdentityReview((prev) => ({ ...prev, model: e.target.value }))
                      }
                      className={`block w-full rounded-xl border px-4 py-3 text-sm shadow-sm transition-all focus:ring-2 focus:ring-blue-100 outline-none ${(identityReview.fieldConfidence?.modelNumber || identityReview.confidence) < 0.85 ? 'border-red-200 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Serial</label>
                    <input
                      type="text"
                      value={identityReview.serial}
                      onChange={(e) =>
                        setIdentityReview((prev) => ({ ...prev, serial: e.target.value }))
                      }
                      className={`block w-full rounded-xl border px-4 py-3 text-sm shadow-sm transition-all focus:ring-2 focus:ring-blue-100 outline-none ${(identityReview.fieldConfidence?.serialNumber || identityReview.confidence) < 0.85 ? 'border-red-200 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Type</label>
                    <input
                      type="text"
                      value={identityReview.productType}
                      onChange={(e) =>
                        setIdentityReview((prev) => ({ ...prev, productType: e.target.value }))
                      }
                      className={`block w-full rounded-xl border px-4 py-3 text-sm shadow-sm transition-all focus:ring-2 focus:ring-blue-100 outline-none ${(identityReview.fieldConfidence?.productType || identityReview.confidence) < 0.85 ? 'border-red-200 bg-red-50 focus:border-red-400' : 'border-slate-200 bg-white focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">OCR Confidence</label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 flex items-center justify-between">
                      <span>{(identityReview.confidence * 100).toFixed(0)}%</span>
                      {identityReview.confidence < 0.85 && <span className="text-[9px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded uppercase font-black">Requires Review</span>}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Search Confidence</label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                      {(identityReview.searchConfidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <CoverageTargetCard identity={identityReview} />
              </div>

              {diagramGroups.length > 0 && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Diagram Group Queue ({diagramGroups.filter((g) => g.status === 'complete').length} / {diagramGroups.length})
                    </h4>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {diagramGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`flex items-center justify-between rounded-xl border p-3 text-xs transition-all ${group.status === 'complete'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : group.status === 'running'
                              ? 'border-blue-100 bg-blue-50 text-blue-700'
                              : group.status === 'failed'
                                ? 'border-red-100 bg-red-50 text-red-700'
                                : 'border-slate-100 bg-slate-50 text-slate-500'
                          }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          {group.status === 'complete' ? (
                            <CheckCircle2 size={12} className="shrink-0" />
                          ) : group.status === 'running' ? (
                            <RefreshCw size={12} className="shrink-0 animate-spin" />
                          ) : group.status === 'failed' ? (
                            <AlertCircle size={12} className="shrink-0" />
                          ) : (
                            <Layers size={12} className="shrink-0" />
                          )}
                          <span className="truncate font-medium">{group.groupName}</span>
                        </div>
                        {group.status === 'complete' && (
                          <span className="font-bold">{group.acceptedRowCount} rows</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-4">
                {(!jobId || jobStage === 'identity_review') && (
                  <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-6 text-white shadow-xl shadow-slate-200">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <Zap size={14} className="text-yellow-400 fill-yellow-400" />
                          Recommended Next Step
                        </div>
                        <h4 className="text-xl font-black">Generate Full BOM</h4>
                        <p className="text-sm text-slate-400 max-w-md">
                          Deploying the authoritative retrieval engine to resolve all sections and master part numbers.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleBeginCompilation}
                        disabled={!identityReview.model?.trim() || isLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-sm font-black text-white hover:bg-blue-500 disabled:bg-slate-700 transition-all shadow-lg"
                      >
                        {loadingMode === 'bom' ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Compiling...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Compile Full BOM
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {diagramGroups.length > 0 && activeGroupId && (
                  <div className="flex flex-col gap-3 rounded-2xl bg-blue-600 p-6 text-white shadow-lg shadow-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold uppercase tracking-wider text-blue-100 text-[10px]">Next Group to Extract </h4>
                        <div className="text-xl font-bold">
                          {diagramGroups.find((g) => g.id === activeGroupId)?.groupName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleExtractNextGroup}
                        disabled={isLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:bg-blue-300 disabled:text-blue-100 transition-all"
                      >
                        {loadingMode === 'extract_group' ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Extract This Group
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                        <h4 className="text-lg font-bold text-slate-900">
                          {jobStage === 'compiling_oem' ? 'Agent 1: Routing to OEM Source...' :
                            jobStage === 'benchmarking_coverage' ? 'Agent 2: Benchmarking Coverage...' :
                              jobStage === 'extracting_groups' ? 'Agent 3: Expanding Diagrams...' :
                                jobStage === 'filling_gaps' ? 'Agent 4: Filling Data Gaps...' :
                                  'Supervisor: Orchestrating Agents...'}
                        </h4>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-1000"
                        style={{
                          width:
                            jobStage === 'compiling_oem' ? '25%' :
                              jobStage === 'benchmarking_coverage' ? '50%' :
                                jobStage === 'extracting_groups' ? '75%' :
                                  jobStage === 'filling_gaps' ? '90%' : '10%'
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="h-px bg-slate-100 my-2" />
              </div>
            </div>
          )}

          {(() => {
            const modelForPanel = manualModelNumber || identityReview?.model || "";
            const serialForPanel = manualSerial || identityReview?.serial || "";
            if (!modelForPanel) return null;
            return (
              <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <Database size={14} />
                  Source URL Control
                </div>
                <EncompassUrlPanel 
                  modelNumber={modelForPanel} 
                  serialNumber={serialForPanel} 
                />
              </div>
            );
          })()}

          {results && (results.rows?.length > 0 || !isLoading) && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {(() => {
                const resultRowCount = getResultRowCount(results);
                const filteredRowCount = filteredParts.length;
                const resultStatusMeta = getBomStatusMeta(results?.status, resultRowCount);
                const resultToneClass = toneClasses(resultStatusMeta.tone);
                const resultChipLabel = getJobChipLabel(resultStatusMeta.key);

                const exportParams = new URLSearchParams();
                if (selectedSections.length > 0) {
                  selectedSections.forEach((s) => exportParams.append('section', s));
                }
                if (searchQuery) {
                  exportParams.append('q', searchQuery);
                }
                if (selectedRowIds.length > 0) {
                  selectedRowIds.forEach((id) => exportParams.append('part', id));
                }

                const exportUrl = jobId
                  ? `/api/bom/jobs/${jobId}/export?${exportParams.toString()}`
                  : '#';

                return (
                  <>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Layers size={14} /> Step 3 · Full BOM
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 mb-4 text-xs">
                      <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100 font-bold">
                        <Database size={12} /> Brand: {results.brand || identityReview?.brand || 'Detected'}
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-slate-700 ring-1 ring-slate-100 font-bold">
                        Model: {results.model || identityReview?.model || 'Detected'}
                      </span>
                      {identityReview?.expectedPartsTotal > 0 && (
                        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 font-bold ${identityReview.coveragePct >= 0.9 ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' :
                            identityReview.coveragePct < 0.75 ? 'bg-amber-50 text-amber-700 ring-amber-100' :
                              'bg-blue-50 text-blue-700 ring-blue-100'
                          }`}>
                          <BarChart3 size={12} />
                          Coverage: {(identityReview.coveragePct * 100).toFixed(0)}% ({identityReview.actualUniqueParts}/{identityReview.expectedPartsTotal})
                        </span>
                      )}
                      <div className={`rounded-full px-3 py-1 font-bold uppercase tracking-widest border ${resultToneClass}`}>
                        {resultChipLabel}: {jobId?.split('-')[0]}
                      </div>
                    </div>

                    {resultRowCount === 0 && (
                      <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6 flex items-start gap-4">
                        <div className="bg-red-100 p-2 rounded-xl text-red-600"><AlertCircle size={24} /></div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">0 parts retrieved</h3>
                          <p className="text-slate-600 text-sm">Sources were found, but zero accepted BOM rows were extracted for this model.</p>
                        </div>
                      </div>
                    )}

                    {resultRowCount > 0 && resultRowCount < 40 && (
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6 flex items-start gap-4">
                        <div className="bg-amber-100 p-2 rounded-xl text-amber-600"><Info size={24} /></div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">{resultRowCount} verified parts found — BELOW FLOOR</h3>
                          <p className="text-slate-600 text-sm">Full BOM compile returned rows, but coverage is still below target.</p>
                        </div>
                      </div>
                    )}

                    {resultStatusMeta.key === 'bom_complete' && resultRowCount > 0 && (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 flex items-start gap-4">
                        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600"><Zap size={24} className="fill-emerald-600" /></div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">{resultRowCount} verified parts found — SUCCESS</h3>
                          <p className="text-slate-600 text-sm">The full BOM is ready for filter/export.</p>
                        </div>
                      </div>
                    )}

                    {resultRowCount > 0 && (
                      <>
                        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xl">
                          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                            <Search size={14} />
                            Step 4 · Keyword Search & Filter Narrowing
                          </div>

                          <div className="mb-6">
                            <div className="relative">
                              <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                              <input
                                type="text"
                                placeholder="Search description or part number to narrow results..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="block w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium shadow-md outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                              />
                            </div>
                          </div>

                          <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Filter by Category</div>
                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <button
                              type="button"
                              onClick={() => setSelectedSections([])}
                              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${selectedSections.length === 0
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                              All Categories
                            </button>

                            {sectionOptions.map((section) => {
                              const active = selectedSections.includes(section);

                              return (
                                <button
                                  key={section}
                                  type="button"
                                  onClick={() => toggleSection(section)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${active
                                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                  {section}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                              <span>
                                Showing <span className="font-bold text-slate-900">{filteredRowCount}</span> of{' '}
                                <span className="font-bold text-slate-900">{resultRowCount}</span> rows
                              </span>

                              {selectedSections.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                                  <Filter size={12} />
                                  {selectedSections.length} filter{selectedSections.length === 1 ? '' : 's'} active
                                </span>
                              ) : null}
                            </div>

                            {selectedSections.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedSections([])}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                              >
                                <X size={12} />
                                Clear Filters
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xl">
                          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                            <DollarSign size={14} />
                            Step 5 · Pricing
                          </div>

                          <p className="mb-4 text-xs font-medium text-slate-500">
                            {!isPricingEnabled
                              ? 'Run BOM compilation first to enable pricing.'
                              : selectedRowIds.length > 0
                                ? `Ready. Pricing ${selectedRowIds.length} selected row${selectedRowIds.length === 1 ? '' : 's'}.`
                                : selectedSections.length > 0
                                  ? `Ready. Pricing ${filteredParts.length} filtered row${filteredParts.length === 1 ? '' : 's'} (${selectedSections.length} category filter${selectedSections.length === 1 ? '' : 's'} active).`
                                  : `Ready. Will price all ${filteredParts.length} parts. Use category filters or row checkboxes to narrow scope.`}
                          </p>

                          <button
                            onClick={handleFindPricing}
                            disabled={pricingBusy || !isPricingEnabled}
                            className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 ${isPricingEnabled
                                ? 'bg-blue-600 shadow-blue-200 hover:bg-blue-700 hover:shadow-blue-300'
                                : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
                              }`}
                          >
                            <DollarSign size={16} />
                            {pricingBusy
                              ? 'Fetching Market Prices...'
                              : !isPricingEnabled
                                ? 'Run BOM Compile First'
                                : selectedRowIds.length > 0
                                  ? `Price ${selectedRowIds.length} Selected`
                                  : selectedSections.length > 0
                                    ? `Price ${filteredParts.length} Filtered`
                                    : `Price All ${filteredParts.length} Parts`}
                          </button>

                          {pricingMessage ? (
                            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                              {pricingMessage}
                            </div>
                          ) : null}
                        </div>

                        {lastPricedSubset.length > 0 ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                              <DollarSign size={14} />
                              Step 6 · Returned Priced Subset
                            </div>

                            <div className="mb-4 text-sm text-emerald-900">
                              Showing <span className="font-bold">{lastPricedSubset.length}</span> priced row{lastPricedSubset.length === 1 ? '' : 's'} for
                              {' '}<span className="font-bold">{lastPricingSelection.join(', ')}</span>.
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white">
                              <table className="w-full text-left text-sm text-slate-600 border-collapse">
                                <thead className="bg-emerald-50 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                  <tr>
                                    <th className="px-6 py-3 border-b border-emerald-100">Part Description</th>
                                    <th className="px-6 py-3 border-b border-emerald-100">Part Number</th>
                                    <th className="px-6 py-3 border-b border-emerald-100">Retail</th>
                                    <th className="px-6 py-3 border-b border-emerald-100">Section</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lastPricedSubset.map((part, idx) => (
                                    <tr key={`priced-subset-${part.currentServicePartNumber || part.originalPartNumber}-${idx}`} className="border-b border-emerald-50">
                                      <td className="px-6 py-4 font-semibold text-slate-800">{part.description}</td>
                                      <td className="px-6 py-4 font-mono text-slate-700">{part.currentServicePartNumber || part.originalPartNumber}</td>
                                      <td className="px-6 py-4">
                                        {typeof part.retailPrice === 'number' ? (part.retailPriceText || `$${part.retailPrice.toFixed(2)}`) : '—'}
                                      </td>
                                      <td className="px-6 py-4">{part.section || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-100 overflow-hidden relative">
                          <div className="flex flex-col md:flex-row gap-6 mb-8">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${resultToneClass}`}>
                                  {resultStatusMeta.key === 'bom_complete' ? <Zap size={10} className="fill-emerald-700" /> : <Info size={10} />}
                                  {resultStatusMeta.label}
                                </div>
                              </div>
                              <h3 className="font-bold text-slate-800 tracking-tight text-xl mb-1">
                                {filteredRowCount} Visible Parts for {results.model || identityReview?.model || manualModelNumber}
                              </h3>
                              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-medium mt-4">
                                <div className="flex items-center gap-1">
                                  <Layers size={12} className="text-slate-400" />
                                  <span>Total: <span className="text-slate-800 font-bold">{resultRowCount}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Filter size={12} className="text-slate-400" />
                                  <span>Visible: <span className="text-slate-800 font-bold">{filteredRowCount}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <DollarSign size={12} className="text-slate-400" />
                                  <span>Priced: <span className="text-slate-800 font-bold">{pricedRowCount}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <BarChart3 size={12} className="text-slate-400" />
                                  <span>Coverage: <span className="text-slate-800 font-bold">{(results.coverage * 100).toFixed(1)}%</span></span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3 self-center md:self-auto">
                              <a
                                href={exportUrl}
                                className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
                              >
                                <Download size={16} />
                                {selectedSections.length > 0 ? 'Export Subset' : 'Export Full BOM'}
                              </a>
                            </div>
                          </div>

                          <div className="overflow-x-auto -mx-6 -mb-6 border-t border-slate-100">
                            <table className="w-full text-left text-sm text-slate-600 border-collapse">
                              <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <tr>
                                  <th className="px-6 py-4 border-b border-slate-200">
                                    <input
                                      type="checkbox"
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={filteredParts.length > 0 && selectedRowIds.length === filteredParts.length}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedRowIds(filteredParts.map(p => p.currentServicePartNumber).filter(Boolean));
                                        } else {
                                          setSelectedRowIds([]);
                                        }
                                      }}
                                    />
                                  </th>
                                  <th className="px-6 py-4 border-b border-slate-200">Part Description</th>
                                  <th className="px-6 py-4 border-b border-slate-200">Part Number</th>
                                  <th className="px-6 py-4 border-b border-slate-200">Retail</th>
                                  <th className="px-6 py-4 border-b border-slate-200">eBay Resale</th>
                                  <th className="px-6 py-4 border-b border-slate-200">Section</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredParts.map((part, idx) => (
                                  <tr
                                    key={`${part.currentServicePartNumber || part.originalPartNumber}-${idx}`}
                                    className={`group border-b border-slate-100 hover:bg-blue-50/20 transition-all duration-150 ${selectedRowIds.includes(part.currentServicePartNumber) ? 'bg-blue-50/40' : ''}`}
                                  >
                                    <td className="px-6 py-5">
                                      <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        checked={selectedRowIds.includes(part.currentServicePartNumber)}
                                        onChange={() => {
                                          const pid = part.currentServicePartNumber;
                                          if (!pid) return;
                                          setSelectedRowIds(prev =>
                                            prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
                                          );
                                        }}
                                      />
                                    </td>
                                    <td className="px-8 py-5">
                                      <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                                        {part.description}
                                      </div>
                                      <div className="text-[10px] text-slate-400 mt-0.5">{part.sourceType}</div>
                                    </td>
                                    <td className="px-8 py-5">
                                      <div className="font-mono font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded inline-block group-hover:bg-white transition-colors">
                                        {part.currentServicePartNumber || part.originalPartNumber}
                                      </div>
                                      {part.nlaStatus && (
                                        <span className="ml-2 text-[10px] font-bold text-red-600 uppercase">
                                          NLA
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-8 py-5">
                                      {typeof part.retailPrice === 'number' ? (
                                        <div className="space-y-1">
                                          <div className="font-bold text-slate-800">
                                            {part.retailPriceText || `$${part.retailPrice.toFixed(2)}`}
                                          </div>
                                          {part.retailAvailability ? (
                                            <div className="text-[10px] text-slate-500">{part.retailAvailability}</div>
                                          ) : null}
                                          {part.retailPricingUrl ? (
                                            <a
                                              href={part.retailPricingUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                                            >
                                              Sears Price <ExternalLink size={10} />
                                            </a>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-8 py-5">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex gap-2">
                                          <a
                                            href={ebaySearchUrl(getBomRowPartNumber(part))}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                          >
                                            Search eBay
                                          </a>
                                          <a
                                            href={ebaySoldSearchUrl(getBomRowPartNumber(part))}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                          >
                                            Sold Comps
                                          </a>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedMarketPart(part)}
                                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-blue-300 hover:text-blue-600"
                                        >
                                          eBay Resale ↓
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-8 py-5">
                                      <span className="inline-block rounded-lg bg-white px-3 py-1 text-[11px] font-bold text-slate-500 border border-slate-200 shadow-md">
                                        {part.section}
                                      </span>
                                      {part.diagramNumber && (
                                        <div className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1">
                                          <BarChart3 className="w-3 h-3 text-slate-300" />
                                          Item: {part.diagramNumber}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}

                                {results && results.parts.length > 0 && filteredParts.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-8 py-10 text-center text-sm text-slate-500">
                                      <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4">
                                        <div className="flex items-center gap-3 text-red-700">
                                          <AlertCircle size={20} />
                                          <div className="text-sm font-bold">No BOM rows matched the selected filters.</div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <EbayMarketPanel
                          part={selectedMarketPart}
                          ebayCaptureText={ebayCaptureText}
                          setEbayCaptureText={setEbayCaptureText}
                          ebaySummary={ebaySummary}
                          ebayDrafts={ebayDrafts}
                          isEbayLoading={isEbayLoading}
                          onAnalyze={handleCaptureEbayPage}
                          onClose={() => {
                            setSelectedMarketPart(null);
                            setEbayCaptureText('');
                          }}
                        />
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getResultsFromJob(job) {
  const rows = Array.isArray(job?.finalRows) ? job.finalRows : [];
  if (!rows.length) return null;

  return {
    parts: normalizeResultParts(rows),
    brand: job?.brand || null,
    model: job?.model || null,
    serial: job?.serial || null,
    productType: job?.productType || null,
    status: job?.resultStatus || 'complete',
    coverage: job?.coverageScore || 0,
    issues: Array.isArray(job?.issues) ? job.issues : [],
  };
}

function getIdentityReviewFromExtractor(identity) {
  if (!identity) return null;
  return {
    brand: identity?.brand || '',
    resolvedBrand: identity?.brand || '',
    model: identity?.model || '',
    serial: identity?.serial || '',
    productType: identity?.productType || '',
    confidence: typeof identity?.confidence === 'number' ? identity.confidence : 0,
    searchConfidence: 0,
    familyKey: '',
    adapterKey: '',
    expectedPartsTotal: 0,
    expectedPartsSource: '',
    coveragePct: 0,
    actualUniqueParts: 0,
  };
}
