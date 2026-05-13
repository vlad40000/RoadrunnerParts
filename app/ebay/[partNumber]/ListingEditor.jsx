"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ListingGallery from "./ListingGallery";
import AppliancePhotoCapture from "@/src/features/identity/AppliancePhotoCapture";

const TEXT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const IMAGE_WORKFLOW_MODEL = "gemini-3.1-flash-image-preview";
const MODEL_PRESETS = [
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  IMAGE_WORKFLOW_MODEL,
];

function normalizeEditorModel(value) {
  const model = String(value || "").trim();
  if (!model || model === "gemini-3.1-flash-lite-preview") return TEXT_FALLBACK_MODEL;
  if (model === "gemini-3-pro" || model === "gemini-3-pro-preview") return "gemini-3.1-pro-preview";
  if (model === "gemini-2.5-flash-preview-09-2025") return "gemini-2.5-flash";
  if (model === "gemini-2.5-flash-image" || /^nano[-\s]?banana$/i.test(model)) return IMAGE_WORKFLOW_MODEL;
  return /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model) ? model : TEXT_FALLBACK_MODEL;
}
function isImageWorkflowModel(model) {
  return normalizeEditorModel(model) === IMAGE_WORKFLOW_MODEL;
}

function moneyLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toFixed(2)}`;
  return String(value || "").trim();
}

export default function ListingEditor({ initialListing, partNumber }) {
  const [listing, setListing] = useState({
    ...initialListing,
    ebayBuyNow: moneyLabel(initialListing.ebayBuyNow) || moneyLabel(initialListing.price) || moneyLabel(initialListing.specs?.ebayBuyNow),
    condition: initialListing.condition || "Used",
    quantity: initialListing.quantity || 1,
    shipping: initialListing.shipping || "Ground",
    packageDetails: {
      weightLb: initialListing.packageDetails?.weightLb || "",
      weightOz: initialListing.packageDetails?.weightOz || "",
      lengthIn: initialListing.packageDetails?.lengthIn || "",
      widthIn: initialListing.packageDetails?.widthIn || "",
      heightIn: initialListing.packageDetails?.heightIn || "",
    },
    returns: initialListing.returns !== undefined ? initialListing.returns : true,
    status: initialListing.status || "draft"
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isOptimizingSpecs, setIsOptimizingSpecs] = useState(false);
  const [selectedModel, setSelectedModel] = useState(TEXT_FALLBACK_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [editorEnabled, setEditorEnabled] = useState(true);
  const [aiInstruction, setAiInstruction] = useState("");
  const [isRunningAi, setIsRunningAi] = useState(false);
  const [isRunningAiPreset, setIsRunningAiPreset] = useState(null); // tracks which preset fired
  const [aiError, setAiError] = useState("");
  const [aiHistory, setAiHistory] = useState([]);
  const [undoStack, setUndoStack] = useState([]);

  // ── Photo capture / identity sync ──────────────────────────────────
  // URL of the first image uploaded to the gallery — feeds the Listing Photo slot
  const [galleryProductPreview, setGalleryProductPreview] = useState(null);
  // Identity extraction result from nameplate OCR or feature-cue pass
  const [identityResult, setIdentityResult] = useState(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [captureFeatureCues, setCaptureFeatureCues] = useState(null);

  // ── Confidence interview state ────────────────────────────────────────────
  // interviewState mirrors the API response shape
  const [interviewState, setInterviewState] = useState(null);
  const [interviewHistory, setInterviewHistory] = useState([]);
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState(null);
  // Base64 snapshots stored when nameplate/product files arrive (for re-sending to interview API)
  const captureBase64Ref = useRef({ nameplate: null, nameplateType: null, product: null, productType: null });
  const interviewAnswerRef = useRef(null);

  // Seed from existing lead image on mount so the panel shows on first load
  useEffect(() => {
    const lead = (initialListing.imageCandidates || [])[0];
    if (lead?.imageUrl) setGalleryProductPreview(lead.imageUrl);
  }, [initialListing]);

  // ── Core interview runner ─────────────────────────────────────────────────
  // Calls the confidence-interview API with all accumulated evidence.
  // Pass pendingAnswer to append an answer before sending (avoids stale-closure issues).
  const runInterview = useCallback(async (pendingAnswer = null) => {
    setInterviewLoading(true);
    setInterviewError(null);
    try {
      const history = pendingAnswer
        ? [
            ...interviewHistory,
            { question: interviewState?.nextQuestion || "", answer: pendingAnswer },
          ]
        : interviewHistory;

      const body = {
        ocrResult: identityResult || undefined,
        featureCues: captureFeatureCues || undefined,
        history,
        partNumber,
        nameplateBase64: captureBase64Ref.current.nameplate || undefined,
        nameplateType: captureBase64Ref.current.nameplateType || undefined,
        productBase64: captureBase64Ref.current.product || undefined,
        productType: captureBase64Ref.current.productType || undefined,
      };

      const res = await fetch("/api/identity/confidence-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Interview API error");

      if (pendingAnswer) {
        setInterviewHistory(history);
        setInterviewAnswer("");
      }
      setInterviewState(data);

      // Auto-focus the answer input
      setTimeout(() => interviewAnswerRef.current?.focus(), 80);
    } catch (err) {
      setInterviewError(err?.message || "Unknown error");
    } finally {
      setInterviewLoading(false);
    }
  }, [interviewHistory, interviewState, identityResult, captureFeatureCues, partNumber]);

  const calculateQualityScore = () => {
    let score = 0;
    if (listing.title?.length > 10) score += 15;
    if (listing.description?.length > 200) score += 20;
    if (listing.ebayBuyNow && listing.ebayBuyNow !== "US $") score += 15;
    if (listing.imageCandidates?.length > 0) score += 20;
    
    const specCount = Object.values(listing.specs || {}).filter(v => v && v.trim() !== "").length;
    if (specCount >= 4) score += 20;
    else score += (specCount * 5);

    if (listing.condition && listing.quantity > 0 && listing.shipping) score += 10;
    
    return Math.min(score, 100);
  };

  const qualityScore = calculateQualityScore();
  const requestedModel = normalizeEditorModel(showCustomModel ? customModel : selectedModel);
  const effectiveModel = isImageWorkflowModel(requestedModel) ? TEXT_FALLBACK_MODEL : requestedModel;
  const imageWorkflowSelected = isImageWorkflowModel(requestedModel);

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem("rrp:office-editor:gemini-session") || "{}");
      if (session?.model) {
        const normalizedModel = normalizeEditorModel(session.model);
        setSelectedModel(normalizedModel);
        setCustomModel(normalizedModel);
        setShowCustomModel(!MODEL_PRESETS.includes(normalizedModel));
      }
    } catch {
      // Ignore malformed local editor session state.
    }
  }, []);

  const handleUpdate = (field, value) => {
    setListing((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSpecUpdate = (field, value) => {
    setListing((prev) => ({
      ...prev,
      specs: {
        ...(prev.specs || {}),
        [field]: value,
      },
    }));
  };

  const handlePackageUpdate = (field, value) => {
    setListing((prev) => ({
      ...prev,
      packageDetails: {
        ...(prev.packageDetails || {}),
        [field]: value,
      },
    }));
  };

  const persistListing = async (draftListing, reason = "manual") => {
    if (!editorEnabled) return;
    setIsSaving(true);
    setSaveMessage("");
    try {
      const updates = {
        title: draftListing.title,
        ebayBuyNow: draftListing.ebayBuyNow,
        description: draftListing.description,
        specs: draftListing.specs,
        condition: draftListing.condition,
        quantity: draftListing.quantity,
        shipping: draftListing.shipping,
        packageDetails: draftListing.packageDetails || {},
        returns: draftListing.returns,
        status: draftListing.status,
      };
      if (reason === "images") {
        updates.imageCandidates = draftListing.imageCandidates || [];
      }

      const response = await fetch("/api/ebay/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber,
          updates,
          imageSaveMode: reason === "images" ? "replace" : "preserve",
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.details || data.error || "Save failed");
      }

      const savedAt = new Date();
      setLastSaved(savedAt);
      if (reason === "images" && Number(data.imageCount || 0) < Number(draftListing.imageCandidates?.length || 0)) {
        throw new Error(`Only ${data.imageCount || 0} of ${draftListing.imageCandidates?.length || 0} images were confirmed in storage`);
      }
      if (reason === "images") {
        const verifyResponse = await fetch(`/api/ebay/save?partNumber=${encodeURIComponent(partNumber)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const verified = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok || verified.ok === false) {
          throw new Error(verified.error || verified.details || "Image save verification failed");
        }
        if (Number(verified.imageCount || 0) < Number(draftListing.imageCandidates?.length || 0)) {
          throw new Error(`Verified only ${verified.imageCount || 0} of ${draftListing.imageCandidates?.length || 0} images after save`);
        }
      }
      setSaveMessage(
        data.warning
          ? "Saved locally (Blob unavailable)"
          : reason === "images"
          ? `Images saved (${data.imageCount ?? draftListing.imageCandidates?.length ?? 0})`
          : "Saved",
      );
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveMessage(`Save failed: ${message}`);
      console.error("Error saving changes:", error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleImagesChange = (imageCandidates) => {
    if (!editorEnabled) return;
    const nextListing = {
      ...listing,
      imageCandidates,
    };
    setListing(nextListing);
    persistListing(nextListing, "images").catch(() => {
      // Error is already surfaced in the sidebar save message.
    });
  };

  // ── Gallery → AppliancePhotoCapture ──────────────────────────────────
  // When a new file is uploaded to the gallery, push the first Blob URL into
  // the Listing Photo slot on the capture panel.
  const handleGalleryFirstUpload = useCallback((blobUrl) => {
    setGalleryProductPreview(blobUrl);
  }, []);

  // ── AppliancePhotoCapture (Listing Photo slot) → Gallery ─────────────
  // When the operator uses the panel to take/upload a product photo, upload
  // it through the same image-upload API and add it to the gallery.
  const handleProductFromCapture = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append("partNumber", partNumber);
      formData.append("images", file);
      const res = await fetch("/api/ebay/image-upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const uploaded = Array.isArray(data.uploaded) ? data.uploaded : [];
      if (!uploaded.length) return;
      // Merge into gallery
      const clean = uploaded.map((c) => ({
        title: c.title || "",
        imageUrl: c.imageUrl || c.thumbnailUrl || "",
        thumbnailUrl: c.thumbnailUrl || c.imageUrl || "",
        pageUrl: c.pageUrl || "",
        sourceDomain: c.sourceDomain || "operator-capture",
        source: c.source || "appliance_photo_panel",
        reviewStatus: c.reviewStatus || "operator_added_needs_review",
        score: Number(c.score || 100),
        blobPathname: c.blobPathname || "",
        remoteImageUrl: c.remoteImageUrl || "",
        localImagePath: c.localImagePath || "",
        vaultPath: c.vaultPath || "",
        vaultRelativePath: c.vaultRelativePath || "",
        vaultNotePath: c.vaultNotePath || "",
        vaultNoteRelativePath: c.vaultNoteRelativePath || "",
      }));
      const next = { ...listing, imageCandidates: [...(listing.imageCandidates || []), ...clean] };
      setListing(next);
      persistListing(next, "images").catch(() => {});
      // Also update the listing photo slot preview
      if (clean[0]?.imageUrl) setGalleryProductPreview(clean[0].imageUrl);
    } catch { /* silent */ }
  }, [listing, partNumber, persistListing]);

  // ── AppliancePhotoCapture (Nameplate slot) → identity result ─────────
  // Uploads the nameplate photo to the nameplate-OCR endpoint and surfaces
  // the extracted model, serial, brand, and confidence in the sidebar.
  // Also stores base64 for re-sending to the interview API on each round.
  const handleNameplateFile = useCallback(async (file) => {
    setIdentityLoading(true);
    setIdentityResult(null);
    setInterviewState(null);
    setInterviewHistory([]);
    setInterviewError(null);
    try {
      const reader = new FileReader();
      const { base64, mimeType } = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const [prefix, data] = (reader.result || "").split(",");
          const mime = prefix.match(/data:([^;]+)/)?.[1] || file.type || "image/jpeg";
          resolve({ base64: data, mimeType: mime });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      // Store for interview API re-use
      captureBase64Ref.current.nameplate = base64;
      captureBase64Ref.current.nameplateType = mimeType;
      const res = await fetch("/api/tools/parts/extract-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data) {
        setIdentityResult({ type: "nameplate", ...data });
      }
    } catch (err) {
      setIdentityResult({ type: "nameplate", error: err?.message || "OCR failed" });
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  // Auto-trigger the first interview question whenever OCR result or feature cues land
  useEffect(() => {
    if (identityResult && !identityLoading && !interviewState && !interviewLoading) {
      runInterview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityResult]);

  useEffect(() => {
    if (captureFeatureCues && !interviewLoading) {
      runInterview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureFeatureCues]);


  const applyAiEdit = (edit) => {
    setUndoStack((prev) => [...prev.slice(-19), JSON.parse(JSON.stringify(listing))]);
    setListing((prev) => {
      const next = { ...prev };
      const fieldMap = {
        title: "title",
        descriptionText: "description",
        price: "ebayBuyNow",
        quantity: "quantity",
        condition: "condition",
        shipping: "shipping",
        returns: "returns",
        sellerNotes: "sellerNotes",
      };
      for (const [aiKey, localKey] of Object.entries(fieldMap)) {
        if (edit[aiKey] !== undefined) {
          if (aiKey === "price") {
            next[localKey] = typeof edit[aiKey] === "number" ? `US $${edit[aiKey].toFixed(2)}` : String(edit[aiKey]);
          } else {
            next[localKey] = edit[aiKey];
          }
        }
      }
      const specFields = ["brand", "mpn", "fitment", "type", "color", "material", "compatibility"];
      const specPatch = {};
      for (const f of specFields) {
        if (edit[f] !== undefined) specPatch[f] = edit[f];
      }
      if (Object.keys(specPatch).length) {
        next.specs = { ...(prev.specs || {}), ...specPatch };
      }
      return next;
    });
  };

  const inferAiMode = (instruction, requestedMode = "auto") => {
    if (requestedMode === "chat" || requestedMode === "edit") return requestedMode;
    const text = String(instruction || "").trim().toLowerCase();
    const startsWithEditVerb = /^(rewrite|optimize|set|add|change|update|make|remove|fill|normalize|price|title|describe)\b/.test(text);
    const looksLikeQuestion = text.includes("?") || /^(do|does|did|can|could|should|why|what|where|when|how|is|are)\b/.test(text);
    return looksLikeQuestion && !startsWithEditVerb ? "chat" : "edit";
  };

  const runAiInstruction = async (instruction, requestedMode = "auto") => {
    if (!instruction?.trim()) return;
    const mode = inferAiMode(instruction, requestedMode);
    setIsRunningAi(true);
    setAiError("");
    try {
      const response = await fetch("/api/ebay/mockup-ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim(),
          listing: { ...listing, partNumber },
          model: effectiveModel,
          mode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.detail || "AI edit failed");
      }
      if (data.mode !== "chat") {
        applyAiEdit(data.edit || {});
      }
      setAiHistory((prev) => [{
        instruction: instruction.trim(),
        mode: data.mode || mode,
        edit: data.edit,
        message: data.message,
        rationale: data.edit?.rationale,
        warnings: data.edit?.warnings,
        model: data.model,
        ts: new Date().toISOString(),
      }, ...prev].slice(0, 30));
      setAiInstruction("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setAiError(msg);
      console.error("AI instruction error:", error);
    } finally {
      setIsRunningAi(false);
    }
  };

  const undoLastAi = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setListing(prev);
  };

  const generateDescription = async () => {
    setIsGeneratingDescription(true);
    try {
      await runAiInstruction("Rewrite the listing description. Keep it concise, professional, suitable for eBay. Do not invent specs or claims.", "edit");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const optimizeSpecs = async () => {
    setIsOptimizingSpecs(true);
    try {
      await runAiInstruction("Normalize and fill in the item specifics (brand, mpn, type, color, material, compatibility). Use empty strings for unknown values. Do not guess.", "edit");
    } finally {
      setIsOptimizingSpecs(false);
    }
  };

  const saveChanges = async () => {
    try {
      await persistListing(listing, "manual");
    } catch (error) {
      // Error surfaced via setSaveMessage inside persistListing.
      console.error("[eBay editor] Save failed:", error);
    }
  };

  const candidates = listing.imageCandidates || [];
  const specs = listing.specs || {};
  const packageDetails = listing.packageDetails || {};

  const priceRaw = listing.ebayBuyNow?.replace("US $", "").replace("$", "").trim() || "";

  /* Tab state for shipping/returns/payment */
  const [activeTab, setActiveTab] = useState("shipping");

  const specEntries = [
    { label: "Brand", field: "brand" },
    { label: "MPN", field: "mpn" },
    { label: "Type", field: "type" },
    { label: "Color", field: "color" },
    { label: "Material", field: "material" },
    { label: "Compatibility", field: "compatibility" },
    { label: "Bundle Listing", field: "bundle" },
    { label: "Custom", field: "custom" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* ════════════ MAIN CONTENT ════════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-6 py-8">
          {!editorEnabled && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
              Preview Mode — editor controls hidden
            </div>
          )}

          {/* ── Top Section: Gallery + Purchase Panel ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
            {/* LEFT: Gallery */}
            <div>
              <ListingGallery
                candidates={candidates}
                title={listing.title}
                partNumber={partNumber}
                onChange={editorEnabled ? handleImagesChange : null}
                onFirstUpload={editorEnabled ? handleGalleryFirstUpload : null}
              />
            </div>

            {/* RIGHT: Purchase / Info Stack */}
            <div className="flex flex-col gap-5">
              {/* Title */}
              <div>
                {editorEnabled ? (
                  <input
                    type="text"
                    value={listing.title || ""}
                    onChange={(e) => handleUpdate("title", e.target.value)}
                    className="w-full text-xl font-bold text-[#191919] bg-transparent border-b-2 border-dashed border-blue-200 pb-1 focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Listing Title"
                  />
                ) : (
                  <h1 className="text-xl font-bold text-[#191919] leading-tight">{listing.title || "Untitled Listing"}</h1>
                )}
              </div>

              {/* Seller Row */}
              <div className="flex items-center gap-2 text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-[11px] font-bold text-white">R</div>
                <span className="font-medium text-[#3665F3] hover:underline cursor-pointer">roadrunnerparts</span>
                <span className="text-slate-400">|</span>
                <span className="text-xs text-slate-500">100% positive feedback</span>
              </div>

              {/* Price */}
              <div className="border-t border-b border-slate-200 py-4">
                <div className="text-xs text-slate-500 mb-1">Price:</div>
                {editorEnabled ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#191919]">US $</span>
                    <input
                      type="text"
                      value={priceRaw}
                      onChange={(e) => handleUpdate("ebayBuyNow", `US $${e.target.value}`)}
                      className="text-2xl font-bold text-[#191919] bg-transparent border-b-2 border-dashed border-blue-200 w-32 focus:border-blue-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-[#191919]">US ${priceRaw || "—"}</div>
                )}
              </div>

              {/* Condition & Quantity */}
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-slate-500">Condition: </span>
                  {editorEnabled ? (
                    <select
                      value={listing.condition || "Used"}
                      onChange={(e) => handleUpdate("condition", e.target.value)}
                      className="font-medium text-[#191919] bg-transparent border-b border-dashed border-blue-200 focus:outline-none cursor-pointer"
                    >
                      <option value="New">New</option>
                      <option value="New other (see details)">New other</option>
                      <option value="Open box">Open box</option>
                      <option value="Pre-Owned">Pre-Owned</option>
                      <option value="Used">Used</option>
                      <option value="For parts or not working">For parts</option>
                    </select>
                  ) : (
                    <span className="font-medium text-[#191919]">{listing.condition || "Used"}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">Qty: </span>
                  {editorEnabled ? (
                    <input
                      type="number"
                      min="1"
                      value={listing.quantity || 1}
                      onChange={(e) => handleUpdate("quantity", Number(e.target.value) || 1)}
                      className="w-12 font-medium text-[#191919] bg-transparent border-b border-dashed border-blue-200 focus:outline-none text-center"
                    />
                  ) : (
                    <span className="font-medium text-[#191919]">{listing.quantity || 1}</span>
                  )}
                </div>
              </div>

              {/* Buy It Now / Add to Cart */}
              <div className="flex flex-col gap-2.5">
                <button type="button" className="ebay-buy-now-btn">Buy It Now</button>
                <button type="button" className="ebay-add-cart-btn">Add to cart</button>
                <button type="button" className="ebay-watchlist-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  Add to Watchlist
                </button>
              </div>

              {/* Shipping summary */}
              <div className="rounded-lg border border-slate-200 p-4 text-sm">
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  {/ground|free|standard/i.test(listing.shipping || "") ? "FREE Standard Shipping" : /priority|expedited/i.test(listing.shipping || "") ? "Expedited $9.99" : "Next Day $29.99"}
                </div>
                <div className="mt-1 text-xs text-slate-500">Estimated delivery: 3-7 business days</div>
                <div className="mt-2 text-xs text-slate-500">
                  {listing.returns !== false ? "30 day returns · Buyer pays return shipping" : "No returns accepted"}
                </div>
              </div>

              {/* Part number badge */}
              <div className="text-xs text-slate-400">
                Part #: <span className="font-mono font-medium text-slate-600">{partNumber}</span>
              </div>
            </div>
          </div>

          {/* ── Description Section ── */}
          <div className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-lg font-bold text-[#191919] mb-4">Item description from the seller</h2>
            {editorEnabled ? (
              <textarea
                value={listing.description || ""}
                onChange={(e) => handleUpdate("description", e.target.value)}
                className="w-full min-h-[200px] rounded-lg border-2 border-dashed border-blue-200 p-4 text-sm leading-relaxed text-slate-700 focus:border-blue-500 focus:outline-none resize-y bg-blue-50/30"
                placeholder="Enter part description, compatibility notes, and condition details..."
              />
            ) : (
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                {listing.description || "No description provided."}
              </div>
            )}
          </div>

          {/* ── Item Specifics Table ── */}
          <div className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="text-lg font-bold text-[#191919] mb-4">Item specifics</h2>
            <div className="ebay-specifics-table">
              {specEntries.map((spec) => (
                <div key={spec.field} className="ebay-specifics-row">
                  <div className="ebay-specifics-label">{spec.label}</div>
                  <div className="ebay-specifics-value">
                    {editorEnabled ? (
                      <input
                        type="text"
                        value={specs[spec.field] || ""}
                        onChange={(e) => handleSpecUpdate(spec.field, e.target.value)}
                        className="w-full bg-transparent border-b border-dashed border-blue-200 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder={`—`}
                      />
                    ) : (
                      <span className="text-sm">{specs[spec.field] || "—"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Shipping / Returns / Payments Tabs ── */}
          <div className="mt-10 border-t border-slate-200 pt-8 pb-12">
            <div className="ebay-tabs">
              {["shipping", "returns", "payments"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`ebay-tab ${activeTab === tab ? "ebay-tab-active" : ""}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-slate-700">
              {activeTab === "shipping" && (
                <div className="flex flex-col gap-3">
                  {editorEnabled ? (
                    <select
                      className="w-64 rounded-lg border border-slate-200 p-2.5 text-sm bg-white focus:border-blue-500 focus:outline-none"
                      value={listing.shipping || "Ground"}
                      onChange={(e) => handleUpdate("shipping", e.target.value)}
                    >
                      <option value="Ground">Standard Ground (Free)</option>
                      <option value="Priority">Expedited Priority ($9.99)</option>
                      <option value="Overnight">Next Day Air ($29.99)</option>
                    </select>
                  ) : (
                    <div>{listing.shipping === "Ground" ? "FREE Standard Ground Shipping" : listing.shipping === "Priority" ? "Expedited Priority — $9.99" : "Next Day Air — $29.99"}</div>
                  )}
                  <div className="text-xs text-slate-500">Ships from: United States</div>
                  {/* Package dimensions */}
                  {editorEnabled && (
                    <div className="mt-2 grid grid-cols-5 gap-3">
                      {[
                        { label: "Weight lb", field: "weightLb", step: "1" },
                        { label: "Weight oz", field: "weightOz", step: "1" },
                        { label: "Length″", field: "lengthIn", step: "0.1" },
                        { label: "Width″", field: "widthIn", step: "0.1" },
                        { label: "Height″", field: "heightIn", step: "0.1" },
                      ].map((item) => (
                        <label key={item.field} className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400">{item.label}</span>
                          <input
                            type="number" min="0" step={item.step}
                            value={packageDetails[item.field] || ""}
                            onChange={(e) => handlePackageUpdate(item.field, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm font-medium outline-none focus:border-blue-500"
                            placeholder="0"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "returns" && (
                <div className="flex flex-col gap-2">
                  {editorEnabled ? (
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={listing.returns !== false}
                        onChange={(e) => handleUpdate("returns", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span className="text-sm font-medium">Accept 30-day returns</span>
                    </label>
                  ) : (
                    <div>{listing.returns !== false ? "30 day returns. Buyer pays for return shipping." : "No returns accepted."}</div>
                  )}
                </div>
              )}
              {activeTab === "payments" && (
                <div>PayPal, Visa, Mastercard, American Express, Discover</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ EDITOR SIDEBAR ════════════ */}
      {editorEnabled && (
        <div className="w-[340px] shrink-0 border-l border-slate-200 bg-slate-50 flex flex-col shadow-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-200 bg-white">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Listing Controls
            </h2>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Editor</span>
              <button
                type="button"
                onClick={() => setEditorEnabled((v) => !v)}
                aria-pressed={editorEnabled}
                className={`relative h-6 w-11 rounded-full transition-colors ${editorEnabled ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${editorEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className={`text-[10px] font-extrabold ${editorEnabled ? "text-blue-700" : "text-slate-500"}`}>{editorEnabled ? "ON" : "OFF"}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
            {/* Status */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select
                className="w-full rounded-lg border border-slate-200 p-2.5 text-sm bg-white"
                value={listing.status || "draft"}
                onChange={(e) => handleUpdate("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* AI Engine */}
            <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-blue-100 bg-blue-50/50">
              <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">AI Engine</label>
              <select
                className="w-full rounded-lg border border-blue-200 p-2 text-xs bg-white outline-none"
                value={showCustomModel ? "custom" : selectedModel}
                onChange={(e) => {
                  if (e.target.value === "custom") { setShowCustomModel(true); }
                  else { setShowCustomModel(false); setSelectedModel(normalizeEditorModel(e.target.value)); }
                }}
              >
                <optgroup label="Stable">
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                </optgroup>
                <optgroup label="Preview">
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                  <option value="gemini-3.1-flash-image-preview">Gemini Image Preview</option>
                </optgroup>
                <option value="custom">Custom Model ID...</option>
              </select>
              {showCustomModel && (
                <input type="text" placeholder="gemini-*" value={customModel} onChange={(e) => setCustomModel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-blue-200 p-2 text-xs bg-white outline-none font-mono" />
              )}
              {requestedModel !== (showCustomModel ? customModel.trim() : selectedModel) && (
                <div className="text-[10px] font-semibold text-blue-700">Resolved: {requestedModel}</div>
              )}
              {imageWorkflowSelected && (
                <div className="text-[10px] font-semibold text-amber-700">Text AI uses {TEXT_FALLBACK_MODEL}</div>
              )}
            </div>

            {/* AI Command */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Command</label>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-blue-600 truncate max-w-[80px]">{effectiveModel.replace("gemini-","")}</span>
                </div>
              </div>
              <textarea
                value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isRunningAi) { e.preventDefault(); runAiInstruction(aiInstruction); } }}
                placeholder="e.g. 'Rewrite title under 80 chars' · 'Set price to $45'"
                className="w-full rounded-xl border border-blue-200 bg-white p-3 text-xs leading-relaxed resize-none outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                rows={3} disabled={isRunningAi}
              />
              <div className="flex gap-2">
                <button onClick={() => runAiInstruction(aiInstruction)} disabled={isRunningAi || !aiInstruction.trim()}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold text-white transition-all ${isRunningAi || !aiInstruction.trim() ? "bg-slate-300 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 active:scale-95"}`}
                >{isRunningAi && !isRunningAiPreset ? "Running..." : "Apply (Ctrl+Enter)"}</button>
                <button onClick={undoLastAi} disabled={undoStack.length === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >Undo</button>
              </div>
            </div>

            {/* AI Chat / Feedback */}
            <div className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Chat</div>
                  <div className="text-[10px] font-semibold text-slate-400">Commands, errors, and applied changes</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${isRunningAi ? "bg-blue-50 text-blue-700" : aiError ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>
                  {isRunningAi ? "Running" : aiError ? "Needs review" : "Ready"}
                </span>
              </div>

              <div className="flex max-h-64 flex-1 flex-col gap-2 overflow-y-auto bg-slate-50/60 p-3">
                {!aiHistory.length && !aiError && !isRunningAi && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500">
                    Send an AI command above. The response, changed fields, warnings, and failures will appear here.
                  </div>
                )}
                {isRunningAi && (
                  <div className="max-w-[88%] rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm">
                    Running your request with {effectiveModel}...
                  </div>
                )}
                {aiError && (
                  <div className="max-w-[92%] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-red-700">
                    <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide">Error</div>
                    {aiError}
                  </div>
                )}
                {aiHistory.slice(0, 6).map((entry, i) => (
                  <div key={`${entry.ts}-${i}`} className="flex flex-col gap-1.5">
                    <div className="ml-auto max-w-[88%] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold leading-relaxed text-white">
                      {entry.instruction}
                    </div>
                    <div className="max-w-[92%] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-700 shadow-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className={`font-extrabold ${entry.mode === "chat" ? "text-blue-700" : "text-emerald-700"}`}>
                          {entry.mode === "chat" ? "AI response" : "Applied edit"}
                        </span>
                        <span className="shrink-0 text-[9px] font-semibold text-slate-400">{new Date(entry.ts).toLocaleTimeString()}</span>
                      </div>
                      {entry.mode === "chat" ? (
                        <div>{entry.message || "No answer returned."}</div>
                      ) : entry.rationale ? (
                        <div>{entry.rationale}</div>
                      ) : (
                        <div>AI returned a structured edit and the listing fields were updated.</div>
                      )}
                      {entry.warnings?.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">
                          {entry.warnings.join("; ")}
                        </div>
                      )}
                      <div className="mt-1 text-[9px] font-semibold text-slate-400">{entry.model}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 bg-white p-2">
                {[
                  { label: "Description", key: "description", action: generateDescription, loading: isGeneratingDescription },
                  { label: "Specifics", key: "specs", action: optimizeSpecs, loading: isOptimizingSpecs },
                  { label: "SEO Title", key: "seo_title", action: () => { setIsRunningAiPreset("seo_title"); runAiInstruction("Rewrite the title for maximum eBay SEO. Keep under 80 chars. Include part number, brand, and type.", "edit").finally(() => setIsRunningAiPreset(null)); }, loading: isRunningAiPreset === "seo_title" },
                  { label: "Seller Notes", key: "seller_notes", action: () => { setIsRunningAiPreset("seller_notes"); runAiInstruction("Write concise seller notes about condition and what's included. Be honest, no invented claims.", "edit").finally(() => setIsRunningAiPreset(null)); }, loading: isRunningAiPreset === "seller_notes" },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={p.action}
                    disabled={p.loading || isRunningAi}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.loading ? "Running..." : p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Capture Panel */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Appliance Photos</label>
              <AppliancePhotoCapture
                compact={true}
                externalProductPreview={galleryProductPreview}
                onProductFile={handleProductFromCapture}
                onNameplateFile={handleNameplateFile}
                onFeatureCues={(cues) => {
                  if (!cues) return;
                  setCaptureFeatureCues(cues);
                }}
              />

              {/* ── Identity / Confidence Interview Card ── */}
              {(identityLoading || interviewLoading || identityResult || interviewState || captureFeatureCues) && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Identity Interview</span>
                    <div className="flex items-center gap-2">
                      {(identityLoading || interviewLoading) && (
                        <span className="text-[10px] font-bold text-indigo-600 animate-pulse">Analyzing...</span>
                      )}
                      {interviewState && (
                        <span className={`text-[9px] font-extrabold uppercase rounded-full px-2 py-0.5 ${
                          interviewState.confidence >= 0.92
                            ? "bg-emerald-100 text-emerald-700"
                            : interviewState.confidence >= 0.6
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {Math.round(interviewState.confidence * 100)}% conf
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Confidence bar */}
                  {interviewState && (
                    <div className="px-3 pt-2.5 pb-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                          {interviewState.entityType === "machine" ? "Whole Machine" : interviewState.entityType === "part" ? "Part" : "Identifying..."}
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">
                          Target: 92%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            interviewState.confidence >= 0.92 ? "bg-emerald-500" :
                            interviewState.confidence >= 0.6  ? "bg-amber-400" : "bg-red-400"
                          }`}
                          style={{ width: `${Math.round(interviewState.confidence * 100)}%` }}
                        />
                      </div>
                      {/* Target marker */}
                      <div className="relative" style={{ marginTop: -8 }}>
                        <div className="absolute" style={{ left: "92%", width: 2, height: 8, background: "#334155", borderRadius: 1 }} />
                      </div>
                    </div>
                  )}

                  <div className="px-3 py-2 flex flex-col gap-2">

                    {/* AI summary */}
                    {interviewState?.summary && (
                      <p className="text-[11px] text-slate-600 leading-relaxed">{interviewState.summary}</p>
                    )}

                    {/* Resolved fields */}
                    {interviewState?.resolved && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 flex flex-col gap-1.5">
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-700 mb-0.5">Confirmed Identity</div>
                        {interviewState.fields?.make && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Make</span>
                            <span className="font-bold text-slate-800">{interviewState.fields.make}</span>
                          </div>
                        )}
                        {interviewState.fields?.model && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Model</span>
                            <span className="font-bold text-slate-800 font-mono">{interviewState.fields.model}</span>
                          </div>
                        )}
                        {interviewState.fields?.serialNumber && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Serial</span>
                            <span className="font-bold text-slate-800 font-mono">{interviewState.fields.serialNumber}</span>
                          </div>
                        )}
                        {(interviewState.fields?.manufactureYear || interviewState.fields?.ageRange) && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Year/Age</span>
                            <span className="font-bold text-slate-800">{interviewState.fields.manufactureYear || interviewState.fields.ageRange}</span>
                          </div>
                        )}
                        {interviewState.fields?.partNumber && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Part #</span>
                            <span className="font-bold text-slate-800 font-mono">{interviewState.fields.partNumber}</span>
                          </div>
                        )}
                        {interviewState.fields?.partTitle && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Title</span>
                            <span className="font-bold text-slate-800">{interviewState.fields.partTitle}</span>
                          </div>
                        )}
                        {interviewState.fields?.brands?.length > 0 && (
                          <div className="flex items-start justify-between text-[11px] gap-2">
                            <span className="text-emerald-600 font-semibold shrink-0">Brands</span>
                            <span className="font-bold text-slate-800 text-right">{interviewState.fields.brands.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Q&A history */}
                    {interviewHistory.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
                        {interviewHistory.map((h, i) => (
                          <div key={i} className="flex flex-col gap-0.5">
                            <div className="text-[10px] font-bold text-indigo-600 leading-snug">{h.question}</div>
                            <div className="text-[11px] text-slate-700 pl-2 border-l-2 border-indigo-100">{h.answer}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next question + answer input */}
                    {!interviewState?.resolved && interviewState?.nextQuestion && (
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
                        <div className="text-[10px] font-bold text-indigo-700 leading-snug">
                          {interviewState.nextQuestion}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            ref={interviewAnswerRef}
                            type="text"
                            value={interviewAnswer}
                            onChange={(e) => setInterviewAnswer(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && interviewAnswer.trim() && !interviewLoading) {
                                e.preventDefault();
                                runInterview(interviewAnswer.trim());
                              }
                            }}
                            placeholder="Your answer..."
                            disabled={interviewLoading}
                            className="flex-1 min-w-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => interviewAnswer.trim() && runInterview(interviewAnswer.trim())}
                            disabled={!interviewAnswer.trim() || interviewLoading}
                            className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {interviewLoading ? "..." : "Send"}
                          </button>
                        </div>
                        <span className="text-[9px] text-slate-400">Press Enter or Send to continue</span>
                      </div>
                    )}

                    {/* Re-run button */}
                    {!interviewLoading && (identityResult || captureFeatureCues) && (
                      <button
                        type="button"
                        onClick={() => runInterview()}
                        className="mt-1 text-[9px] font-bold text-slate-400 hover:text-indigo-600 transition-colors text-left"
                      >
                        ↺ Re-analyze
                      </button>
                    )}

                    {/* Error */}
                    {interviewError && (
                      <p className="text-[10px] font-semibold text-red-600">{interviewError}</p>
                    )}

                    {/* Feature cue pills */}
                    {captureFeatureCues && (() => {
                      const active = [
                        captureFeatureCues.thinQEnabled && { label: "ThinQ", floor: "≥2018" },
                        captureFeatureCues.wifiConnected && { label: "WiFi", floor: "≥2017" },
                        captureFeatureCues.touchscreenDispenser && { label: "Touchscreen", floor: "≥2015" },
                        captureFeatureCues.ledInteriorLighting && { label: "LED Interior", floor: "≥2013" },
                        captureFeatureCues.invertLinearCompressor && { label: "Linear Comp.", floor: "≥2012" },
                        captureFeatureCues.steamCycle && { label: "Steam", floor: "≥2010" },
                        captureFeatureCues.digitalDisplay && { label: "Digital Display", floor: "≥2010" },
                      ].filter(Boolean);
                      return active.length > 0 ? (
                        <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-1.5">
                          {active.map((c) => (
                            <span key={c.label} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-700">
                              {c.label} <span className="text-emerald-400">{c.floor}</span>
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
            </div>
            {/* Quality Score */}
            <div className="p-4 rounded-xl bg-[#162033] text-white flex flex-col gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Quality Score</div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold">{qualityScore}%</span>
                {qualityScore > 80 && <span className="text-[10px] text-emerald-400 font-bold pb-1">Excellent</span>}
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${qualityScore < 50 ? 'bg-red-500' : qualityScore < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${qualityScore}%` }} />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="p-5 border-t border-slate-200 bg-white">
            <button onClick={saveChanges} disabled={isSaving}
              className={`w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${isSaving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/25"}`}
            >{isSaving ? "Saving..." : "Save Changes"}</button>
            {lastSaved && <div className="mt-2 text-center text-[10px] text-slate-400">Saved {lastSaved.toLocaleTimeString()}</div>}
            {saveMessage && <div className={`mt-1 text-center text-[10px] font-bold ${saveMessage.startsWith("Save failed") ? "text-red-600" : "text-emerald-700"}`}>{saveMessage}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
