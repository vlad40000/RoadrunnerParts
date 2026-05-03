// import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";

export async function runRetrievalWorker(workerId = "local-encompass-worker") {
  const scriptPath = path.join(
    process.cwd(),
    "src",
    "workers",
    "bom-retrieval-worker",
    "worker.py",
  );
  const python = process.env.PYTHON_BIN || "python";

  return new Promise<{ status: "complete"; output: string }>((resolve, reject) => {
    const child = spawn(python, [scriptPath, "--once"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKER_ID: workerId,
        WORKER_PLAYWRIGHT: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ status: "complete", output });
      } else {
        reject(new Error(output || `Retrieval worker exited with ${code}`));
      }
    });
  });
}
