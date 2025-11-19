-- Add index on books.id for faster queries when filtering by book ID
-- This will improve performance when loading individual book pages
CREATE INDEX IF NOT EXISTS idx_books_id_pages ON books(id) 
WHERE pages IS NOT NULL;

-- Add comment to explain the index
COMMENT ON INDEX idx_books_id_pages IS 'Improves performance when loading book pages by ID';