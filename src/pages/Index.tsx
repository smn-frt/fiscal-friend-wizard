import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, Eye, FileCheck2, FileText, Plus, ReceiptText, ScanLine, ShieldCheck, UploadCloud } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
};

type TaxPayment = { id: string; year: number; reference: string; amount: number; paid_at?: string | null; notes?: string | null };

const historicalYears = [
  { year: 2021, invoices: 12, net: 18950, gross: 19732, taxes: 6423.96, gain: 13308.04 },
  { year: 2022, invoices: 14, net: 34519.5, gross: 35928.28, taxes: 5061.95, gain: 30866.33 },
  { year: 2023, invoices: 17, net: 48639.42, gross: 50619, taxes: 10439.37, gain: 40179.63 },
  { year: 2024, invoices: 18, net: 45358.05, gross: 47208.37, taxes: 6097.91, gain: 41110.46 },
  { year: 2025, invoices: 23, net: 52350, gross: 54490, taxes: 2349.5, gain: 52140.5 },
];

const initialInvoices: Invoice[] = [
  {
    id: "sample-2026-1",
    year: 2026,
    invoice_number: 1,
    debtor: "INTAGO ENGINEERING S.R.L.",
    invoice_date: "2026-01-07",
    taxable_amount: 3000,
    pension_fund: 120,
    stamp_duty: 2,
    gross_total: 3122,
    pdf_file_name: "01_ITFRTSMN93P22H501R_M4uia.pdf",
    pdf_storage_path: null,
    pdf_url: "/invoices/01_ITFRTSMN93P22H501R_M4uia.pdf",
  },
];

const initialTaxes: TaxPayment[] = [
  { id: "tax-2026-ordine", year: 2026, reference: "ORDINE INGEGNERI", amount: 110 },
  { id: "tax-2025-ordine", year: 2025, reference: "ORDINE INGEGNERI", amount: 110 },
  { id: "tax-2025-ass", year: 2025, reference: "ASSICURAZIONE PROFESSIONALE", amount: 211 },
  { id: "tax-2025-inarcassa-s", year: 2025, reference: "INARCASSA SOGGETTIVO", amount: 916.5 },
  { id: "tax-2025-inarcassa-i", year: 2025, reference: "INARCASSA INTEGRATIVO", amount: 278.5 },
  { id: "tax-2025-ade", year: 2025, reference: "ADE P.IVA", amount: 742.5 },
];

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const money = (value: number) => eur.format(value);

const parseAmount = (value?: string | null) => {
  if (!value) return 0;
  return Number(value.replace(/\./g, "").replace(",", "."));
};

