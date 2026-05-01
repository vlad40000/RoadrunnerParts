# Agent Manager Instruction

## Gemini 3 Temperature & Reliability Policy

For Gemini 3 agents, **keep temperature at default 1.0.**

- **Do not create a Temp-0 frontline agent.** 
- Reliability must come from narrow tool exposure, mode `ANY` for required calls, explicit `allowed_function_names`, flat schemas, Zod validation, deterministic DB writes, and completion gates.
- **Fallback Protocol:** Fallback means escalating to a stronger model (e.g., from Flash to Pro) or narrower repair prompt, not changing temperature. Keep fallback temperature at default 1.0.
- **Exceptions:** Only use a low temperature if testing proves a specific non-Gemini-3 model/stage benefits from it. Do not apply Temp-0 as a general reliability mechanism for Gemini 3.

## Frontline vs Fallback Configuration

**Recommended Frontline Setup:**
- Model: Gemini 3 Flash or Pro
- Temperature: `1.0` (Default)
- Mode: `ANY` (for required calls)
- Allowed Functions: Stage-specific only
- Purpose: Choose the next required function call

**Recommended Fallback Setup:**
- Model: Gemini 3 Pro
- Temperature: `1.0` (Default)
- Mode: `ANY` or `AUTO` by stage
- Allowed Functions: Same stage or repair tools only
- Purpose: Recover from ambiguity, schema failure, source conflict, or repeated failed tool calls

**Final Response Agent Setup:**
- Temperature: `1.0` (Default)
- Mode: `NONE`
- Purpose: Summarize state without calling tools
