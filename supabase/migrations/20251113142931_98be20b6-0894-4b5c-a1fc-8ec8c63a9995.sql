-- Make storage buckets public so images can be accessed via public URLs
UPDATE storage.buckets 
SET public = true 
WHERE name IN ('generated-pages', 'pdfs');