import fs from "fs";
import path from "path";
import { list } from "@vercel/blob";

const DETAIL_STATE_PATH = "ebay/detail-editor-state/current.json";

export const metadata = {
  title: "eBay Listings Dashboard — RoadrunnerParts",
  description:
    "Live audit dashboard for the 41-part eBay listing scope with image candidates and pricing.",
};

export const dynamic = "force-dynamic";

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase();
}

function loadBaseListings() {
  const filePath = path.join(
    process.cwd(),
    "scratch/ebay-html-current/listings.normalized.json"
  );
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data.listings || [];
}

async function loadDetailEditorEdits() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return {};
  try {
    const result = await list({ prefix: DETAIL_STATE_PATH, limit: 1 });
    const blob = result.blobs.find((item) => item.pathname === DETAIL_STATE_PATH);
    if (!blob) return {};
    const stateUrl = new URL(blob.url);
    stateUrl.searchParams.set("rrpStateTs", String(Date.now()));
    const response = await fetch(stateUrl.toString(), { cache: "no-store" });
    if (!response.ok) return {};
    const state = await response.json();
    return state && typeof state.edits === "object" && !Array.isArray(state.edits)
      ? state.edits
      : {};
  } catch {
    return {};
  }
}

function imageCandidateKey(candidate) {
  return String(candidate?.imageUrl || candidate?.thumbnailUrl || candidate?.remoteImageUrl || "")
    .trim()
    .toLowerCase();
}

function mergeImageCandidates(baseCandidates, editCandidates) {
  const merged = [];
  const seen = new Set();

  for (const candidate of [
    ...(Array.isArray(editCandidates) ? editCandidates : []),
    ...(Array.isArray(baseCandidates) ? baseCandidates : []),
  ]) {
    const key = imageCandidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

async function loadListings() {
  const listings = loadBaseListings();
  const edits = await loadDetailEditorEdits();
  if (!Object.keys(edits).length) return listings;
  return listings.map((listing) => {
    const partNumber = cleanPartNumber(listing.partNumber);
    const edit = edits[partNumber];
    if (!edit) return listing;
    return {
      ...listing,
      ...edit,
      imageCandidate: edit.imageCandidates?.[0] || listing.imageCandidate || null,
      imageCandidates: mergeImageCandidates(listing.imageCandidates, edit.imageCandidates),
    };
  });
}

function StatusBadge({ listing }) {
  const candidates = listing.imageCandidates || [];
  const top = candidates[0];
  if (!top) {
    return (
      <span className="inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
        Image Pending
      </span>
    );
  }
  const status = String(top.reviewStatus || "");
  if (status.includes("watermark")) {
    return (
      <span className="inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
        Watermark Review
      </span>
    );
  }
  return (
    <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
      Ready
    </span>
  );
}

export default async function EbayDashboard() {
  const listings = await loadListings();
  const withImages = listings.filter(
    (l) => l.imageCandidates && l.imageCandidates.length > 0
  );
  const withoutImages = listings.length - withImages.length;
  const watermarkReview = listings.filter((l) =>
    String(l.imageCandidates?.[0]?.reviewStatus || "").includes("watermark")
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-12 text-center text-slate-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-600 via-slate-900 to-emerald-600" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl">
          <h1 className="mb-2 font-[var(--font-display)] text-4xl leading-tight tracking-normal sm:text-5xl">
            <span className="text-blue-600">Road</span>
            <span className="text-slate-950">Runner</span>
            <span className="text-slate-950">-</span>
            <span className="text-emerald-600">Parts</span>
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Live eBay listing dashboard — operator review
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Stat label="Total Parts" value={listings.length} />
            <Stat label="With Images" value={withImages.length} />
            <Stat label="Pending" value={withoutImages} />
            <Stat label="Watermark Review" value={watermarkReview} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700">
              Pipeline:{" "}
              <span className="font-extrabold text-blue-600">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Grid */}
      <main className="mx-auto max-w-[1280px] px-5 py-12">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((listing, i) => {
            const top = listing.imageCandidates?.[0];
            const imgSrc = top?.imageUrl || top?.thumbnailUrl || null;
            return (
              <a
                key={listing.partNumber || i}
                href={`/ebay/${encodeURIComponent(listing.partNumber)}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-blue-500 hover:shadow-xl"
              >
                <div className="relative flex aspect-square items-center justify-center border-b border-slate-100 bg-slate-50 p-8">
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgSrc}
                      alt={listing.partNumber}
                      className="max-h-full max-w-full object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="text-xl font-extrabold tracking-widest text-slate-300">
                      NO IMAGE
                    </div>
                  )}
                  <span className="absolute right-3 top-3 rounded-md bg-[#162033] px-2 py-0.5 text-[10px] font-bold text-white">
                    #{i + 1}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-1 font-[var(--font-display)] text-lg font-bold text-[#162033]">
                    {listing.partNumber}
                  </div>
                  <div className="mb-4 line-clamp-2 min-h-[40px] text-xs leading-relaxed text-slate-500">
                    {listing.partTitle || listing.title}
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <StatusBadge listing={listing} />
                    {listing.ebayBuyNow && (
                      <span className="text-sm font-bold text-[#162033]">
                        {listing.ebayBuyNow}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-slate-100 px-10 py-12 text-center text-xs text-slate-500">
        &copy; 2026 RoadRunner-Parts Advanced Systems. Built for serialized
        appliance resale.
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700">
      <span className="mr-1 text-base font-extrabold text-blue-600">
        {value}
      </span>
      {label}
    </div>
  );
}
