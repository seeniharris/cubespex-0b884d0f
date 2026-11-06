CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT display_name_len CHECK (char_length(display_name) <= 40)
);
CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u text;
BEGIN
  u := lower(coalesce(NEW.raw_user_meta_data->>'username', ''));
  IF u !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, u, left(coalesce(NEW.raw_user_meta_data->>'display_name', u), 40));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(_username));
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.username := lower(NEW.username); NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_profile();