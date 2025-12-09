-- Enable pg_cron and pg_net extensions for scheduled queue processing
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to trigger queue-worker every 30 seconds
-- Using cron syntax: every minute, but with pg_net we can achieve more frequent polling
SELECT cron.schedule(
  'process-book-queue',
  '* * * * *', -- Every minute (pg_cron minimum is 1 minute)
  $$
  SELECT net.http_post(
    url := 'https://yzcqvuidasgljeifvmxk.supabase.co/functions/v1/queue-worker',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Add a second job offset by 30 seconds to achieve ~30 second polling
SELECT cron.schedule(
  'process-book-queue-2',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://yzcqvuidasgljeifvmxk.supabase.co/functions/v1/queue-worker',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);