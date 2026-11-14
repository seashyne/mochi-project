// Friendly paper & clay sign-up form: birthday, username, email, password

import React, { useId, useMemo, useState } from 'react';
import { Eye, EyeOff, User, Lock, Mail, ChevronDown } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { languageMeta } from '../../i18n/registry';

export interface QuickSignupFormData {
  username: string;
  email: string;
  password: string;
  birthday?: string;
}

export interface QuickSignupFormProps {
  onSubmit: (data: QuickSignupFormData) => void;
  onSwitchToSignIn: () => void;
  isLoading: boolean;
  error: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const today = new Date();
const MIN_YEAR = today.getFullYear() - 100;
const MAX_YEAR = today.getFullYear() - 13;
const MIN_AGE_DATE = new Date(MAX_YEAR, today.getMonth(), today.getDate());

const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export const QuickSignupForm: React.FC<QuickSignupFormProps> = ({
  onSubmit,
  onSwitchToSignIn,
  isLoading,
  error
}) => {
  const { t, lang } = useI18n();
  const [birthdayDay, setBirthdayDay] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayYear, setBirthdayYear] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const birthdayLabelId = useId();

  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(languageMeta(lang).localeTag, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2020, i, 1)));
  }, [lang]);

  const readBirthday = (): string | null => {
    if (!birthdayDay || !birthdayMonth || !birthdayYear) return null;
    const day = Number(birthdayDay);
    const month = Number(birthdayMonth);
    const year = Number(birthdayYear);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    if (date > MIN_AGE_DATE) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUser.length < 3 || cleanUser.length > 20) {
      setValidationError(t.auth.usernameHint);
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setValidationError(t.profile.invalidEmail);
      return;
    }
    if (password.length < 6) {
      setValidationError(t.auth.passwordHint);
      return;
    }
    const birthday = readBirthday();
    if (!birthday) {
      setValidationError(t.auth.birthdayInvalid);
      return;
    }

    onSubmit({
      username: cleanUser,
      email: cleanEmail,
      password,
      birthday
    });
  };

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1 text-start">
        <h2 className="mochi-auth-title text-2xl">{t.auth.signUpTitle}</h2>
      </div>

      {displayError && (
        <div className="mochi-auth-error">
          <span>{displayError}</span>
        </div>
      )}

      <div className="text-start">
        <span id={birthdayLabelId} className="mochi-auth-label">
          {t.auth.birthday} <span className="mochi-auth-required">*</span>
        </span>
        <div
          className="mt-1.5 grid grid-cols-[1fr_1.35fr_1fr] gap-2"
          role="group"
          aria-labelledby={birthdayLabelId}
        >
          <div className="mochi-auth-select-wrap">
            <select
              value={birthdayDay}
              onChange={(e) => setBirthdayDay(e.target.value)}
              aria-label={t.auth.day}
              required
              className="mochi-auth-input mochi-auth-select"
            >
              <option value="">{t.auth.day}</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            <ChevronDown className="mochi-auth-select-chevron" />
          </div>
          <div className="mochi-auth-select-wrap">
            <select
              value={birthdayMonth}
              onChange={(e) => setBirthdayMonth(e.target.value)}
              aria-label={t.auth.month}
              required
              className="mochi-auth-input mochi-auth-select"
            >
              <option value="">{t.auth.month}</option>
              {monthNames.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
            <ChevronDown className="mochi-auth-select-chevron" />
          </div>
          <div className="mochi-auth-select-wrap">
            <select
              value={birthdayYear}
              onChange={(e) => setBirthdayYear(e.target.value)}
              aria-label={t.auth.year}
              required
              className="mochi-auth-input mochi-auth-select"
            >
              <option value="">{t.auth.year}</option>
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <ChevronDown className="mochi-auth-select-chevron" />
          </div>
        </div>
      </div>

      <div className="text-start">
        <label htmlFor={usernameId} className="mochi-auth-label">
          {t.auth.username} <span className="mochi-auth-required">*</span>
        </label>
        <div className="relative">
          <User className="mochi-auth-field-icon h-4 w-4" />
          <input
            id={usernameId}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t.auth.usernameHint}
            required
            minLength={3}
            maxLength={20}
            autoComplete="username"
            className="mochi-auth-input mochi-auth-input-icon"
          />
        </div>
      </div>

      <div className="text-start">
        <label htmlFor={emailId} className="mochi-auth-label">
          {t.auth.email} <span className="mochi-auth-required">*</span>
        </label>
        <div className="relative">
          <Mail className="mochi-auth-field-icon h-4 w-4" />
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.profile.emailPlaceholder}
            required
            autoComplete="email"
            className="mochi-auth-input mochi-auth-input-icon"
          />
        </div>
      </div>

      <div className="text-start">
        <label htmlFor={passwordId} className="mochi-auth-label">
          {t.auth.password} <span className="mochi-auth-required">*</span>
        </label>
        <div className="relative">
          <Lock className="mochi-auth-field-icon h-4 w-4" />
          <input
            id={passwordId}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.auth.passwordHint}
            required
            minLength={6}
            autoComplete="new-password"
            className="mochi-auth-input mochi-auth-input-icon mochi-auth-input-end"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
            className="mochi-auth-field-toggle"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mochi-auth-primary mochi-auth-primary-orange mt-1"
      >
        {isLoading ? t.auth.signingUp : t.auth.signUpBtn}
      </button>

      <div className="pt-1 text-center text-xs">
        <span className="mochi-auth-muted">{t.auth.alreadyHaveAccount} </span>
        <button type="button" onClick={onSwitchToSignIn} className="mochi-auth-link">
          {t.auth.signInNow}
        </button>
      </div>

      <p className="mochi-auth-legal">{t.auth.legalNotice}</p>
    </form>
  );
};

export default QuickSignupForm;
