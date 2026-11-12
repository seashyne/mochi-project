// Secondary Authentication Option Buttons (Email Code & QR Sign-In)

import React from 'react';
import { Mail, QrCode } from 'lucide-react';

export interface AuthSecondaryButtonsProps {
  dividerText: string;
  emailCodeText: string;
  qrCodeText: string;
  onSelectEmailCode: () => void;
  onSelectQrCode: () => void;
}

export const AuthSecondaryButtons: React.FC<AuthSecondaryButtonsProps> = ({
  dividerText,
  emailCodeText,
  qrCodeText,
  onSelectEmailCode,
  onSelectQrCode
}) => (
  <div className="space-y-3">
    <div className="mochi-auth-divider">
      <span>{dividerText}</span>
    </div>
    <div className="grid grid-cols-2 gap-2.5">
      <button
        type="button"
        onClick={onSelectEmailCode}
        className="mochi-auth-ghost flex items-center justify-center gap-1.5"
      >
        <Mail className="h-3.5 w-3.5" />
        <span className="truncate">{emailCodeText}</span>
      </button>
      <button
        type="button"
        onClick={onSelectQrCode}
        className="mochi-auth-ghost flex items-center justify-center gap-1.5"
      >
        <QrCode className="h-3.5 w-3.5" />
        <span className="truncate">{qrCodeText}</span>
      </button>
    </div>
  </div>
);
