-- Add back_cover_image_url column to books table for Lulu cover generation
ALTER TABLE books ADD COLUMN IF NOT EXISTS back_cover_image_url TEXT;