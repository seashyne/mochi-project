// Neutral first-paint placeholder shared by the Studio and Player entries.

import React from 'react';

export interface AppLoadingScreenProps {
  background?: string;
}

export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({ background = '#090b10' }) => (
  <div className="min-h-screen flex items-center justify-center" style={{ background }}>
    <div className="w-8 h-8 rounded-full border-2 border-[#00a2ff]/25 border-t-[#00a2ff] animate-spin" />
  </div>
);

export default AppLoadingScreen;
