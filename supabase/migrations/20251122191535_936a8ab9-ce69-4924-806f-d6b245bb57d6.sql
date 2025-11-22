-- Phase 5: Add database trigger for automatic cleanup
-- This trigger runs cleanup_stale_jobs() whenever a job is updated

CREATE OR REPLACE FUNCTION trigger_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  -- Run cleanup in background (fire and forget)
  PERFORM cleanup_stale_jobs();
  RETURN NEW;
END;
$$;

-- Create trigger that fires after any job update
CREATE TRIGGER auto_cleanup_stale_jobs
AFTER UPDATE ON book_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION trigger_cleanup();