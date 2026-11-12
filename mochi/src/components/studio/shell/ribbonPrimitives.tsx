// Ribbon primitives shared by every ribbon tab: tool buttons, grouped sections
// with a caption underneath, and the vertical separators between them.

import React from 'react';

export interface RibbonButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  testId?: string;
}

const BASE =
  'group flex flex-col items-center justify-start gap-1 w-[58px] py-1.5 rounded-md border text-[10px] font-semibold leading-none transition-colors select-none';
const IDLE = 'border-transparent text-studio-muted hover:text-studio-text hover:bg-studio-card/70';
const ACTIVE = 'border-studio-accent/60 bg-studio-accent/20 text-studio-text';
const DISABLED = 'opacity-35 cursor-not-allowed';

export const RibbonButton: React.FC<RibbonButtonProps> = ({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  title,
  testId
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title ?? label}
    data-testid={testId}
    className={`${BASE} ${active ? ACTIVE : IDLE} ${disabled ? DISABLED : ''}`}
  >
    <span className={`flex items-center justify-center h-5 ${active ? 'text-studio-accent' : ''}`}>
      {icon}
    </span>
    <span className="truncate max-w-[54px]">{label}</span>
  </button>
);

export const RibbonGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children
}) => (
  <div className="flex flex-col items-center gap-1 px-1.5 shrink-0">
    <div className="flex items-start gap-0.5">{children}</div>
    <span className="text-[9px] uppercase tracking-wider text-studio-muted/70 font-mono">
      {label}
    </span>
  </div>
);

export const RibbonDivider: React.FC = () => (
  <div className="w-px self-stretch my-1 bg-studio-border/70 shrink-0" />
);

export const RibbonChip: React.FC<{
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}> = ({ label, value, onClick, active = false, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title ?? label}
    className={`flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[9px] font-mono leading-none transition-colors ${
      active
        ? 'border-studio-accent/60 bg-studio-accent/20 text-studio-text'
        : 'border-studio-border bg-studio-bg text-studio-muted hover:text-studio-text'
    }`}
  >
    <span className="uppercase tracking-wide">{label}</span>
    <span className="text-[11px] font-bold text-studio-text">{value}</span>
  </button>
);
