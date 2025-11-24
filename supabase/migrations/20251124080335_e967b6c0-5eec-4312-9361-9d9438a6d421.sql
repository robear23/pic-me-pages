-- Update cleanup_stale_jobs to be smarter about paused jobs
CREATE OR REPLACE FUNCTION public.cleanup_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mark jobs as failed if heartbeat is stale (>5 minutes)
  UPDATE book_generation_jobs
  SET 
    status = 'failed',
    error_message = 'Job became unresponsive - no heartbeat for 5+ minutes',
    failure_reason = 'stale_heartbeat',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE 
    status = 'processing'
    AND last_heartbeat < NOW() - INTERVAL '5 minutes'
    AND started_at < NOW() - INTERVAL '5 minutes';
    
  -- Mark jobs as failed if stuck in pending for >30 minutes
  -- BUT ONLY if they never started processing (no book_id, no progress)
  UPDATE book_generation_jobs
  SET 
    status = 'failed',
    error_message = 'Job was never picked up by processing system - please retry',
    failure_reason = 'never_started',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE 
    status = 'pending'
    AND created_at < NOW() - INTERVAL '30 minutes'
    AND book_id IS NULL
    AND (progress IS NULL OR (progress->>'currentPage')::int = 0);
    
  -- Reset resumed jobs that got stuck (pending for 10+ mins AFTER making progress)
  UPDATE book_generation_jobs
  SET 
    status = 'pending',
    updated_at = NOW(),
    error_message = 'Resuming after pause'
  WHERE 
    status = 'pending'
    AND book_id IS NOT NULL
    AND updated_at < NOW() - INTERVAL '10 minutes'
    AND (progress->>'currentPage')::int > 0;
    
  -- Reset failed jobs with retries remaining
  UPDATE book_generation_jobs
  SET 
    status = 'pending',
    retry_count = retry_count + 1,
    started_at = NULL,
    last_heartbeat = NULL,
    error_message = NULL,
    updated_at = NOW()
  WHERE 
    status = 'failed'
    AND retry_count < max_retries
    AND completed_at > NOW() - INTERVAL '5 minutes'
    AND failure_reason IN ('stale_heartbeat', 'never_started', 'system_error');
    
  RAISE NOTICE 'Cleanup complete - stale jobs processed';
END;
$function$;