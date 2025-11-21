-- Drop the existing foreign key constraint
ALTER TABLE book_generation_jobs 
DROP CONSTRAINT IF EXISTS book_generation_jobs_book_id_fkey;

-- Recreate the constraint with CASCADE DELETE
-- This will automatically delete related job records when a book is deleted
ALTER TABLE book_generation_jobs
ADD CONSTRAINT book_generation_jobs_book_id_fkey 
FOREIGN KEY (book_id) 
REFERENCES books(id) 
ON DELETE CASCADE;