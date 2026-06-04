// Download a harvested asset manifest to disk for the redesign-migration
// "copy the old site's images" workflow. Node IO (fs + fetch), no browser.
// The deterministic filename logic lives in assetFilename() so it is
// unit-testable; downloadAssets() is the fail-soft fetch/write glue.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetManifest, AssetRef } from "./harvest-assets.js";

/** One successfully downloaded asset, plus where it landed and its size. */
export interface DownloadedAsset extends AssetRef {
  /** Filename written inside the destination directory. */
  file: string;
  /** Byte length written. */
  bytes: number;
}

/** One asset that could not be fetched or written. */
export interface FailedAsset {
  url: string;
  error: string;
}

/** Result of a downloadAssets() run. */
export interface DownloadReport {
  /** Destination directory the files were written to. */
  dir: string;
  downloaded: DownloadedAsset[];
  failed: FailedAsset[];
}

/** Tunables for downloadAssets; fetchImpl is injectable for testing. */
export interface DownloadOptions {
  /** Fetch implementation to use. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const SAFE = /[^A-Za-z0-9._-]+/g;

/**
 * Derive a safe, unique filename for an asset URL. Uses the URL's last path
 * segment (query and hash ignored), sanitized to a conservative character set,
 * with a fallback of "asset" for empty/root paths. If the name is already in
 * `taken`, a "-N" counter is inserted before the extension. The chosen name is
 * not added to `taken`; the caller does that, so a dry call stays pure.
 */
export function assetFilename(url: string, taken: Set<string>): string {
  let last = "";
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    last = decodeURIComponent(segments[segments.length - 1] ?? "");
  } catch {
    last = "";
  }

  let base = last.replace(SAFE, "-").replace(/^-+|-+$/g, "");
  if (!base || base === "." || base === "..") base = "asset";

  if (!taken.has(base)) return base;

  // Split extension off so the counter lands before it: logo.png -> logo-1.png.
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let n = 1;
  let candidate = `${stem}-${n}${ext}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  return candidate;
}

/**
 * Fetch every asset in the manifest and write it into destDir, alongside a
 * manifest.json describing the run. Fails soft: a fetch error, non-200, or
 * write error records the asset under `failed` and continues. Returns the
 * report (also written to destDir/manifest.json).
 */
export async function downloadAssets(
  manifest: AssetManifest,
  destDir: string,
  opts: DownloadOptions = {},
): Promise<DownloadReport> {
  const { fetchImpl = fetch } = opts;
  await mkdir(destDir, { recursive: true });

  const taken = new Set<string>();
  const downloaded: DownloadedAsset[] = [];
  const failed: FailedAsset[] = [];

  for (const asset of manifest.assets) {
    try {
      const res = await fetchImpl(asset.url);
      if (!res.ok) {
        failed.push({ url: asset.url, error: `HTTP ${res.status}` });
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const file = assetFilename(asset.url, taken);
      taken.add(file);
      await writeFile(join(destDir, file), bytes);
      downloaded.push({ ...asset, file, bytes: bytes.length });
    } catch (err) {
      failed.push({
        url: asset.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const report: DownloadReport = { dir: destDir, downloaded, failed };
  await writeFile(
    join(destDir, "manifest.json"),
    `${JSON.stringify({ downloaded, failed }, null, 2)}\n`,
  );
  return report;
}
