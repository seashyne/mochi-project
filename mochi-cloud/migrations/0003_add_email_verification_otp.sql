-- Migration 0003: Email verification OTP support for Mochi Cloud
-- Add is_verified flag to users table
ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;

-- Backfill existing users as verified
UPDATE users SET is_verified = 1 WHERE is_verified IS NULL OR is_verified = 0;

-- Create email verification OTPs table
CREATE TABLE IF NOT EXISTS email_verification_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- B-tree indexes for fast lookups and expiry sweeps
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_user_id ON email_verification_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email ON email_verification_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_expires_at ON email_verification_otps(expires_at);
