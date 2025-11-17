-- Add book options columns to books table
ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS selected_page_count integer DEFAULT 12,
ADD COLUMN IF NOT EXISTS selected_binding_type text DEFAULT 'premium',
ADD COLUMN IF NOT EXISTS selected_pod_package_id text,
ADD COLUMN IF NOT EXISTS selected_price numeric(10, 2) DEFAULT 24.99;

-- Add comments for documentation
COMMENT ON COLUMN public.books.selected_page_count IS 'Number of pages selected by user (12, 24, or 32)';
COMMENT ON COLUMN public.books.selected_binding_type IS 'Binding type: standard (saddle stitch) or premium (coil)';
COMMENT ON COLUMN public.books.selected_pod_package_id IS 'Lulu POD package identifier for print-on-demand';
COMMENT ON COLUMN public.books.selected_price IS 'Price in USD for the selected book configuration';