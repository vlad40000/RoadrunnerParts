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
