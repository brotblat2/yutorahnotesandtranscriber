# Shiur Notes production website

This Worker deploys the existing `web-mvp/` frontend and the production `/api/*` backend together on one Cloudflare hostname.

## What the backend does

- Resolves YUTorah lecture pages through the `LectureData` endpoint and page fallback.
- Resolves old and new Kol Halashon links, including `GetMp3FileToPlay` endpoints.
- Validates that the source returned audio rather than HTML or JSON.
- Streams the remote audio into the Gemini Files API without routing it through Safari.
- Uses the same notes, transcript, maamar, Kol Halashon, and no-chart prompts as the Chrome extension.
- Rejects Gemini's `sorry can't access the audio file` placeholder instead of saving it as a successful note.
- Serves the frontend and API on one origin, so no public CORS proxy is needed.

## Local validation

```bash
cd web-worker
npm install
npm run check
```

For local development:

```bash
npm run dev
```

## One-time Cloudflare setup

1. Create or sign in to a Cloudflare account.
2. Create a scoped API token with permission to edit Cloudflare Workers.
3. Copy the Cloudflare account ID.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
5. Add these repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
6. Open **Actions → Deploy Production Website → Run workflow**.
7. The workflow deploys the Worker and static assets together and reports the new `workers.dev` URL.

The Gemini key is not stored in Cloudflare. The frontend sends the user's saved Gemini key to the Worker only for the active generation request.

## Routes

- `GET /api/health`
- `POST /api/resolve`
  - JSON: `{ "sourceUrl": "https://..." }`
- `POST /api/generate`
  - Header: `X-Gemini-Key: ...`
  - JSON: `{ "sourceUrl": "https://...", "type": "notes|transcript|maamar", "customPrompt": "" }`

## Deployment strategy

The production deployment workflow is manual until the initial Cloudflare account connection succeeds. After the first successful end-to-end test, it can be changed to deploy automatically on pushes to the website branch.
