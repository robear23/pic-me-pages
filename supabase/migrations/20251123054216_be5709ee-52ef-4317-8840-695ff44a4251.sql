-- PHASE 5: Enhance cleanup_stale_jobs() to be more aggressive

CREATE OR REPLACE FUNCTION public.cleanup_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Mark jobs as failed if heartbeat is stale (>5 minutes, more aggressive than before)
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
  UPDATE book_generation_jobs
  SET 
    status = 'failed',
    error_message = 'Job was never picked up by processing system - please retry',
    failure_reason = 'never_started',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE 
    status = 'pending'
    AND created_at < NOW() - INTERVAL '30 minutes';
    
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