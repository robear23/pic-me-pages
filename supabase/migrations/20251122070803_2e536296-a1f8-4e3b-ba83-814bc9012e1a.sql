-- Phase 1: Add job tracking columns
ALTER TABLE book_generation_jobs 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failure_reason TEXT,
ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

-- Add indexes for efficient job queries
CREATE INDEX IF NOT EXISTS idx_jobs_status_created 
ON book_generation_jobs(status, created_at, started_at);

CREATE INDEX IF NOT EXISTS idx_jobs_heartbeat 
ON book_generation_jobs(status, last_heartbeat) 
WHERE status = 'processing';

-- Add index for retry credits
CREATE INDEX IF NOT EXISTS idx_retry_credits_user_unused 
ON retry_credits(user_id, used_at) 
WHERE used_at IS NULL;

-- Phase 2: Create automated cleanup function
CREATE OR REPLACE FUNCTION cleanup_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Mark jobs as failed if heartbeat is stale (>3 minutes)
  UPDATE book_generation_jobs
  SET 
    status = 'failed',
    error_message = 'Job became unresponsive - system detected no heartbeat for 3+ minutes',
    failure_reason = 'stale_heartbeat',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE 
    status = 'processing'
    AND (last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '3 minutes')
    AND started_at < NOW() - INTERVAL '3 minutes';
    
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
$$;

-- Create trigger to run cleanup periodically
CREATE OR REPLACE FUNCTION trigger_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM cleanup_stale_jobs();
  RETURN NEW;
END;
$$;

-- Phase 6: Create function for admin stats
CREATE OR REPLACE FUNCTION get_job_stats(time_window_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  avg_duration_minutes NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour' * time_window_hours) as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '1 hour' * time_window_hours) as failed_count,
    ROUND(AVG(processing_duration_ms) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour' * time_window_hours) / 60000.0, 1) as avg_duration_minutes
  FROM book_generation_jobs;
END;
$$;