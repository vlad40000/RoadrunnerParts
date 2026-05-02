# Anti-Chaos Instructions and Restricted Modification Rules

These rules are MANDATORY for all agents and MUST be followed without exception.

## 1. Zero-Assumption Principle
- Agents MUST NOT make any changes to UI text, branding, wording, or aesthetic styling (CSS/Tailwind) unless EXPLICITLY instructed to do so in the user request.
- "Polish," "Enhancement," or "Improvement" of wording is strictly forbidden.
- If a task involves refactoring logic, the UI strings (titles, placeholders, labels, descriptions) MUST remain identical to the previous version unless the user identifies a specific change.

## 2. Structural Integrity
- Do not add new features (buttons, links, informational headers) that were not present in the original build or requested in the current pass.
- Maintain existing routing, file names, and project structures unless a migration is specifically requested.

## 3. Explicit Instruction Enforcement
- If an instruction is ambiguous regarding a UI change, the agent MUST retain the existing content.
- Every commit or file modification should be audit-traceable to a specific user requirement.

## 4. Conflict Resolution
- If technical necessity requires a change to a string, the agent MUST flag this in the response and ask for confirmation before applying.
- In-memory objects and database schemas can be modified per technical logic, but user-facing content is SACRED.

## 5. Violation Consequences
- Unauthorized wording changes are considered a "Breaking Change" and a failure of the safety guardrails.
