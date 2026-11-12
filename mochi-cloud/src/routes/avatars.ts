// Avatar HTTP endpoints for retrieving and customizing 3D player avatars

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import {
  getAvatarByUserId,
  provisionDefaultAvatar,
  updateAvatar
} from '../services/avatarDb';
import { findUserById } from '../services/userDb';
import { getShopItemById, isItemOwned } from '../services/shopDb';
import { UpdateAvatarInput, isValidHexColor } from '../models/avatar';
import { AVATAR_CATALOG, AccessoryKind, isValidAccessoryId } from '../models/avatarCatalog';

export const avatarsRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// GET /api/v1/avatars/catalog - Public accessory catalog, must precede the :userId route
avatarsRouter.get('/catalog', async (c) => {
  return c.json({ success: true, items: AVATAR_CATALOG }, 200);
});

// GET /api/v1/avatars/me - Fetch authenticated user's 3D avatar
avatarsRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const avatar = await provisionDefaultAvatar(c.env.DB, user.id);
  return c.json({ success: true, avatar }, 200);
});

// PUT /api/v1/avatars/me - Update customizable avatar attributes and colors
avatarsRouter.put('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as UpdateAvatarInput;

  // Validate color format if supplied
  const colorFields: (keyof UpdateAvatarInput)[] = [
    'headColor',
    'torsoColor',
    'leftArmColor',
    'rightArmColor',
    'leftLegColor',
    'rightLegColor'
  ];

  for (const field of colorFields) {
    const val = body[field];
    if (typeof val === 'string' && !isValidHexColor(val)) {
      return c.json(
        { error: `Invalid color format for ${field}. Expected 3 or 6 digit hex (e.g. #0284c7)` },
        400
      );
    }
  }

  const accessoryFields: { field: keyof UpdateAvatarInput; kind: string }[] = [
    { field: 'hatId', kind: 'hat' },
    { field: 'shirtId', kind: 'shirt' },
    { field: 'pantsId', kind: 'pants' },
    { field: 'faceId', kind: 'face' },
    { field: 'hairId', kind: 'hair' },
    { field: 'backId', kind: 'back' }
  ];

  for (const { field, kind } of accessoryFields) {
    const val = body[field] as string | null | undefined;
    if (val === undefined || val === null || val === '') continue;
    if (typeof val !== 'string') {
      return c.json({ error: `Invalid identifier for ${kind}` }, 400);
    }

    // Allow legacy catalog accessories if valid
    if ((kind === 'hat' || kind === 'shirt') && isValidAccessoryId(val, kind as AccessoryKind)) {
      continue;
    }

    // Check shop item and ownership
    const shopItem = await getShopItemById(c.env.DB, val);
    if (shopItem) {
      if (shopItem.slot !== kind) {
        return c.json({ error: `Item ${val} does not match slot ${kind}` }, 400);
      }
      if (shopItem.price > 0) {
        const owned = await isItemOwned(c.env.DB, user.id, val);
        if (!owned) {
          return c.json(
            { error: `You do not own item ${val}. Please purchase it in the shop first.` },
            403
          );
        }
      }
    } else {
      return c.json(
        { error: `Unknown ${kind} identifier. Fetch /api/v1/avatars/catalog for available items` },
        400
      );
    }
  }

  if (body.emoteIds !== undefined) {
    if (!Array.isArray(body.emoteIds)) {
      return c.json({ error: 'emoteIds must be an array of strings' }, 400);
    }
    if (body.emoteIds.length > 4) {
      return c.json({ error: 'Maximum 4 equipped emotes allowed' }, 400);
    }
  }

  const updated = await updateAvatar(c.env.DB, user.id, body);
  return c.json({ success: true, avatar: updated }, 200);
});

// GET /api/v1/avatars/:userId - Fetch public 3D avatar by user ID
avatarsRouter.get('/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  let avatar = await getAvatarByUserId(c.env.DB, userId);
  if (!avatar) {
    const user = await findUserById(c.env.DB, userId);
    if (!user) {
      return c.json({ error: 'Avatar not found' }, 404);
    }
    avatar = await provisionDefaultAvatar(c.env.DB, userId);
  }

  return c.json({ success: true, avatar }, 200);
});
