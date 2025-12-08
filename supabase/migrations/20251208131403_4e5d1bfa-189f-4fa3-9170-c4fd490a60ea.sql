-- Add cover_regeneration_count column to books table
ALTER TABLE public.books ADD COLUMN cover_regeneration_count integer DEFAULT 0;