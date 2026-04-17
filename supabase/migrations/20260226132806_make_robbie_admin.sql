DO $$ 
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user id
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'robbieforest2332@gmail.com';

  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
