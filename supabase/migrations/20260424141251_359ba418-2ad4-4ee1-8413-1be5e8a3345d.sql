
CREATE TABLE public.future_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  agreed_amount NUMERIC NOT NULL DEFAULT 0,
  expected_payment_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  collected_at DATE,
  collected_amount NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.future_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own future jobs"
ON public.future_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own future jobs"
ON public.future_jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own future jobs"
ON public.future_jobs FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own future jobs"
ON public.future_jobs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_future_jobs_updated_at
BEFORE UPDATE ON public.future_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
