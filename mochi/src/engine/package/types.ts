// TypeScript interfaces and schemas for .mochi game package container

export type MochiScriptRole = 'client' | 'server' | 'shared';

export interface MochiScriptEntry {
  path: string;
  role: MochiScriptRole;
  code: string;
}

export interface MochiAssetEntry {
  path: string;
  contentType: string;
  data: string; // Base64 encoded or UTF-8 text
  size: number;
  hash: string; // SHA-256 integrity hash
}

export interface MochiPackageManifest {
  formatVersion: '1.0';
  gameId: string;
  slug: string;
  title: string;
  version: string;
  description?: string;
  author: {
    id: string;
    displayName: string;
  };
  entry: {
    clientScript: string;
    serverScript?: string;
    sceneSnapshot?: string;
  };
  capabilities?: {
    multiplayer?: boolean;
    audio?: boolean;
    physics?: boolean;
  };
  publishedAt?: string;
}

export interface MochiPackageContent {
  manifest: MochiPackageManifest;
  scripts: Record<string, MochiScriptEntry>;
  assets: Record<string, MochiAssetEntry>;
  scenes: Record<string, unknown>;
}

export interface MochiValidationResult {
  valid: boolean;
  errors: string[];
}
