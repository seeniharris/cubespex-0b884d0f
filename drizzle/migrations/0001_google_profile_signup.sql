CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u text; social boolean;
BEGIN
  social := coalesce(NEW.raw_app_meta_data->>'provider', 'email') = 'google';
  IF social THEN
    LOOP
      u := 'cuber_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
      BEGIN
        INSERT INTO public.profiles (id, username, display_name)
        VALUES (NEW.id, u, left(coalesce(NEW.raw_user_meta_data->>'full_name', u), 40));
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN RAISE; END IF;
      END;
    END LOOP;
  ELSE
    u := lower(trim(coalesce(NEW.raw_user_meta_data->>'username', '')));
    IF u !~ '^[a-z0-9_]{3,20}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (NEW.id, u, left(coalesce(NEW.raw_user_meta_data->>'display_name', u), 40));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(trim(_username)));
$$;
REVOKE ALL ON FUNCTION public.username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
