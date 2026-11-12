// Extracts asset access ids referenced by scene objects so a draft save can
// verify that every referenced upload exists and is readable by the author.

export interface ObjectAssetRef {
  objectId: string;
  accessId: string;
  field: 'textureAccessId' | 'assetAccessId';
}

const REF_FIELDS: ObjectAssetRef['field'][] = ['textureAccessId', 'assetAccessId'];

export function collectObjectAssetRefs(manifest: unknown): ObjectAssetRef[] {
  if (!manifest || typeof manifest !== 'object') return [];
  const objects = (manifest as Record<string, unknown>).objects;
  if (!Array.isArray(objects)) return [];

  const refs: ObjectAssetRef[] = [];
  const seen = new Set<string>();

  objects.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const object = entry as Record<string, unknown>;
    const objectId =
      typeof object.id === 'string' && object.id.trim() ? object.id.trim() : `object_${index}`;

    for (const field of REF_FIELDS) {
      const value = object[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      const accessId = value.trim();
      const dedupeKey = `${objectId}:${field}:${accessId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      refs.push({ objectId, accessId, field });
    }
  });

  return refs;
}

export function formatRefFailure(ref: ObjectAssetRef, reason: string): string {
  return `${ref.objectId}.${ref.field} -> ${ref.accessId}: ${reason}`;
}
