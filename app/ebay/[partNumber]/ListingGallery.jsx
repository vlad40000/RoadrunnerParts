"use client";

import { useEffect, useRef, useState } from "react";

function cleanImageCandidate(candidate) {
  return {
    title: String(candidate.title || "").trim(),
    imageUrl: String(candidate.imageUrl || candidate.thumbnailUrl || "").trim(),
    thumbnailUrl: String(candidate.thumbnailUrl || candidate.imageUrl || "").trim(),
    pageUrl: String(candidate.pageUrl || "").trim(),
    sourceDomain: String(candidate.sourceDomain || "operator-upload").trim(),
    source: String(candidate.source || "detail_editor").trim(),
    reviewStatus: String(candidate.reviewStatus || "operator_added_needs_review").trim(),
    score: Number(candidate.score || 0),
    blobPathname: String(candidate.blobPathname || "").trim(),
    remoteImageUrl: String(candidate.remoteImageUrl || "").trim(),
    localImagePath: String(candidate.localImagePath || "").trim(),
    vaultPath: String(candidate.vaultPath || "").trim(),
    vaultRelativePath: String(candidate.vaultRelativePath || "").trim(),
    vaultNotePath: String(candidate.vaultNotePath || "").trim(),
    vaultNoteRelativePath: String(candidate.vaultNoteRelativePath || "").trim(),
  };
}

function imageCandidateKey(candidate) {
  return String(
    candidate?.blobPathname ||
      candidate?.imageUrl ||
      candidate?.thumbnailUrl ||
      candidate?.remoteImageUrl ||
      candidate?.localImagePath ||
      candidate?.vaultRelativePath ||
      "",
  )
    .trim()
    .toLowerCase();
}

function uniqueImageCandidates(nextCandidates) {
  const next = [];
  const seen = new Set();
  for (const rawCandidate of nextCandidates || []) {
    const candidate = cleanImageCandidate(rawCandidate);
    const key = imageCandidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(candidate);
  }
  return next.slice(0, 24);
}

