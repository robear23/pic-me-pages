-- Add error tracking columns to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS error_log JSONB DEFAULT '[]';
ALTER TABLE books ADD COLUMN IF NOT EXISTS generation_attempts INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS last_error_timestamp TIMESTAMPTZ;
ALTER TABLE books ADD COLUMN IF NOT EXISTS failed_step TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS generation_duration_seconds INTEGER;
ALTER TABLE books ADD COLUMN IF NOT EXISTS generated_prompts JSONB;

-- Add indexes for efficient admin queries
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_failed ON books(status, last_error_timestamp) 
  WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_books_user_status ON books(user_id, status);