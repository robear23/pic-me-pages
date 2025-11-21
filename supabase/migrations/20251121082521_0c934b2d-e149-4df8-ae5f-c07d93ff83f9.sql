-- Create book generation jobs table for background processing
CREATE TABLE book_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID REFERENCES books(id),
  status TEXT NOT NULL DEFAULT 'pending',
  progress JSONB DEFAULT '{"currentPage": 0, "totalPages": 0, "currentStep": "initializing"}'::jsonb,
  generation_data JSONB NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE book_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs"
  ON book_generation_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own jobs"
  ON book_generation_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- System can update any job (for edge function)
CREATE POLICY "System can update jobs"
  ON book_generation_jobs
  FOR UPDATE
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_book_generation_jobs_updated_at
  BEFORE UPDATE ON book_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for efficient queue processing
CREATE INDEX idx_jobs_status_created ON book_generation_jobs(status, created_at);
CREATE INDEX idx_jobs_user_id ON book_generation_jobs(user_id);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE book_generation_jobs;