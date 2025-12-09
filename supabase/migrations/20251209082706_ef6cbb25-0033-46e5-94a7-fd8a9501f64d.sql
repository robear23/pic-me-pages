-- Add queue management columns to book_generation_jobs
ALTER TABLE book_generation_jobs 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS worker_id text,
ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;

-- Create index for efficient queue ordering
CREATE INDEX IF NOT EXISTS idx_jobs_queue_order ON book_generation_jobs (status, priority DESC, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON book_generation_jobs (worker_id) WHERE worker_id IS NOT NULL;

-- Create system_config table for runtime settings
CREATE TABLE IF NOT EXISTS system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write system config
CREATE POLICY "Admins can manage system config" 
ON system_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default configuration
INSERT INTO system_config (key, value) VALUES
  ('max_concurrent_jobs', '3'),
  ('daily_spend_limit_usd', '50'),
  ('current_daily_spend_usd', '0'),
  ('daily_spend_reset_at', to_jsonb(now()::text))
ON CONFLICT (key) DO NOTHING;

-- Create api_usage_logs table for cost tracking
CREATE TABLE api_usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES book_generation_jobs(id) ON DELETE SET NULL,
  api_name text NOT NULL,
  tokens_used integer,
  estimated_cost_usd decimal(10, 6),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on api_usage_logs
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view API usage logs
CREATE POLICY "Admins can view API usage logs" 
ON api_usage_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert logs (from edge functions)
CREATE POLICY "System can insert API usage logs" 
ON api_usage_logs 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for api_usage_logs
CREATE INDEX idx_usage_by_date ON api_usage_logs (created_at);
CREATE INDEX idx_usage_by_job ON api_usage_logs (job_id);
CREATE INDEX idx_usage_by_api ON api_usage_logs (api_name, created_at);

-- Create function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats(time_window_hours integer DEFAULT 24)
RETURNS TABLE(
  pending_count bigint,
  processing_count bigint,
  completed_today bigint,
  failed_today bigint,
  daily_spend_usd decimal,
  avg_generation_time_minutes numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM book_generation_jobs WHERE status = 'pending') as pending_count,
    (SELECT COUNT(*) FROM book_generation_jobs WHERE status = 'processing') as processing_count,
    (SELECT COUNT(*) FROM book_generation_jobs WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 day') as completed_today,
    (SELECT COUNT(*) FROM book_generation_jobs WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '1 day') as failed_today,
    (SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '1 day') as daily_spend_usd,
    (SELECT ROUND(AVG(processing_duration_ms) / 60000.0, 1) FROM book_generation_jobs WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour' * time_window_hours) as avg_generation_time_minutes;
END;
$$;