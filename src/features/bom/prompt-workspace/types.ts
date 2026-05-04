export type BomWorkspaceMode =
  | "identity"
  | "prompt_scenarios"
  | "supplier_runs"
  | "diagram_context"
  | "bom_extraction"
  | "pricing"
  | "validation"
  | "export_review"
  | "browser_tool";

export type ModelProvider = "gemini" | "manual" | "mock";

export type ModelSlot = {
  id: "slot_a" | "slot_b";
  modelName: "gemini-3-flash-preview" | "gemini-3-pro-preview";
  provider: ModelProvider;
  enabled: boolean;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
};

export const DEFAULT_MODEL_SLOTS: ModelSlot[] = [
  {
    id: "slot_a",
    modelName: "gemini-3-flash-preview",
    provider: "gemini",
    enabled: true,
    temperature: 1,
    topP: 0.8,
    maxOutputTokens: 8192,
  },
  {
    id: "slot_b",
    modelName: "gemini-3-pro-preview",
    provider: "gemini",
    enabled: true,
    temperature: 1,
    topP: 0.8,
    maxOutputTokens: 8192,
  },
];

export type PromptScenarioType =
  | "identity_extraction"
  | "nameplate_ocr_identity_json"
  | "plaintext_identity_extraction"
  | "supplier_url_generation"
  | "official_parts_source_search"
  | "diagram_discovery"
  | "technical_diagram_callouts_csv"
  | "visual_qa_drift_json"
  | "computer_use_navigation"
  | "bom_extraction"
  | "bom_row_extraction_json"
  | "bom_validation"
  | "pricing_reconciliation"
  | "pricing_router"
  | "retail_pricing_verification"
  | "ebay_listing_prep";

export type RetrievalStatus =
  | "no_result"
  | "summary_only"
  | "needs_fallback"
  | "parts_partial"
  | "bom_complete"
  | "failed";

export type PromptScenario = {
  id: string;
  name: string;
  type: PromptScenarioType;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  requiredInputs: string[];
  expectedJsonShape?: unknown;
  enabled: boolean;
};

export type PromptRunStatus = "pending" | "running" | "complete" | "failed";

export type NormalizedModelOutput = {
  rawText: string;
  parsedJson: unknown | null;
  parseError: string | null;
  jsonKeys: string[];
};

export type PromptValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  acceptedRows: Array<Record<string, unknown>>;
  rejectedRows: Array<{ row: Record<string, unknown>; reason: string }>;
  completenessStatus?: RetrievalStatus | "unknown";
};

export type PromptRunOutput = {
  id: string;
  runId: string;
  slotId: ModelSlot["id"];
  modelName: ModelSlot["modelName"];
  provider: ModelProvider;
  rawOutput: string;
  parsedJson: unknown | null;
  validationStatus: "valid" | "invalid" | "warning" | "unparsed";
  errors: string[];
  warnings: string[];
  latencyMs: number;
  createdAt: string;
  mock: boolean;
};

export type PromptRun = {
  id: string;
  scenarioId: string;
  scenarioType: PromptScenarioType;
  scenarioName: string;
  inputPayload: Record<string, unknown>;
  modelSlots: ModelSlot[];
  outputs: PromptRunOutput[];
  status: PromptRunStatus;
  error?: string | null;
  createdAt: string;
};

export type SupplierId =
  | "sears-partsdirect"
  | "encompass"
  | "repairclinic"
  | "ge"
  | "whirlpool"
  | "lg"
  | "samsung"
  | "manual-pdf"
  | "diagram-upload";

export type SupplierTaskAction = {
  supplierId: SupplierId;
  task: "diagrams" | "bom" | "pricing";
  scenarioType: PromptScenarioType;
  status: "placeholder" | "ready" | "blocked";
};

export type BrowserToolStage =
  | "idle"
  | "source_selected"
  | "browser_loaded"
  | "capture_planned"
  | "parse_planned"
  | "validate_planned";

export type BrowserSourceCapture = {
  id: string;
  label: string;
  sourceUrl: string;
  captureKind: "page" | "dom" | "xhr_json" | "diagram_image" | "manual_note";
  status: "planned" | "captured" | "blocked";
  rawPayload?: unknown;
  createdAt: string;
};

export type BrowserParserSession = {
  id: string;
  url: string;
  supplierId?: SupplierId;
  stage: BrowserToolStage;
  captures: BrowserSourceCapture[];
  notes: string[];
};
