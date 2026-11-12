// Maps owned shop items to avatar accessory fields that the runtime can render

import { AvatarCatalogItem } from '../api/types';
import { ShopItem } from '../api/shopTypes';

export type AccessoryField = 'hatId' | 'shirtId';

export interface EquippableAccessory {
  field: AccessoryField;
  id: string;
}

export function resolveEquippable(
  item: ShopItem | undefined,
  catalog: AvatarCatalogItem[]
): EquippableAccessory | null {
  if (!item?.assetKey) return null;
  const match = catalog.find((entry) => entry.id === item.assetKey);
  if (!match) return null;
  if (item.slot === 'hat' && match.kind === 'hat') return { field: 'hatId', id: match.id };
  if (item.slot === 'shirt' && match.kind === 'shirt') return { field: 'shirtId', id: match.id };
  return null;
}

export function isEquipped(
  avatar: { hatId?: string; shirtId?: string } | null,
  accessory: EquippableAccessory | null
): boolean {
  if (!avatar || !accessory) return false;
  return avatar[accessory.field] === accessory.id;
}
