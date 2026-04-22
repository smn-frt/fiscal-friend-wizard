ALTER TABLE public.tax_payments
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Altro';

CREATE TABLE IF NOT EXISTS public.tax_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  year integer NOT NULL,
  category text NOT NULL DEFAULT 'Altro',
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  paid_at date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tax deductions"
ON public.tax_deductions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tax deductions"
ON public.tax_deductions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tax deductions"
ON public.tax_deductions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tax deductions"
ON public.tax_deductions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_tax_deductions_updated_at
BEFORE UPDATE ON public.tax_deductions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();