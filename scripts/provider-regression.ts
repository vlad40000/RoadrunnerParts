import "./setup-env";

import { geOfficialProvider } from "../src/features/bom/services/providers/ge-official";
import { repairClinicFamilyProvider } from "../src/features/bom/services/providers/repairclinic-family";
import { frigidaireFamilyProvider } from "../src/features/bom/services/providers/frigidaire-family";
import { lgFamilyProvider } from "../src/features/bom/services/providers/lg-family";
import { samsungFamilyProvider } from "../src/features/bom/services/providers/samsung-family";
import { boschFamilyProvider } from "../src/features/bom/services/providers/bosch-family";
import { searsPartsDirectProvider } from "../src/features/bom/services/providers/sears-partsdirect";
import { fixComProvider } from "../src/features/bom/services/providers/fix-com";
import { partSelectProvider } from "../src/features/bom/services/providers/partselect";
import type {
  RetrievedSource,
  SourceProvider,
} from "../src/features/bom/services/providers/types";
import {
  PROVIDER_REGRESSION_CASES,
  type ProviderRegressionCase,
} from "./provider-regression.cases";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type RegressionResult = {
  key: string;
  label: string;
  provider: string;
  brand: string;
  model: string;
  sourceCount: number;
  rowCount: number;
  passed: boolean;
  error: string | null;
  sections: string[];
  urls: string[];
  elapsedMs: number;
};

const PROVIDERS: Record<string, SourceProvider> = {
  "ge-official": geOfficialProvider,
  "repairclinic-family": repairClinicFamilyProvider,
  "frigidaire-family": frigidaireFamilyProvider,
  "lg-family": lgFamilyProvider,
  "samsung-family": samsungFamilyProvider,
  "bosch-family": boschFamilyProvider,
  "sears-partsdirect": searsPartsDirectProvider,
  "fix.com": fixComProvider,
  "partselect.com": partSelectProvider,
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);

  const concurrencyIndex = argv.findIndex((arg) => arg === "--concurrency");
  const concurrencyValue =
    concurrencyIndex >= 0 && argv[concurrencyIndex + 1]
      ? Number.parseInt(argv[concurrencyIndex + 1], 10)
      : undefined;

  const reportFileArg = argv.find((arg) => arg.startsWith("--report-file="));

  return {
    json: args.has("--json"),
    concurrency:
      Number.isFinite(concurrencyValue) && (concurrencyValue ?? 0) > 0
        ? Math.max(1, Number(concurrencyValue))
        : 3,
    reportFile:
      reportFileArg?.split("=")[1] ??
      (args.has("--report-file")
        ? argv[argv.findIndex((arg) => arg === "--report-file") + 1]
        : undefined),
  };
}

function countStructuredRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("ROW|")).length;
}

function countRowsFromSources(sources: RetrievedSource[]) {
  return sources.reduce((sum, source) => {
    const structured = countStructuredRows(source.text || "");
    if (structured > 0) return sum + structured;

    const metaCount =
      typeof source.meta?.rowCount === "number" ? Number(source.meta.rowCount) : 0;

    return sum + metaCount;
  }, 0);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  throw lastError;
}

async function runCase(testCase: ProviderRegressionCase): Promise<RegressionResult> {
  const provider = PROVIDERS[testCase.expectedProvider];

  if (!provider) {
    return {
      key: testCase.key,
      label: testCase.label,
      provider: testCase.expectedProvider,
      brand: testCase.brand,
      model: testCase.model,
      sourceCount: 0,
      rowCount: 0,
      passed: false,
      error: `Missing provider: ${testCase.expectedProvider}`,
      sections: [],
      urls: [],
      elapsedMs: 0,
    };
  }

  const startedAt = Date.now();

  try {
    const sources = await withRetry(
      () =>
        provider.fetchSources({
          brand: testCase.brand,
          model: testCase.model,
        }),
      2,
    );

    const rowCount = countRowsFromSources(sources);
    const sourceCount = sources.length;
    const sections = unique(
      sources.map((source) => String(source.sectionName || "").trim()).filter(Boolean),
    );
    const urls = unique(
      sources.map((source) => String(source.sourceUrl || "").trim()).filter(Boolean),
    );

    return {
      key: testCase.key,
      label: testCase.label,
      provider: provider.name,
      brand: testCase.brand,
      model: testCase.model,
      sourceCount,
      rowCount,
      passed: rowCount >= testCase.minRows,
      error:
        rowCount >= testCase.minRows
          ? null
          : `Expected >= ${testCase.minRows} rows but received ${rowCount} from ${provider.name}`,
      sections: sections.slice(0, 8),
      urls: urls.slice(0, 5),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      key: testCase.key,
      label: testCase.label,
      provider: provider.name,
      brand: testCase.brand,
      model: testCase.model,
      sourceCount: 0,
      rowCount: 0,
      passed: false,
      error: error instanceof Error ? error.message : "Unknown regression error",
      sections: [],
      urls: [],
      elapsedMs: Date.now() - startedAt,
    };
  }
}

function printHuman(results: RegressionResult[]) {
  console.table(
    results.map((result) => ({
      family: result.label,
      provider: result.provider,
      model: result.model,
      sources: result.sourceCount,
      rows: result.rowCount,
      ms: result.elapsedMs,
      passed: result.passed ? "yes" : "no",
      error: result.error ?? "",
    })),
  );

  for (const result of results) {
    console.log(`\n[${result.label}] ${result.provider} :: ${result.model}`);
    if (result.sections.length) {
      console.log(`sections: ${result.sections.join(" | ")}`);
    }
    if (result.urls.length) {
      console.log(`urls: ${result.urls.join(" | ")}`);
    }
    if (result.error) {
      console.log(`error: ${result.error}`);
    }
  }
}

function printSummary(results: RegressionResult[]) {
  const elapsed = results.map((result) => result.elapsedMs);
  const totalElapsed = elapsed.reduce((sum, value) => sum + value, 0);
  const avg = elapsed.length ? Math.round(totalElapsed / elapsed.length) : 0;
  const slowest = [...results].sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 3);

  console.log("\nSummary:");
  console.log(`cases=${results.length} avgMs=${avg} totalMs=${totalElapsed}`);

  if (slowest.length) {
    console.log(
      `slowest=${slowest
        .map((entry) => `${entry.label}:${entry.elapsedMs}ms`)
        .join(", ")}`,
    );
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

async function main() {
  const { json, concurrency, reportFile } = parseArgs();

  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY");
    process.exit(1);
  }

  const results = await runWithConcurrency(
    PROVIDER_REGRESSION_CASES,
    concurrency,
    async (testCase) => runCase(testCase),
  );

  const jsonBody = JSON.stringify(results, null, 2);

  if (reportFile) {
    await mkdir(dirname(reportFile), { recursive: true });
    await writeFile(reportFile, `${jsonBody}\n`, "utf8");
  }

  if (json) {
    console.log(jsonBody);
  } else {
    printHuman(results);
    printSummary(results);
  }

  const failures = results.filter((result) => !result.passed);

  if (failures.length > 0) {
    console.error(
      `\nProvider regression failed for: ${failures
        .map((failure) => `${failure.label}(${failure.rowCount})`)
        .join(", ")}`,
    );
    process.exit(1);
  }

  console.log("\nProvider regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
