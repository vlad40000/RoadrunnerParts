import { NextRequest, NextResponse } from "next/server";
import { resolveEncompassExplodedViewUrl } from "@/features/bom/services/encompass-model-index";
import { resolveEncompassBrandRoute } from "@/features/bom/services/encompass-route-service";
import {
  buildCanonicalEncompassUrls,
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "@/features/bom/services/source-tier-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get("model");
  const brand = searchParams.get("brand");

  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  try {
    const normalizedModel = normalizeCanonicalModel(model);
    const knownUrl = buildKnownEncompassAssemblyUrl(normalizedModel, brand);
    if (knownUrl) {
      return NextResponse.json({
        status: "known_route",
        normalizedModel,
        selected: {
          url: knownUrl,
          source: "known_encompass_route",
        },
        candidates: [],
      });
    }

    const result = await resolveEncompassExplodedViewUrl({
      model: normalizedModel,
      routeHint: null, // Let the index find it based on normalized model first
    });

    if (result.status !== "not_found") {
      return NextResponse.json(result);
    }

    const brandRoute = brand ? await resolveEncompassBrandRoute(brand) : null;
    if (brandRoute?.explodedViewSearchUrl) {
      const separator = brandRoute.explodedViewSearchUrl.includes("?") ? "&" : "?";
      const routeUrl = `${brandRoute.explodedViewSearchUrl}${separator}searchTerm=${encodeURIComponent(normalizedModel)}`;
      return NextResponse.json({
        ...result,
        status: "brand_route",
        selected: {
          url: routeUrl,
          source: "encompass_brand_routes",
          brand: brandRoute.brand,
          abv: brandRoute.abv,
          targetBrand: brandRoute.targetBrand,
        },
      });
    }

    const canonical = buildCanonicalEncompassUrls({ model: normalizedModel, brand });
    return NextResponse.json({
      ...result,
      status: canonical.explodedViewUrl ? "canonical_fallback" : result.status,
      fallbackUrl: canonical.explodedViewUrl || null,
      selected: canonical.explodedViewUrl
        ? {
            url: canonical.explodedViewUrl,
            source: "canonical_encompass_pattern",
            prefix: canonical.prefix,
          }
        : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to resolve Encompass URL", detail: String(error) },
      { status: 500 },
    );
  }
}
