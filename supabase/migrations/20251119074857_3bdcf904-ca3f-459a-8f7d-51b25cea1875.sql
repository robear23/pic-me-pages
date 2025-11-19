-- Add column to track which pages have been reworked
ALTER TABLE public.books
ADD COLUMN reworked_page_numbers integer[] DEFAULT ARRAY[]::integer[];