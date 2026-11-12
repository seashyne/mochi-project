// Tier 5 render smoke tests for the new Studio panels: environment picker,
// asset library, and server authoring. Server rendering catches invalid hook
// usage and broken prop contracts without a browser.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { StudioEnvironmentPanel } from '../src/components/studio/StudioEnvironmentPanel';
import { StudioServerScriptsPanel } from '../src/components/studio/StudioServerScriptsPanel';
import { StudioAssetLibraryPanel } from '../src/components/studio/assets/StudioAssetLibraryPanel';
import { StudioMaterialLibraryPanel } from '../src/components/studio/StudioMaterialLibraryPanel';
import { AssetDropZone } from '../src/components/studio/assets/AssetDropZone';
import { MATERIAL_PRESETS } from '../src/engine/materials/materialPresets';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import { SKYBOX_PRESETS } from '../src/engine/environment/skyboxPresets';
import type { RemoteEventDef, ServerScript } from '../src/engine/scripting/serverManifest';

const scripts: ServerScript[] = [
  { id: 's1', name: 'SpawnGuard', code: 'print("guard")', enabled: true }
];
const events: RemoteEventDef[] = [
  { id: 'e1', name: 'PurchaseItem', direction: 'toServer', rateLimitPerSecond: 5 }
];

