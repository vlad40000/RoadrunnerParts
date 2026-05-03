# Prompt Engineering Rubric

All stage prompts in the RoadrunnerParts BOM pipeline must adhere to the following 3-part structure to ensure token efficiency and deterministic output.

## 1. REMINDERS (1-3 bullets)
- Use concise, imperative bullets.
- Focus on hard constraints (e.g., "Do not estimate", "Distributor only").
- No redundant role-play or model instructions.

## 2. TASK (One sentence)
- A single, clear instruction defining the stage's goal.
- Must mention the input evidence and the expected output shape.

## 3. JSON SHAPE
- A clear, minimal template of the expected JSON return.
- Use string literals for enums (e.g., "status": "complete | partial | failed").
- Avoid complex nested schemas if a flat structure suffices.

## PROHIBITIONS
- NO model IDs or temperature configs.
- NO thinking/chain-of-thought instructions.
- NO duplicated role declarations.
- NO full workflow recaps or multi-stage context.
- NO example blocks (structured examples) unless strictly required for pattern matching.
