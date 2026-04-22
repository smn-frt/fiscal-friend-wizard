import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, Calculator, Coins, Eye, FileCheck2, FileText, FolderOpen, HandCoins, Plus, ReceiptText, ShieldCheck, UploadCloud } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { excelExtraEarnings, excelInvoices, excelTaxes, historicalYears } from "@/data/accountingSeed";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Invoice = {
  id: string;
  year: number;
  invoice_number: number;
  debtor: string;
  invoice_date: string | null;
  taxable_amount: number;
  pension_fund: number;
  stamp_duty: number;
  gross_total: number;
  pdf_file_name: string | null;
  pdf_storage_path: string | null;
  pdf_url?: string;
  source?: string;
};

type TaxPayment = { id: string; year: number; category: string; reference: string; amount: number; paid_at?: string | null; notes?: string | null; source?: string };

type TaxDeduction = { id: string; year: number; category: string; description: string; amount: number; paid_at?: string | null; notes?: string | null };

type ExtraEarning = { id: string; year: number; description: string; amount: number; earned_at?: string | null; notes?: string | null };

const taxCategories = ["Ordine ingegneri", "Assicurazione professionale", "INARCASSA (contributo soggettivo)", "INARCASSA (contributo integrativo)", "INARCASSA (contributo paternità)", "Spese F24", "Altro"];

const initialInvoices = excelInvoices as unknown as Invoice[];
const initialTaxes = excelTaxes as unknown as TaxPayment[];
const initialExtras = excelExtraEarnings as unknown as ExtraEarning[];

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const money = (value: number) => eur.format(value);

const parseAmount = (value?: string | null) => {
  if (!value) return 0;
  return Number(value.replace(/\./g, "").replace(",", "."));
};

const formatAmountInput = (value: number) => value ? value.toFixed(2).replace(".", ",") : "";

const pickDate = (text: string) => {
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const extractInvoice = (text: string, fileName: string): Omit<Invoice, "id" | "pdf_url"> => {
  const number = Number(text.match(/(?:Numero|Fattura)(?:\s+documento)?\s*:?\s*(\d+)/i)?.[1] ?? fileName.match(/(?:^|\D)(\d{1,3})(?:\D|$)/)?.[1] ?? 1);
  const date = pickDate(text);
  const year = Number(date?.slice(0, 4) ?? new Date().getFullYear());
  const debtor = text.match(/Cessionario\/committente\s+(.+?)\s+-\s+C\.F\./i)?.[1]?.trim() ?? "Cliente non riconosciuto";
  const amounts = [...text.matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g)].map((match) => match[0]);
  const firstLineAmount = parseAmount(text.match(/(?:Imponibile|Prezzo totale|Totale imponibile)[\s\S]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1] ?? text.match(/\n\s*([\d.]+,\d{2})\s*\n\s*Cassa previdenziale/i)?.[1] ?? amounts[0]);
  const pension = parseAmount(text.match(/(?:Cassa previdenziale|INARCASSA|Contributo)[\s\S]{0,140}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1]);
  const stamp = parseAmount(text.match(/(?:Bollo|Imposta di bollo)[\s\S]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1]);
  const total = parseAmount(text.match(/(?:TOTALE|Importo totale documento)[\s\S]{0,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1] ?? amounts.at(-1)) || firstLineAmount + pension + stamp;

  return {
    year,
    invoice_number: number,
    debtor,
    invoice_date: date,
    taxable_amount: firstLineAmount,
    pension_fund: pension,
    stamp_duty: stamp,
    gross_total: total,
    pdf_file_name: fileName,
    pdf_storage_path: null,
    source: "pdf",
  };
};

const extractPdfText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => ("str" in item ? item.str : "")).join("\n");
    }),
  );
  return pages.join("\n");
};

