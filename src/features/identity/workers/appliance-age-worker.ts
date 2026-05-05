import "server-only";

import { decodeSerialNumber, type SerialProfile, type SerialConfidence } from "../decoder";
import { resolveTrueOemBrand } from "@/lib/providers/manufacturer/family-config";

export type AgeBand =
  | "current_recent"
  | "strong_resale"
  | "normal_used"
  | "part_out_bias"
  | "scrap_or_legacy_parts"
  | "unknown";

export type ApplianceAgeWorkerInput = {
  machineId: string;
  brand: string;
  model?: string | null;
  serial: string;
  observedFeatures?: string[];
  refrigerantLabel?: string | null;
  hardLowerBoundYear?: number | null;
};

export type ApplianceAgeDecodeResult = {
  machineId: string;
  brandRaw: string | null;
  modelRaw: string | null;
  serialRaw: string | null;
  resolvedOemBrand: string | null;
  manufacturerFamily: string | null;
  decodedYear: number | null;
  decodedMonth: number | null;
  decodedWeek: number | null;
  decodedManufactureDate: string | null;
  decodedAgeMonths: number | null;
  decodeConfidence: SerialConfidence | "none";
  decodeReason: string | null;
  decodeRulesApplied: string[];
  decodeCandidates: number[];
  ageBand: AgeBand;
  manualReviewRequired: boolean;
  manualReviewReason: string | null;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function dateFromIsoWeek(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - day + 1);
  const target = new Date(mondayWeek1);
  target.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return isoDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

function calculateAgeMonths(manufactureDate: string, now = new Date()) {
  const [year, month] = manufactureDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

function ageBandFor(ageMonths: number | null): AgeBand {
  if (ageMonths === null || ageMonths < 0) return "unknown";
  if (ageMonths < 48) return "current_recent";
  if (ageMonths < 96) return "strong_resale";
  if (ageMonths < 156) return "normal_used";
  if (ageMonths < 216) return "part_out_bias";
  return "scrap_or_legacy_parts";
}

function reviewReason(input: {
  profile: SerialProfile | null;
  decodedAgeMonths: number | null;
}) {
  if (!input.profile?.selectedYear) return "serial_date_not_decoded";
  if (input.decodedAgeMonths !== null && input.decodedAgeMonths < 0) return "decoded_date_is_in_future";
  if (input.profile.confidence === "low") return "low_decode_confidence";
  if (input.profile.remainingCandidates.length > 1) return "multiple_decode_candidates";
  return null;
}

export async function runApplianceAgeWorker(
  input: ApplianceAgeWorkerInput,
): Promise<ApplianceAgeDecodeResult> {
  const model = String(input.model || "").trim();
  const resolvedOemBrand = model
    ? resolveTrueOemBrand(input.brand, model)
    : input.brand || null;

  let profile: SerialProfile | null = null;
  try {
    profile = await decodeSerialNumber(input.serial, {
      brand: resolvedOemBrand || input.brand,
      model,
      hard_lower_bound_year: input.hardLowerBoundYear ?? undefined,
      observed_features: input.observedFeatures,
      refrigerant_label: input.refrigerantLabel ?? undefined,
    });
  } catch (error) {
    profile = null;
  }

  const decodedYear = profile?.selectedYear ?? null;
  const decodedMonth = profile?.decoded.month ?? null;
  const decodedWeek = profile?.decoded.week ?? null;
  const decodedManufactureDate = decodedYear
    ? decodedMonth
      ? isoDate(decodedYear, decodedMonth, 1)
      : decodedWeek
        ? dateFromIsoWeek(decodedYear, decodedWeek)
        : isoDate(decodedYear, 1, 1)
    : null;
  const decodedAgeMonths = decodedManufactureDate
    ? calculateAgeMonths(decodedManufactureDate)
    : null;
  const manualReviewReason = reviewReason({ profile, decodedAgeMonths });
  const manualReviewRequired = Boolean(manualReviewReason);
  const ageBand = ageBandFor(decodedAgeMonths);

  return {
    machineId: input.machineId,
    brandRaw: input.brand || null,
    modelRaw: input.model || null,
    serialRaw: input.serial || null,
    resolvedOemBrand: resolvedOemBrand || null,
    manufacturerFamily: profile?.brandFamily ?? null,
    decodedYear,
    decodedMonth,
    decodedWeek,
    decodedManufactureDate,
    decodedAgeMonths,
    decodeConfidence: profile?.confidence ?? "none",
    decodeReason: profile?.resolutionReason ?? null,
    decodeRulesApplied: profile?.rulesApplied ?? [],
    decodeCandidates: profile?.remainingCandidates ?? [],
    ageBand,
    manualReviewRequired,
    manualReviewReason,
  };
}
