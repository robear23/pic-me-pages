-- Add columns to track missing covers and components
ALTER TABLE books 
ADD COLUMN IF NOT EXISTS missing_covers BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS missing_components TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_cover_attempt_at TIMESTAMPTZ;

-- Add index for querying partial books
CREATE INDEX IF NOT EXISTS idx_books_missing_covers ON books(missing_covers) WHERE missing_covers = true;

-- Update existing books to set missing_covers flag for books without covers
UPDATE books 
SET missing_covers = true,
    missing_components = ARRAY['front_cover', 'back_cover', 'cover_pdf']
WHERE (cover_image_url IS NULL OR back_cover_image_url IS NULL OR cover_url IS NULL)
  AND status = 'completed'
  AND pdf_url IS NOT NULL;