export default function ListingGallery({ candidates, title, partNumber, onChange, onFirstUpload }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileInputRef = useRef(null);
  const activeImage = candidates[activeIndex] || null;
  const canEdit = typeof onChange === "function";

  useEffect(() => {
    if (!candidates.length) {
      setActiveIndex(0);
    } else if (activeIndex > candidates.length - 1) {
      setActiveIndex(candidates.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length]);

  function updateCandidates(nextCandidates, nextIndex = activeIndex) {
    const cleanCandidates = uniqueImageCandidates(nextCandidates);
    onChange?.(cleanCandidates);
    setActiveIndex(Math.max(0, Math.min(nextIndex, cleanCandidates.length - 1)));
  }

  function addImage() {
    const imageUrl = newImageUrl.trim();
    if (!imageUrl) return;
    const urls = imageUrl
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    updateCandidates(
      [
        ...uniqueImageCandidates(candidates),
        ...urls.map((url) =>
          cleanImageCandidate({
            imageUrl: url,
            thumbnailUrl: url,
            pageUrl: url,
            sourceDomain: "operator-added",
            reviewStatus: "operator_added_needs_review",
            score: 100,
          }),
        ),
      ],
      candidates.length + urls.length - 1,
    );
    setNewImageUrl("");
  }

  async function uploadFiles(files) {
    const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
    if (!imageFiles.length) return;

    setIsUploading(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("partNumber", partNumber);
      imageFiles.forEach((file) => formData.append("images", file));

      const response = await fetch("/api/ebay/image-upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.details || "Image upload failed");
      }

      const uploaded = Array.isArray(data.uploaded) ? data.uploaded.map(cleanImageCandidate) : [];
      if (uploaded.length) {
        const existing = uniqueImageCandidates(candidates);
        updateCandidates([...existing, ...uploaded], existing.length);
        // Notify parent so it can push the first image into AppliancePhotoCapture
        if (typeof onFirstUpload === "function" && uploaded[0]?.imageUrl) {
          onFirstUpload(uploaded[0].imageUrl);
        }
      }

      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      const dbText = data.dbPersist?.persisted
        ? ` Synced ${Number(data.dbPersist.upserted || 0)} record${Number(data.dbPersist.upserted || 0) === 1 ? "" : "s"} to DB.`
        : data.dbPersist?.warning
          ? ` DB sync warning: ${data.dbPersist.warning}`
          : "";
      setUploadMessage(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded${skipped ? `, ${skipped} skipped` : ""}.${dbText}`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUploading(false);
    }
  }

  function handleDragOver(event) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  }

  function handleDragLeave(event) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    uploadFiles(event.dataTransfer?.files);
  }

  function removeActiveImage() {
    if (!activeImage) return;
    updateCandidates(
      uniqueImageCandidates(candidates).filter((_, index) => index !== activeIndex),
      activeIndex - 1,
    );
  }

  function setActiveAsLead() {
    if (!activeImage || activeIndex === 0) return;
    const cleanCandidates = uniqueImageCandidates(candidates);
    const selected = cleanCandidates[activeIndex];
    if (!selected) return;
    updateCandidates(
      [selected, ...cleanCandidates.filter((_, index) => index !== activeIndex)],
      0,
    );
  }

  function goPrev() {
    setActiveIndex((i) => (i > 0 ? i - 1 : candidates.length - 1));
  }

  function goNext() {
    setActiveIndex((i) => (i < candidates.length - 1 ? i + 1 : 0));
  }

  return (
    <>
    <div className="flex flex-col gap-4">
      {/* Gallery: thumbnail strip + hero */}
      <div className="flex gap-3">
        {/* Vertical Thumbnail Strip */}
        {candidates.length > 0 && (
          <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 480 }}>
            {candidates.map((candidate, index) => {
              const isWatermarked = String(candidate.reviewStatus || "").includes("watermark");
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${candidate.imageUrl || candidate.thumbnailUrl || "img"}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`ebay-thumb ${isActive ? "ebay-thumb-active" : ""} ${isWatermarked ? "opacity-70" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={candidate.imageUrl || candidate.thumbnailUrl}
                    alt={`Thumbnail ${index + 1}`}
                    className="h-full w-full object-contain p-1"
                  />
                  {isWatermarked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-amber-500/20">
                      <span className="rounded bg-amber-600 px-1 py-px text-[7px] font-bold uppercase text-white">WM</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Hero Image */}
        <div className="relative flex-1">
          <div
            className={`ebay-hero-container ${canEdit && isDragActive ? "ring-4 ring-blue-400 ring-offset-2" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {activeImage?.imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage.imageUrl}
                  alt={title || partNumber}
                  className="ebay-hero-image"
                />
                {/* Viewed Today Badge */}
                {candidates.length > 1 && (
                  <div className="absolute left-3 top-3 z-10 rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    {candidates.length} PHOTOS
                  </div>
                )}
                {/* Zoom / expand icon */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute left-3 bottom-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur-sm hover:bg-white transition-all cursor-pointer"
                  title="Expand image"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                </button>
                {/* Heart icon */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm hover:text-red-500 hover:bg-white transition-all"
                    title="Watch"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-3xl text-slate-300">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </div>
                <div className="text-sm font-bold tracking-tight text-slate-400">
                  PHOTO PENDING
                </div>
                <div className="text-xs text-slate-400">
                  Drop images here or upload files below
                </div>
              </div>
            )}
            {canEdit && isDragActive && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-blue-500 bg-blue-50/90 text-sm font-extrabold uppercase tracking-wide text-blue-700">
                Drop images to upload
              </div>
            )}

            {/* Prev / Next arrows */}
            {candidates.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="ebay-arrow ebay-arrow-left"
                  aria-label="Previous image"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="ebay-arrow ebay-arrow-right"
                  aria-label="Next image"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Image controls — edit mode only */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={setActiveAsLead}
            disabled={!activeImage || activeIndex === 0}
            className="ebay-img-action-btn"
          >
            Set as main
          </button>
          <button
            type="button"
            onClick={removeActiveImage}
            disabled={!activeImage}
            className="ebay-img-action-btn hover:border-red-300 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      )}

      {/* Upload section — edit mode only */}
      {canEdit && (
        <div
          className={`rounded-lg border p-3 ${isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Add images
          </label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex min-h-28 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
                isDragActive
                  ? "border-blue-500 bg-white text-blue-700"
                  : "border-blue-200 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <span className="text-sm font-extrabold">
                {isDragActive ? "Drop images to upload" : "Drag images here"}
              </span>
              <span className="mt-1 text-[11px] font-semibold text-slate-500">
                or click to choose files
              </span>
              <span className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                JPG, PNG, WebP, AVIF. Up to 24 at a time.
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="hidden"
              onChange={(event) => {
                uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                Camera
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    uploadFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-500">
                Optional: paste image URLs
              </summary>
              <div className="mt-2 grid gap-2">
                <textarea
                  value={newImageUrl}
                  onChange={(event) => setNewImageUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) addImage();
                  }}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Paste one or more image URLs, one per line"
                />
                <button
                  type="button"
                  onClick={addImage}
                  disabled={!newImageUrl.trim()}
                  className="w-fit rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Add URL(s)
                </button>
              </div>
            </details>
          </div>
          {(isUploading || uploadMessage) && (
            <p className={`mt-2 text-[10px] font-bold ${uploadMessage.includes("failed") || uploadMessage.includes("Missing") ? "text-red-600" : "text-blue-700"}`}>
              {isUploading ? "Uploading images..." : uploadMessage}
            </p>
          )}
        </div>
      )}
    </div>

      {/* ── Lightbox overlay ── */}
      {lightboxOpen && activeImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightboxOpen(false);
            if (e.key === "ArrowRight" && candidates.length > 1) setActiveIndex((i) => (i + 1) % candidates.length);
            if (e.key === "ArrowLeft" && candidates.length > 1) setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Image gallery for ${partNumber}`}
          ref={(el) => { if (el && document.activeElement !== el) el.focus(); }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>

          {/* Counter */}
          {candidates.length > 1 && (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              {activeIndex + 1} / {candidates.length}
            </div>
          )}

          {/* Prev / Next arrows */}
          {candidates.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i + 1) % candidates.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </>
          )}

          {/* Main image */}
          <img
            src={activeImage.imageUrl}
            alt={title || partNumber}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
