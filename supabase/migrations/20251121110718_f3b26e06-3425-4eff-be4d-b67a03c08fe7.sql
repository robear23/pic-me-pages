-- Fix security warnings: Add search_path to functions
-- Drop trigger first, then functions, then recreate with proper search_path

DROP TRIGGER IF EXISTS cleanup_stale_jobs_trigger ON book_generation_jobs;
DROP FUNCTION IF EXISTS trigger_cleanup_stale_jobs();
DROP FUNCTION IF EXISTS cleanup_stale_book_generation_jobs();

-- Recreate cleanup function with proper search_path
CREATE OR REPLACE FUNCTION cleanup_stale_book_generation_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Recreate trigger function with proper search_path
CREATE OR REPLACE FUNCTION trigger_cleanup_stale_jobs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Run cleanup in background (fire and forget)
  PERFORM cleanup_stale_book_generation_jobs();
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER cleanup_stale_jobs_trigger
AFTER INSERT ON book_generation_jobs
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_cleanup_stale_jobs();