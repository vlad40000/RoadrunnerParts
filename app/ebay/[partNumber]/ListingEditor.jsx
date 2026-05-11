"use client";

import React, { useState, useEffect } from "react";
import ListingGallery from "./ListingGallery";

export default function ListingEditor({ initialListing, partNumber }) {
  const [listing, setListing] = useState({
    ...initialListing,
    condition: initialListing.condition || "Used",
    quantity: initialListing.quantity || 1,
    shipping: initialListing.shipping || "Ground",
    returns: initialListing.returns !== undefined ? initialListing.returns : true,
    status: initialListing.status || "draft"
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isOptimizingSpecs, setIsOptimizingSpecs] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-flash-lite-preview");
  const [customModel, setCustomModel] = useState("");
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

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
  const effectiveModel = showCustomModel ? customModel : selectedModel;

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem("rrp:office-editor:gemini-session") || "{}");
      if (session?.model && /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(session.model)) {
        const presetModels = [
          "gemini-3.1-flash-lite-preview",
          "gemini-3-flash-preview",
          "gemini-3-pro-preview",
          "gemini-2.5-pro",
          "gemini-2.5-flash-preview-09-2025",
          "gemini-2.5-flash-image",
        ];
        setSelectedModel(session.model);
        setCustomModel(session.model);
        setShowCustomModel(!presetModels.includes(session.model));
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

  const handleImagesChange = (imageCandidates) => {
    setListing((prev) => ({
      ...prev,
      imageCandidates,
    }));
  };

  const generateDescription = async () => {
    setIsGeneratingDescription(true);
    try {
      const response = await fetch("/api/ebay/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "description",
          partNumber,
          currentData: listing,
          modelName: effectiveModel
        }),
      });

      if (response.ok) {
        const data = await response.json();
        handleUpdate("description", data.result);
      }
    } catch (error) {
      console.error("Error generating description:", error);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const optimizeSpecs = async () => {
    setIsOptimizingSpecs(true);
    try {
      const response = await fetch("/api/ebay/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "specs",
          partNumber,
          currentData: listing,
          modelName: effectiveModel
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setListing((prev) => ({
          ...prev,
          specs: {
            ...(prev.specs || {}),
            ...data.result,
          },
        }));
      }
    } catch (error) {
      console.error("Error optimizing specs:", error);
    } finally {
      setIsOptimizingSpecs(false);
    }
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/ebay/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber,
          updates: {
            title: listing.title,
            ebayBuyNow: listing.ebayBuyNow,
            description: listing.description,
            specs: listing.specs,
            condition: listing.condition,
            quantity: listing.quantity,
            shipping: listing.shipping,
            returns: listing.returns,
            status: listing.status,
            imageCandidates: listing.imageCandidates || []
          },
        }),
      });

      if (response.ok) {
        setLastSaved(new Date());
      } else {
        console.error("Failed to save changes");
      }
    } catch (error) {
      console.error("Error saving changes:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const candidates = listing.imageCandidates || [];
  const specs = listing.specs || {};

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F5]">
      {/* Main Canvas / Preview */}
      <div className="flex-1 overflow-y-auto p-12">
        <div className="mx-auto max-w-4xl rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
          {/* Header Area */}
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
                onChange={handleImagesChange}
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
          </div>
        </div>
      </div>

      {/* Right Sidebar: Properties / Controls */}
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
                    setSelectedModel(e.target.value);
                  }
                }}
              >
                <optgroup label="Stable">
                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite Preview</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                </optgroup>
                <optgroup label="Experimental">
                  <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.5-flash-preview-09-2025">Gemini 2.5 Flash Preview 09-2025</option>
                  <option value="gemini-2.5-flash-image">Nano Banana / Gemini 2.5 Flash Image</option>
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
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">AI Actions</label>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-blue-600 truncate max-w-[100px]">
                    {effectiveModel.replace("gemini-", "")}
                  </span>
                </div>
              </div>
              <button 
                onClick={generateDescription}
                disabled={isGeneratingDescription}
                className="w-full text-left p-3 rounded-xl border border-slate-100 hover:bg-slate-50 text-xs font-medium transition-all disabled:opacity-50 flex justify-between items-center bg-white group"
              >
                <span className="group-hover:text-blue-600">Generate Description</span>
                {isGeneratingDescription ? <span className="text-blue-500">...</span> : <span>AI</span>}
              </button>
              <button 
                onClick={optimizeSpecs}
                disabled={isOptimizingSpecs}
                className="w-full text-left p-3 rounded-xl border border-slate-100 hover:bg-slate-50 text-xs font-medium transition-all disabled:opacity-50 flex justify-between items-center bg-white group"
              >
                <span className="group-hover:text-blue-600">Optimize Specifics</span>
                {isOptimizingSpecs ? <span className="text-blue-500">...</span> : <span>AI</span>}
              </button>
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
        </div>
      </div>
    </div>
  );
}
