-- Add index to improve job query performance and prevent timeouts
CREATE INDEX IF NOT EXISTS idx_book_generation_jobs_status_created 
ON book_generation_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_book_generation_jobs_user_status 
ON book_generation_jobs(user_id, status);