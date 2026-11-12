// Curated avatar accessory catalog and identifier validation

export type AccessoryKind = 'hat' | 'shirt';

export interface AvatarCatalogItem {
  id: string;
  kind: AccessoryKind;
  name: string;
  style: string;
  color: string;
}

export const AVATAR_CATALOG: AvatarCatalogItem[] = [
  { id: 'hat_cyber_beanie', kind: 'hat', name: 'Cyber Beanie', style: 'beanie', color: '#00e5ff' },
  { id: 'hat_cap_classic', kind: 'hat', name: 'Classic Cap', style: 'cap', color: '#ef4444' },
  { id: 'hat_crown_royal', kind: 'hat', name: 'Royal Crown', style: 'crown', color: '#fbbf24' },
  { id: 'hat_halo_neon', kind: 'hat', name: 'Neon Halo', style: 'halo', color: '#a3e635' },
  { id: 'hat_horns_imp', kind: 'hat', name: 'Imp Horns', style: 'horns', color: '#f43f5e' },
  { id: 'hat_bucket_studio', kind: 'hat', name: 'Studio Bucket', style: 'bucket', color: '#8b5cf6' },
  { id: 'shirt_space_cadet', kind: 'shirt', name: 'Space Cadet', style: 'decal', color: '#e0e7ff' },
  { id: 'shirt_stripes_racer', kind: 'shirt', name: 'Racer Stripes', style: 'stripes', color: '#f8fafc' },
  { id: 'shirt_hoodie_zip', kind: 'shirt', name: 'Zip Hoodie', style: 'hoodie', color: '#334155' },
  { id: 'shirt_vest_tech', kind: 'shirt', name: 'Tech Vest', style: 'vest', color: '#0ea5e9' },
  { id: 'shirt_tee_plain', kind: 'shirt', name: 'Plain Tee', style: 'tee', color: '#facc15' },
  { id: 'shirt_jacket_denim', kind: 'shirt', name: 'Denim Jacket', style: 'jacket', color: '#3b82f6' }
];

export function getCatalogItem(id: string): AvatarCatalogItem | undefined {
  return AVATAR_CATALOG.find((item) => item.id === id);
}

export function isValidAccessoryId(id: string, kind: AccessoryKind): boolean {
  const item = getCatalogItem(id);
  return Boolean(item && item.kind === kind);
}

export function listCatalogByKind(kind: AccessoryKind): AvatarCatalogItem[] {
  return AVATAR_CATALOG.filter((item) => item.kind === kind);
}