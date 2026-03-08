-- Add date_of_birth column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Prevent users from changing their date_of_birth once set (same pattern as gender).
CREATE OR REPLACE FUNCTION public.prevent_dob_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'date_of_birth cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dob_change ON public.profiles;
CREATE TRIGGER trg_prevent_dob_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_dob_change();
