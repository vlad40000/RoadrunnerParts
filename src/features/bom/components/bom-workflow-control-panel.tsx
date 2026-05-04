"use client";

import { BomPromptWorkspace } from "./bom-prompt-workspace";

type BomWorkflowControlPanelProps = {
  initialModel?: string;
  initialSerial?: string;
  initialJobId?: string;
};

export function BomWorkflowControlPanel(props: BomWorkflowControlPanelProps) {
  return <BomPromptWorkspace {...props} />;
}