const pickDate = (text: string) => {
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const extractInvoice = (text: string, fileName: string): Omit<Invoice, "id" | "pdf_url"> => {
  const number = Number(text.match(/Numero:\s*(\d+)/i)?.[1] ?? fileName.match(/(?:^|\D)(\d{1,3})(?:\D|$)/)?.[1] ?? 1);
  const date = pickDate(text);
  const year = Number(date?.slice(0, 4) ?? new Date().getFullYear());
  const debtor = text.match(/Cessionario\/committente\s+(.+?)\s+-\s+C\.F\./i)?.[1]?.trim() ?? "Cliente non riconosciuto";
  const firstLineAmount = parseAmount(text.match(/<td>([\d.]+,\d{2})<\/td>/i)?.[1] ?? text.match(/\n\s*([\d.]+,\d{2})\s*\n\s*Cassa previdenziale/i)?.[1]);
  const pension = parseAmount(text.match(/Cassa previdenziale[\s\S]*?<td>(\d{1,3},\d{2})<\/td>/i)?.[1] ?? text.match(/4,00%[\s\S]*?(\d{1,3},\d{2})/i)?.[1]);
  const stamp = parseAmount(text.match(/Bollo[\s\S]*?Importo\s*(\d{1,3},\d{2})/i)?.[1]);
  const total = parseAmount(text.match(/TOTALE[\s\S]*?(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1]) || firstLineAmount + pension + stamp;

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
  const [year, setYear] = useState(2026);
  const [uploading, setUploading] = useState(false);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [authDraft, setAuthDraft] = useState({ email: "", password: "" });
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [taxDraft, setTaxDraft] = useState({ reference: "", amount: "", paid_at: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const boot = async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? null;
      setSessionUser(uid);
      if (!uid) return;
      const [{ data: invoiceRows }, { data: taxRows }] = await Promise.all([
        supabase.from("invoices").select("*").order("year", { ascending: false }).order("invoice_number", { ascending: false }),
        supabase.from("tax_payments").select("*").order("year", { ascending: false }),
      ]);
      if (invoiceRows?.length) setInvoices([initialInvoices[0], ...invoiceRows.filter((row) => row.id !== initialInvoices[0].id)]);
      if (taxRows?.length) setTaxes([...initialTaxes, ...taxRows]);
    };
    boot();
  }, []);

  const handleAuth = async () => {
    if (!authDraft.email || authDraft.password.length < 6) return toast.error("Inserisci email e password di almeno 6 caratteri");
    const action = authMode === "signup" ? supabase.auth.signUp(authDraft) : supabase.auth.signInWithPassword(authDraft);
    const { data, error } = await action;
    if (error) return toast.error("Accesso non riuscito", { description: error.message });
    setSessionUser(data.user?.id ?? null);
    toast.success(authMode === "signup" ? "Account creato" : "Accesso effettuato");
  };

  const yearOptions = useMemo(() => [...new Set([...historicalYears.map((item) => item.year), ...invoices.map((item) => item.year), ...taxes.map((item) => item.year)])].sort((a, b) => b - a), [invoices, taxes]);

  const chartData = useMemo(() => {
    const dynamic = yearOptions.map((currentYear) => {
      const existing = historicalYears.find((item) => item.year === currentYear);
      const annualInvoices = invoices.filter((item) => item.year === currentYear);
      const annualTaxes = taxes.filter((item) => item.year === currentYear).reduce((sum, item) => sum + Number(item.amount), 0);
      if (!annualInvoices.length && existing) return existing;
      const net = annualInvoices.reduce((sum, item) => sum + Number(item.taxable_amount), 0);
      const gross = annualInvoices.reduce((sum, item) => sum + Number(item.gross_total), 0);
      return { year: currentYear, invoices: annualInvoices.length, net, gross, taxes: annualTaxes, gain: gross - annualTaxes };
    });
    return dynamic.sort((a, b) => a.year - b.year);
  }, [invoices, taxes, yearOptions]);

  const selectedInvoices = invoices.filter((item) => item.year === year).sort((a, b) => a.invoice_number - b.invoice_number);
  const selectedTaxes = taxes.filter((item) => item.year === year);
  const current = chartData.find((item) => item.year === year) ?? { net: 0, gross: 0, taxes: 0, gain: 0, invoices: 0 };

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
        const invoiceRow = { ...parsed, pdf_storage_path: storagePath, extracted_text: text, user_id: sessionUser };
        const { data, error } = await supabase
          .from("invoices")
          .upsert([invoiceRow], { onConflict: "user_id,year,invoice_number" })
          .select("*")
          .single();
        if (error) throw error;
        setInvoices((items) => [{ ...data, pdf_url: url }, ...items.filter((item) => !(item.year === data.year && item.invoice_number === data.invoice_number))]);
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

  const addTax = async () => {
    const amount = parseAmount(taxDraft.amount);
    if (!taxDraft.reference || !amount) return;
    const draft = { year, reference: taxDraft.reference, amount, paid_at: taxDraft.paid_at || null, notes: null };
    if (sessionUser) {
      const { data, error } = await supabase.from("tax_payments").insert({ ...draft, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Tassa non salvata", { description: error.message });
      setTaxes((items) => [data, ...items]);
    } else {
      setTaxes((items) => [{ ...draft, id: crypto.randomUUID() }, ...items]);
    }
    setTaxDraft({ reference: "", amount: "", paid_at: "" });
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
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-10">
          <div className="flex min-h-[420px] flex-col justify-between gap-8 py-5">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-normal text-secondary">
              <ReceiptText className="h-5 w-5" /> Studio contabile fatture
            </div>
            <div className="max-w-3xl animate-rise-in">
              <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl lg:text-7xl">Archivio fatture e riepilogo forfettario</h1>
              <p className="mt-5 max-w-2xl text-lg text-ledger-foreground/82">Carica un PDF: l’app legge numero, data, cliente, imponibile, cassa, bollo e totale, poi aggiorna automaticamente anno, archivio e grafici.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Fatturato lordo" value={money(current.gross)} />
              <Metric label="Tasse/costi" value={money(current.taxes)} />
              <Metric label="Guadagno" value={money(current.gain)} />
            </div>
          </div>
          <div className="relative my-auto overflow-hidden rounded-lg border border-ledger-foreground/15 bg-surface-raised/95 p-4 text-foreground shadow-ledger">
            <div className="pointer-events-none absolute inset-x-4 top-0 h-16 animate-scan-line bg-gradient-to-b from-secondary/0 via-secondary/25 to-secondary/0 motion-reduce:hidden" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Scanner PDF</p>
                <h2 className="font-display text-2xl font-bold">Import automatico</h2>
              </div>
              <ScanLine className="h-8 w-8 text-accent" />
            </div>
            <button onClick={() => fileRef.current?.click()} className="group flex min-h-[210px] w-full flex-col items-center justify-center rounded-md border border-dashed border-primary/45 bg-surface-tint p-6 text-center transition duration-300 hover:-translate-y-1 hover:border-secondary hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <UploadCloud className="mb-4 h-12 w-12 text-primary transition group-hover:scale-110" />
              <span className="font-display text-xl font-semibold">{uploading ? "Lettura del PDF in corso…" : "Carica fattura PDF"}</span>
              <span className="mt-2 text-sm text-muted-foreground">Esempio incluso: fattura 1/2026 già catalogata dal PDF allegato.</span>
            </button>
            <input ref={fileRef} className="hidden" type="file" accept="application/pdf" onChange={(event) => handleUpload(event.target.files?.[0])} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold">Riepilogo annuale</h2>
            <p className="text-muted-foreground">Struttura basata sulle schede Excel: fatture, tasse e andamento guadagni.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {yearOptions.map((item) => (
              <Button key={item} variant={item === year ? "ledger" : "outline"} size="sm" onClick={() => setYear(item)}>{item}</Button>
            ))}
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start bg-surface-raised p-1 shadow-soft">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="fatture">Fatture</TabsTrigger>
            <TabsTrigger value="tasse">Tasse pagate</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <Panel title="Andamento guadagni" icon={<ShieldCheck className="h-5 w-5" />}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Number(value) / 1000}k`} />
                      <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                      <Area type="monotone" dataKey="gain" name="Guadagno" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.18)" strokeWidth={3} />
                      <Area type="monotone" dataKey="taxes" name="Tasse" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.12)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Netto, lordo, tasse" icon={<Archive className="h-5 w-5" />}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `${Number(value) / 1000}k`} />
                      <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }} />
                      <Bar dataKey="net" name="Netto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="gross" name="Lordo" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="taxes" name="Tasse" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="fatture">
            <Panel title={`Fatture ${year}`} icon={<FileCheck2 className="h-5 w-5" />} action={<Button variant="warm" size="sm" onClick={() => fileRef.current?.click()}><Plus className="h-4 w-4" /> PDF</Button>}>
              <LedgerTable headers={["N°", "Cliente", "Data", "Imponibile", "Cassa", "Bollo", "Totale", "PDF"]} empty="Nessuna fattura archiviata per questo anno.">
                {selectedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                    <td className="px-3 py-3 font-semibold">{invoice.invoice_number}</td>
                    <td className="px-3 py-3">{invoice.debtor}</td>
                    <td className="px-3 py-3 text-muted-foreground">{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="px-3 py-3">{money(Number(invoice.taxable_amount))}</td>
                    <td className="px-3 py-3">{money(Number(invoice.pension_fund))}</td>
                    <td className="px-3 py-3">{money(Number(invoice.stamp_duty))}</td>
                    <td className="px-3 py-3 font-bold text-primary">{money(Number(invoice.gross_total))}</td>
                    <td className="px-3 py-3"><Button variant="ghost" size="icon" onClick={() => openPdf(invoice)} aria-label="Apri PDF"><Eye className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </LedgerTable>
            </Panel>
          </TabsContent>

          <TabsContent value="tasse">
            <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Nuova tassa" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Input placeholder="Riferimento, es. INARCASSA" value={taxDraft.reference} onChange={(e) => setTaxDraft((draft) => ({ ...draft, reference: e.target.value }))} />
                  <Input placeholder="Importo, es. 916,50" value={taxDraft.amount} onChange={(e) => setTaxDraft((draft) => ({ ...draft, amount: e.target.value }))} />
                  <Input type="date" value={taxDraft.paid_at} onChange={(e) => setTaxDraft((draft) => ({ ...draft, paid_at: e.target.value }))} />
                  <Button variant="ledger" onClick={addTax}>Registra pagamento</Button>
                </div>
              </Panel>
              <Panel title={`Tasse pagate ${year}`} icon={<FileText className="h-5 w-5" />}>
                <LedgerTable headers={["Riferimento", "Data", "Importo"]} empty="Nessuna tassa registrata per questo anno.">
                  {selectedTaxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                      <td className="px-3 py-3 font-semibold">{tax.reference}</td>
                      <td className="px-3 py-3 text-muted-foreground">{tax.paid_at ? new Date(tax.paid_at).toLocaleDateString("it-IT") : "—"}</td>
                      <td className="px-3 py-3 font-bold text-accent">{money(Number(tax.amount))}</td>
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