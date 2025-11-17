-- Allow users to delete their own books
CREATE POLICY "Users can delete own books"
ON public.books
FOR DELETE
USING (auth.uid() = user_id);