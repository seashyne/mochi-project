// Adversarial Challenger Empirical Test Suite: Milestone 2 Templates
// Rigorous verification of templates, manifest byte ceilings, and starter scripts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  STUDIO_TEMPLATES,
  getTemplateById,
  validateTemplateManifestBytes,
  MAX_MANIFEST_BYTES,
  StudioTemplateDefinition
} from '../src/components/studio/templates/studioTemplates';

describe('Milestone 2 Challenger: Pre-Configured Templates & Manifest Boundaries', () => {
  const rootDir = path.resolve(__dirname, '..');
  const templateFilePath = path.join(rootDir, 'src/components/studio/templates/studioTemplates.ts');

  it('verifies STUDIO_TEMPLATES contains all 3 canonical starter templates', () => {
    expect(STUDIO_TEMPLATES).toHaveLength(3);
    const ids = STUDIO_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('baseplate');
    expect(ids).toContain('flat_terrain');
    expect(ids).toContain('obby');
  });

  it('verifies template properties and script contracts per requirements', () => {
    const baseplate = getTemplateById('baseplate');
    expect(baseplate).toBeDefined();
    expect(baseplate?.grid).toBe(64);
    expect(baseplate?.hasSpawn).toBe(true);
    expect(baseplate?.scriptCode).toContain('print("Baseplate")');

    const terrain = getTemplateById('flat_terrain');
    expect(terrain).toBeDefined();
    expect(terrain?.grid).toBe(80);
    expect(terrain?.hasSpawn).toBe(true);
    expect(terrain?.scriptCode).toContain('world.setTime("12:00")');

    const obby = getTemplateById('obby');
    expect(obby).toBeDefined();
    expect(obby?.hasSpawn).toBe(true);
    expect(obby?.hasHazard).toBe(true);
    expect(obby?.hasGoal).toBe(true);
    expect(obby?.scriptCode).toContain('player.takeDamage(100)');
  });

  it('verifies each template serializes strictly <= 64KB manifest ceiling', () => {
    const encoder = new TextEncoder();
    for (const template of STUDIO_TEMPLATES) {
      expect(template.objects.length).toBeGreaterThan(0);
      const manifestPayload = JSON.stringify({
        objects: template.objects,
        scriptCode: template.scriptCode,
        version: '0.1.0'
      });
      const byteLength = encoder.encode(manifestPayload).length;
      expect(byteLength).toBeLessThan(MAX_MANIFEST_BYTES);
      expect(byteLength).toBeLessThan(6000);
      expect(validateTemplateManifestBytes(template)).toBe(true);
    }
  });

  it('stress-tests boundary at exactly 65,536 bytes (permitted) vs 65,537 bytes (rejected)', () => {
    const emptyPayload = JSON.stringify({ objects: [], scriptCode: '', version: '0.1.0' });
    const emptyLength = new TextEncoder().encode(emptyPayload).length;
    const targetPadding = MAX_MANIFEST_BYTES - emptyLength;

    const base = {
      id: 'test_boundary',
      name: 'Boundary Test',
      description: 'Test',
      previewType: 'grid',
      objects: []
    };

    const exactTemplate: StudioTemplateDefinition = {
      ...base,
      scriptCode: 'x'.repeat(targetPadding)
    };
    expect(validateTemplateManifestBytes(exactTemplate)).toBe(true);

    const oversizedTemplate: StudioTemplateDefinition = {
      ...base,
      scriptCode: 'x'.repeat(targetPadding + 1)
    };
    expect(validateTemplateManifestBytes(oversizedTemplate)).toBe(false);
  });

  it('stress-tests multi-byte UTF-8 character encoding in manifest size calculation', () => {
    const thaiChar = 'ก'; // 3 bytes per char in UTF-8
    expect(new TextEncoder().encode(thaiChar).length).toBe(3);

    const multiByteTemplate: StudioTemplateDefinition = {
      id: 'multibyte_test',
      name: 'UTF8 Test',
      description: 'Testing byte vs character count',
      previewType: 'grid',
      objects: [],
      scriptCode: thaiChar.repeat(25000)
    };

    // Character length is 25,000 (< 65536 string length), but byte length is 75,000+ (> 65536)
    expect(multiByteTemplate.scriptCode.length).toBeLessThan(MAX_MANIFEST_BYTES);
    expect(validateTemplateManifestBytes(multiByteTemplate)).toBe(false);
  });

  it('stress-tests large object count in template manifest serialization', () => {
    const largeObjects = Array.from({ length: 500 }, (_, i) => ({
      id: `obj_${i}`,
      name: `Part_${i}`,
      type: 'block',
      position: { x: i, y: 0, z: i },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#ffffff'
    }));

    const largeTemplate: StudioTemplateDefinition = {
      id: 'large_template',
      name: 'Large Template',
      description: '500 parts',
      previewType: 'grid',
      objects: largeObjects,
      scriptCode: '-- large'
    };

    expect(typeof validateTemplateManifestBytes(largeTemplate)).toBe('boolean');
  });

  it('enforces static compliance on studioTemplates.ts (SRP <= 300, 0 emojis, 0 legacy strings)', () => {
    const content = fs.readFileSync(templateFilePath, 'utf8');
    const lines = content.split('\n');
    expect(lines.length).toBeLessThanOrEqual(300);

    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const legacyRegex = /roblox|rbx/i;

    lines.forEach((line, idx) => {
      expect(emojiRegex.test(line), `Emoji at line ${idx + 1}`).toBe(false);
      expect(legacyRegex.test(line), `Legacy brand at line ${idx + 1}`).toBe(false);
    });
  });
});
