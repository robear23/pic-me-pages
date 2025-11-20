-- Create retry credits table for tracking free retries
CREATE TABLE IF NOT EXISTS public.retry_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  reason text NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  used_at timestamp with time zone,
  created_by uuid,
  CONSTRAINT retry_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add RLS policies
ALTER TABLE public.retry_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own retry credits"
  ON public.retry_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert retry credits"
  ON public.retry_credits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own retry credits"
  ON public.retry_credits FOR UPDATE
  USING (auth.uid() = user_id);

-- Add index for efficient queries
CREATE INDEX idx_retry_credits_user_id ON public.retry_credits(user_id);
CREATE INDEX idx_retry_credits_book_id ON public.retry_credits(book_id);

-- Add partial status to books (update check constraint if exists, otherwise just allow it)
COMMENT ON COLUMN public.books.status IS 'Status: processing, completed, failed, partial';