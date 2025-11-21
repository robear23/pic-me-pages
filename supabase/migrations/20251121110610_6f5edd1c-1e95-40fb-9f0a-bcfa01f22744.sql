-- Create function to automatically cleanup stale jobs
-- Jobs stuck in 'processing' for more than 10 minutes will be marked as failed
CREATE OR REPLACE FUNCTION cleanup_stale_book_generation_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark jobs that have been processing for more than 10 minutes as failed
  UPDATE book_generation_jobs
  SET 
    status = 'failed',
    error_message = 'Job timed out - exceeded maximum processing time (10 minutes). Please retry your book generation.',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE 
    status = 'processing' 
    AND started_at < NOW() - INTERVAL '10 minutes'
    AND completed_at IS NULL;
    
  -- Log how many jobs were cleaned up
  RAISE NOTICE 'Cleaned up % stale jobs', (
    SELECT COUNT(*) 
    FROM book_generation_jobs 
    WHERE status = 'failed' 
    AND error_message LIKE 'Job timed out - exceeded maximum processing time%'
    AND completed_at > NOW() - INTERVAL '1 minute'
  );
END;
$$;

-- Create a trigger to run the cleanup function periodically
-- This runs every time the book_generation_jobs table is accessed
CREATE OR REPLACE FUNCTION trigger_cleanup_stale_jobs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Run cleanup in background (fire and forget)
  PERFORM cleanup_stale_book_generation_jobs();
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS cleanup_stale_jobs_trigger ON book_generation_jobs;

-- Create trigger that runs on INSERT to book_generation_jobs
-- This ensures cleanup runs whenever new jobs are created
CREATE TRIGGER cleanup_stale_jobs_trigger
AFTER INSERT ON book_generation_jobs
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_cleanup_stale_jobs();

-- Also run an initial cleanup now
SELECT cleanup_stale_book_generation_jobs();