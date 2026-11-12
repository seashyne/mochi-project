// Shared page header for the soft-surface page system

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  badge,
  actions
}) => (
  <header className="mochi-page-head">
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <span className="mochi-icon-badge">
          <Icon className="w-5 h-5" />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && <div className="mochi-eyebrow">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mochi-page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mochi-page-sub">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export default PageHeader;
