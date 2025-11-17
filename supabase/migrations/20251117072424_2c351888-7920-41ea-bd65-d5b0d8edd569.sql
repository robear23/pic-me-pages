-- Add cover_image_url column to store the actual cover image URL
ALTER TABLE books 
ADD COLUMN cover_image_url TEXT;

-- Populate existing books with cover images from their first page
UPDATE books 
SET cover_image_url = pages->0->>'imageUrl'
WHERE cover_image_url IS NULL 
  AND pages IS NOT NULL 
  AND jsonb_array_length(pages) > 0;