const Index = () => {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [taxes, setTaxes] = useState<TaxPayment[]>(initialTaxes);
  const [deductions, setDeductions] = useState<TaxDeduction[]>([]);
  const [extraEarnings, setExtraEarnings] = useState<ExtraEarning[]>(initialExtras);
  const [year, setYear] = useState<number | "all">(2026);
  const [uploading, setUploading] = useState(false);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [authDraft, setAuthDraft] = useState({ email: "", password: "" });
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [taxDraft, setTaxDraft] = useState({ category: "Ordine ingegneri", reference: "", amount: "", paid_at: "" });
  const [deductionDraft, setDeductionDraft] = useState({ category: "Altro", description: "", amount: "", paid_at: "" });
  const [invoiceDraft, setInvoiceDraft] = useState({ invoice_number: "", debtor: "", invoice_date: "", taxable_amount: "", pension_fund: "", stamp_duty: "" });
  const [extraDraft, setExtraDraft] = useState({ description: "", amount: "", earned_at: "", notes: "" });
  const [topChart, setTopChart] = useState<"gain" | "gross">("gain");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUserData = async (uid: string) => {
    const [{ data: invoiceRows }, { data: taxRows }, { data: deductionRows }, { data: extraRows }] = await Promise.all([
      supabase.from("invoices").select("*").order("year", { ascending: false }).order("invoice_number", { ascending: false }),
      supabase.from("tax_payments").select("*").order("year", { ascending: false }),
      (supabase as any).from("tax_deductions").select("*").order("year", { ascending: false }),
      (supabase as any).from("extra_earnings").select("*").order("year", { ascending: false }),
    ]);
    if (invoiceRows?.length) setInvoices([...invoiceRows, ...initialInvoices.filter((seed) => !invoiceRows.some((row) => row.year === seed.year && row.invoice_number === seed.invoice_number))]);
    if (taxRows?.length) setTaxes([...taxRows.map((row) => ({ ...row, category: row.category ?? "Altro" })), ...initialTaxes]);
    if (deductionRows?.length) setDeductions(deductionRows);
    if (extraRows?.length) setExtraEarnings([...extraRows, ...initialExtras.filter((seed) => !extraRows.some((row: ExtraEarning) => row.year === seed.year && row.description === seed.description && Number(row.amount) === Number(seed.amount))) ]);
  };

  useEffect(() => {
    const boot = async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? null;
      setSessionUser(uid);
      if (uid) await loadUserData(uid);
    };
    boot();
  }, []);

  const handleAuth = async () => {
    if (!authDraft.email || authDraft.password.length < 6) return toast.error("Inserisci email e password di almeno 6 caratteri");
    const action = authMode === "signup" ? supabase.auth.signUp(authDraft) : supabase.auth.signInWithPassword(authDraft);
    const { data, error } = await action;
    if (error) return toast.error("Accesso non riuscito", { description: error.message });
    const uid = data.user?.id ?? null;
    setSessionUser(uid);
    if (uid) await loadUserData(uid);
    toast.success(authMode === "signup" ? "Account creato" : "Accesso effettuato");
  };

  const yearOptions = useMemo(() => [...new Set([...historicalYears.map((item) => item.year), ...invoices.map((item) => item.year), ...taxes.map((item) => item.year), ...deductions.map((item) => item.year), ...extraEarnings.map((item) => item.year)])].sort((a, b) => b - a), [invoices, taxes, deductions, extraEarnings]);

  const chartData = useMemo(() => {
    const dynamic = yearOptions.map((currentYear) => {
      const existing = historicalYears.find((item) => item.year === currentYear);
      const annualInvoices = invoices.filter((item) => item.year === currentYear);
      const annualTaxes = taxes.filter((item) => item.year === currentYear).reduce((sum, item) => sum + Number(item.amount), 0);
      const annualExtra = extraEarnings.filter((item) => item.year === currentYear).reduce((sum, item) => sum + Number(item.amount), 0);
      if (!annualInvoices.length && existing) return { ...existing, extra: annualExtra, gain: Number(existing.gain) + annualExtra };
      const net = annualInvoices.reduce((sum, item) => sum + Number(item.taxable_amount), 0);
      const gross = annualInvoices.reduce((sum, item) => sum + Number(item.gross_total), 0);
      return { year: currentYear, invoices: annualInvoices.length, net, gross, taxes: annualTaxes, extra: annualExtra, gain: gross - annualTaxes + annualExtra };
    });
    return dynamic.sort((a, b) => a.year - b.year);
  }, [invoices, taxes, extraEarnings, yearOptions]);

  const selectedInvoices = invoices.filter((item) => year === "all" || item.year === year).sort((a, b) => a.year - b.year || a.invoice_number - b.invoice_number);
  const selectedTaxes = taxes.filter((item) => year === "all" || item.year === year);
  const selectedDeductions = deductions.filter((item) => year === "all" || item.year === year);
  const selectedExtras = extraEarnings.filter((item) => year === "all" || item.year === year);
  const selectedPdfInvoices = selectedInvoices.filter((item) => item.pdf_file_name || item.pdf_storage_path || item.pdf_url);
  const totalSummary = chartData.reduce((total, item) => ({
    net: total.net + Number(item.net),
    gross: total.gross + Number(item.gross),
    taxes: total.taxes + Number(item.taxes),
    extra: total.extra + Number(item.extra ?? 0),
    gain: total.gain + Number(item.gain),
    invoices: total.invoices + Number(item.invoices),
    pension: total.pension + invoices.filter((invoice) => invoice.year === item.year).reduce((sum, invoice) => sum + Number(invoice.pension_fund), 0),
  }), { net: 0, gross: 0, taxes: 0, extra: 0, gain: 0, invoices: 0, pension: 0 });
  const yearlySummary = chartData.find((item) => item.year === year);
  const yearlyPension = year === "all" ? 0 : invoices.filter((item) => item.year === year).reduce((sum, item) => sum + Number(item.pension_fund), 0);
  const current = year === "all" ? totalSummary : { ...(yearlySummary ?? { net: 0, gross: 0, taxes: 0, extra: 0, gain: 0, invoices: 0 }), pension: yearlyPension };
  const manualGross = parseAmount(invoiceDraft.taxable_amount) + parseAmount(invoiceDraft.pension_fund) + parseAmount(invoiceDraft.stamp_duty);
  const activeYearForNew = year === "all" ? new Date().getFullYear() : year;

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const text = await extractPdfText(file);
      const parsed = extractInvoice(text, file.name);
      let storagePath: string | null = null;
      let url: string | undefined = URL.createObjectURL(file);
      if (sessionUser) {
        storagePath = `${sessionUser}/${parsed.year}/${Date.now()}-${file.name}`;
        await supabase.storage.from("invoice-pdfs").upload(storagePath, file, { upsert: true });
        const { data: signed } = await supabase.storage.from("invoice-pdfs").createSignedUrl(storagePath, 60 * 60);
        url = signed?.signedUrl ?? url;
        const { source: _source, ...cleanParsed } = parsed;
        const invoiceRow = { ...cleanParsed, pdf_storage_path: storagePath, extracted_text: text, user_id: sessionUser };
        const { data, error } = await supabase
          .from("invoices")
          .insert([invoiceRow])
          .select("*")
          .single();
        if (error) throw error;
        setInvoices((items) => [{ ...data, pdf_url: url, source: "pdf" }, ...items.filter((item) => !(item.year === data.year && item.invoice_number === data.invoice_number))]);
      } else {
        setInvoices((items) => [{ ...parsed, id: crypto.randomUUID(), pdf_storage_path: storagePath, pdf_url: url }, ...items]);
      }
      setYear(parsed.year);
      toast.success("Fattura letta e archiviata", { description: `Imponibile ${money(parsed.taxable_amount)}, cassa ${money(parsed.pension_fund)}, bollo ${money(parsed.stamp_duty)}` });
    } catch (error) {
      toast.error("Non riesco a leggere questo PDF", { description: error instanceof Error ? error.message : "Carica una fattura elettronica in PDF leggibile." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addManualInvoice = async () => {
    const taxable = parseAmount(invoiceDraft.taxable_amount);
    const pension = parseAmount(invoiceDraft.pension_fund);
    const stamp = parseAmount(invoiceDraft.stamp_duty);
    const number = Number(invoiceDraft.invoice_number);
    if (!number || !invoiceDraft.debtor || !taxable) return toast.error("Inserisci numero, cliente e imponibile della fattura");
    const draft = {
      year: activeYearForNew,
      invoice_number: number,
      debtor: invoiceDraft.debtor,
      invoice_date: invoiceDraft.invoice_date || null,
      taxable_amount: taxable,
      pension_fund: pension,
      stamp_duty: stamp,
      gross_total: taxable + pension + stamp,
      pdf_file_name: null,
      pdf_storage_path: null,
    };
    if (sessionUser) {
      const { data, error } = await supabase.from("invoices").insert({ ...draft, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Fattura non salvata", { description: error.message });
      setInvoices((items) => [{ ...data, source: "manuale" }, ...items]);
    } else {
      setInvoices((items) => [{ ...draft, id: crypto.randomUUID(), source: "manuale" }, ...items]);
    }
    setInvoiceDraft({ invoice_number: "", debtor: "", invoice_date: "", taxable_amount: "", pension_fund: "", stamp_duty: "" });
    toast.success("Fattura inserita manualmente");
  };

  const addTax = async () => {
    const amount = parseAmount(taxDraft.amount);
    if (!taxDraft.reference || !amount) return;
    const draft = { year: activeYearForNew, category: taxDraft.category, reference: taxDraft.reference, amount, paid_at: taxDraft.paid_at || null, notes: null };
    if (sessionUser) {
      const { data, error } = await (supabase as any).from("tax_payments").insert({ ...draft, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Tassa non salvata", { description: error.message });
      setTaxes((items) => [data, ...items]);
    } else {
      setTaxes((items) => [{ ...draft, id: crypto.randomUUID() }, ...items]);
    }
    setTaxDraft({ category: "Ordine ingegneri", reference: "", amount: "", paid_at: "" });
  };

  const addDeduction = async () => {
    const amount = parseAmount(deductionDraft.amount);
    if (!deductionDraft.description || !amount) return;
    const draft = { year: activeYearForNew, category: deductionDraft.category, description: deductionDraft.description, amount, paid_at: deductionDraft.paid_at || null, notes: null };
    if (sessionUser) {
      const { data, error } = await (supabase as any).from("tax_deductions").insert({ ...draft, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Detrazione non salvata", { description: error.message });
      setDeductions((items) => [data, ...items]);
    } else {
      setDeductions((items) => [{ ...draft, id: crypto.randomUUID() }, ...items]);
    }
    setDeductionDraft({ category: "Altro", description: "", amount: "", paid_at: "" });
  };

  const addExtra = async () => {
    const amount = parseAmount(extraDraft.amount);
    if (!extraDraft.description || !amount) return toast.error("Inserisci descrizione e importo del guadagno extra");
    const draft = { year: activeYearForNew, description: extraDraft.description, amount, earned_at: extraDraft.earned_at || null, notes: extraDraft.notes || null };
    if (sessionUser) {
      const { data, error } = await (supabase as any).from("extra_earnings").insert({ ...draft, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Guadagno extra non salvato", { description: error.message });
      setExtraEarnings((items) => [data, ...items]);
    } else {
      setExtraEarnings((items) => [{ ...draft, id: crypto.randomUUID() }, ...items]);
    }
    setExtraDraft({ description: "", amount: "", earned_at: "", notes: "" });
    toast.success("Guadagno extra registrato");
  };

  const openPdf = async (invoice: Invoice) => {
    if (invoice.pdf_url) return window.open(invoice.pdf_url, "_blank");
    if (!invoice.pdf_storage_path) return;
    const { data } = await supabase.storage.from("invoice-pdfs").createSignedUrl(invoice.pdf_storage_path, 60 * 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <main className="min-h-screen overflow-hidden ledger-grid">
      <section className="relative bg-hero-ledger text-ledger-foreground">
        <div className="absolute inset-x-0 top-0 h-px bg-secondary/70" />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8 lg:py-10">
          <div className="flex min-h-[390px] flex-col justify-between gap-8 py-5">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-normal text-secondary">
              <ReceiptText className="h-5 w-5" /> Archivio fatture, tasse e andamento guadagni
            </div>
            <div className="max-w-3xl animate-rise-in">
              <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl lg:text-7xl">Contabilità</h1>
            </div>
            <div className="rounded-lg border border-ledger-foreground/15 bg-surface-raised/95 p-4 text-foreground shadow-ledger">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-surface-tint p-2 text-primary"><ShieldCheck className="h-5 w-5" /></span>
                  <h2 className="font-display text-xl font-bold">{topChart === "gain" ? "Andamento guadagni" : "Fatturato lordo, tasse ed extra"}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={topChart === "gain" ? "ledger" : "outline"} onClick={() => setTopChart("gain")}>Andamento guadagni</Button>
                  <Button size="sm" variant={topChart === "gross" ? "ledger" : "outline"} onClick={() => setTopChart("gross")}>Fatturato lordo, tasse ed extra</Button>
                </div>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  {topChart === "gain" ? (
                    <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Number(value) / 1000}k`} />
                      <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                      <Area type="monotone" dataKey="gain" name="Guadagno" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.18)" strokeWidth={3} />
                      <Area type="monotone" dataKey="taxes" name="Tasse" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.12)" strokeWidth={2} />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Number(value) / 1000}k`} />
                      <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="gross" name="Fatturato lordo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="taxes" name="Tasse" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="extra" name="Extra" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Fatturato lordo" value={money(current.gross)} />
              <Metric label="Tasse totali" value={money(current.taxes)} />
              <Metric label="Extra" value={money(current.extra ?? 0)} />
              <Metric label="Guadagno totale" value={money(current.gross - current.taxes + (current.extra ?? 0))} />
            </div>
            {!sessionUser ? (
              <div className="rounded-lg border border-ledger-foreground/15 bg-ledger-foreground/10 p-4 backdrop-blur-sm">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Input className="bg-ledger-foreground/95" type="email" placeholder="email" value={authDraft.email} onChange={(e) => setAuthDraft((draft) => ({ ...draft, email: e.target.value }))} />
                  <Input className="bg-ledger-foreground/95" type="password" placeholder="password" value={authDraft.password} onChange={(e) => setAuthDraft((draft) => ({ ...draft, password: e.target.value }))} />
                  <Button variant="warm" onClick={handleAuth}>{authMode === "signup" ? "Crea archivio" : "Accedi"}</Button>
                </div>
                <button className="mt-3 text-sm text-secondary underline-offset-4 hover:underline" onClick={() => setAuthMode((mode) => (mode === "signup" ? "signin" : "signup"))}>
                  {authMode === "signup" ? "Ho già un account" : "Crea un nuovo account"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative my-auto overflow-hidden rounded-lg border border-ledger-foreground/15 bg-surface-raised/95 p-4 text-foreground shadow-ledger">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Anno selezionato</p>
                <h2 className="font-display text-2xl font-bold">Riepilogo {year === "all" ? "totale" : year}</h2>
              </div>
              <Select value={String(year)} onValueChange={(value) => setYear(value === "all" ? "all" : Number(value))}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Anno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Totale</SelectItem>
                  {yearOptions.map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile icon={<Archive className="h-5 w-5" />} label="Fatture" value={`${current.invoices} registrate`} />
              <SummaryTile icon={<Calculator className="h-5 w-5" />} label="Fatturato lordo" value={money(current.gross)} />
              <SummaryTile icon={<ShieldCheck className="h-5 w-5" />} label="Totale cassa" value={money(current.pension)} />
              <SummaryTile icon={<FileText className="h-5 w-5" />} label="Tasse" value={money(current.taxes)} />
              <SummaryTile icon={<Coins className="h-5 w-5" />} label="Guadagni extra" value={money(current.extra ?? 0)} />
              <SummaryTile wide icon={<HandCoins className="h-5 w-5" />} label="Guadagno totale" value={money(current.gross - current.taxes + (current.extra ?? 0))} />
            </div>
            <Button className="mt-4 w-full" variant="warm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <UploadCloud className="h-4 w-4" /> {uploading ? "Lettura PDF…" : "Importa fattura PDF"}
            </Button>
            <input ref={fileRef} className="hidden" type="file" accept="application/pdf" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold">Archivio fatture, guadagni extra, tasse e detrazioni</h2>
          </div>
          <Select value={String(year)} onValueChange={(value) => setYear(value === "all" ? "all" : Number(value))}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Anno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totale</SelectItem>
              {yearOptions.map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="fatture" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start bg-surface-raised p-1 shadow-soft">
            <TabsTrigger value="fatture">Archivio fatture</TabsTrigger>
            <TabsTrigger value="pdf">PDF fatture</TabsTrigger>
            <TabsTrigger value="extra">Guadagni extra</TabsTrigger>
            <TabsTrigger value="tasse">Tasse</TabsTrigger>
            <TabsTrigger value="detrazioni">Detrazioni fiscali</TabsTrigger>
          </TabsList>


          <TabsContent value="fatture">
            <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Inserisci fattura" icon={<Plus className="h-5 w-5" />} action={<Button variant="warm" size="sm" onClick={() => fileRef.current?.click()}><UploadCloud className="h-4 w-4" /> PDF</Button>}>
                <div className="grid gap-3">
                  <Input placeholder="Numero fattura" inputMode="numeric" value={invoiceDraft.invoice_number} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, invoice_number: e.target.value }))} />
                  <Input placeholder="Cliente" value={invoiceDraft.debtor} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, debtor: e.target.value }))} />
                  <Input type="date" value={invoiceDraft.invoice_date} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, invoice_date: e.target.value }))} />
                  <Input placeholder="Imponibile, es. 1000,00" value={invoiceDraft.taxable_amount} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, taxable_amount: e.target.value }))} />
                  <Input placeholder="Cassa, es. 40,00" value={invoiceDraft.pension_fund} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, pension_fund: e.target.value }))} />
                  <Input placeholder="Bollo, es. 2,00" value={invoiceDraft.stamp_duty} onChange={(e) => setInvoiceDraft((draft) => ({ ...draft, stamp_duty: e.target.value }))} />
                  <div className="rounded-md border border-border bg-surface-tint p-3 text-sm font-semibold">Totale: {money(manualGross)}</div>
                  <Button variant="ledger" onClick={addManualInvoice}>Registra fattura</Button>
                </div>
              </Panel>
              <Panel title={`Archivio fatture ${year}`} icon={<FileCheck2 className="h-5 w-5" />}>
                <LedgerTable headers={["N°", "Cliente", "Data", "Imponibile", "Cassa", "Bollo", "Totale", "Origine", "PDF"]} empty="Nessuna fattura archiviata per questo anno.">
                  {selectedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                      <td className="px-3 py-3 font-semibold">{invoice.invoice_number}</td>
                      <td className="px-3 py-3">{invoice.debtor}</td>
                      <td className="px-3 py-3 text-muted-foreground">{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("it-IT") : "—"}</td>
                      <td className="px-3 py-3">{money(Number(invoice.taxable_amount))}</td>
                      <td className="px-3 py-3">{money(Number(invoice.pension_fund))}</td>
                      <td className="px-3 py-3">{money(Number(invoice.stamp_duty))}</td>
                      <td className="px-3 py-3 font-bold text-primary">{money(Number(invoice.gross_total))}</td>
                      <td className="px-3 py-3 text-muted-foreground">{invoice.source === "excel" ? "Excel" : invoice.pdf_storage_path || invoice.pdf_url ? "PDF" : "Manuale"}</td>
                      <td className="px-3 py-3"><Button variant="ghost" size="icon" onClick={() => openPdf(invoice)} aria-label="Apri PDF" disabled={!invoice.pdf_url && !invoice.pdf_storage_path}><Eye className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                </LedgerTable>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="pdf">
            <Panel title={`PDF fatture ${year}`} icon={<FolderOpen className="h-5 w-5" />} action={<Button variant="warm" size="sm" onClick={() => fileRef.current?.click()}><UploadCloud className="h-4 w-4" /> Importa PDF</Button>}>
              <LedgerTable headers={["N°", "Cliente", "Data", "File", "Totale", "Apri"]} empty="Nessun PDF archiviato per questo anno.">
                {selectedPdfInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                    <td className="px-3 py-3 font-semibold">{invoice.invoice_number}</td>
                    <td className="px-3 py-3">{invoice.debtor}</td>
                    <td className="px-3 py-3 text-muted-foreground">{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{invoice.pdf_file_name ?? "Fattura PDF"}</td>
                    <td className="px-3 py-3 font-bold text-primary">{money(Number(invoice.gross_total))}</td>
                    <td className="px-3 py-3"><Button variant="ghost" size="icon" onClick={() => openPdf(invoice)} aria-label="Apri PDF"><Eye className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </LedgerTable>
            </Panel>
          </TabsContent>

          <TabsContent value="extra">
            <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Nuovo guadagno extra" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Input placeholder="Descrizione" value={extraDraft.description} onChange={(e) => setExtraDraft((draft) => ({ ...draft, description: e.target.value }))} />
                  <Input placeholder="Importo imponibile, es. 500,00" value={extraDraft.amount} onChange={(e) => setExtraDraft((draft) => ({ ...draft, amount: e.target.value }))} />
                  <Input type="date" value={extraDraft.earned_at} onChange={(e) => setExtraDraft((draft) => ({ ...draft, earned_at: e.target.value }))} />
                  <Textarea placeholder="Note" value={extraDraft.notes} onChange={(e) => setExtraDraft((draft) => ({ ...draft, notes: e.target.value }))} />
                  <Button variant="ledger" onClick={addExtra}>Registra extra</Button>
                </div>
              </Panel>
              <Panel title={`Guadagni extra ${year}`} icon={<Coins className="h-5 w-5" />}>
                <LedgerTable headers={["Descrizione", "Data", "Importo", "Note"]} empty="Nessun guadagno extra registrato per questo anno.">
                  {selectedExtras.map((extra) => (
                    <tr key={extra.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                      <td className="px-3 py-3 font-semibold">{extra.description}</td>
                      <td className="px-3 py-3 text-muted-foreground">{extra.earned_at ? new Date(extra.earned_at).toLocaleDateString("it-IT") : "—"}</td>
                      <td className="px-3 py-3 font-bold text-secondary">{money(Number(extra.amount))}</td>
                      <td className="px-3 py-3 text-muted-foreground">{extra.notes || "—"}</td>
                    </tr>
                  ))}
                </LedgerTable>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="tasse">
            <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Nuova spesa/tassa" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Select value={taxDraft.category} onValueChange={(category) => setTaxDraft((draft) => ({ ...draft, category, reference: category === "Altro" ? draft.reference : category }))}>
                    <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>{taxCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder={taxDraft.category === "Altro" ? "Specifica la voce" : "Descrizione facoltativa"} value={taxDraft.reference} onChange={(e) => setTaxDraft((draft) => ({ ...draft, reference: e.target.value }))} />
                  <Input placeholder="Importo, es. 916,50" value={taxDraft.amount} onChange={(e) => setTaxDraft((draft) => ({ ...draft, amount: e.target.value }))} />
                  <Input type="date" value={taxDraft.paid_at} onChange={(e) => setTaxDraft((draft) => ({ ...draft, paid_at: e.target.value }))} />
                  <Button variant="ledger" onClick={addTax}>Registra pagamento</Button>
                </div>
              </Panel>
              <Panel title={`Tasse pagate ${year}`} icon={<FileText className="h-5 w-5" />}>
                <LedgerTable headers={["Categoria", "Riferimento", "Data", "Importo"]} empty="Nessuna tassa registrata per questo anno.">
                  {selectedTaxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                      <td className="px-3 py-3 text-muted-foreground">{tax.category}</td>
                      <td className="px-3 py-3 font-semibold">{tax.reference}</td>
                      <td className="px-3 py-3 text-muted-foreground">{tax.paid_at ? new Date(tax.paid_at).toLocaleDateString("it-IT") : "—"}</td>
                      <td className="px-3 py-3 font-bold text-accent">{money(Number(tax.amount))}</td>
                    </tr>
                  ))}
                </LedgerTable>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="detrazioni">
            <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Nuova detrazione" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Select value={deductionDraft.category} onValueChange={(category) => setDeductionDraft((draft) => ({ ...draft, category }))}>
                    <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>{taxCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Descrizione detrazione" value={deductionDraft.description} onChange={(e) => setDeductionDraft((draft) => ({ ...draft, description: e.target.value }))} />
                  <Input placeholder="Importo, es. 150,00" value={deductionDraft.amount} onChange={(e) => setDeductionDraft((draft) => ({ ...draft, amount: e.target.value }))} />
                  <Input type="date" value={deductionDraft.paid_at} onChange={(e) => setDeductionDraft((draft) => ({ ...draft, paid_at: e.target.value }))} />
                  <Button variant="ledger" onClick={addDeduction}>Registra detrazione</Button>
                </div>
              </Panel>
              <Panel title={`Detrazioni fiscali ${year}`} icon={<FileText className="h-5 w-5" />}>
                <LedgerTable headers={["Categoria", "Descrizione", "Data", "Importo"]} empty="Nessuna detrazione registrata per questo anno.">
                  {selectedDeductions.map((deduction) => (
                    <tr key={deduction.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                      <td className="px-3 py-3 text-muted-foreground">{deduction.category}</td>
                      <td className="px-3 py-3 font-semibold">{deduction.description}</td>
                      <td className="px-3 py-3 text-muted-foreground">{deduction.paid_at ? new Date(deduction.paid_at).toLocaleDateString("it-IT") : "—"}</td>
                      <td className="px-3 py-3 font-bold text-primary">{money(Number(deduction.amount))}</td>
                    </tr>
                  ))}
                </LedgerTable>
              </Panel>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-ledger-foreground/15 bg-ledger-foreground/10 p-4 backdrop-blur-sm">
    <p className="text-sm text-ledger-foreground/70">{label}</p>
    <p className="mt-1 font-display text-2xl font-bold">{value}</p>
  </div>
);

const SummaryTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-md border border-border bg-surface-tint p-4">
    <div className="mb-3 flex items-center gap-2 text-primary">{icon}<span className="text-sm font-semibold uppercase">{label}</span></div>
    <p className="font-display text-2xl font-bold">{value}</p>
  </div>
);

const Panel = ({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-soft">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-surface-tint p-2 text-primary">{icon}</span>
        <h3 className="font-display text-xl font-bold">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const LedgerTable = ({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-md border border-border">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse bg-card text-sm">
        <thead className="bg-ledger text-ledger-foreground">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-3 text-left font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {!Array.isArray(children) || children.length === 0 ? <div className="p-8 text-center text-muted-foreground">{empty}</div> : null}
    </div>
  </div>
);

export default Index;
