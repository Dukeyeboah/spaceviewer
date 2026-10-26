/**
 * Open a user-provided LCC/LCC2 package (ZIP or folder) or a remote URL / PLY.
 * ZIP/folder files are cached under /sv-pkg/<id>/… and served by public/sv-fs-sw.js
 * so the LCC SDK can resolve tile paths relative to the .lcc / .lcc2 scene file.
 * LCC Cloud exports use a project name (e.g. Community2Hall.lcc), not meta.lcc.
 */

import JSZip from "jszip";

export type OpenedScene =
  | {
      kind: "lcc";
      id: string;
      /** URL the LCC SDK should load (*.lcc2 / *.lcc). */
      dataPath: string;
      label: string;
      source: "zip" | "folder" | "url";
    }
  | {
      kind: "ply";
      id: string;
      dataPath: string;
      label: string;
      source: "file" | "url";
      /** Object URL — revoke when clearing the session. */
      objectUrl?: string;
    };

const CACHE_PREFIX = "sv-pkg-";
/** Bump when sv-fs-sw.js changes so an already-open Chrome tab drops the old worker. */
const SW_URL = "/sv-fs-sw.js?v=5";
const SW_VERSION = "5";

function mimeFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bin")) return "application/octet-stream";
  if (lower.endsWith(".ply")) return "application/octet-stream";
  if (lower.endsWith(".lcc") || lower.endsWith(".lcc2")) return "application/octet-stream";
  return "application/octet-stream";
}

function normalizeZipPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Lower rank wins. Named meta.* stays ahead of LCC Cloud's ProjectName.lcc. */
function sceneFileRank(base: string): number {
  if (base === "meta.lcc2") return 0;
  if (base.endsWith(".lcc2")) return 1;
  if (base === "meta.lcc") return 2;
  if (base.endsWith(".lcc")) return 3;
  return 99;
}

function findMetaPath(paths: string[]): string | null {
  const metas = paths.filter((p) => {
    const base = p.split("/").pop()?.toLowerCase() ?? "";
    // .lcc2 does not end with .lcc — check both.
    return base.endsWith(".lcc2") || base.endsWith(".lcc");
  });
  if (metas.length === 0) return null;
  metas.sort((a, b) => {
    const ba = a.split("/").pop()?.toLowerCase() ?? "";
    const bb = b.split("/").pop()?.toLowerCase() ?? "";
    const rank = sceneFileRank(ba) - sceneFileRank(bb);
    if (rank !== 0) return rank;
    // Prefer the shallower package root when several scene files exist.
    return a.split("/").length - b.split("/").length || a.length - b.length;
  });
  return metas[0]!;
}

function packageRootAndRel(metaPath: string): { root: string; relMeta: string } {
  const i = metaPath.lastIndexOf("/");
  if (i < 0) return { root: "", relMeta: metaPath };
  return { root: metaPath.slice(0, i + 1), relMeta: metaPath.slice(i + 1) };
}

function controllerIsCurrent(): boolean {
  return navigator.serviceWorker.controller?.scriptURL.includes(`v=${SW_VERSION}`) ?? false;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are required to open local LCC packages in the browser.");
  }
  const reg = await navigator.serviceWorker.register(SW_URL, {
    scope: "/",
    updateViaCache: "none",
  });
  try {
    await reg.update();
  } catch {
    /* update check can fail if the dev server just restarted */
  }
  reg.waiting?.postMessage({ type: "skip-waiting" });
  reg.installing?.postMessage({ type: "skip-waiting" });
  if (!controllerIsCurrent()) {
    await new Promise<void>((resolve, reject) => {
      const finish = (ok: boolean) => {
        window.clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", onChange);
        if (ok || controllerIsCurrent()) resolve();
        else {
          reject(
            new Error(
              "This tab is still using an older package loader. Reload the page once, then upload the ZIP again.",
            ),
          );
        }
      };
      const onChange = () => {
        if (controllerIsCurrent()) finish(true);
      };
      const timer = window.setTimeout(() => finish(false), 8000);
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      if (controllerIsCurrent()) finish(true);
    });
  }
  await navigator.serviceWorker.ready;
  if (!controllerIsCurrent()) {
    throw new Error("This tab is still using an older package loader. Reload the page once, then upload the ZIP again.");
  }
  return reg;
}

