import "dotenv/config";
import Module from "node:module";

// Mock 'server-only' to bypass the Next.js restriction in this script
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "server-only") {
    return {};
  }
  return originalRequire.apply(this, arguments as any);
};

import { orchestrateBomRetrieval } from "./bom-orchestrator";

async function main() {
  console.log("=== BOM Orchestrator Dry-Run Test ===");
  console.log("Testing with brand: GE, model: HTDX100ED3WW");

  try {
    const result = await orchestrateBomRetrieval({
      brand: "GE",
      model: "HTDX100ED3WW",
    });

    console.log("=== Result ===");
    console.log(`Source Type: ${result.sourceType}`);
    console.log(`From Cache: ${result.fromCache}`);
    console.log(`Is Exhaustive: ${result.isExhaustive}`);
    console.log(`Parts Retrieved: ${result.parts.length}`);
    
    if (result.parts.length > 0) {
      console.log("First 3 parts:");
      console.log(JSON.stringify(result.parts.slice(0, 3), null, 2));
    }
  } catch (error) {
    console.error("Dry run failed:", error);
  }
}

main();
