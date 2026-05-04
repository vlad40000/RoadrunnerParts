import { ModelRunInput, runText } from "./model-runner";

export type DualModelResult = {
  modelA: {
    id: string;
    output: string;
    latency: number;
  };
  modelB: {
    id: string;
    output: string;
    latency: number;
  };
};

export async function runDualModelComparison(
  input: Omit<ModelRunInput, "model"> & {
    modelA: ModelRunInput["model"];
    modelB: ModelRunInput["model"];
  }
): Promise<DualModelResult> {
  const startTime = Date.now();

  const [resA, resB] = await Promise.all([
    (async () => {
      const start = Date.now();
      const output = await runText({ ...input, model: input.modelA });
      return { id: input.modelA || "default", output, latency: Date.now() - start };
    })(),
    (async () => {
      const start = Date.now();
      const output = await runText({ ...input, model: input.modelB });
      return { id: input.modelB || "default", output, latency: Date.now() - start };
    })(),
  ]);

  return {
    modelA: resA,
    modelB: resB,
  };
}
