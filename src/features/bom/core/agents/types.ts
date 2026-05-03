// import 'server-only';

export interface JobPacket {
  jobId: string;
  brand: string | null;
  manufacturerFamily: string | null;
  model: string;
  serial: string | null;
  type: string | null;
  manufacturedDate: string | null;
  ocrConfidence: number;
  searchConfidence: number;
}

export interface RoutingPlan {
  primaryLane: 'manufacturer_oem' | 'public_all_parts' | 'grouped_diagrams';
  secondaryLane: 'public_all_parts' | 'grouped_diagrams' | 'none';
  fallbackLanes: string[];
  pricingLane: 'filtered_subset_only' | 'full_bom';
}

export interface AgentResult {
  agent: string;
  status: 'success' | 'partial' | 'failed';
  source: string;
  exactModelConfirmed?: boolean;
  directBomFound?: boolean;
  rowsFound?: number;
  expectedPartsTotal?: number;
  rowsAccepted?: number;
  coverageConfidence?: number;
  coverageAfterMerge?: number;
  groupsRun?: number;
  newUniqueRows?: number;
  remainingGaps?: string[];
  resolvedMissingCategories?: string[];
  unresolved?: string[];
  notes?: string[];
  error?: string;
  masterParts?: any[];
}

export interface MasterBom {
  jobId: string;
  rows: any[];
  sources: any[];
  coverageScore: number;
  status: string;
  issues: string[];
}
