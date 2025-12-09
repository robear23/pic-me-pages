-- Add admin RLS policies for book_generation_jobs table
-- These allow admins to view and update all jobs (needed for retry functionality)

CREATE POLICY "Admins can view all jobs" 
ON public.book_generation_jobs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all jobs" 
ON public.book_generation_jobs 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));