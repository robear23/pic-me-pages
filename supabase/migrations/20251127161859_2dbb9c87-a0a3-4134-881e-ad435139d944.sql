-- Create orders_uk table for UK Christmas launch system
CREATE TABLE orders_uk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  book_id uuid REFERENCES books(id),
  
  -- Product info
  product_type text NOT NULL CHECK (product_type IN ('pdf', 'booklet', 'booklet_upgrade')),
  child_name text NOT NULL,
  selected_interests text[],
  custom_prompt text,
  
  -- Pricing
  amount_paid numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  stripe_payment_id text UNIQUE,
  
  -- Customer info
  customer_email text NOT NULL,
  customer_name text,
  
  -- Shipping (null for PDF orders)
  shipping_address jsonb,
  special_instructions text,
  
  -- Files
  pdf_url text,
  
  -- Fulfillment status
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'pdf_sent', 'pending_fulfillment', 'uploaded_to_doxzoo', 'shipped', 'delivered')),
  
  -- Doxzoo fulfillment (for booklet orders)
  doxzoo_order_number text,
  tracking_number text,
  shipped_at timestamp with time zone,
  delivered_at timestamp with time zone,
  
  -- Original order (for upgrade flow)
  original_order_id uuid REFERENCES orders_uk(id),
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE orders_uk ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own UK orders" ON orders_uk
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own UK orders" ON orders_uk
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all UK orders" ON orders_uk
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update UK orders" ON orders_uk
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for performance
CREATE INDEX idx_orders_uk_user_id ON orders_uk(user_id);
CREATE INDEX idx_orders_uk_status ON orders_uk(status);
CREATE INDEX idx_orders_uk_product_type ON orders_uk(product_type);
CREATE INDEX idx_orders_uk_created_at ON orders_uk(created_at DESC);
CREATE INDEX idx_orders_uk_stripe_payment_id ON orders_uk(stripe_payment_id);

-- Add updated_at trigger
CREATE TRIGGER update_orders_uk_updated_at
  BEFORE UPDATE ON orders_uk
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();