/** The SDK copies each Range body into a fixed texture. A full-file body overflows it. */
async function assertByteRange(id: string, relFiles: { path: string }[]): Promise<void> {
  const data =
    relFiles.find((f) => f.path.toLowerCase().endsWith("data.bin")) ??
    relFiles.find((f) => /\.lcc2?$/i.test(f.path));
  if (!data) return;
  const url = `/sv-pkg/${id}/${data.path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  const buf = await res.arrayBuffer();
  if (res.headers.get("X-SV-SW") !== SW_VERSION || buf.byteLength !== 16) {
    throw new Error(
      "This tab is still using an older package loader, so the scan cannot open. Reload the page once, then upload the ZIP again.",
    );
  }
}

async function putFilesInCache(
  id: string,
  files: { path: string; blob: Blob }[],
): Promise<void> {
  const cache = await caches.open(CACHE_PREFIX + id);
  await Promise.all(
    files.map(({ path, blob }) => {
      const url = `/sv-pkg/${id}/${path.split("/").map(encodeURIComponent).join("/")}`;
      return cache.put(
        url,
        new Response(blob, {
          headers: {
            "Content-Type": mimeFor(path),
            "Cache-Control": "no-store",
          },
        }),
      );
    }),
  );
}

export async function clearPackageSession(id: string): Promise<void> {
  await caches.delete(CACHE_PREFIX + id);
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.active?.postMessage({ type: "drop-cache", id });
}

export async function openLccFromZip(file: File): Promise<OpenedScene> {
  await ensureServiceWorker();
  const zip = await JSZip.loadAsync(file);
  const entries: { path: string; blob: Blob }[] = [];
  const paths: string[] = [];

  const jobs: Promise<void>[] = [];
  zip.forEach((rawPath, entry) => {
    if (entry.dir) return;
    const path = normalizeZipPath(rawPath);
    if (!path || path.includes("__MACOSX") || path.endsWith(".DS_Store")) return;
    paths.push(path);
    jobs.push(
      entry.async("blob").then((blob) => {
        entries.push({ path, blob });
      }),
    );
  });
  await Promise.all(jobs);

  const metaPath = findMetaPath(paths);
  if (!metaPath) {
    throw new Error(
      "No .lcc or .lcc2 scene file found in the ZIP. Upload a full LCC/LCC2 package (a project-named .lcc from LCC Cloud is fine).",
    );
  }
  const { root, relMeta } = packageRootAndRel(metaPath);
  const relFiles = entries
    .filter((e) => (root ? e.path.startsWith(root) : true))
    .map((e) => ({
      path: root ? e.path.slice(root.length) : e.path,
      blob: e.blob,
    }));

  const id = `z${Date.now().toString(36)}`;
  await putFilesInCache(id, relFiles);
  await assertByteRange(id, relFiles);
  const dataPath = `${window.location.origin}/sv-pkg/${id}/${relMeta.split("/").map(encodeURIComponent).join("/")}`;
  return {
    kind: "lcc",
    id,
    dataPath,
    label: file.name.replace(/\.zip$/i, "") || "Uploaded package",
    source: "zip",
  };
}

/** Folder picker: files with webkitRelativePath. */
export async function openLccFromFolder(fileList: FileList): Promise<OpenedScene> {
  await ensureServiceWorker();
  const files = Array.from(fileList);
  if (files.length === 0) throw new Error("Empty folder.");

  const paths = files.map((f) => normalizeZipPath(f.webkitRelativePath || f.name));
  const metaPath = findMetaPath(paths);
  if (!metaPath) {
    throw new Error("No .lcc or .lcc2 scene file in this folder.");
  }
  const { root, relMeta } = packageRootAndRel(metaPath);
  const relFiles = files.map((f, i) => {
    const full = paths[i]!;
    return {
      path: root ? full.slice(root.length) : full,
      blob: f,
    };
  });

  const id = `f${Date.now().toString(36)}`;
  await putFilesInCache(id, relFiles);
  await assertByteRange(id, relFiles);
  const dataPath = `${window.location.origin}/sv-pkg/${id}/${relMeta.split("/").map(encodeURIComponent).join("/")}`;
  const top = (files[0]?.webkitRelativePath || "folder").split("/")[0] || "Folder";
  return { kind: "lcc", id, dataPath, label: top, source: "folder" };
}

export function openFromUrl(raw: string): OpenedScene {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Enter a full http(s) URL to a .lcc2 / .lcc scene file, or a .ply.");
  }
  const id = `u${Date.now().toString(36)}`;
  const lower = url.toLowerCase();
  if (lower.includes(".ply")) {
    return { kind: "ply", id, dataPath: url, label: url.split("/").pop() || "Remote PLY", source: "url" };
  }
  return {
    kind: "lcc",
    id,
    dataPath: url,
    label: url.split("/").pop() || "Remote LCC",
    source: "url",
  };
}

export async function openPlyFile(file: File): Promise<OpenedScene> {
  const objectUrl = URL.createObjectURL(file);
  return {
    kind: "ply",
    id: `p${Date.now().toString(36)}`,
    dataPath: objectUrl,
    label: file.name,
    source: "file",
    objectUrl,
  };
}
