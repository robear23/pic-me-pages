-- Clean up duplicate pending/processing jobs, keeping only the most recent one per book
WITH ranked_jobs AS (
  SELECT id, book_id, created_at, status,
         ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at DESC) as rn
  FROM book_generation_jobs
  WHERE status IN ('pending', 'processing')
    AND book_id IS NOT NULL
)
DELETE FROM book_generation_jobs 
WHERE id IN (
  SELECT id FROM ranked_jobs WHERE rn > 1
);