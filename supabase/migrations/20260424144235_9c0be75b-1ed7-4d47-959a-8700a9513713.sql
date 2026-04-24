-- Add new fields to future_jobs for offer PDF, recurring jobs, and conversion to invoice
ALTER TABLE public.future_jobs
  ADD COLUMN IF NOT EXISTS offer_pdf_path text,
  ADD COLUMN IF NOT EXISTS offer_pdf_name text,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_start_date date,
  ADD COLUMN IF NOT EXISTS recurring_monthly_amount numeric,
  ADD COLUMN IF NOT EXISTS converted_to_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_invoice_id uuid;

-- Storage bucket for offer PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('offer-pdfs', 'offer-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for offer-pdfs bucket
CREATE POLICY "Users can view their own offer PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'offer-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own offer PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'offer-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own offer PDFs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'offer-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own offer PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'offer-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage bucket for signature/stamp images (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view their own signature"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own signature"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own signature"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own signature"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Recurring expenses table
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Altro',
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly', -- monthly, quarterly, yearly, one_off
  next_due_date date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recurring expenses"
ON public.recurring_expenses FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recurring expenses"
ON public.recurring_expenses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring expenses"
ON public.recurring_expenses FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring expenses"
ON public.recurring_expenses FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_recurring_expenses_updated_at
BEFORE UPDATE ON public.recurring_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();