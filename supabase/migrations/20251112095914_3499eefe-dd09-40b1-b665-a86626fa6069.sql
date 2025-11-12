-- Add cover_url column to books table
ALTER TABLE public.books ADD COLUMN cover_url TEXT;

-- Add index for faster lookups
CREATE INDEX idx_books_cover_url ON public.books(cover_url) WHERE cover_url IS NOT NULL;