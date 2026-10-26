"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExperienceTourHost,
  type CameraPoseSample,
  type TourHostHandle,
  type TourHostStats,
  type TourNavMode,
} from "@/components/viewer/ExperienceTourHost";
import { QualityLever } from "@/components/viewer/QualityLever";
import { WalkOnScreenControls } from "@/components/viewer/WalkOnScreenControls";
import { ExpDevSection } from "@/components/viewer/ExpDevSection";
import { StagingEditor, createPlacementFromHit } from "@/components/viewer/StagingEditor";
import { SurfaceEditor, type SurfaceEditorMode } from "@/components/viewer/SurfaceEditor";
import {
  DEFAULT_QUALITY_PRESET,
  QUALITY_PRESETS,
  loadQualityPresetId,
  saveQualityPresetId,
  type QualityPresetId,
} from "@/lib/viewer/experiences/qualityPresets";
import {
  listStagingPlacements,
  saveStagingPlacement,
} from "@/lib/viewer/experiences/stagingStorage";
import {
  BUILTIN_CHAIR_ASSET,
  type StagingAssetRef,
  type StagingPlacement,
  type StagingTransformMode,
  type Vec3 as StagingVec3,
} from "@/lib/viewer/experiences/stagingTypes";
import type { SurfaceDepthDiag, SurfaceRenderPreset } from "@/lib/viewer/experiences/surfaceOcclusion";
import { listSurfaceOverlays, saveSurfaceOverlay } from "@/lib/viewer/experiences/surfaceStorage";
import type {
  SurfaceOverlay,
  SurfacePickMeta,
  Vec3 as SurfaceVec3,
} from "@/lib/viewer/experiences/surfaceTypes";
import {
  loadOverrides,
  mergeContent,
  removeOverrideViewpoint,
  saveViewpoint,
  type ExperienceOverrides,
} from "@/lib/viewer/experiences/storage";
import type { CheckpointTransitionMode, ExperienceViewpoint } from "@/lib/viewer/experiences/types";
import { LCC_SDK_VERSION_LABEL } from "@/lib/viewer/lccSdk";
import {
  clearPackageSession,
  openFromUrl,
  openLccFromFolder,
  openLccFromZip,
  openPlyFile,
  type OpenedScene,
} from "@/lib/viewer/packageSession";
import { propertyFromOpenedScene } from "@/lib/viewer/sceneProperty";

const EMPTY_OVERRIDES: ExperienceOverrides = { viewpoints: [], hotspots: [] };

/**
 * SpaceViewer — upload-first Experiences clone.
 */
