# SpaceViewer architecture

## Product cut

- **Spatial Lab** — research monorepo (LiDAR, Gaussians, XGRIDS calibration, Experiences experiments). Runs locally.
- **SpaceViewer** — this app. Experiences-derived tour UI + **user-owned** LCC/LCC2/PLY. Deployable.

## Runtime (v0)

```
Browser
  ├─ SpaceViewerApp (upload / URL / folder)
  ├─ packageSession → Cache Storage + sv-fs-sw.js → /sv-pkg/<id>/…
  └─ ExperienceTourHost + LCC Web SDK 0.6.3 (Three.js UMD)
       ├─ Walk / orbit / quality presets
       ├─ Checkpoints (localStorage)
       ├─ Staging GLB / builtin chair
       └─ Wall surface overlays
```

No Python backend. Staging / surfaces / checkpoints use the same browser storage patterns as Experiences (`localStorage` / IndexedDB).

## Upload formats

| Input | Behaviour |
|-------|-----------|
| `.zip` with `meta.lcc2` / `meta.lcc` | Unzip → cache → LCC tour |
| Folder (directory picker) | Same |
| HTTPS URL to meta | Load directly (CORS must allow your origin) |
| `.ply` | Accepted; full Experiences tools deferred (SuperSplat preview planned) |

## Production storage (next)

Most effective:

1. Deploy **SpaceViewer** on Vercel (frontend only).
2. Add Firebase Storage (or R2): client uploads ZIP → cloud → get download base URL → open as LCC `dataPath` (same as “Open URL”).
3. Optional auth later so shares are private.

Keep Spatial Lab’s FastAPI **out** of this deploy.

## Porting from Spatial Lab

Source trees were copied from:

- `components/labs/experiences` → `components/viewer`
- `lib/labs/experiences` + `lcc*.ts` → `lib/viewer`
- `public/vendor/lcc-web-sdk`

When Experiences gains a stable feature, port the delta; don’t couple the two repos at runtime.
