-- Add RLS policy for admins to view all books (fixes Sync Status button)
CREATE POLICY "Admins can view all books" 
ON public.books 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));