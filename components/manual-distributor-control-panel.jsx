"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Zap,
  Search,
  Lock,
  Database,
  ArrowRight,
} from "lucide-react";
import {
  SOURCE_TIERS,
  normalizeCanonicalModel,
  normalizeModelForSupplier,
  supplierDisplayName,
} from "@/features/bom/services/source-tier-policy";

function readCurrentModel({ manualModelNumber, identityReview, results }) {
  return (
    String(manualModelNumber || "").trim() ||
    String(identityReview?.model || "").trim() ||
    String(results?.model || "").trim()
  );
}

function readCurrentBrand({ manualBrand, identityReview, results }) {
  return (
    String(manualBrand || "").trim() ||
    String(identityReview?.brand || "").trim() ||
    String(results?.brand || "").trim()
  );
}

function statusTone(status) {
  if (status === "complete") return "text-emerald-700 bg-emerald-50 border-emerald-100";
  if (status === "partial") return "text-amber-700 bg-amber-50 border-amber-100";
  if (status === "failed") return "text-red-700 bg-red-50 border-red-100";
  if (status === "count_unknown") return "text-slate-700 bg-slate-50 border-slate-100";
  return "text-blue-700 bg-blue-50 border-blue-100";
}

function Pill({ children, status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusTone(status)}`}>
      {children}
    </span>
  );
}

export default function ManualDistributorControlPanel({
  jobId,
  setJobId,
  identityReview,
  results,
  manualModelNumber,
  manualBrand,
  manualSerial,
  manualProductType,
  pollJob,
  setError,
}) {
  const [activeTier, setActiveTier] = useState("tier1");
  const [supplierRows, setSupplierRows] = useState([]);
  const [activeSupplierRow, setActiveSupplierRow] = useState(null);
  const [supplierIndex, setSupplierIndex] = useState(null);
  const [selectedAssemblyIds, setSelectedAssemblyIds] = useState(new Set());
  const [overrideCounts, setOverrideCounts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState(null);
  const [encompassIndexMatch, setEncompassIndexMatch] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const currentModel = readCurrentModel({
    manualModelNumber,
    identityReview,
    results,
  });

  const currentBrand = readCurrentBrand({
    manualBrand,
    identityReview,
    results,
  });

  const canonicalModel = normalizeCanonicalModel(currentModel);

  // Proactive Encompass Index Detection
  useEffect(() => {
    if (!canonicalModel) {
      setEncompassIndexMatch(null);
      return;
    }

    async function detectIndex() {
      setIsDetecting(true);
      try {
        const res = await fetch(`/api/bom/encompass-index?model=${encodeURIComponent(canonicalModel)}&brand=${encodeURIComponent(currentBrand)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "exact_match" || data.status === "multiple_matches") {
            setEncompassIndexMatch(data.selected);
          } else {
            setEncompassIndexMatch(null);
          }
        }
      } catch (err) {
        console.error("Encompass index detection failed", err);
      } finally {
        setIsDetecting(false);
      }
    }

    detectIndex();
  }, [canonicalModel, currentBrand]);

  const selectedAssemblies = useMemo(() => {
    if (!supplierIndex?.assemblies) return [];

    return supplierIndex.assemblies
      .filter((assembly) => selectedAssemblyIds.has(assembly.id))
      .map((assembly) => ({
        id: assembly.id,
        title: assembly.title,
        sourceUrl: assembly.sourceUrl,
        supplierCount: assembly.supplierCount,
        overrideCount:
          overrideCounts[assembly.id] === "" ||
          overrideCounts[assembly.id] === undefined
            ? null
            : Number(overrideCounts[assembly.id]),
      }));
  }, [supplierIndex, selectedAssemblyIds, overrideCounts]);

  const expectedSelectedCount = useMemo(() => {
    return selectedAssemblies.reduce((sum, assembly) => {
      const count = Number(assembly.overrideCount ?? assembly.supplierCount ?? 0);
      return sum + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);
  }, [selectedAssemblies]);

  async function readApiResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { detail: text };
    }
  }

  async function ensureJobId() {
    if (jobId) return jobId;

    const res = await fetch("/api/bom/jobs", { method: "POST" });
    const data = await readApiResponse(res);

    if (!res.ok || !data.jobId) {
      throw new Error(data?.detail || data?.error || "Job creation failed.");
    }

    setJobId?.(data.jobId);
    return data.jobId;
  }

  function buildRowsForTier(tierKey) {
    const tier = SOURCE_TIERS[tierKey];
    if (!tier || !canonicalModel) return [];

    return tier.suppliers.map((supplier) => {
      const formattedModel = normalizeModelForSupplier({
        supplier,
        model: canonicalModel,
        brand: currentBrand,
      });

      let searchUrl = "";
      let family = null;

      if (supplier === "encompass-family" && encompassIndexMatch) {
        searchUrl = encompassIndexMatch.url;
        family = encompassIndexMatch.family;
      }

      return {
        supplier,
        tierKey,
        canonicalModel,
        formattedModel,
        searchUrl,
        family,
        targetStatus: searchUrl ? "complete" : "idle",
        indexStatus: "idle",
        extractionStatus: "locked",
        pricingStatus: "locked",
      };
    });
  }

  useEffect(() => {
    if (activeTier && canonicalModel) {
      setSupplierRows(buildRowsForTier(activeTier));
    }
  }, [activeTier, canonicalModel, encompassIndexMatch]);

  function openTier(tierKey) {
    if (!canonicalModel) {
      setError?.("Enter or confirm a model number before opening a supplier tier.");
      return;
    }

    setError?.(null);
    setMessage(null);
    setActiveTier(tierKey);
    setActiveSupplierRow(null);
    setSupplierIndex(null);
    setSelectedAssemblyIds(new Set());
    setOverrideCounts({});
  }

  async function runSourceAction(row, task, extra = {}) {
    const activeJobId = await ensureJobId();

    const body = {
      jobId: activeJobId,
      task,
      tierKey: row.tierKey,
      supplier: row.supplier,
      canonicalModel: row.canonicalModel,
      formattedModel: row.formattedModel,
      searchUrl: row.searchUrl,
      brand: currentBrand || undefined,
      serial: manualSerial || identityReview?.serial || results?.serial || undefined,
      productType:
        manualProductType ||
        identityReview?.productType ||
        results?.productType ||
        undefined,
      ...extra,
    };

    const res = await fetch("/api/bom/source-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await readApiResponse(res);

    if (!res.ok) {
      throw new Error(data?.detail || data?.error || "Source action failed.");
    }

    pollJob?.(activeJobId);
    return data;
  }

  async function lockSupplier(row) {
    setBusyKey(`${row.supplier}:lock`);
    setError?.(null);
    setMessage(null);

    try {
      const data = await runSourceAction(row, "lock_supplier_target");
      setActiveSupplierRow(row);
      setMessage(`${supplierDisplayName(row.supplier)} target locked.`);
      setSupplierRows((prev) =>
        prev.map((item) =>
          item.supplier === row.supplier ? { ...item, targetStatus: "complete", searchUrl: data.result?.supplierTarget?.searchUrl || item.searchUrl } : item,
        ),
      );
      return data;
    } catch (err) {
      setError?.(err instanceof Error ? err.message : "Lock supplier failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function loadSupplierIndex(row) {
    setBusyKey(`${row.supplier}:index`);
    setError?.(null);
    setMessage(null);

    try {
      let currentRow = row;
      if (row.targetStatus !== "complete") {
        const lockData = await lockSupplier(row);
        if (lockData?.result?.supplierTarget) {
            currentRow = { ...row, searchUrl: lockData.result.supplierTarget.searchUrl, targetStatus: "complete" };
        }
      }

      const data = await runSourceAction(currentRow, "load_supplier_index");
      const index = data?.result?.supplierIndex;

      if (!index) {
        throw new Error("Supplier index did not return assembly titles.");
      }

      setActiveSupplierRow(currentRow);
      setSupplierIndex(index);
      setSelectedAssemblyIds(new Set());
      setOverrideCounts({});
      setMessage(
        `${supplierDisplayName(currentRow.supplier)} index loaded: ${index.assemblies.length} assembly title(s).`,
      );
      setSupplierRows((prev) =>
        prev.map((item) =>
          item.supplier === currentRow.supplier ? { ...item, indexStatus: "complete" } : item,
        ),
      );
    } catch (err) {
      setError?.(err instanceof Error ? err.message : "Load supplier index failed.");
      setSupplierRows((prev) =>
        prev.map((item) =>
          item.supplier === row.supplier ? { ...item, indexStatus: "failed" } : item,
        ),
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function extractSelectedAssemblies() {
    if (!activeSupplierRow) {
      setError?.("Lock/load a supplier before extracting assemblies.");
      return;
    }

    if (!selectedAssemblies.length) {
      setError?.("Select at least one assembly title before clicking GO.");
      return;
    }

    setBusyKey(`${activeSupplierRow.supplier}:go`);
    setError?.(null);
    setMessage(null);

    try {
      const data = await runSourceAction(activeSupplierRow, "extract_selected_assemblies", {
        selectedAssemblies,
      });

      setMessage(
        `GO complete: extracted ${data?.result?.extractedThisRun || 0} rows from selected assemblies.`,
      );

      setSupplierRows((prev) =>
        prev.map((item) =>
          item.supplier === activeSupplierRow.supplier
            ? { ...item, extractionStatus: data?.result?.partsComplete ? "complete" : "partial" }
            : item,
        ),
      );

      pollJob?.(data.jobId);
    } catch (err) {
      setError?.(err instanceof Error ? err.message : "GO extraction failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runPricing(task, pricingSource) {
    if (!activeSupplierRow) {
      setError?.("Load a supplier before pricing.");
      return;
    }

    setBusyKey(`${activeSupplierRow.supplier}:${task}`);
    setError?.(null);
    setMessage(null);

    try {
      const data = await runSourceAction(activeSupplierRow, task, { pricingSource });
      setMessage(
        `${pricingSource} pricing: ${data?.result?.verifiedPriceCount || 0}/${data?.result?.requiredPriceCount || 0} verified.`,
      );
      pollJob?.(data.jobId);
    } catch (err) {
      setError?.(err instanceof Error ? err.message : "Pricing failed.");
    } finally {
      setBusyKey(null);
    }
  }

  const pricingLocked = !results?.parts?.length;
  const tierKeys = Object.keys(SOURCE_TIERS);

  return (
    <section className="group relative mb-8 overflow-hidden rounded-[2.5rem] border border-white/20 bg-slate-900/5 p-1 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-all hover:shadow-[0_48px_80px_-24px_rgba(0,0,0,0.15)]">
      {/* Premium Gradient Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/80 via-slate-50/50 to-slate-200/50 opacity-100 transition-opacity group-hover:opacity-90" />
      
      <div className="p-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-blue-600/80">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200">
                <Layers size={10} />
              </div>
              Manual Distributor Control
            </div>
            <h3 className="text-3xl font-black tracking-tight text-slate-900">
              1. Pick Tier <ArrowRight className="inline-block text-slate-300" size={24} /> 2. Lock &amp; Load <ArrowRight className="inline-block text-slate-300" size={24} /> 3. Select Assemblies <ArrowRight className="inline-block text-slate-300" size={24} /> 4. GO
            </h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Manually resolve diagrams when automated extraction needs guidance. Use the indexed URL when available to bypass generic searching.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-4 rounded-3xl border border-white/50 bg-white/40 p-1 pr-6 shadow-sm backdrop-blur-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-200">
              <Search size={20} />
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Target Model
              </div>
              <div className="font-mono text-xl font-black text-slate-900">
                {canonicalModel || "---"}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          {tierKeys.map((tierKey) => {
            const tier = SOURCE_TIERS[tierKey];
            const active = activeTier === tierKey;

            return (
              <button
                key={tierKey}
                type="button"
                onClick={() => openTier(tierKey)}
                className={`relative overflow-hidden rounded-[2rem] border-2 p-5 text-left transition-all duration-300 ${
                  active
                    ? "border-blue-500 bg-white shadow-2xl shadow-blue-100 ring-4 ring-blue-50"
                    : "border-white/50 bg-white/40 hover:border-blue-200 hover:bg-white"
                }`}
              >
                <div className={`text-sm font-black uppercase tracking-tighter ${active ? "text-blue-600" : "text-slate-900"}`}>
                    {tier.label}
                </div>
                <div className="mt-1 text-xs font-bold leading-tight text-slate-500">
                  {tier.description || `${tier.suppliers.length} suppliers`}
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Control Panel
                    </div>
                    {active && (
                        <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    )}
                </div>
              </button>
            );
          })}
        </div>

        {message ? (
          <div className="mb-6 flex items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 px-6 py-4 text-sm font-bold text-emerald-700 shadow-sm backdrop-blur-md">
            <CheckCircle2 size={18} className="shrink-0" />
            {message}
          </div>
        ) : null}

        {supplierRows.length ? (
          <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/50 bg-white/40 shadow-sm backdrop-blur-md">
            <div className="grid grid-cols-[1.2fr_0.8fr_1.5fr_auto] items-center gap-4 border-b border-slate-100 bg-slate-50/50 px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <div>Provider</div>
              <div>Formatted Model</div>
              <div>Route Evidence</div>
              <div className="text-right">Actions</div>
            </div>

            <div className="divide-y divide-slate-100">
              {supplierRows.map((row) => {
                const isEncompass = row.supplier === "encompass-family";
                const hasMatch = isEncompass && row.searchUrl;

                return (
                  <div
                    key={row.supplier}
                    className={`grid grid-cols-[1.2fr_0.8fr_1.5fr_auto] items-center gap-4 px-8 py-5 transition-colors ${activeSupplierRow?.supplier === row.supplier ? "bg-blue-50/30" : "hover:bg-slate-50/20"}`}
                  >
                    <div>
                      <div className="flex items-center gap-2 font-black text-slate-900">
                        {supplierDisplayName(row.supplier)}
                        {hasMatch && (
                            <Database size={14} className="text-blue-500" title="Indexed result found" />
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Pill status={row.targetStatus}>{row.targetStatus}</Pill>
                        <Pill status={row.indexStatus}>index {row.indexStatus}</Pill>
                      </div>
                    </div>

                    <div className="font-mono text-sm font-bold text-slate-700">
                      {row.formattedModel}
                    </div>

                    <div className="min-w-0">
                        {isEncompass && row.family ? (
                            <div className="mb-1 flex items-center gap-1.5">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                                <span className="text-[11px] font-black uppercase tracking-tight text-blue-600">{row.family}</span>
                            </div>
                        ) : null}
                        <a
                            className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-400 transition hover:text-blue-600 hover:underline"
                            href={row.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(row.formattedModel)}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <ExternalLink size={12} className="shrink-0" />
                            <span className="truncate">{row.searchUrl || "No direct URL indexed"}</span>
                        </a>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await lockSupplier(row);
                          await loadSupplierIndex(row);
                        }}
                        disabled={busyKey !== null}
                        title={row.targetStatus === 'complete' ? 'Supplier locked and index loaded' : 'Locks this supplier as the active target and loads its part index'}
                        className={`group flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-black transition-all ${
                          row.targetStatus === 'complete' && row.indexStatus === 'complete'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-600 opacity-80'
                            : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 active:scale-95 disabled:opacity-50'
                        }`}
                      >
                        {busyKey === `${row.supplier}:index` || busyKey === `${row.supplier}:lock` ? (
                          <Loader2 size={14} className="animate-spin text-blue-500" />
                        ) : row.targetStatus === 'complete' && row.indexStatus === 'complete' ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Lock size={14} className="text-slate-400 group-hover:text-blue-600" />
                        )}
                        {row.targetStatus === 'complete' && row.indexStatus === 'complete'
                          ? 'Locked & Loaded'
                          : row.indexStatus === 'complete'
                            ? 'Refresh Index'
                            : 'Lock & Load Index'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-8 flex h-48 flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-slate-50/50">
             {isDetecting ? (
                 <Loader2 size={32} className="animate-spin text-slate-300" />
             ) : (
                 <>
                    <Database size={32} className="text-slate-200" />
                    <p className="mt-4 text-sm font-bold text-slate-400">Open a supplier tier above to start.</p>
                 </>
             )}
          </div>
        )}

        {supplierIndex ? (
          <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
            <div className="flex flex-col rounded-[2rem] border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-md">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Source Manifest
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {supplierDisplayName(supplierIndex.supplier)}
                  </div>
                </div>
                <Pill status="complete">
                  {supplierIndex.totalCount ? `${supplierIndex.totalCount} total` : "count unknown"}
                </Pill>
              </div>

              {supplierIndex.totalCountEvidence ? (
                <div className="mb-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-[11px] font-bold text-blue-700">
                  <AlertCircle size={16} className="shrink-0" />
                  Count evidence: “{supplierIndex.totalCountEvidence}”
                </div>
              ) : (
                <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-[11px] font-bold text-amber-700 text-pretty">
                  <AlertCircle size={16} className="shrink-0" />
                  Completion remains untrusted until count is known.
                </div>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: '500px' }}>
                {supplierIndex.assemblies.map((assembly) => {
                  const selected = selectedAssemblyIds.has(assembly.id);

                  return (
                    <label
                      key={assembly.id}
                      className={`block cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                        selected
                          ? "border-blue-500 bg-white shadow-xl shadow-blue-50 ring-2 ring-blue-50"
                          : "border-white/50 bg-white/60 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${selected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-200 bg-slate-50"}`}>
                            {selected && <CheckCircle2 size={12} strokeWidth={4} />}
                        </div>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAssembly(assembly.id)}
                          className="hidden"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black leading-tight text-slate-900">
                            {assembly.title}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <span>Qty: {assembly.supplierCount ?? "?"}</span>
                            {assembly.status && assembly.status !== "idle" && (
                                <span className={`flex items-center gap-1 ${assembly.status === "complete" ? "text-emerald-500" : "text-amber-500"}`}>
                                    {assembly.status === "complete" ? <CheckCircle2 size={10} /> : <Loader2 size={10} className="animate-spin" />}
                                    {assembly.status}
                                </span>
                            )}
                          </div>
                          
                          {selected && (
                            <div className="mt-4 pt-4 border-t border-slate-50">
                                <div className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Override parts count</div>
                                <input
                                    type="number"
                                    min="0"
                                    value={overrideCounts[assembly.id] ?? ""}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(event) =>
                                    setOverrideCounts((prev) => ({
                                        ...prev,
                                        [assembly.id]: event.target.value,
                                    }))
                                    }
                                    placeholder="e.g. 107"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-xs font-black focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                                />
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-6">
                <button
                    type="button"
                    onClick={extractSelectedAssemblies}
                    disabled={!selectedAssemblies.length || busyKey !== null}
                    className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-sm font-black text-white shadow-2xl shadow-slate-300 transition-all hover:-translate-y-1 hover:bg-blue-600 hover:shadow-blue-200 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:shadow-none"
                >
                    {busyKey?.endsWith(":go") ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Zap size={18} className="text-yellow-400 group-hover:text-white" />
                    )}
                    GO: Extract {selectedAssemblies.length} Diagrams
                </button>
                <div className="mt-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Expected Part Rows: {expectedSelectedCount || "unknown"}
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-[2rem] border border-white/50 bg-white/40 p-8 shadow-sm backdrop-blur-md">
              <div className="mb-8">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                  Extraction Workflow
                </div>
                <h4 className="text-2xl font-black text-slate-900">Queue & Pricing</h4>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Selected diagrams will be added to the BOM job. Run pricing once extraction is verified.
                </p>
              </div>

              <div className="flex-1">
                {selectedAssemblies.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {selectedAssemblies.map((assembly, index) => (
                      <div
                        key={`${assembly.id || assembly.title}-${index}`}
                        className="group relative overflow-hidden rounded-2xl border border-white bg-white/60 p-4 shadow-sm transition-all hover:bg-white hover:shadow-md"
                      >
                        <div className="absolute top-0 left-0 h-full w-1 bg-blue-500/10 group-hover:bg-blue-500 transition-colors" />
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Diagram {index + 1}
                            </div>
                            <div className="truncate font-black text-slate-900">
                                {assembly.title}
                            </div>
                          </div>
                          <Pill status="pending">
                            {assembly.overrideCount ?? assembly.supplierCount ?? "?"}
                          </Pill>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/50">
                    <Zap size={32} className="text-slate-200" />
                    <p className="mt-4 text-sm font-bold text-slate-400">Select diagrams from the manifest on the left.</p>
                  </div>
                )}
              </div>

              <div className="mt-8 border-t border-slate-100 pt-8">
                <div className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    Finalize Pricing
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => runPricing("price_encompass", "encompass-family")}
                    disabled={pricingLocked || busyKey !== null}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-white bg-white/80 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:shadow-xl hover:shadow-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-100">
                        <DollarSign size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Encompass</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => runPricing("price_backup_1", "partsdr")}
                    disabled={pricingLocked || busyKey !== null}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-white bg-white/80 p-4 transition-all hover:border-blue-200 hover:bg-blue-50 hover:shadow-xl hover:shadow-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-100">
                        <Database size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">PartsDr</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => runPricing("price_backup_2", "appliancepartspros")}
                    disabled={pricingLocked || busyKey !== null}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-white bg-white/80 p-4 transition-all hover:border-orange-200 hover:bg-orange-50 hover:shadow-xl hover:shadow-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-100">
                        <Layers size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">APP Pros</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-3xl border border-white/50 bg-white/20 p-6 backdrop-blur-md">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            <AlertCircle size={14} />
            Control Panel Limitations
            </div>
            <div className="grid gap-4 text-[11px] font-bold text-slate-500 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>No automated provider fanout during Lock.</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>Diagram selection is strictly manual per-supplier.</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>No grounding verification from Load Index.</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-blue-500">•</span>
                    <span>Source actions do not trigger global BOM completion.</span>
                </div>
            </div>
        </div>
      </div>
    </section>
  );
}
