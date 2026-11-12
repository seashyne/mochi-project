// Helper utilities for importing and exporting .mochi packages in Creator Studio
import { StudioObject } from '../../engine/studio/types';
import { StudioScene } from '../../engine/studio/studioScene';
import {
  MochiPackageContent,
  createMochiBlob,
  unpackMochi
} from '../../engine/package';

export interface DownloadBudget {
  assetCount: number;
  uniqueAssetCount: number;
  assetBytes: number;
}

export function computeDownloadBudget(objects: StudioObject[]): DownloadBudget {
  const seen = new Set<string>();
  let assetCount = 0;
  let assetBytes = 0;

  for (const obj of objects) {
    if (obj.type !== 'model' || !obj.assetUrl) continue;
    assetCount++;
    const key = obj.assetHash || obj.assetKey || obj.assetUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    assetBytes += Math.max(0, obj.assetSizeBytes ?? 0);
  }

  return { assetCount, uniqueAssetCount: seen.size, assetBytes };
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export interface ExportPackageOptions {
  title: string;
  slug: string;
  versionNumber: string;
  description: string;
  scriptCode: string;
  objects: StudioObject[];
  userId?: string;
  userName?: string;
}

export function exportStudioMochiPackage(opts: ExportPackageOptions): void {
  const cleanSlug = opts.slug.trim() || opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pkg: MochiPackageContent = {
    manifest: {
      formatVersion: '1.0',
      gameId: `game_${cleanSlug}`,
      slug: cleanSlug,
      title: opts.title.trim() || 'Untitled Game',
      version: opts.versionNumber.trim() || '1.0.0',
      description: opts.description.trim(),
      author: {
        id: opts.userId || 'usr_creator',
        displayName: opts.userName || 'Creator'
      },
      entry: {
        clientScript: 'scripts/main.client.lua',
        sceneSnapshot: 'scenes/main.json'
      },
      capabilities: {
        multiplayer: true,
        physics: true,
        audio: true
      },
      publishedAt: new Date().toISOString()
    },
    scripts: {
      'scripts/main.client.lua': {
        path: 'scripts/main.client.lua',
        role: 'client',
        code: opts.scriptCode
      }
    },
    assets: {},
    scenes: {
      'scenes/main.json': {
        objects: opts.objects
      }
    }
  };

  const blob = createMochiBlob(pkg);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanSlug || 'game'}.mochi`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importStudioMochiPackage(
  file: File,
  sceneEngine: StudioScene,
  callbacks: {
    setTitle: (t: string) => void;
    setSlug: (s: string) => void;
    setVersion: (v: string) => void;
    setDesc: (d: string) => void;
    setScript: (s: string) => void;
    setObjects: (objs: StudioObject[]) => void;
  }
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pkg = unpackMochi(buffer);

  if (pkg.manifest?.title) callbacks.setTitle(pkg.manifest.title);
  if (pkg.manifest?.slug) callbacks.setSlug(pkg.manifest.slug);
  if (pkg.manifest?.version) callbacks.setVersion(pkg.manifest.version);
  if (pkg.manifest?.description) callbacks.setDesc(pkg.manifest.description);

  const sceneData = pkg.scenes?.['scenes/main.json'] as { objects?: StudioObject[] } | undefined;
  if (sceneData?.objects && Array.isArray(sceneData.objects)) {
    callbacks.setObjects(sceneData.objects);
    sceneEngine.clearAll();
    sceneData.objects.forEach((o) => sceneEngine.addObject(o));
  }

  const clientScriptPath = pkg.manifest?.entry?.clientScript || 'scripts/main.client.lua';
  const clientScript = pkg.scripts?.[clientScriptPath]?.code;
  if (clientScript) {
    callbacks.setScript(clientScript);
  }

  return pkg.manifest?.title || file.name;
}
