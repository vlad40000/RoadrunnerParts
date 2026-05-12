import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import Link from "next/link";
import { list } from "@vercel/blob";
import ListingEditor from "./ListingEditor";

export const dynamic = "force-dynamic";
const DETAIL_STATE_PATH = "ebay/detail-editor-state/current.json";

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

function moneyLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toFixed(2)}`;
  const text = String(value || "").trim();
  return text;
}

function resolvePriceLabel(edit, listing) {
  return (
    moneyLabel(edit?.ebayBuyNow) ||
    moneyLabel(edit?.price) ||
    moneyLabel(listing.ebayBuyNow) ||
    moneyLabel(listing.price) ||
    moneyLabel(listing.specs?.ebayBuyNow) ||
    ""
  );
}

async function loadListings() {
  const listings = loadBaseListings();
  const edits = await loadDetailEditorEdits();
  if (!Object.keys(edits).length) return listings;
  return listings.map((listing) => {
    const partNumber = cleanPartNumber(listing.partNumber);
    if (!edits[partNumber]) return listing;
    const edit = edits[partNumber];
    return {
      ...listing,
      ...edit,
      price: typeof edit.price === "number" && Number.isFinite(edit.price) ? edit.price : listing.price,
      ebayBuyNow: resolvePriceLabel(edit, listing),
      imageCandidate: edit.imageCandidates?.[0] || listing.imageCandidate || null,
      imageCandidates: mergeImageCandidates(listing.imageCandidates, edit.imageCandidates),
    };
  });
}

export async function generateMetadata({ params }) {
  const { partNumber } = await params;
  return {
    title: `Edit ${decodeURIComponent(partNumber)} — RoadrunnerParts`,
    description: `Interactive editor for part ${decodeURIComponent(partNumber)}.`,
  };
}

export default async function ListingDetail({ params }) {
  const { partNumber: rawPartNumber } = await params;
  const partNumber = decodeURIComponent(rawPartNumber).toUpperCase();
  const listings = await loadListings();
  const listing = listings.find(
    (l) => String(l.partNumber || "").toUpperCase() === partNumber
  );

  if (!listing) return notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header / Nav */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/ebay" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-slate-900 leading-none">Editor</h1>
            <span className="mt-1 font-[var(--font-display)] text-[10px] tracking-normal">
              <span className="text-blue-600">Road</span>
              <span className="text-slate-950">Runner</span>
              <span className="text-slate-950">-</span>
              <span className="text-emerald-600">Parts</span>
              <span className="font-sans font-bold text-slate-400"> / {partNumber}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-7 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          <Link
            href="/ebay"
            className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-800 transition-all"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <ListingEditor initialListing={listing} partNumber={partNumber} />
    </div>
  );
}
