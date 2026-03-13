# Add Form Backend via Resend Email API

## Context

The submission form at [submit.astro](src/pages/submit.astro) is fully built with client-side validation but has no backend — submissions go nowhere (line 463: `// TODO: Hook up actual form submission to backend`). Since the site runs on Cloudflare via Astro's Cloudflare adapter, we can create an Astro API route that sends submissions as emails using **Resend** (free tier: 100 emails/day, supports attachments up to 40MB, works with just `fetch` — no SDK needed).

## Pre-requisites (manual steps)

1. Sign up at resend.com, verify the `scryingglass.argent.works` domain (add DNS records they provide)
2. Generate a Resend API key
3. Set the secret: `npx wrangler secret put RESEND_API_KEY`
4. For local dev, create `.dev.vars` with `RESEND_API_KEY=re_xxxxx`

## Implementation Steps

### 1. Create `src/env.d.ts` — TypeScript types for Cloudflare env

Type `locals.runtime.env.RESEND_API_KEY` so the API route has type safety.

### 2. Create `src/pages/api/submit.ts` — API endpoint

- Accept POST with `multipart/form-data`
- Extract fields: `authorName`, `email`, `storyTitle`, `manuscript` (File), `coverLetter`, `additionalNotes`
- Server-side validation (required fields, file size ≤ 10MB, allowed extensions, email format)
- Convert file to base64 (chunked loop, not spread operator — avoids stack overflow on large files)
- Send email via `fetch("https://api.resend.com/emails")` with attachment
- Email goes from `submissions@scryingglass.argent.works` to `scryingglass@argent.works`
- Return JSON `{ success: true }` or `{ error: "message" }` with appropriate status codes

### 3. Update `src/pages/submit.astro` — wire up the form

Replace the simulated `setTimeout` block (lines 463–478) with:

- Make the submit handler `async`
- `fetch("/api/submit", { method: "POST", body: new FormData(form) })`
- Handle success (show message, reset form) and error (show error, re-enable button) responses

## Files to Create/Modify

| File                      | Action                                                       |
| ------------------------- | ------------------------------------------------------------ |
| `src/env.d.ts`            | **Create** — Cloudflare env types                            |
| `src/pages/api/submit.ts` | **Create** — form processing + Resend email                  |
| `src/pages/submit.astro`  | **Modify** lines ~413–478 — real fetch instead of setTimeout |

No new dependencies needed. No changes to `wrangler.jsonc` or `package.json`.

## Verification

1. Create `.dev.vars` with a real Resend API key
2. Run `pnpm dev` (or `wrangler dev`)
3. Fill out the form and submit — confirm email arrives with attachment
4. Test validation: submit empty form, oversized file, wrong file type
5. Test error handling: temporarily use a bad API key, confirm user sees error message
