// Studio publish workflow: builds the (possibly chunked) manifest, creates the
// game record, publishes the version, and exposes progress/notice state.

import { useCallback, useState } from 'react';
import { GameSummary } from '../../api/types';
import { gamesApi } from '../../api/games';
import { buildPublishManifest } from '../../engine/package/publishWorld';
import { StudioObject } from '../../engine/studio/types';
import { RemoteEventDef, ServerScript } from '../../engine/scripting/serverManifest';
import type { MochiAnimationClip } from '../../engine/animation/clip';
import { TranslationDictionary } from '../../i18n/types';

export interface StudioPublishInput {
  title: string;
  slug: string;
  versionNumber: string;
  description: string;
  objects: StudioObject[];
  scriptCode: string;
  serverScripts?: ServerScript[];
  remoteEvents?: RemoteEventDef[];
  animations?: MochiAnimationClip[];
  token: string;
  userId: string;
}

export function useStudioPublish(
  t: TranslationDictionary,
  onGamePublished: (game: GameSummary) => void
) {
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<string | null>(null);

  const publish = useCallback(
    async (input: StudioPublishInput): Promise<boolean> => {
      setPublishError(null);
      setPublishNotice(null);
      setPublishProgress(null);
      setIsPublishing(true);
      const version = input.versionNumber.trim() || '1.0.0';
      const cleanSlug =
        input.slug.trim() || input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      try {
        const manifestJson = await buildPublishManifest({
          title: input.title.trim(),
          version,
          objects: input.objects,
          scriptCode: input.scriptCode,
          serverScripts: input.serverScripts,
          remoteEvents: input.remoteEvents,
          animations: input.animations,
          token: input.token,
          onProgress: (stage, completed, total) => {
            setPublishProgress(
              stage === 'uploading-index'
                ? `${t.studio.uploadProgress} (index)`
                : `${t.studio.uploadProgress} ${completed}/${total}`
            );
          }
        });
        const created = await gamesApi.create(
          {
            title: input.title.trim(),
            slug: cleanSlug,
            description: input.description.trim() || undefined
          },
          input.token
        );
        const pubVer = await gamesApi.publish(
          created.game.id,
          {
            versionNumber: version,
            changelog: `Initial release v${version}`,
            bundleUrl: `https://game.lenout.com/games/${created.game.slug}`,
            manifestJson
          },
          input.token
        );
        const publishedGame: GameSummary = {
          id: created.game.id,
          slug: created.game.slug,
          title: created.game.title,
          description: created.game.description,
          creatorId: input.userId,
          thumbnailUrl: created.game.thumbnailUrl,
          status: 'published',
          playCount: 1,
          createdAt: created.game.createdAt,
          updatedAt: pubVer.version.createdAt || new Date().toISOString(),
          currentVersion: `v${version}`
        };
        onGamePublished(publishedGame);
        setPublishNotice(
          `${t.studio.publishedNotice}: "${publishedGame.title}" (${publishedGame.currentVersion})`
        );
        return true;
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : 'Publishing failed');
        return false;
      } finally {
        setIsPublishing(false);
        setPublishProgress(null);
      }
    },
    [t, onGamePublished]
  );

  return {
    publishNotice,
    publishError,
    setPublishError,
    isPublishing,
    publishProgress,
    publish
  };
}
