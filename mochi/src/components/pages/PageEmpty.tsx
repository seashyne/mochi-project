// Shared empty state card for the soft-surface page system

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PageEmptyProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export const PageEmpty: React.FC<PageEmptyProps> = ({ icon: Icon, title, hint, action }) => (
  <div className="mochi-empty">
    <span className="mochi-icon-badge mx-auto mb-3">
      <Icon className="w-5 h-5" />
    </span>
    <h3 className="text-sm font-bold text-[color:var(--mochi-text)]">{title}</h3>
    {hint && <p className="mochi-page-sub mx-auto mt-1">{hint}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export default PageEmpty;
