# AI Life Balance V13.4 — Cloudflare Worker

Architecture:
- Frontend/PWA: `public/`
- Cloudflare Worker: `worker.js`
- Gemini proxy: `/api/gemini`
- Secret: `GEMINI_API_KEY` in Cloudflare Worker secrets

Cloudflare Workers Build settings:
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

The Gemini API key must NOT be committed to GitHub or embedded in frontend JavaScript.
