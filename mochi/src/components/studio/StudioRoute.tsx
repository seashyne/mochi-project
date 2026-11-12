// Lazy-Loaded Studio Route Shell with Desktop PC Gating and Suspense Fallback

import React, { Suspense, useState, useMemo } from 'react';
import { GameSummary } from '../../api/types';
import { isDesktopDevice } from '../../utils/deviceDetector';
import { StudioDesktopGate } from './StudioDesktopGate';

const StudioPageLazy = React.lazy(() =>
  import('../../pages/StudioPage').then((m) => ({ default: m.StudioPage }))
);

export interface StudioRouteProps {
  onGamePublished: (newGame: GameSummary) => void;
  initialProjectId?: string | null;
  onReturnHome?: () => void;
  onNavigateCatalog?: () => void;
  detectionOverride?: boolean;
}

export const StudioRouteLoading: React.FC = () => (
  <div
    data-testid="studio-route-loading"
    className="flex-1 min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6 bg-studio-bg text-studio-text"
  >
    <div className="w-10 h-10 rounded-full border-2 border-studio-accent/20 border-t-studio-accent animate-spin mb-4" />
    <p className="text-sm text-studio-muted font-medium">Loading Mochi Studio...</p>
    <p className="text-xs text-studio-muted/70 mt-1">Initializing 3D viewport and toolchain</p>
  </div>
);

export const StudioRoute: React.FC<StudioRouteProps> = ({
  onGamePublished,
  initialProjectId,
  onReturnHome,
  onNavigateCatalog,
  detectionOverride,
}) => {
  const [forcedAccess, setForcedAccess] = useState(false);

  const isDesktop = useMemo(() => {
    if (typeof detectionOverride === 'boolean') {
      return detectionOverride;
    }
    return isDesktopDevice();
  }, [detectionOverride]);

  if (!isDesktop && !forcedAccess) {
    return (
      <StudioDesktopGate
        onReturnHome={onReturnHome}
        onNavigateCatalog={onNavigateCatalog}
        onForceContinue={() => setForcedAccess(true)}
      />
    );
  }

  return (
    <Suspense fallback={<StudioRouteLoading />}>
      <StudioPageLazy
        onGamePublished={onGamePublished}
        initialProjectId={initialProjectId}
      />
    </Suspense>
  );
};
