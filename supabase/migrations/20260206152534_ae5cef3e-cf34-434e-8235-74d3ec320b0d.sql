-- Allow admins to create orders (for test mode bypass)
CREATE POLICY "Admins can create orders"
ON public.orders
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));