import { NextRequest, NextResponse } from "next/server";
import { resolveEncompassExplodedViewUrl } from "@/features/bom/services/encompass-model-index";
import { resolveEncompassBrandRoute } from "@/features/bom/services/encompass-route-service";
import {
  buildCanonicalEncompassUrls,
  buildKnownEncompassAssemblyUrl,
  normalizeCanonicalModel,
} from "@/features/bom/services/source-tier-policy";
import {
  buildEncompassCanonicalUrlSet,
  buildEncompassCanonicalUrlSetFromAssemblyUrl,
} from "@/features/bom/services/providers/deterministic-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildSearchUrl(baseUrl?: string | null, model?: string | null) {
  if (!baseUrl) return null;
  if (!model) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}searchTerm=${encodeURIComponent(model)}`;
}

function buildRouteSearchUrl(input: {
  route?: string | null;
  brand?: string | null;
  model: string;
}) {
  if (!input.route) return null;
  const brandSegment = encodeURIComponent(input.brand || input.route);
  return `https://encompass.com/Exploded-View-Search/${input.route.toUpperCase()}/${brandSegment}?searchTerm=${encodeURIComponent(input.model)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get("model");
  const brand = searchParams.get("brand");

  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  try {
    const normalizedModel = normalizeCanonicalModel(model);
    const brandRoute = brand ? await resolveEncompassBrandRoute(brand) : null;
    const explodedViewSearchUrl = buildSearchUrl(brandRoute?.explodedViewSearchUrl, normalizedModel);

    const result = await resolveEncompassExplodedViewUrl({
      model: normalizedModel,
      routeHint: null, // Let the index find it based on normalized model first
    });

    if (result.status !== "not_found") {
      const indexedSearchUrl = result.selected
        ? buildRouteSearchUrl({
            route: result.selected.encompass_route,
            brand: brand || result.selected.brand,
            model: normalizedModel,
          })
        : explodedViewSearchUrl;
      const canonicalUrls = result.selected?.url
        ? buildEncompassCanonicalUrlSetFromAssemblyUrl({
            url: result.selected.url,
            explodedViewSearchUrl: indexedSearchUrl,
          })
        : null;
      return NextResponse.json({
        ...result,
        canonicalUrls,
        candidates: result.candidates.map((candidate) => ({
          ...candidate,
          canonicalUrls: buildEncompassCanonicalUrlSetFromAssemblyUrl({
            url: candidate.url,
            explodedViewSearchUrl: buildRouteSearchUrl({
              route: candidate.encompass_route,
              brand: brand || candidate.brand,
              model: normalizedModel,
            }) || explodedViewSearchUrl,
          }),
        })),
      });
    }

    const knownUrl = buildKnownEncompassAssemblyUrl(normalizedModel, brand);
    if (knownUrl) {
      const canonicalUrls = buildEncompassCanonicalUrlSetFromAssemblyUrl({
        url: knownUrl,
        explodedViewSearchUrl,
      });
      return NextResponse.json({
        status: "known_route",
        normalizedModel,
        selected: {
          url: knownUrl,
          source: "known_encompass_route",
        },
        canonicalUrls,
        candidates: [],
      });
    }

    if (brandRoute?.explodedViewSearchUrl) {
      return NextResponse.json({
        ...result,
        status: "brand_route",
        selected: {
          url: explodedViewSearchUrl,
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
      canonicalUrls: canonical.explodedViewUrl
        ? buildEncompassCanonicalUrlSet({
            brandAbv: canonical.prefix,
            model: normalizedModel,
            explodedViewSearchUrl,
          })
        : null,
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
