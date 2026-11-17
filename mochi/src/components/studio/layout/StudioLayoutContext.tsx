// React context provider and hook for Studio workspace layout.

import React, { createContext, useContext } from 'react';
import type { LayoutContextValue } from './layoutTypes';

const StudioLayoutContext = createContext<LayoutContextValue | null>(null);

export interface StudioLayoutProviderProps {
  value: LayoutContextValue;
  children: React.ReactNode;
}

export const StudioLayoutProvider: React.FC<StudioLayoutProviderProps> = ({
  value,
  children
}) => (
  <StudioLayoutContext.Provider value={value}>
    {children}
  </StudioLayoutContext.Provider>
);

export function useStudioLayoutContext(): LayoutContextValue {
  const ctx = useContext(StudioLayoutContext);
  if (!ctx) {
    throw new Error('useStudioLayoutContext must be used within StudioLayoutProvider');
  }
  return ctx;
}
