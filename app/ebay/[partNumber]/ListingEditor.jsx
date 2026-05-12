"use client";

import React, { useState, useEffect } from "react";
import ListingGallery from "./ListingGallery";

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
        throw new Error(data.error || data.details || "Save failed");
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
        reason === "images"
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

  const runAiInstruction = async (instruction) => {
    if (!instruction?.trim()) return;
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
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.detail || "AI edit failed");
      }
      applyAiEdit(data.edit || {});
      setAiHistory((prev) => [{
        instruction: instruction.trim(),
        edit: data.edit,
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
      await runAiInstruction("Rewrite the listing description. Keep it concise, professional, suitable for eBay. Do not invent specs or claims.");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const optimizeSpecs = async () => {
    setIsOptimizingSpecs(true);
    try {
      await runAiInstruction("Normalize and fill in the item specifics (brand, mpn, type, color, material, compatibility). Use empty strings for unknown values. Do not guess.");
    } finally {
      setIsOptimizingSpecs(false);
    }
  };

  const saveChanges = async () => {
    persistListing(listing, "manual").catch(() => {});
  };

  const candidates = listing.imageCandidates || [];
  const specs = listing.specs || {};
  const packageDetails = listing.packageDetails || {};
  const inputModeClass = editorEnabled
    ? ""
    : "[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none [&_input]:select-none [&_textarea]:select-none [&_select]:select-none opacity-95";

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F5]">
      <div className="fixed right-5 top-5 z-50 flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
          Editor
        </span>
        <button
          type="button"
          onClick={() => setEditorEnabled((enabled) => !enabled)}
          aria-pressed={editorEnabled}
          className={`relative h-7 w-14 rounded-full transition-colors ${
            editorEnabled ? "bg-blue-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              editorEnabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
          <span className="sr-only">{editorEnabled ? "Turn editor off" : "Turn editor on"}</span>
        </button>
        <span className={`text-xs font-extrabold ${editorEnabled ? "text-blue-700" : "text-slate-500"}`}>
          {editorEnabled ? "ON" : "OFF"}
        </span>
      </div>
      {/* Main Canvas / Preview */}
      <div className="flex-1 overflow-y-auto p-12">
        <div className="mx-auto max-w-4xl rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
          {!editorEnabled && (
            <div className="border-b border-emerald-200 bg-emerald-50 px-8 py-3 text-xs font-bold uppercase tracking-wide text-emerald-800">
              Preview mode - editor controls are off
            </div>
          )}
          {/* Header Area */}
          <div className={inputModeClass}>
          <div className="p-8 border-b border-slate-100 bg-white">
             <input
              type="text"
              value={listing.title || ""}
              onChange={(e) => handleUpdate("title", e.target.value)}
              className="w-full text-3xl font-bold leading-tight text-slate-900 bg-transparent border-none focus:ring-0 focus:outline-none placeholder:text-slate-300"
              placeholder="Listing Title"
            />
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
               <span className="font-medium text-slate-800">Part: {partNumber}</span>
               <span className="text-slate-300">&bull;</span>
               <span>RoadrunnerParts Official Listing</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
            {/* Left: Gallery */}
            <div>
              <ListingGallery 
                candidates={candidates} 
                title={listing.title} 
                partNumber={partNumber} 
                onChange={editorEnabled ? handleImagesChange : null}
              />
            </div>

            {/* Right: Summary Info */}
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Price</label>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-slate-900">$</span>
                    <input
                      type="text"
                      value={listing.ebayBuyNow?.replace("US $", "").replace("$", "") || ""}
                      onChange={(e) => handleUpdate("ebayBuyNow", `US $${e.target.value}`)}
                      className="w-full text-xl font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quantity</label>
                  <input
                    type="number"
                    value={listing.quantity || 1}
                    onChange={(e) => handleUpdate("quantity", Number(e.target.value) || 1)}
                    className="w-full text-xl font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Condition</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  value={listing.condition || "Used"}
                  onChange={(e) => handleUpdate("condition", e.target.value)}
                >
                  <option value="New">New</option>
                  <option value="New other (see details)">New other (see details)</option>
                  <option value="Open box">Open box</option>
                  <option value="Used">Used</option>
                  <option value="For parts or not working">For parts or not working</option>
                </select>
              </div>

              <div className="flex flex-col gap-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Description</label>
                <textarea
                  value={listing.description || ""}
                  onChange={(e) => handleUpdate("description", e.target.value)}
                  className="w-full h-64 rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  placeholder="Enter part description, compatibility notes, and condition details..."
                />
              </div>
            </div>
          </div>

          {/* Item Specifics Grid */}
          <div className="p-8 border-t border-slate-100 bg-slate-50/30">
            <h3 className="text-sm font-bold text-slate-900 mb-6">Item Specifics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-12">
               {[
                 { label: "Brand", field: "brand" },
                 { label: "MPN", field: "mpn" },
                 { label: "Type", field: "type" },
                 { label: "Color", field: "color" },
                 { label: "Material", field: "material" },
                 { label: "Compatibility", field: "compatibility" },
                 { label: "Bundle", field: "bundle" },
                 { label: "Custom", field: "custom" },
               ].map((spec) => (
                 <div key={spec.field} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-slate-400">{spec.label}</span>
                    <input
                      type="text"
                      value={specs[spec.field] || ""}
                      onChange={(e) => handleSpecUpdate(spec.field, e.target.value)}
                      className="text-[13px] font-bold text-slate-800 bg-transparent border-none p-0 focus:ring-0 focus:outline-none placeholder:font-normal placeholder:text-slate-300"
                      placeholder={`Set ${spec.label.toLowerCase()}...`}
                    />
                 </div>
               ))}
            </div>
          </div>

          {/* Shipping & Returns */}
          <div className="p-8 border-t border-slate-100 bg-white">
            <h3 className="text-sm font-bold text-slate-900 mb-6">Shipping & Returns</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shipping Service</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                  value={listing.shipping || "Ground"}
                  onChange={(e) => handleUpdate("shipping", e.target.value)}
                >
                  <option value="Ground">Standard Ground (Free)</option>
                  <option value="Priority">Expedited Priority ($9.99)</option>
                  <option value="Overnight">Next Day Air ($29.99)</option>
                </select>
              </div>
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Return Policy</label>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <input 
                    type="checkbox" 
                    id="returns"
                    checked={listing.returns !== false}
                    onChange={(e) => handleUpdate("returns", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="returns" className="text-sm font-medium text-slate-700">Allow 30-day returns</label>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                { label: "Weight lb", field: "weightLb", step: "1" },
                { label: "Weight oz", field: "weightOz", step: "1" },
                { label: "Length in", field: "lengthIn", step: "0.1" },
                { label: "Width in", field: "widthIn", step: "0.1" },
                { label: "Height in", field: "heightIn", step: "0.1" },
              ].map((item) => (
                <label key={item.field} className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={item.step}
                    value={packageDetails[item.field] || ""}
                    onChange={(event) => handlePackageUpdate(item.field, event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Properties / Controls */}
      {editorEnabled && (
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-xl">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Listing Properties
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
           {/* Listing Status */}
           <div className="flex flex-col gap-3">
             <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Status</label>
             <select 
               className="w-full rounded-lg border border-slate-200 p-2.5 text-sm bg-slate-50 focus:bg-white transition-colors"
               value={listing.status || "draft"}
               onChange={(e) => handleUpdate("status", e.target.value)}
             >
               <option value="draft">Draft</option>
               <option value="ready">Ready for Export</option>
               <option value="published">Published</option>
               <option value="archived">Archived</option>
             </select>
           </div>

           {/* AI Configuration */}
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50/50">
              <label className="text-xs font-bold text-blue-600 uppercase tracking-tight">AI Engine</label>
              <select 
                className="w-full rounded-lg border border-blue-200 p-2 text-xs bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                value={showCustomModel ? "custom" : selectedModel}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setShowCustomModel(true);
                  } else {
                    setShowCustomModel(false);
                    setSelectedModel(normalizeEditorModel(e.target.value));
                  }
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
                  <option value="gemini-3.1-flash-image-preview">Gemini Image Preview (text AI disabled)</option>
                </optgroup>
                <option value="custom">Custom Model ID...</option>
              </select>

              {showCustomModel && (
                <input
                  type="text"
                  placeholder="gemini-*"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-blue-200 p-2 text-xs bg-white focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                />
              )}
              {requestedModel !== (showCustomModel ? customModel.trim() : selectedModel) && (
                <div className="text-[10px] font-semibold text-blue-700">
                  Resolved model: {requestedModel}
                </div>
              )}
              {imageWorkflowSelected && (
                <div className="text-[10px] font-semibold text-amber-700">
                  Image model selected. Text AI actions will use {TEXT_FALLBACK_MODEL} until the image workflow is wired.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">AI Command</label>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-blue-600 truncate max-w-[100px]">
                    {effectiveModel.replace("gemini-", "")}
                  </span>
                </div>
              </div>

              {/* Free-form AI instruction */}
              <div className="relative">
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isRunningAi) {
                      e.preventDefault();
                      runAiInstruction(aiInstruction);
                    }
                  }}
                  placeholder="e.g. 'Rewrite the title under 80 chars with the part number and brand'  ·  'Set price to $45'  ·  'Add Hotpoint and GE compatibility to specifics'  ·  'Write honest seller notes about condition'"
                  className="w-full rounded-xl border border-blue-200 bg-white p-3 text-xs leading-relaxed text-slate-700 resize-none outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400"
                  rows={3}
                  disabled={isRunningAi}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => runAiInstruction(aiInstruction)}
                    disabled={isRunningAi || !aiInstruction.trim()}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold text-white transition-all ${
                      isRunningAi || !aiInstruction.trim()
                        ? "bg-slate-300 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 active:scale-95"
                    }`}
                  >
                    {isRunningAi && !isRunningAiPreset ? "Running..." : "Apply AI Instruction  (Ctrl+Enter)"}
                  </button>
                  <button
                    onClick={undoLastAi}
                    disabled={undoStack.length === 0}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={undoStack.length === 0 ? "No AI edits to undo yet" : "Undo last AI edit"}
                  >
                    Undo
                  </button>
                </div>
              </div>

              {aiError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 font-medium">
                  {aiError}
                </div>
              )}

              {/* Quick presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Actions</span>
                {[
                  { label: "Rewrite Description", key: "description", action: generateDescription, loading: isGeneratingDescription },
                  { label: "Optimize Specifics", key: "specs", action: optimizeSpecs, loading: isOptimizingSpecs },
                  { label: "SEO Title", key: "seo_title", action: () => {
                    setIsRunningAiPreset("seo_title");
                    runAiInstruction("Rewrite the title for maximum eBay SEO. Keep under 80 chars. Include part number, brand, and type.").finally(() => setIsRunningAiPreset(null));
                  }, loading: isRunningAiPreset === "seo_title" },
                  { label: "Add Seller Notes", key: "seller_notes", action: () => {
                    setIsRunningAiPreset("seller_notes");
                    runAiInstruction("Write concise seller notes about condition and what's included. Be honest, no invented claims.").finally(() => setIsRunningAiPreset(null));
                  }, loading: isRunningAiPreset === "seller_notes" },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    onClick={preset.action}
                    disabled={preset.loading || isRunningAi}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-[11px] font-medium transition-all disabled:opacity-50 flex justify-between items-center bg-white group"
                  >
                    <span className="group-hover:text-blue-600">{preset.label}</span>
                    {preset.loading
                      ? <span className="text-blue-500 text-[10px] animate-pulse">Running...</span>
                      : <span className="text-slate-400 text-[10px]">AI</span>}
                  </button>
                ))}
              </div>

              {/* AI History */}
              {aiHistory.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent AI Edits</span>
                  <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5">
                    {aiHistory.slice(0, 8).map((entry, i) => (
                      <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="text-[11px] font-medium text-slate-700 line-clamp-2">{entry.instruction}</div>
                        {entry.rationale && (
                          <div className="mt-1 text-[10px] text-slate-500 italic line-clamp-2">{entry.rationale}</div>
                        )}
                        {entry.warnings?.length > 0 && (
                          <div className="mt-1 text-[10px] text-amber-600 font-medium">{entry.warnings.join("; ")}</div>
                        )}
                        <div className="mt-1 text-[9px] text-slate-400">{entry.model} &bull; {new Date(entry.ts).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

           {/* Audit Stats */}
           <div className="p-4 rounded-xl bg-[#162033] text-white flex flex-col gap-3 shadow-lg">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Listing Quality Score</div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold">{qualityScore}%</span>
                {qualityScore > 80 && (
                  <span className="text-[10px] text-emerald-400 font-bold pb-1">Excellent</span>
                )}
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] ${
                    qualityScore < 50 ? 'bg-red-500' : qualityScore < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} 
                  style={{ width: `${qualityScore}%` }} 
                />
              </div>
           </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={saveChanges}
            disabled={isSaving}
            className={`w-full rounded-xl py-4 text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
              isSaving ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/25"
            }`}
          >
            {isSaving ? "Saving..." : "Apply & Save Changes"}
          </button>
          {lastSaved && (
            <div className="mt-3 text-center text-[10px] text-slate-400 font-medium">
              Saved at {lastSaved.toLocaleTimeString()}
            </div>
          )}
          {saveMessage && (
            <div className={`mt-2 text-center text-[10px] font-bold ${
              saveMessage.startsWith("Save failed") ? "text-red-600" : "text-emerald-700"
            }`}>
              {saveMessage}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
