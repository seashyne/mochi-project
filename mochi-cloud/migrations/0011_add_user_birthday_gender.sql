-- Migration 0011: Add birthday and gender columns for instant registration
ALTER TABLE users ADD COLUMN birthday TEXT;
ALTER TABLE users ADD COLUMN gender TEXT;
