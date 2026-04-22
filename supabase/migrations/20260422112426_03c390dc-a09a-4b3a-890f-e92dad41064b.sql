CREATE TABLE IF NOT EXISTS public.extra_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  earned_at DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.extra_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own extra earnings"
ON public.extra_earnings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own extra earnings"
ON public.extra_earnings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own extra earnings"
ON public.extra_earnings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extra earnings"
ON public.extra_earnings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_extra_earnings_updated_at
BEFORE UPDATE ON public.extra_earnings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_extra_earnings_user_year ON public.extra_earnings(user_id, year);