describe('Tier 5: Studio Panel Render Contracts', () => {
  describe('Environment panel', () => {
    it('renders the panel heading and every preset label', () => {
      const html = renderToString(
        <StudioEnvironmentPanel
          environment={STARTER_ENVIRONMENT}
          onChange={() => {}}
          onReset={() => {}}
        />
      );
      expect(html).toContain('Environment');
      for (const preset of SKYBOX_PRESETS) {
        expect(html).toContain(preset.label);
        expect(html).toContain(`${preset.preview}`);
      }
    });

    it('renders loading and error affordances when requested', () => {
      const html = renderToString(
        <StudioEnvironmentPanel
          environment={STARTER_ENVIRONMENT}
          onChange={() => {}}
          onReset={() => {}}
          isLoading
          errorMessage="Skybox failed to load"
        />
      );
      expect(html).toContain('Skybox failed to load');
      expect(html).toContain('animate-spin');
    });

    it('hides fog density until fog is enabled', () => {
      const off = renderToString(
        <StudioEnvironmentPanel
          environment={STARTER_ENVIRONMENT}
          onChange={() => {}}
          onReset={() => {}}
        />
      );
      expect(off).not.toContain('Fog Density');

      const on = renderToString(
        <StudioEnvironmentPanel
          environment={{ ...STARTER_ENVIRONMENT, fogEnabled: true }}
          onChange={() => {}}
          onReset={() => {}}
        />
      );
      expect(on).toContain('Fog Density');
    });
  });

  describe('Asset library panel', () => {
    it('prompts for sign-in when no token is available', () => {
      const html = renderToString(<StudioAssetLibraryPanel token={null} />);
      expect(html).toContain('Sign in to manage your asset library');
    });

    it('renders the library shell and empty state for signed-in users', () => {
      const html = renderToString(<StudioAssetLibraryPanel token="test-token" />);
      expect(html).toContain('Asset Library');
      expect(html).toContain('All Files');
      expect(html).toContain('No files yet');
    });
  });

  describe('Server authoring panel', () => {
    it('renders scripts, events, and empty states', () => {
      const html = renderToString(
        <StudioServerScriptsPanel
          serverScripts={scripts}
          remoteEvents={events}
          errors={[]}
          onAddScript={() => {}}
          onUpdateScript={() => {}}
          onRemoveScript={() => {}}
          onAddEvent={() => {}}
          onUpdateEvent={() => {}}
          onRemoveEvent={() => {}}
          onValidate={() => {}}
        />
      );
      expect(html).toContain('Server Scripts');
      expect(html).toContain('SpawnGuard');
      expect(html).toContain('Remote Events');
      expect(html).toContain('PurchaseItem');
      expect(html).toContain('Validate manifest');
    });

    it('renders empty states when nothing is declared', () => {
      const html = renderToString(
        <StudioServerScriptsPanel
          serverScripts={[]}
          remoteEvents={[]}
          errors={[]}
          onAddScript={() => {}}
          onUpdateScript={() => {}}
          onRemoveScript={() => {}}
          onAddEvent={() => {}}
          onUpdateEvent={() => {}}
          onRemoveEvent={() => {}}
          onValidate={() => {}}
        />
      );
      expect(html).toContain('No server scripts yet');
      expect(html).toContain('No remote events declared');
    });

    it('surfaces validation errors inline', () => {
      const html = renderToString(
        <StudioServerScriptsPanel
          serverScripts={[]}
          remoteEvents={[]}
          errors={['Duplicate remote event name "Tick"']}
          onAddScript={() => {}}
          onUpdateScript={() => {}}
          onRemoveScript={() => {}}
          onAddEvent={() => {}}
          onUpdateEvent={() => {}}
          onRemoveEvent={() => {}}
          onValidate={() => {}}
        />
      );
      expect(html).toContain('Duplicate remote event name');
    });
  });

  describe('Material library panel', () => {
    it('renders every preset swatch', () => {
      const html = renderToString(
        <StudioMaterialLibraryPanel activeTexture={null} onApply={() => {}} />
      );
      expect(html).toContain('Materials');
      for (const preset of MATERIAL_PRESETS) {
        expect(html).toContain(preset.maps.color);
      }
    });

    it('disables interaction and shows a hint without a selection', () => {
      const html = renderToString(
        <StudioMaterialLibraryPanel activeTexture={null} disabled onApply={() => {}} />
      );
      expect(html).toContain('Select an object to apply a material');
      expect(html).toContain('opacity-60');
    });

    it('shows the clear control only when a texture is active', () => {
      const withoutTexture = renderToString(
        <StudioMaterialLibraryPanel activeTexture={null} onApply={() => {}} />
      );
      expect(withoutTexture).not.toContain('Clear');

      const withTexture = renderToString(
        <StudioMaterialLibraryPanel activeTexture="brick_red" onApply={() => {}} />
      );
      expect(withTexture).toContain('Clear');
      expect(withTexture).toContain('ring-1');
    });

    it('explains that uploads are required before use', () => {
      const html = renderToString(
        <StudioMaterialLibraryPanel activeTexture={null} onApply={() => {}} />
      );
      expect(html).toContain('My uploads');
      expect(html).toContain('Upload an image in the asset library first');
    });

    it('lists uploaded textures with their access id suffix', () => {
      const html = renderToString(
        <StudioMaterialLibraryPanel
          activeTexture={null}
          uploads={[
            {
              accessId: 'acc_0123456789abcdef0123',
              fileId: 'file-1',
              name: 'crate.png',
              url: 'https://access-game.lenout.com/assets/sha256/abc',
              status: 'ready'
            }
          ]}
          onApply={() => {}}
        />
      );
      expect(html).toContain('https://access-game.lenout.com/assets/sha256/abc');
      expect(html).toContain('ef0123');
    });

    it('marks blocked uploads as unselectable', () => {
      const html = renderToString(
        <StudioMaterialLibraryPanel
          activeTexture={null}
          uploads={[
            {
              accessId: 'acc_0123456789abcdef0123',
              fileId: 'file-1',
              name: 'crate.png',
              url: '/assets/x.png',
              status: 'blocked'
            }
          ]}
          onApply={() => {}}
        />
      );
      expect(html).toContain('cursor-not-allowed');
      expect(html).toContain('opacity-40');
    });
  });

  describe('Upload drop zone', () => {
    it('renders the idle prompt and a hidden multi-file input', () => {
      const html = renderToString(
        <AssetDropZone isUploading={false} uploadProgress={0} onUpload={() => {}} />
      );
      expect(html).toContain('Drop files or click to upload');
      expect(html).toContain('type="file"');
      expect(html).toContain('multiple');
    });

    it('renders progress while uploading', () => {
      const html = renderToString(
        <AssetDropZone isUploading uploadProgress={0.42} onUpload={() => {}} />
      );
      expect(html).toContain('Uploading');
      expect(html).toContain('42');
      expect(html).toContain('animate-spin');
      expect(html).toContain('width:42%');
    });
  });

  describe('Compliance', () => {    it('emits no Unicode emoji in rendered markup', () => {
      const html = renderToString(
        <StudioEnvironmentPanel
          environment={STARTER_ENVIRONMENT}
          onChange={() => {}}
          onReset={() => {}}
        />
      );
      const EMOJI_REGEX =
        /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;
      expect(EMOJI_REGEX.test(html)).toBe(false);
    });

    it('does not invoke callbacks during render', () => {
      const onChange = vi.fn();
      renderToString(
        <StudioEnvironmentPanel
          environment={STARTER_ENVIRONMENT}
          onChange={onChange}
          onReset={() => {}}
        />
      );
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
