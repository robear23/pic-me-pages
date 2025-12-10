-- Add admin UPDATE policy for books table so admins can reset book status
CREATE POLICY "Admins can update all books" 
ON public.books 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));