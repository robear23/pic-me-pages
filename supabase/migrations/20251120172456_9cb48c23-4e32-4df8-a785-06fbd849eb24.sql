-- Create email_templates table
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  
  -- Content stored as JSONB for flexibility
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Brand colors
  primary_color text NOT NULL DEFAULT '#7c3aed',
  accent_color text NOT NULL DEFAULT '#faf5ff',
  
  -- Publishing state
  is_published boolean NOT NULL DEFAULT false,
  last_published_at timestamp with time zone,
  
  -- Version control
  version_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_edited_at timestamp with time zone DEFAULT now()
);

-- Trigger to update updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: Only admins can manage email templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));