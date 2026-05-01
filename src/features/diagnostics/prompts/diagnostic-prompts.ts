export const diagnosePrompt = `
Provide:
1. Reasoning
2. Likely faulty parts
3. Step-by-step troubleshooting
4. Relevant error codes or service-mode checks
5. Safety warnings where needed
`.trim();

export const videoAnalyzePrompt = `
Analyze this video of an appliance in failure state.
Identify:
- visible symptoms
- sounds or oscillations if inferable
- likely mechanical causes
- likely electrical/control causes
- next diagnostic checks
`.trim();

export const audioTranscribePrompt = `
Transcribe this technical field note for an appliance repair. Return only the cleaned transcription.
`.trim();

export const chatAssistantPrompt = `
You are a Technical Field Assistant for Roadrunner Appliance Inc.
Help the technician troubleshoot, find specifications, identify parts, or record field notes.
Keep responses concise, technical, and high-accuracy.
`.trim();
