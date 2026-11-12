// Mochi Glassmorphic Authentication Modal
// Handles Instant Frictionless Sign Up, Sign In, 6-digit Email OTP, Password Reset, and Companion QR Sign-In

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, User, Lock, X, AlertCircle } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { authApi } from '../api/auth';
import { UserProfile } from '../api/types';
import { useAuthStore } from '../store/useAuthStore';
import { OtpVerificationStep } from './auth/OtpVerificationStep';
import { ForgotPasswordStep } from './auth/ForgotPasswordStep';
import { EmailCodeLoginStep } from './auth/EmailCodeLoginStep';
import { QrLoginStep } from './auth/QrLoginStep';
import { AuthSecondaryButtons } from './auth/AuthSecondaryButtons';
import { QuickSignupForm, QuickSignupFormData } from './auth/QuickSignupForm';

export type AuthMode = 'signin' | 'signup' | 'verify_otp' | 'forgot' | 'email_code' | 'qr';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  initialMode?: AuthMode;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signin'
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const onStepDone = (u: UserProfile) => { onSuccess(u); onClose(); };
  const onStepBack = () => setMode('signin');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const raw = emailOrUsername.trim().toLowerCase();
      const email = raw.includes('@') ? raw : `${raw}@game.lenout.com`;
      const res = await authApi.login({ email, password });
      if (res.token) useAuthStore.getState().login(res.token, res.user);
      onSuccess(res.user);
      onClose();
    } catch (err: unknown) {
      const eObj = err as { status?: number; details?: { requiresVerification?: boolean; email?: string } };
      if (eObj?.status === 403 && eObj?.details?.requiresVerification) {
        setPendingEmail(eObj.details.email || emailOrUsername.trim());
        setMode('verify_otp');
        return;
      }
      setError(err instanceof Error ? err.message : t.auth.failed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSignup = async (data: QuickSignupFormData) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await authApi.register({
        username: data.username,
        email: data.email,
        password: data.password,
        birthday: data.birthday,
        instant: true
      });
      if (res.token && res.user) {
        useAuthStore.getState().login(res.token, res.user);
        onSuccess(res.user);
        onClose();
        return;
      }
      if (res.user) {
        onSuccess(res.user);
        onClose();
        return;
      }
      setPendingEmail(res.email);
      setMode('verify_otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.auth.failed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <button
        type="button"
        aria-label={t.auth.close}
        onClick={onClose}
        className="mochi-auth-backdrop fixed inset-0 cursor-default"
      />

      <div className="mochi-auth relative z-10 my-auto w-full max-w-md">
        <div className="mochi-auth-card relative space-y-5 p-6 sm:p-7">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.auth.close}
            className="mochi-auth-close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="space-y-2.5 text-center">
            <span className="mochi-auth-badge">
              <span className="mochi-auth-badge-dot" />
              Mochi ID
            </span>
            {mode === 'signin' && (
              <h2 className="mochi-auth-title text-2xl">{t.auth.signInTitle}</h2>
            )}
          </div>

          {error && mode === 'signin' && (
            <div className="mochi-auth-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

        {mode === 'verify_otp' && <OtpVerificationStep email={pendingEmail} onSuccess={onStepDone} onBack={onStepBack} />}
        {mode === 'forgot' && <ForgotPasswordStep initialEmail={emailOrUsername.includes('@') ? emailOrUsername : pendingEmail} onSuccess={onStepDone} onBack={onStepBack} />}
        {mode === 'email_code' && <EmailCodeLoginStep initialEmail={emailOrUsername.includes('@') ? emailOrUsername : pendingEmail} onSuccess={onStepDone} onBack={onStepBack} />}
        {mode === 'qr' && <QrLoginStep onSuccess={onStepDone} onBack={onStepBack} />}

        {mode === 'signup' && (
          <QuickSignupForm
            onSubmit={handleQuickSignup}
            onSwitchToSignIn={() => { setError(null); setMode('signin'); }}
            isLoading={isLoading}
            error={error}
          />
        )}

        {mode === 'signin' && (
          <>
            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div className="relative">
                <User className="mochi-auth-field-icon h-4 w-4" />
                <input
                  type="text"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder={t.auth.usernameOrEmail}
                  required
                  minLength={3}
                  autoComplete="username"
                  className="mochi-auth-input mochi-auth-input-icon"
                />
              </div>

              {/* Hidden semantic email input to support browser auto-fill and validation */}
              <input type="email" value={emailOrUsername} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />

              <div className="relative">
                <Lock className="mochi-auth-field-icon h-4 w-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.password}
                  required
                  minLength={6}
                  autoComplete="current-password"
                  className="mochi-auth-input mochi-auth-input-icon mochi-auth-input-end"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
                  className="mochi-auth-field-toggle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setError(null); setMode('forgot'); }}
                  className="mochi-auth-link text-[11px]"
                >
                  {t.auth.forgotPassword}
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mochi-auth-primary"
              >
                {isLoading ? t.auth.loggingIn : t.auth.signInBtn}
              </button>
            </form>

            <AuthSecondaryButtons
              dividerText={t.auth.orDivider}
              emailCodeText={t.auth.emailCode}
              qrCodeText={t.auth.qrCode}
              onSelectEmailCode={() => { setError(null); setMode('email_code'); }}
              onSelectQrCode={() => { setError(null); setMode('qr'); }}
            />

            <div className="mochi-auth-muted border-t border-[color:var(--a-line)] pt-3 text-center text-xs">
              {t.auth.dontHaveAccount}{' '}
              <button
                type="button"
                onClick={() => { setError(null); setMode('signup'); }}
                className="mochi-auth-link"
              >
                {t.auth.createOne}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
