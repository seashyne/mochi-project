// Studio Desktop Gate Screen for Mobile/Tablet Devices with Dark Glassmorphism and PC Requirements Notice

import React, { useState } from 'react';

export interface StudioDesktopGateProps {
  onReturnHome?: () => void;
  onNavigateCatalog?: () => void;
  onForceContinue?: () => void;
}

export const StudioDesktopGate: React.FC<StudioDesktopGateProps> = ({
  onReturnHome,
  onNavigateCatalog,
  onForceContinue,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="studio-desktop-gate"
      className="flex-1 min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 bg-studio-bg text-studio-text"
    >
      <div className="max-w-lg w-full bg-studio-panel/90 border border-studio-border rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
        {/* Desktop PC Workstation Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-studio-accent/20 to-studio-violet/10 border border-studio-accent/30 flex items-center justify-center text-studio-accent">
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"
            />
          </svg>
        </div>

        {/* Title and Badge */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-studio-accent/10 text-studio-accent border border-studio-accent/20">
            <span>PC Desktop Required</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-studio-text">
            Mochi Studio is for Desktop
          </h2>
          <p className="text-sm text-studio-muted leading-relaxed">
            The 3D Scene Viewport, Transform Gizmos, Hierarchy Tree, Object Inspector,
            and Lua Script Editor require a desktop computer with a keyboard and mouse.
          </p>
        </div>

        {/* Future PC version callout */}
        <div className="p-4 rounded-xl bg-studio-bg/60 border border-studio-border text-left space-y-1.5 text-xs text-studio-muted">
          <p className="font-semibold text-studio-text">Desktop Architecture</p>
          <p>
            Mochi separates the lightweight cross-platform Player from the full-featured Creator Studio.
            A native PC desktop application will also be available for creators.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {onReturnHome && (
            <button
              data-testid="gate-return-home"
              type="button"
              onClick={onReturnHome}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-studio-accent hover:bg-studio-accent/90 text-studio-on-accent transition-colors shadow-lg shadow-studio-accent/20"
            >
              Back to Home
            </button>
          )}

          {onNavigateCatalog && (
            <button
              data-testid="gate-navigate-catalog"
              type="button"
              onClick={onNavigateCatalog}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-sm bg-studio-card hover:bg-studio-card/80 text-studio-text border border-studio-border transition-colors"
            >
              Play Games
            </button>
          )}

          <button
            data-testid="gate-copy-link"
            type="button"
            onClick={handleCopyLink}
            className="px-4 py-2.5 rounded-xl font-medium text-sm bg-studio-card/60 hover:bg-studio-card/40 text-studio-muted border border-studio-border/60 transition-colors"
          >
            {copied ? 'Link Copied' : 'Copy Link'}
          </button>
        </div>

        {/* Developer / Power User Override */}
        {onForceContinue && (
          <div className="pt-2">
            <button
              data-testid="gate-force-continue"
              type="button"
              onClick={onForceContinue}
              className="text-xs text-studio-muted hover:text-studio-text underline underline-offset-4 transition-colors"
            >
              Continue anyway (Experimental)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
