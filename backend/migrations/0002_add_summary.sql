-- Migration: Add summary column to notes table
-- This allows caching generated summaries for better performance

ALTER TABLE notes ADD COLUMN summary TEXT;
