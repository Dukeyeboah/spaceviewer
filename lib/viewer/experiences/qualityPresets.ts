/**
 * LAB EXP-02 — rendering quality / performance presets for LCC2 tours.
 * Budgets are starting benchmarks; tune per device in Dev if needed.
 */

export type QualityPresetId = "performance" | "balanced" | "quality";

export type QualityPreset = {
  id: QualityPresetId;
  label: string;
  /** Cap for lcc.setMaxSplats (LCC2). */
  maxSplats: number;
  /** Cap for lcc.setMaxDistance (metres). */
  maxDistance: number;
  /** Renderer setPixelRatio upper bound. */
  pixelRatioCap: number;
  note: string;
};

export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  performance: {
    id: "performance",
    label: "Performance",
    maxSplats: 750_000,
    maxDistance: 35,
    pixelRatioCap: 1,
    note: "Lower splat budget + 1× pixel ratio — prefer on M-series when choppy",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    maxSplats: 1_500_000,
    maxDistance: 55,
    pixelRatioCap: 1.5,
    note: "Default — clarity vs smooth walk",
  },
  quality: {
    id: "quality",
    label: "Quality",
    maxSplats: 2_500_000,
    maxDistance: 80,
    pixelRatioCap: 2,
    note: "Higher detail when the GPU keeps up",
  },
};

export const DEFAULT_QUALITY_PRESET: QualityPresetId = "balanced";

const QUALITY_STORE_KEY = "spatial-lab.experiences.quality.v1";

const PRESET_ORDER: QualityPresetId[] = ["performance", "balanced", "quality"];

export function isQualityPresetId(v: string): v is QualityPresetId {
  return v === "performance" || v === "balanced" || v === "quality";
}

/** Ordered list for lever / segmented UI (Performance → Quality). */
export function qualityPresetOrder(): QualityPresetId[] {
  return PRESET_ORDER;
}

export function loadQualityPresetId(): QualityPresetId {
  if (typeof window === "undefined") return DEFAULT_QUALITY_PRESET;
  try {
    const raw = window.localStorage.getItem(QUALITY_STORE_KEY);
    if (raw && isQualityPresetId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_QUALITY_PRESET;
}

export function saveQualityPresetId(id: QualityPresetId) {
  try {
    window.localStorage.setItem(QUALITY_STORE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Optional CDN / blob base for LCC packages (no trailing slash).
 * Catalog paths stay relative (`/labs/lcc-samples/...`); when this is set,
 * they resolve to `${base}/labs/lcc-samples/...` for Vercel + external hosting.
 */
export function resolveExperienceDataPath(dataPath: string): string {
  if (dataPath.startsWith("http://") || dataPath.startsWith("https://")) return dataPath;
  const base = (process.env.NEXT_PUBLIC_LCC_ASSET_BASE ?? "").replace(/\/$/, "");
  if (!base) return dataPath;
  return `${base}${dataPath.startsWith("/") ? dataPath : `/${dataPath}`}`;
}
