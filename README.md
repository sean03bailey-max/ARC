# ACRCY Hub — Nexus + Core

One deployment, two pages:

- **Nexus** (`index.html`) — the QR resource board. This is the landing page.
- **Core** (`core.html`) — the officers' deliverables tracker.

Each has a button in its header that jumps to the other, so you only ever
need to share one link.

Both pages save through the same serverless function, `api/state.js`, into
one Upstash Redis database — Nexus and Core use separate keys inside it
(`acrcy-nexus-state` and `acrcy-tracker-state`), so their data never mixes.

## What changed from the Canva Code exports

- Removed the `/_sdk/*.js` Canva-only script tags (bootstrap, telemetry,
  data SDK, editing SDK) — they only exist inside Canva's own hosting and
  would 404 anywhere else.
- **Nexus** no longer depends on `window.dataSdk` / a Canva Sheet. It now
  saves the whole board (titles, links, image uploads, card order) to
  `/api/state?app=nexus` automatically as you edit — no manual save step
  required. QR uploads are resized client-side and stored as PNG data, so
  there's no separate file-storage bucket to configure.
- **Core** keeps the same shared-tracker behavior as before, just pointed
  at `/api/state?app=core`.
- Fixed the delete-card confirmation dialog jumping the page to the
  middle of the screen — the browser was auto-scrolling to bring the
  "Cancel" button into view the instant it appeared. Focusing it with
  `{ preventScroll: true }` stops that.
- The per-card "save" action on Nexus now exports the **whole card**
  (title, QR image, and link) as one PNG via `html2canvas`, not just the
  raw QR image — closer to what a "save this QR space" button should do.
- "Save Board" now does a real save-to-server plus (as before) downloads a
  JSON snapshot as a backup record.
- "Copy URL" and "Add Resource" work standalone now — no dependency on any
  Canva runtime.
- Added a proper favicon / apple-touch-icon generated from the ACRCY logo
  to both pages.

## Deploying it yourself

I can't push to your GitHub account for you — you'll need your own token
or the GitHub web UI for that. Here's the fastest path:

1. **Create a new GitHub repo** (e.g. `acrcy-hub`), then upload everything
   in this folder to it — either drag-and-drop on github.com ("Add file →
   Upload files") or via git:
   ```
   git init
   git add .
   git commit -m "Nexus + Core"
   git branch -M main
   git remote add origin https://github.com/<you>/acrcy-hub.git
   git push -u origin main
   ```
2. **Import the repo into Vercel** (vercel.com → Add New → Project → pick
   the repo). No framework preset needed — leave build settings default;
   this is static HTML plus one serverless function.
3. **After the first deploy, connect a database** (needed before saving
   will work):
   - In the Vercel project, go to **Storage → Browse Storage → Marketplace
     Database Providers → Upstash → Redis**, create one, then
     **Connect Project** to this project.
   - Go to **Deployments** and trigger **Redeploy** so the function picks
     up the new `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env
     vars Vercel injects automatically.
4. Visit your `*.vercel.app` URL — Nexus loads at `/`, Core at `/core.html`.

## Notes / limits

- Nexus polls-on-load, not continuously — reload the page to pick up
  another device's edits (matches how Core already behaved with its
  5-second poll for concurrent officers).
- QR images are stored as base64 PNG inside the same Redis record. Fine
  for normal QR codes (a few KB–100 KB each); avoid uploading huge photos
  into a QR slot.
- If two people edit the *same* field within the same few seconds on
  Core, the last save wins for that field — unchanged from before.
- The custom favicon and logo were generated from `ACRCYLogo.png` you
  provided; swap `assets/logo.png`, `assets/favicon.png`,
  `assets/favicon-32.png`, or `assets/apple-touch-icon.png` any time if
  you'd rather use a different crop.
