"use client";

import { useState } from "react";

function cleanImageCandidate(candidate) {
  return {
    imageUrl: String(candidate.imageUrl || candidate.thumbnailUrl || "").trim(),
    thumbnailUrl: String(candidate.thumbnailUrl || candidate.imageUrl || "").trim(),
    sourceDomain: String(candidate.sourceDomain || "operator-upload").trim(),
    reviewStatus: String(candidate.reviewStatus || "operator_added_needs_review").trim(),
    score: Number(candidate.score || 0),
  };
}

export default function ListingGallery({ candidates, title, partNumber, onChange }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [newImageUrl, setNewImageUrl] = useState("");
  const activeImage = candidates[activeIndex] || null;
  const canEdit = typeof onChange === "function";

  function updateCandidates(nextCandidates, nextIndex = activeIndex) {
    onChange?.(nextCandidates.map(cleanImageCandidate));
    setActiveIndex(Math.max(0, Math.min(nextIndex, nextCandidates.length - 1)));
  }

  function addImage() {
    const imageUrl = newImageUrl.trim();
    if (!imageUrl) return;
    updateCandidates(
      [
        ...candidates,
        cleanImageCandidate({
          imageUrl,
          thumbnailUrl: imageUrl,
          sourceDomain: "operator-added",
          reviewStatus: "operator_added_needs_review",
          score: 100,
        }),
      ],
      candidates.length,
    );
    setNewImageUrl("");
  }

  function removeActiveImage() {
    if (!activeImage) return;
    updateCandidates(
      candidates.filter((_, index) => index !== activeIndex),
      activeIndex - 1,
    );
  }

  function setActiveAsLead() {
    if (!activeImage || activeIndex === 0) return;
    updateCandidates(
      [activeImage, ...candidates.filter((_, index) => index !== activeIndex)],
      0,
    );
  }

  async function copyListingLink() {
    const path = `/ebay/${encodeURIComponent(partNumber)}`;
    const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Listing link", url);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {candidates.length > 0 ? (
        <div className="flex flex-row gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {candidates.map((candidate, index) => {
            const isWatermarked = String(candidate.reviewStatus || "").includes("watermark");
            return (
              <button
                key={`${candidate.imageUrl || candidate.thumbnailUrl || "image"}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`group relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 transition-all duration-200 ${
                  index === activeIndex
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/10"
                    : "border-slate-200 bg-white hover:border-slate-400"
                } ${isWatermarked ? "opacity-80" : ""}`}
              >
                <img
                  src={candidate.imageUrl || candidate.thumbnailUrl}
                  alt={`Thumbnail ${index + 1}`}
                  className="max-h-full max-w-full object-contain p-1.5 transition-transform group-hover:scale-110"
                />
                {isWatermarked ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-amber-500/10">
                    <div className="rounded bg-amber-500 px-1 py-0.5 text-[8px] font-bold uppercase tracking-tighter text-white">
                      WMARK
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hidden flex-col gap-3 lg:flex">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm lg:p-8">
          {activeImage?.imageUrl ? (
            <img
              src={activeImage.imageUrl}
              alt={title || partNumber}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-2xl text-slate-300">
                +
              </div>
              <div className="text-lg font-bold tracking-tight text-slate-400">
                PHOTO PENDING
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 px-2">
          <button
            type="button"
            onClick={setActiveAsLead}
            disabled={!canEdit || !activeImage || activeIndex === 0}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Set as main
          </button>
          <button
            type="button"
            onClick={removeActiveImage}
            disabled={!canEdit || !activeImage}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove image
          </button>
          <button
            type="button"
            onClick={copyListingLink}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-500 hover:text-blue-600"
          >
            Copy link
          </button>
        </div>

        {canEdit ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Add or replace listing image
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={newImageUrl}
                onChange={(event) => setNewImageUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addImage();
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Paste image URL"
              />
              <button
                type="button"
                onClick={addImage}
                disabled={!newImageUrl.trim()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add
              </button>
            </div>
            <p className="mt-2 text-[10px] font-medium text-slate-500">
              Added images save with this listing. Put the clean operator-owned image first before export.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
