# Build Rules for Profix Parts Finder

## Model Configuration (STRICT LOCK)
You MUST use these specific Gemini models. **DO NOT change these identifiers under any circumstances unless explicitly instructed by the USER.**

- **Gemini 3 Pro Preview (`gemini-3-pro-preview`)**: Use for complex planning, system architecture, and exhaustive search-grounded BOM queries.
- **Gemini 3 Flash Preview (`gemini-3-flash-preview`)**: Use for high-velocity code generation, nameplate OCR, and identity review.

> [!IMPORTANT]
> **NO UNAUTHORIZED MODEL CHANGES**: Changing the model strings in `lib/gemini.js` or elsewhere to any older versions (1.5, 2.0, etc.) is STRICTLY PROHIBITED.

## Core Technical Stack
- **Framework**: [Next.js](https://nextjs.org) using **App Router** and **React Server Components (RSC)**.
- **Runtime**: Target **Vercel Edge Runtime** for all API logic and serverless functions.
- **Database**: Strictly use **Neon (Serverless Postgres)** with the `@neondatabase/serverless` driver.
- **Styling**: Exclusively use **Tailwind CSS** for rapid, responsive UI development.

## AI Implementation Guideline
- Use the **Gemini API** via `@google/generative-ai` only.
- Never suggest or use OpenAI models.
- Ensure all backend keys (e.g., `GEMINI_API_KEY`) are NOT prefixed with `NEXT_PUBLIC_`.
