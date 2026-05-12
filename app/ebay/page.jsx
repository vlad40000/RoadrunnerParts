import fs from "fs";
import path from "path";
import { list } from "@vercel/blob";

const DETAIL_STATE_PATH = "ebay/detail-editor-state/current.json";
const COVERAGE_PATH = "scratch/current-ebay-image-coverage.json";

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

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

function loadImageCoverage() {
  const filePath = path.join(process.cwd(), COVERAGE_PATH);
  if (!fs.existsSync(filePath)) return new Map();
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return new Map(
    (Array.isArray(data.attachedParts) ? data.attachedParts : []).map((part) => [
      cleanPartNumber(part.partNumber),
      {
        imageCount: Number(part.imageCount || 0),
        publicPrimaryImage: String(part.publicPrimaryImage || ""),
        primaryImage: String(part.primaryImage || ""),
      },
    ]),
  );
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
    const state = await readJsonResponse(response);
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
  const approvedImages = loadImageCoverage();
  const listings = loadBaseListings().map((listing) => {
    const partNumber = cleanPartNumber(listing.partNumber);
    const approved = approvedImages.get(partNumber) || null;
    return {
      ...listing,
      approvedSaleImage: approved,
    };
  });
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
      approvedSaleImage: listing.approvedSaleImage,
    };
  });
}

function StatusBadge({ listing }) {
  const visual = getListingVisual(listing);
  return (
    <span className={`inline-block rounded-lg border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${visual.badgeClass}`}>
      {visual.label}
    </span>
  );
}

function getListingVisual(listing) {
  if (listing.approvedSaleImage?.publicPrimaryImage) {
    return {
      label: "Approved Photo",
      cardClass: "border-emerald-300 bg-emerald-50 shadow-emerald-100 hover:border-emerald-500 hover:shadow-emerald-200",
      imageClass: "border-emerald-200 bg-white",
      badgeClass: "border-emerald-200 bg-emerald-100 text-emerald-800",
      priceClass: "text-emerald-800",
    };
  }

  const candidates = listing.imageCandidates || [];
  const top = candidates[0];
  if (!top) {
    return {
      label: "Photo Pending",
      cardClass: "border-amber-300 bg-amber-50 shadow-amber-100 hover:border-amber-500 hover:shadow-amber-200",
      imageClass: "border-amber-200 bg-amber-100",
      badgeClass: "border-amber-300 bg-amber-100 text-amber-900",
      priceClass: "text-amber-900",
    };
  }

  const status = String(top.reviewStatus || "");
  if (status.includes("watermark")) {
    return {
      label: "Watermark Review",
      cardClass: "border-orange-300 bg-orange-50 shadow-orange-100 hover:border-orange-500 hover:shadow-orange-200",
      imageClass: "border-orange-200 bg-white",
      badgeClass: "border-orange-300 bg-orange-100 text-orange-800",
      priceClass: "text-orange-900",
    };
  }

  return {
    label: "Candidate Review",
    cardClass: "border-blue-300 bg-blue-50 shadow-blue-100 hover:border-blue-500 hover:shadow-blue-200",
    imageClass: "border-blue-200 bg-white",
    badgeClass: "border-blue-200 bg-blue-100 text-blue-800",
    priceClass: "text-blue-900",
  };
}

export default async function EbayDashboard() {
  const listings = await loadListings();
  const approvedPhotos = listings.filter(
    (l) => l.approvedSaleImage?.publicPrimaryImage
  );
  const candidateReview = listings.filter(
    (l) => !l.approvedSaleImage?.publicPrimaryImage && l.imageCandidates && l.imageCandidates.length > 0
  );
  const photoPending = listings.length - approvedPhotos.length - candidateReview.length;
  const watermarkReview = listings.filter((l) =>
    !l.approvedSaleImage?.publicPrimaryImage &&
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
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-extrabold uppercase tracking-wide text-slate-700 hover:border-blue-500 hover:text-blue-700"
            >
              Home
            </a>
            <a
              href="/ebay_mockup_gallery.html"
              className="inline-flex h-10 items-center rounded-lg border border-blue-600 bg-blue-600 px-4 text-xs font-extrabold uppercase tracking-wide text-white hover:bg-slate-900"
            >
              Live Mockups
            </a>
          </div>
          <h1 className="mb-2 text-4xl font-black leading-tight tracking-normal sm:text-5xl">
            <span className="text-blue-600">Road</span>
            <span className="text-slate-950">Runner</span>
            <span className="text-slate-950">-</span>
            <span className="text-emerald-600">Parts</span>
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Live eBay listing dashboard — operator review
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Stat label="Total Parts" value={listings.length} tone="slate" />
            <Stat label="Approved Photos" value={approvedPhotos.length} tone="emerald" />
            <Stat label="Candidate Review" value={candidateReview.length} tone="blue" />
            <Stat label="Photo Pending" value={photoPending} tone="amber" />
            <Stat label="Watermark Review" value={watermarkReview} tone="orange" />
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
            const imgSrc =
              listing.approvedSaleImage?.publicPrimaryImage ||
              top?.imageUrl ||
              top?.thumbnailUrl ||
              null;
            const visual = getListingVisual(listing);
            return (
              <a
                key={listing.partNumber || i}
                href={`/ebay/${encodeURIComponent(listing.partNumber)}`}
                className={`group flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl ${visual.cardClass}`}
              >
                <div className={`relative flex aspect-square items-center justify-center border-b p-8 ${visual.imageClass}`}>
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
                  <div className="mb-1 text-lg font-black text-[#162033]">
                    {listing.partNumber}
                  </div>
                  <div className="mb-4 line-clamp-2 min-h-[40px] text-xs leading-relaxed text-slate-500">
                    {listing.partTitle || listing.title}
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <StatusBadge listing={listing} />
                    {listing.ebayBuyNow && (
                      <span className={`text-sm font-bold ${visual.priceClass}`}>
                        {listing.ebayBuyNow}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-slate-700 transition-colors group-hover:border-blue-500 group-hover:text-blue-700">
                    Open Editor
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

function Stat({ label, value, tone = "slate" }) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 [&_span]:text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 [&_span]:text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-800 [&_span]:text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-900 [&_span]:text-amber-800",
    orange: "border-orange-200 bg-orange-50 text-orange-900 [&_span]:text-orange-700",
  }[tone] || "border-slate-200 bg-slate-50 text-slate-700 [&_span]:text-slate-900";

  return (
    <div className={`rounded-xl border px-5 py-2.5 text-sm font-semibold ${toneClass}`}>
      <span className="mr-1 text-base font-extrabold">
        {value}
      </span>
      {label}
    </div>
  );
}
