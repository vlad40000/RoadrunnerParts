import "dotenv/config";
import dotenv from "dotenv";
import path from "path";

// Load .env.local for Next.js consistency
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Bypassing server-only check for script execution
try {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    parent: null,
    children: [],
    path: "",
    paths: [],
  } as any;
} catch {
  // Ignore if server-only is not found
}
