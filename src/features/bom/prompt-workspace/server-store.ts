import "server-only";

import type { PromptRun, PromptScenario } from "./types";
import { PROMPT_SCENARIOS } from "./scenarios";

const scenarioStore = new Map<string, PromptScenario>();
const runStore = new Map<string, PromptRun>();

export function listPromptScenarios() {
  const base = PROMPT_SCENARIOS.map((scenario) => scenarioStore.get(scenario.id) || scenario);
  const baseIds = new Set(base.map((scenario) => scenario.id));
  const custom = Array.from(scenarioStore.values()).filter((scenario) => !baseIds.has(scenario.id));
  return [...base, ...custom];
}

export function getPromptScenario(id: string) {
  return listPromptScenarios().find((scenario) => scenario.id === id) || null;
}

export function upsertPromptScenario(scenario: PromptScenario) {
  scenarioStore.set(scenario.id, scenario);
  return scenario;
}

export function savePromptRun(run: PromptRun) {
  runStore.set(run.id, run);
  return run;
}

export function getPromptRun(id: string) {
  return runStore.get(id) || null;
}

export function listPromptRuns(limit = 25) {
  return Array.from(runStore.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
