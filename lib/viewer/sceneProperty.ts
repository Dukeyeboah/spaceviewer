import type { ExperienceProperty } from "@/lib/viewer/experiences/types";
import type { OpenedScene } from "@/lib/viewer/packageSession";

/** Minimal Experiences property wrapper for an opened SpaceViewer scene. */
export function propertyFromOpenedScene(scene: OpenedScene): ExperienceProperty {
  return {
    id: scene.id,
    title: scene.label,
    description:
      scene.kind === "lcc"
        ? "Your uploaded LCC / LCC2 space — SpaceViewer"
        : "PLY open — walk/staging/surfaces need LCC2 (PLY preview coming next)",
    dataPath: scene.dataPath,
    sizeHint: scene.source,
    branding: { accent: "#c4a574", tagline: "SpaceViewer" },
    nav: { defaultMode: "first-person", maxSplats: 1_500_000, collision: true },
    viewpointsReady: true,
    floors: [],
    viewpoints: [],
    hotspots: [],
  };
}
