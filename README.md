# SpaceViewer

**Upload your scan. Walk the space.**  

Standalone product cloned from [Spatial Lab](../SpatialLab) Experiences: LCC / LCC2 walkthrough, quality lever, checkpoints, virtual staging, wall surfaces. Spatial Lab stays the local research lab; **this** app is what you deploy and share.

## Quick start

```bash
cd spaceviewer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Upload a **ZIP** of an LCC/LCC2 package (must contain `meta.lcc2` or `meta.lcc`), or pick the **folder**, or paste a public **URL** to `meta.lcc2`.
2. Walk with pads / keyboard; use **Graphics** Performance ↔ Quality; open **Dev** for staging and walls.

PLY upload is accepted; full tour tools need LCC2 (PLY preview via SuperSplat is planned).

## How local packages work

Large packages are **not** committed to git. On open, files go into the browser **Cache Storage** and a service worker serves them at `/sv-pkg/<id>/…` so the XGRIDS LCC SDK can load tiles relative to `meta.lcc2`.

## Deploy (efficient path)

| Piece | Choice |
|-------|--------|
| App | **Vercel** — single Next.js project (this repo). **No** FastAPI multi-service. |
| User content (production) | **Firebase Storage** or **Cloudflare R2** — upload ZIP → extract or store → HTTPS URLs → Open URL / future auto-open |
| SDK vendor | Already in `public/vendor/lcc-web-sdk` (~3.5 MB) — fine in git |

Do **not** put proprietary sample apartments in this repo. Users bring their own packages.

Firebase is a good fit if you already use it: Storage for packages + optional Hosting later. R2 is often cheaper for heavy download traffic.

See `docs/ARCHITECTURE.md`.

## Relation to Spatial Lab

| Spatial Lab | SpaceViewer |
|-------------|-------------|
| LiDAR, calibration, Experiences R&D | Shareable viewer |
| Local samples + FastAPI | User upload / CDN URLs |
| Feature source of truth | Port mature Features here |

## License / XGRIDS

Vendored LCC Web SDK and any user-uploaded LCC data are subject to XGRIDS terms. Confirm commercial license / `appKey` before production.
