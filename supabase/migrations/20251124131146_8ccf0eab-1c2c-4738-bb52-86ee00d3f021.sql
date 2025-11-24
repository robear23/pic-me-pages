-- FIX #4: Clean up stale jobs that block the queue
-- Cancel jobs that have been pending or processing for more than 30 minutes
UPDATE book_generation_jobs
SET 
  status = 'failed',
  error_message = 'Job cancelled - exceeded maximum pending/processing time (30 minutes)',
  failure_reason = 'timeout',
  completed_at = NOW(),
  updated_at = NOW()
WHERE 
  status IN ('pending', 'processing')
  AND updated_at < NOW() - INTERVAL '30 minutes'
  AND completed_at IS NULL;