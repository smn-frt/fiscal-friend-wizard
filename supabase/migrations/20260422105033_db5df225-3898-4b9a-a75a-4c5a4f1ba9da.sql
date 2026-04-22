CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  invoice_number INTEGER NOT NULL,
  debtor TEXT NOT NULL,
  invoice_date DATE,
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_fund NUMERIC(12,2) NOT NULL DEFAULT 0,
  stamp_duty NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  pdf_file_name TEXT,
  pdf_storage_path TEXT,
  extracted_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, invoice_number)
);

CREATE TABLE public.tax_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  reference TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices"
ON public.invoices FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices"
ON public.invoices FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own tax payments"
ON public.tax_payments FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tax payments"
ON public.tax_payments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tax payments"
ON public.tax_payments FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tax payments"
ON public.tax_payments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_payments_updated_at
BEFORE UPDATE ON public.tax_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view their own invoice PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own invoice PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own invoice PDFs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own invoice PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE INDEX idx_invoices_user_year ON public.invoices(user_id, year);
CREATE INDEX idx_tax_payments_user_year ON public.tax_payments(user_id, year);