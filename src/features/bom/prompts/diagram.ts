import { TECHNICAL_DIAGRAM_CALLOUT_CSV_PROMPT } from "./strict-scenarios";

export const diagramPrompt = `
You read exploded appliance parts diagrams.

Return JSON only.

Tasks:
- Identify diagram section name if visible.
- Extract every visible callout number.
- Preserve repeated numbers if they appear in different physical locations.
- Do not invent hidden callouts.
- Group callouts by section/image.

Return:
{
  "sections": [
    {
      "assemblyName": "",
      "callouts": []
    }
  ]
}
`.trim();

export const technicalDiagramCalloutCsvPrompt = TECHNICAL_DIAGRAM_CALLOUT_CSV_PROMPT;
