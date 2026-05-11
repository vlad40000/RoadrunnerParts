import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function loadListings() {
  const filePath = path.join(
    process.cwd(),
    "scratch/ebay-html-current/listings.normalized.json"
  );
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data.listings || [];
}

export async function generateMetadata({ params }) {
  const { partNumber } = await params;
  return {
    title: `${decodeURIComponent(partNumber)} — RoadrunnerParts eBay Listing`,
    description: `Detailed audit view for part ${decodeURIComponent(partNumber)}.`,
  };
}

function SpecRow({ label, value }) {
  if (!value) return null;
  return (
    <tr>
      <th className="whitespace-nowrap border-b border-slate-100 py-3 pr-6 text-left text-xs font-medium text-slate-500">
        {label}
      </th>
      <td className="border-b border-slate-100 py-3 text-sm font-semibold text-slate-800">
        {value}
      </td>
    </tr>
  );
}

export default async function ListingDetail({ params }) {
  const { partNumber: rawPartNumber } = await params;
  const partNumber = decodeURIComponent(rawPartNumber).toUpperCase();
  const listings = loadListings();
  const listing = listings.find(
    (l) => String(l.partNumber || "").toUpperCase() === partNumber
  );
  if (!listing) return notFound();

  const candidates = listing.imageCandidates || [];
  const primary = candidates[0] || null;
  const primaryStatus = String(primary?.reviewStatus || "");
  const hasWatermarkRisk = primaryStatus.includes("watermark");
  const specs = listing.specs || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-800 bg-[#162033] px-5 py-3 shadow-lg">
        <Link
          href="/ebay"
          className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          ← Back to Dashboard
        </Link>
        <div className="font-[Outfit,sans-serif] text-xl font-extrabold text-white">
          Roadrunner<span className="text-blue-500">Parts</span>
        </div>
        <div className="w-[140px]" />
      </nav>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-10 rounded-3xl border border-slate-200 bg-white p-10 shadow-sm lg:grid-cols-2">
          {/* Gallery */}
          <div className="flex flex-col gap-5">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-10">
              {primary?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primary.imageUrl}
                  alt={listing.title || partNumber}
                  className="max-h-full max-w-full object-contain drop-shadow-xl"
                />
              ) : (
                <div className="text-2xl font-extrabold tracking-widest text-slate-300">
                  IMAGE PENDING
                </div>
              )}
            </div>

            {candidates.length > 1 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
                {candidates.map((cand, i) => (
                  <div
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-xl border-2 bg-white p-1.5 ${
                      String(cand.reviewStatus || "").includes("watermark")
                        ? "border-amber-400 bg-amber-50"
                        : "border-slate-100"
                    }`}
                    title={`Score: ${cand.score} | ${cand.sourceDomain} | ${cand.reviewStatus || "review"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cand.imageUrl || cand.thumbnailUrl}
                      alt={`Candidate ${i + 1}`}
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-blue-600">
              Appliance Component
            </div>
            <h1 className="mb-6 font-[Outfit,sans-serif] text-3xl font-extrabold leading-tight text-[#162033]">
              {listing.title || `${partNumber} Appliance Part`}
            </h1>

            <table className="mb-8 w-full">
              <tbody>
                <SpecRow label="Part Number" value={listing.partNumber} />
                <SpecRow label="Diagram ID" value={listing.diagId} />
                <SpecRow label="Retail" value={listing.retail} />
                <SpecRow label="eBay Buy Now" value={listing.ebayBuyNow} />
                <SpecRow label="Brand" value={specs.brand} />
                <SpecRow label="MPN" value={specs.mpn} />
                <SpecRow label="Type" value={specs.type} />
                <SpecRow label="Condition" value="Used" />
                <SpecRow label="Supersedes" value={specs.supersedes} />
              </tbody>
            </table>

            {listing.description && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <h2 className="mb-3 font-[Outfit,sans-serif] text-lg font-bold text-[#162033]">
                  Product Insights
                </h2>
                <div className="text-sm leading-relaxed text-slate-600">
                  {listing.description}
                </div>
              </div>
            )}

            {candidates.length > 0 && (
              <div
                className={`mt-6 rounded-xl border p-4 text-xs ${
                  hasWatermarkRisk
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <strong className="text-amber-900">Audit Insight:</strong> Top
                visual candidate from{" "}
                <strong>{primary?.sourceDomain}</strong> with quality score{" "}
                <strong>{primary?.score}</strong>. Status:{" "}
                <strong>
                  {primaryStatus || "candidate_needs_operator_review"}
                </strong>
                .{" "}
                {hasWatermarkRisk
                  ? "ReliableParts is mixed-trust; verify this image has no visible watermark before final staging."
                  : "Verify for watermarks before final staging."}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-16 border-t border-slate-200 px-10 py-10 text-center text-xs text-slate-500">
        RoadrunnerParts Internal Audit Tool &bull; 2026
      </footer>
    </div>
  );
}
