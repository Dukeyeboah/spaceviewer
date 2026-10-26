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
  ensureServiceWorker,
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
  const [fileNotice, setFileNotice] = useState<string | null>(null);

  useEffect(() => {
    void ensureServiceWorker().catch(() => {});
  }, []);

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
  const [eyeDrop, setEyeDrop] = useState(0);
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
    setFileNotice(null);
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

  if (!scene || !property || !content) {
    return (
      <div className="sv-landing">
        <div className="sv-welcome">
          <p className="sv-brand">SpaceViewer</p>
          <label className={`sv-upload${opening ? " is-busy" : ""}`}>
            <span>{opening ? "Opening" : "Upload"}</span>
            <input
              type="file"
              disabled={opening}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const name = f.name.toLowerCase();
                const zip =
                  name.endsWith(".zip") ||
                  f.type === "application/zip" ||
                  f.type === "application/x-zip-compressed";
                if (zip) {
                  void runOpen(() => openLccFromZip(f));
                  return;
                }
                if (name.endsWith(".ply")) {
                  void runOpen(() => openPlyFile(f));
                  return;
                }
                setFileNotice(
                  "Upload a ZIP of a full LCC or LCC2 package — the scene file together with data.bin — or a .ply point cloud.",
                );
              }}
            />
          </label>
          {opening && <p className="sv-status">Large packages can take a minute.</p>}
        </div>
        {(fileNotice || openError) && !opening && (
          <div className="sv-modal" role="dialog" aria-modal="true" aria-labelledby="sv-notice-title">
            <div className="sv-modal-card">
              <p className="sv-brand" id="sv-notice-title">SpaceViewer</p>
              <p className="sv-status">{fileNotice || openError}</p>
              <button
                type="button"
                className="sv-upload"
                onClick={() => {
                  setFileNotice(null);
                  setOpenError(null);
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (scene.kind === "ply") {
    return (
      <div className="sv-landing">
        <div className="sv-welcome">
          <p className="sv-brand">SpaceViewer</p>
          <p className="sv-status">{scene.label}</p>
          <p className="sv-status">PLY preview is next. Walk tools need an LCC package.</p>
          <button type="button" className="sv-upload" onClick={() => void closeScene()}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`exp-page sv-session${panelOpen ? "" : " panel-collapsed"}`} style={{ ["--exp-accent" as string]: "#111" }}>
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
        eyeDrop={eyeDrop}
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

      {navMode === "orbit" && (
        <>
          <div className="sv-orbit-orb" aria-hidden />
          <p className="sv-orbit-hint">Click and drag the screen to orbit around it</p>
        </>
      )}

      {navMode === "first-person" && padsOpen && (
        <>
          <div className="exp-nav-dock exp-nav-dock-left">
            <WalkOnScreenControls api={walkApi} visible which="move" />
          </div>
          <div className="exp-nav-dock exp-nav-dock-right">
            <WalkOnScreenControls api={walkApi} visible which="look" />
          </div>
        </>
      )}

      {panelOpen && (
        <aside className="exp-panel">
          <div className="exp-panel-top">
            <div className="exp-panel-titles">
              <div className="exp-brand">SpaceViewer</div>
              <h1>{property.title}</h1>
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

          <div className="exp-quality-lever" role="group" aria-label="Camera height">
            <div className="exp-quality-lever-head">
              <span className="exp-quality-lever-label">Height</span>
              <span className="exp-quality-lever-value">{eyeDrop === 0 ? "Default" : `−${Math.round(eyeDrop * 100)} cm`}</span>
            </div>
            <input
              className="exp-quality-lever-range"
              type="range"
              min={0}
              max={120}
              step={5}
              value={120 - Math.round(eyeDrop * 100)}
              aria-valuetext={eyeDrop === 0 ? "Default height" : `${Math.round(eyeDrop * 100)} centimetres lower`}
              onChange={(e) => setEyeDrop((120 - Number(e.target.value)) / 100)}
            />
          </div>

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
            <button type="button" className={devOpen ? "exp-icon-btn sv-tool-icon on" : "exp-icon-btn sv-tool-icon"} onClick={() => setDevOpen((v) => !v)} aria-label="Dev" title="Dev">
              <ToolIcon name="dev" />
            </button>
            <button
              type="button"
              className="exp-icon-btn sv-tool-icon"
              onClick={() => setNavMode((m) => (m === "first-person" ? "orbit" : "first-person"))}
              aria-label={navMode === "first-person" ? "Orbit" : "Walk"}
              title={navMode === "first-person" ? "Orbit" : "Walk"}
            >
              <ToolIcon name={navMode === "first-person" ? "orbit" : "walk"} />
            </button>
            <button
              type="button"
              className={padsOpen ? "exp-icon-btn sv-tool-icon on" : "exp-icon-btn sv-tool-icon"}
              onClick={() => setPadsOpen((v) => !v)}
              aria-label="Pads"
              title="Pads"
            >
              <ToolIcon name="pads" />
            </button>
            <button type="button" className="exp-icon-btn sv-tool-icon" onClick={() => setResetToken((n) => n + 1)} aria-label="Reset" title="Reset">
              <ToolIcon name="reset" />
            </button>
            <button type="button" className="exp-icon-btn sv-tool-icon" onClick={() => void closeScene()} aria-label="Close" title="Close">
              <ToolIcon name="close" />
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
              <ExpDevSection id="sv-staging" title="Upload objects" defaultOpen={false}>
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
        <button type="button" className="exp-panel-tab" onClick={() => setPanelOpen(true)} aria-label="Show panel" title="Show panel">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 2.2v11.6" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name: "dev" | "walk" | "orbit" | "pads" | "reset" | "close" }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "dev") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
      </svg>
    );
  }
  if (name === "walk") {
    return (
      <svg {...props}>
        <circle cx="14" cy="4.2" r="1.7" fill="currentColor" stroke="none" />
        <path d="M13.2 6.4l-1.2 5.2" />
        <path d="M12 11.6l-3.4 6.2" />
        <path d="M12 11.6l3.8 5.6" />
        <path d="M12.2 8.6l4.2 1.2" />
        <path d="M12.2 8.8L8.4 11" />
      </svg>
    );
  }
  if (name === "orbit") {
    return (
      <svg {...props}>
        <rect x="2.5" y="7" width="11" height="9" rx="1.5" />
        <path d="M13.5 10.2 20 7.2v8.6l-6.5-3" />
      </svg>
    );
  }
  if (name === "pads") {
    return (
      <svg {...props}>
        <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "reset") {
    return (
      <svg {...props}>
        <path d="M5 12a7 7 0 1 0 2-4.9" />
        <path d="M5 4.5V10H10.5" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
