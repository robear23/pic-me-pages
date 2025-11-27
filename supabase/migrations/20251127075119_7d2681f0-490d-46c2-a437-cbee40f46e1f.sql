-- Add lulu_status column to orders table to track order lifecycle
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS lulu_status text DEFAULT 'pending' CHECK (lulu_status IN ('pending', 'processing', 'shipped', 'rejected', 'cancelled'));

-- Add comment to document the column
COMMENT ON COLUMN public.orders.lulu_status IS 'Tracks the Lulu order status lifecycle: pending (created), processing (accepted by Lulu), shipped, rejected (failed validation), cancelled';

-- Create index for filtering orders by status
CREATE INDEX IF NOT EXISTS idx_orders_lulu_status ON public.orders(lulu_status);