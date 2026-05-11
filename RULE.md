# Build Rules for Profix Parts Finder

## Model Configuration

Roadrunner has two different AI lanes:

1. **Evidence automation lane**: BOM extraction, source review, nameplate OCR, supplier routing, listing-material generation, and any workflow that claims facts needed to post to eBay.
2. **Office editor lane**: Frontend/back-office editing tools where an operator is changing listing text, layout, wording, or review fields on the fly.

### Evidence Automation Lane
- Use the Gemini API via `@google/generative-ai`.
- Default to `gemini-3.1-flash-lite` unless the operator explicitly selects another Gemini model for that run.
- Model output is not source evidence. OEM part rows, prices, compatibility, condition, images, and completeness claims still require provider evidence, captured JSON, manuals, database records, or operator approval.

### Office Editor Lane
- Use the Gemini API, but expose full Gemini API model selection to the operator.
- Operators may select any Gemini model ID enabled for the configured `GEMINI_API_KEY`, including stable, preview, latest, and experimental Gemini IDs.
- Image/visual editor tools may use image-capable Gemini models such as Nano Banana 2 / Gemini 3.1 Flash Image Preview (`gemini-3.1-flash-image-preview`) when the operator selects them.
- Custom model IDs are allowed when they start with `gemini-`.
- Editor output is a draft/change suggestion applied to frontend fields. It does not become source evidence or eBay posting truth by itself.

### Provider Boundary
- Do not switch Roadrunner AI stages to OpenAI, Anthropic, OpenRouter, or other non-Gemini providers unless explicitly instructed by the USER.
- Model choices must stay visible in the request, UI, logs, or saved config.

## Core Technical Stack
- **Framework**: [Next.js](https://nextjs.org) using **App Router** and **React Server Components (RSC)**.
- **Runtime**: Target **Vercel Edge Runtime** for all API logic and serverless functions.
- **Database**: Strictly use **Neon (Serverless Postgres)** with the `@neondatabase/serverless` driver.
- **Styling**: Exclusively use **Tailwind CSS** for rapid, responsive UI development.

## AI Implementation Guideline
- Use the **Gemini API** via `@google/generative-ai` only.
- Never suggest or use OpenAI, Anthropic, OpenRouter, or other non-Gemini providers unless explicitly instructed by the USER.
- Ensure all backend keys (e.g., `GEMINI_API_KEY`) are NOT prefixed with `NEXT_PUBLIC_`.
