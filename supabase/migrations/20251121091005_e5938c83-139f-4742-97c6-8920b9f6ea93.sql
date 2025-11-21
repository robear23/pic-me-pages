-- Fix waitlist SELECT policy to be admin-only
DROP POLICY IF EXISTS "Anyone can sign up for waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Authenticated users can view waitlist" ON public.waitlist;

-- Allow anyone to insert (sign up)
CREATE POLICY "Anyone can sign up for waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view waitlist entries
CREATE POLICY "Only admins can view waitlist"
ON public.waitlist
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Verify payment hasn't been claimed - add unique constraint on stripe_payment_id
ALTER TABLE public.orders 
ADD CONSTRAINT unique_stripe_payment_id UNIQUE (stripe_payment_id);