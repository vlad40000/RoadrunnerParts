import { extractIdentity } from "../src/lib/identity-service";

function test(model: string, brand?: string) {
  console.log(`\nTesting: Model=${model}, Brand=${brand || "none"}`);
  const identity = extractIdentity({ modelNumber: model, brand, source: "manual" });
  console.log(JSON.stringify(identity, null, 2));
}

// Test cases from instructions
test("MED3500FW0"); // Should resolve to Maytag
test("WTW7500GC2"); // Should resolve to Whirlpool
test("HTDX100ED3WW"); // Should resolve to Hotpoint
test("RF28R7351SR"); // Should resolve to Samsung
test("DLE3400W"); // Should resolve to LG

// Test with explicit brand
test("3500FW0", "Maytag"); 