export function SpaceViewerApp() {
  const [scene, setScene] = useState<OpenedScene | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const property = useMemo(() => (scene ? propertyFromOpenedScene(scene) : null), [scene]);
  const [overrides, setOverrides] = useState<ExperienceOverrides>(EMPTY_OVERRIDES);
  useEffect(() => {
    if (!property) return;
    setOverrides(loadOverrides(property.id));
  }, [property?.id]);

  const content = useMemo(
    () => (property ? mergeContent(property, overrides) : null),
    [property, overrides],
  );

  const hostRef = useRef<TourHostHandle | null>(null);
  const walkApi = useMemo(
    () => ({
      setVirtualMove: (x: number, z: number) => hostRef.current?.setVirtualMove(x, z),
      setVirtualLook: (yawDir: number, pitchDir: number) => hostRef.current?.setVirtualLook(yawDir, pitchDir),
      clearVirtualInput: () => hostRef.current?.clearVirtualInput(),
    }),
    [],
  );

  const [navMode, setNavMode] = useState<TourNavMode>("first-person");
  const [qualityId, setQualityId] = useState<QualityPresetId>(DEFAULT_QUALITY_PRESET);
  const quality = QUALITY_PRESETS[qualityId];
  const setQuality = useCallback((id: QualityPresetId) => {
    setQualityId(id);
    saveQualityPresetId(id);
  }, []);
  useEffect(() => {
    setQualityId(loadQualityPresetId());
  }, []);

  const [collisionOn, setCollisionOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [devOpen, setDevOpen] = useState(false);
  const [padsOpen, setPadsOpen] = useState(true);
  const [stats, setStats] = useState<TourHostStats | null>(null);
  const [fade, setFade] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [flyTo, setFlyTo] = useState<{
    viewpoint: ExperienceViewpoint;
    token: number;
    transition: CheckpointTransitionMode;
  } | null>(null);
  const [activeVpId, setActiveVpId] = useState<string | null>(null);
  const [transitionMode] = useState<CheckpointTransitionMode>("smooth");
  const [sampleToken, setSampleToken] = useState(0);
  const [pendingSample, setPendingSample] = useState<CameraPoseSample | null>(null);
  const [vpName, setVpName] = useState("");

  const [stagingPlacements, setStagingPlacements] = useState<StagingPlacement[]>([]);
  const [stagingSelectedId, setStagingSelectedId] = useState<string | null>(null);
  const [stagingPlaceMode, setStagingPlaceMode] = useState(false);
  const [stagingTransformMode, setStagingTransformMode] = useState<StagingTransformMode>("translate");
  const [stagedVisible, setStagedVisible] = useState(true);
  const [stagingProxyDebug, setStagingProxyDebug] = useState(false);
  const [stagingDraftAsset, setStagingDraftAsset] = useState<StagingAssetRef>(BUILTIN_CHAIR_ASSET);
  const [stagingDraftName, setStagingDraftName] = useState("Chair");
  const [stagingDims, setStagingDims] = useState<{
    size: StagingVec3;
    position: StagingVec3;
    rotation: StagingVec3;
    scale: StagingVec3;
  } | null>(null);

  const [surfaceOverlays, setSurfaceOverlays] = useState<SurfaceOverlay[]>([]);
  const [surfacesVisible, setSurfacesVisible] = useState(true);
  const [surfaceSelectedId, setSurfaceSelectedId] = useState<string | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceEditorMode>("idle");
  const [surfaceLastPick, setSurfaceLastPick] = useState<SurfacePickMeta | null>(null);
  const [surfaceCornerHits, setSurfaceCornerHits] = useState<{ point: SurfaceVec3; normal: SurfaceVec3 }[]>([]);
  const [surfaceRenderPreset, setSurfaceRenderPreset] = useState<SurfaceRenderPreset>("default");
  const [surfaceClipTest, setSurfaceClipTest] = useState(false);
  const [surfaceSemanticProbe, setSurfaceSemanticProbe] = useState(false);
  const [surfaceCollisionDepthProxy, setSurfaceCollisionDepthProxy] = useState(false);
  const [surfaceDragEnabled, setSurfaceDragEnabled] = useState(false);
  const [surfaceDepthDiag, setSurfaceDepthDiag] = useState<SurfaceDepthDiag | null>(null);
  const [surfaceLabNote, setSurfaceLabNote] = useState<string | null>(null);

  const refreshStaging = useCallback(() => {
    if (!property) return;
    setStagingPlacements(listStagingPlacements(property.id));
  }, [property]);
  const refreshSurfaces = useCallback(() => {
    if (!property) return;
    setSurfaceOverlays(listSurfaceOverlays(property.id));
  }, [property]);

  useEffect(() => {
    refreshStaging();
    refreshSurfaces();
  }, [refreshStaging, refreshSurfaces]);

  const closeScene = async () => {
    if (scene?.kind === "lcc" && (scene.source === "zip" || scene.source === "folder")) {
      await clearPackageSession(scene.id);
    }
    if (scene?.kind === "ply" && scene.objectUrl) URL.revokeObjectURL(scene.objectUrl);
    setScene(null);
    setOpenError(null);
  };

  const runOpen = async (fn: () => Promise<OpenedScene> | OpenedScene) => {
    setOpening(true);
    setOpenError(null);
    try {
      const next = await fn();
      if (scene) await closeScene();
      setScene(next);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  const goViewpoint = (vp: ExperienceViewpoint) => {
    setActiveVpId(vp.id);
    setFlyTo({ viewpoint: vp, token: Date.now(), transition: transitionMode });
  };

  const saveCheckpoint = () => {
    if (!property || !pendingSample || !vpName.trim()) return;
    const vp: ExperienceViewpoint = {
      id: `vp-${Date.now().toString(36)}`,
      name: vpName.trim(),
      order: content?.viewpoints.length ?? 0,
      sceneId: property.id,
      position: pendingSample.position,
      target: [
        pendingSample.position[0] + Math.sin(pendingSample.yaw),
        pendingSample.position[1],
        pendingSample.position[2] - Math.cos(pendingSample.yaw),
      ],
      yaw: pendingSample.yaw,
      icon: "camera",
    };
    saveViewpoint(property.id, vp);
    setOverrides(loadOverrides(property.id));
    setPendingSample(null);
    setVpName("");
  };

  const accent = property?.branding?.accent ?? "#c4a574";

  if (!scene || !property || !content) {
    return (
      <div className="sv-landing" style={{ ["--exp-accent" as string]: accent }}>
        <header className="sv-hero">
          <p className="sv-brand">SpaceViewer</p>
          <h1>Open your space</h1>
          <p className="sv-lead">
            Upload an LCC / LCC2 package or open a hosted URL. Walk, stage furniture, and customise walls —
            the Experiences toolkit in a shareable app.
          </p>
        </header>

        <div className="sv-open-card">
          <label className="sv-file">
            <span>ZIP package (LCC / LCC2)</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={opening}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runOpen(() => openLccFromZip(f));
                e.target.value = "";
              }}
            />
          </label>
          <label className="sv-file">
            <span>Folder (contains meta.lcc2)</span>
            <input
              type="file"
              // @ts-expect-error webkitdirectory is widely supported
              webkitdirectory=""
              directory=""
              multiple
              disabled={opening}
              onChange={(e) => {
                const list = e.target.files;
                if (list?.length) void runOpen(() => openLccFromFolder(list));
                e.target.value = "";
              }}
            />
          </label>
          <label className="sv-file">
            <span>PLY (preview — full tour tools need LCC2)</span>
            <input
              type="file"
              accept=".ply"
              disabled={opening}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runOpen(() => openPlyFile(f));
                e.target.value = "";
              }}
            />
          </label>
          <div className="sv-url-row">
            <input
              type="url"
              placeholder="https://…/meta.lcc2"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              disabled={opening}
            />
            <button
              type="button"
              disabled={opening || !urlDraft.trim()}
              onClick={() => void runOpen(() => openFromUrl(urlDraft))}
            >
              Open URL
            </button>
          </div>
          {opening && <p className="exp-hint">Opening… large packages can take a minute.</p>}
          {openError && <p className="sv-error">{openError}</p>}
        </div>

        <footer className="sv-foot">
          <p>
            Ported from Spatial Lab Experiences. User files stay in this browser (Cache Storage) unless you later
            wire Firebase / R2. LCC SDK {LCC_SDK_VERSION_LABEL}.
          </p>
        </footer>
      </div>
    );
  }

  if (scene.kind === "ply") {
    return (
      <div className="sv-landing">
        <header className="sv-hero">
          <p className="sv-brand">SpaceViewer</p>
          <h1>{scene.label}</h1>
          <p className="sv-lead">
            PLY upload is accepted. Full walk / staging / wall tools require an LCC2 package. A SuperSplat PLY
            preview mode is next.
          </p>
          <button type="button" className="sv-primary" onClick={() => void closeScene()}>
            Choose another file
          </button>
        </header>
      </div>
    );
  }

  return (
    <div className={`exp-page${panelOpen ? "" : " panel-collapsed"}`} style={{ ["--exp-accent" as string]: accent }}>
      <ExperienceTourHost
        ref={hostRef}
        key={property.dataPath}
        dataPath={property.dataPath}
        navMode={navMode}
        quality={quality}
        collisionEnabled={collisionOn}
        hotspots={[]}
        viewpoints={content.viewpoints}
        floor={null}
        flyTo={flyTo}
        placeHotspotMode={false}
        posePreview={pendingSample}
        hotspotPreview={null}
        onStats={setStats}
        onHotspotSelect={() => {}}
        onViewpointSelect={goViewpoint}
        onHotspotPlaced={() => {}}
        onCameraSample={setPendingSample}
        onPoseTick={() => {}}
        onFade={setFade}
        onMapOutline={() => {}}
        resetToken={resetToken}
        sampleCameraToken={sampleToken}
        stagingPlacements={stagingPlacements}
        stagingVisible={stagedVisible}
        stagingEditEnabled={devOpen}
        stagingPlaceMode={devOpen && stagingPlaceMode}
        stagingSelectedId={stagingSelectedId}
        stagingTransformMode={stagingTransformMode}
        stagingProxyDebug={devOpen && stagingProxyDebug}
        onStagingPlace={(hit) => {
          const p = createPlacementFromHit(
            property.id,
            property.dataPath,
            stagingDraftAsset,
            stagingDraftName,
            hit.position,
          );
          refreshStaging();
          setStagingSelectedId(p.id);
          setStagingPlaceMode(false);
          setStagingTransformMode("translate");
        }}
        onStagingSelect={setStagingSelectedId}
        onStagingTransform={(id, next) => {
          const cur = listStagingPlacements(property.id).find((p) => p.id === id);
          if (!cur) return;
          saveStagingPlacement({ ...cur, ...next });
          refreshStaging();
        }}
        surfaceOverlays={surfaceOverlays}
        surfacesVisible={surfacesVisible}
        surfaceEditEnabled={devOpen}
        surfaceMode={devOpen ? surfaceMode : "idle"}
        surfaceSelectedId={surfaceSelectedId}
        surfaceCornerHits={surfaceCornerHits}
        onSurfacePick={(meta) => {
          setSurfaceLastPick(meta);
          setStagingPlaceMode(false);
        }}
        onSurfaceCornerHit={(hit) => {
          setSurfaceCornerHits((prev) => (prev.length >= 4 ? [...prev.slice(1), hit] : [...prev, hit]));
        }}
        onSurfaceSelect={(id) => {
          setSurfaceSelectedId(id);
          setSurfaceMode("idle");
        }}
        onSurfaceTransform={(id, next) => {
          const cur = listSurfaceOverlays(property.id).find((s) => s.id === id);
          if (!cur) return;
          saveSurfaceOverlay({ ...cur, ...next });
          refreshSurfaces();
        }}
        surfaceDragEnabled={devOpen && surfaceDragEnabled}
        surfaceRenderPreset={surfaceRenderPreset}
        surfaceClipTest={devOpen && surfaceClipTest}
        surfaceSemanticProbe={devOpen && surfaceSemanticProbe}
        surfaceCollisionDepthProxy={devOpen && surfaceCollisionDepthProxy}
        onSurfaceDepthDiag={setSurfaceDepthDiag}
        onSurfaceLabNote={setSurfaceLabNote}
        onStagingDims={setStagingDims}
      />

      <div className={`exp-fade${fade ? " on" : ""}`} aria-hidden />

      {navMode === "first-person" && (
        <WalkOnScreenControls api={walkApi} visible={padsOpen} />
      )}

      {panelOpen && (
        <aside className="exp-panel">
          <div className="exp-panel-top">
            <div className="exp-panel-titles">
              <div className="exp-brand">SpaceViewer</div>
              <h1>{property.title}</h1>
              <p className="exp-desc">{property.description}</p>
            </div>
            <button type="button" className="exp-panel-collapse" onClick={() => setPanelOpen(false)} title="Hide panel">
              ‹
            </button>
          </div>

          <div className="exp-staging-visitor">
            <button type="button" className={stagedVisible ? "on" : ""} onClick={() => setStagedVisible(true)}>
              Staged
            </button>
            <button type="button" className={!stagedVisible ? "on" : ""} onClick={() => setStagedVisible(false)}>
              No furniture
            </button>
            <button type="button" className={surfacesVisible ? "on" : ""} onClick={() => setSurfacesVisible(true)}>
              Surfaces
            </button>
            <button type="button" className={!surfacesVisible ? "on" : ""} onClick={() => setSurfacesVisible(false)}>
              Original walls
            </button>
          </div>

          <QualityLever value={qualityId} onChange={setQuality} />

          <b className="exp-sub">Checkpoints</b>
          {content.viewpoints.length === 0 ? (
            <p className="exp-hint">None yet — open Dev to capture.</p>
          ) : (
            <div className="exp-cp-grid">
              {content.viewpoints.map((vp) => (
                <button
                  key={vp.id}
                  type="button"
                  className={`exp-cp-tile-main${activeVpId === vp.id ? " on" : ""}`}
                  onClick={() => goViewpoint(vp)}
                >
                  {vp.name}
                </button>
              ))}
            </div>
          )}

          <div className="exp-toolbar">
            <button type="button" className={devOpen ? "exp-icon-btn on" : "exp-icon-btn"} onClick={() => setDevOpen((v) => !v)}>
              Dev
            </button>
            <button type="button" className="exp-icon-btn" onClick={() => setResetToken((n) => n + 1)}>
              Reset
            </button>
            <button type="button" className="exp-icon-btn" onClick={() => setNavMode((m) => (m === "first-person" ? "orbit" : "first-person"))}>
              {navMode === "first-person" ? "Orbit" : "Walk"}
            </button>
            <button type="button" className="exp-icon-btn" onClick={() => setPadsOpen((v) => !v)}>
              Pads
            </button>
            <button type="button" className="exp-icon-btn" onClick={() => void closeScene()}>
              Close
            </button>
          </div>

          {devOpen && (
            <div className="exp-dev">
              <div className="exp-dev-stats">
                {stats?.phase ?? "…"} · {stats?.fps ?? "—"} fps · SDK {LCC_SDK_VERSION_LABEL}
              </div>
              <label className="exp-check">
                <input type="checkbox" checked={collisionOn} onChange={(e) => setCollisionOn(e.target.checked)} />
                Collision
              </label>
              <ExpDevSection id="sv-checkpoints" title="Checkpoints" defaultOpen>
                <button type="button" onClick={() => setSampleToken((n) => n + 1)}>
                  Capture pose
                </button>
                {pendingSample && <div className="exp-hint ok">Pose locked</div>}
                <input placeholder="Name" value={vpName} onChange={(e) => setVpName(e.target.value)} />
                <button type="button" disabled={!pendingSample || !vpName.trim()} onClick={saveCheckpoint}>
                  Save checkpoint
                </button>
                {content.viewpoints.map((vp) => (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => {
                      removeOverrideViewpoint(property.id, vp.id);
                      setOverrides(loadOverrides(property.id));
                    }}
                  >
                    Delete {vp.name}
                  </button>
                ))}
              </ExpDevSection>
              <ExpDevSection id="sv-staging" title="Virtual staging" defaultOpen={false}>
                <StagingEditor
                  propertyId={property.id}
                  placements={stagingPlacements}
                  selectedId={stagingSelectedId}
                  placeMode={stagingPlaceMode}
                  transformMode={stagingTransformMode}
                  stagedVisible={stagedVisible}
                  proxyDebug={stagingProxyDebug}
                  draftAsset={stagingDraftAsset}
                  draftName={stagingDraftName}
                  liveDims={stagingDims}
                  onRefresh={refreshStaging}
                  onSelect={setStagingSelectedId}
                  onPlaceMode={setStagingPlaceMode}
                  onTransformMode={setStagingTransformMode}
                  onStagedVisible={setStagedVisible}
                  onProxyDebug={setStagingProxyDebug}
                  onDraftAsset={setStagingDraftAsset}
                  onDraftName={setStagingDraftName}
                />
              </ExpDevSection>
              <ExpDevSection id="sv-surfaces" title="Wall / surfaces" defaultOpen={false}>
                <SurfaceEditor
                  propertyId={property.id}
                  modelDataPath={property.dataPath}
                  surfaces={surfaceOverlays}
                  selectedId={surfaceSelectedId}
                  surfacesVisible={surfacesVisible}
                  mode={surfaceMode}
                  lastPick={surfaceLastPick}
                  cornerHits={surfaceCornerHits}
                  onRefresh={refreshSurfaces}
                  onSelect={setSurfaceSelectedId}
                  onSurfacesVisible={setSurfacesVisible}
                  onMode={setSurfaceMode}
                  onClearCorners={() => setSurfaceCornerHits([])}
                  depthDiag={surfaceDepthDiag}
                  labNote={surfaceLabNote}
                  renderPreset={surfaceRenderPreset}
                  onRenderPreset={setSurfaceRenderPreset}
                  clipTest={surfaceClipTest}
                  onClipTest={setSurfaceClipTest}
                  semanticProbe={surfaceSemanticProbe}
                  onSemanticProbe={setSurfaceSemanticProbe}
                  collisionDepthProxy={surfaceCollisionDepthProxy}
                  onCollisionDepthProxy={setSurfaceCollisionDepthProxy}
                  dragEnabled={surfaceDragEnabled}
                  onDragEnabled={setSurfaceDragEnabled}
                />
              </ExpDevSection>
            </div>
          )}
        </aside>
      )}

      {!panelOpen && (
        <button type="button" className="exp-panel-tab" onClick={() => setPanelOpen(true)}>
          Panel
        </button>
      )}
    </div>
  );
}
