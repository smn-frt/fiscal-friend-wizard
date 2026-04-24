import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlarmClock,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Download,
  FileSignature,
  FileUp,
  Home,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { profile } from "@/data/profile";
import logoSf from "@/assets/logo-sf.jpg";
import { monthsAccrued, nextAccrualDate } from "@/lib/recurring";
import { downloadICS, type CalendarEvent } from "@/lib/ics";

type FutureJob = {
  id: string;
  client: string;
  description: string;
  agreed_amount: number;
  expected_payment_date: string | null;
  notes: string | null;
  status: "pending" | "collected";
  collected_at: string | null;
  collected_amount: number | null;
  offer_pdf_path: string | null;
  offer_pdf_name: string | null;
  is_recurring: boolean;
  recurring_start_date: string | null;
  recurring_monthly_amount: number | null;
  converted_to_invoice: boolean;
};

type RecurringExpense = {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "yearly" | "one_off";
  next_due_date: string | null;
  notes: string | null;
  active: boolean;
};

type OfferLine = { id: string; title: string; description: string; amount: string };

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const money = (v: number) => eur.format(v || 0);
const parseAmount = (v?: string | null) => (!v ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")));
const dateIt = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");
const todayISO = () => new Date().toISOString().slice(0, 10);

const defaultOfferLines: OfferLine[] = [
  { id: "l1", title: "ELABORATI GRAFICI", description: "", amount: "" },
  { id: "l2", title: "RILIEVO", description: "", amount: "" },
  { id: "l3", title: "RELAZIONE", description: "", amount: "" },
  { id: "l4", title: "PERIZIA", description: "", amount: "" },
  { id: "l5", title: "RENDER", description: "", amount: "" },
  { id: "l6", title: "RELAZIONE DI CALCOLO", description: "", amount: "" },
  { id: "l7", title: "PROGETTAZIONE", description: "", amount: "" },
  { id: "l8", title: "DIREZIONE LAVORI", description: "", amount: "" },
  { id: "l9", title: "PRATICHE AMMINISTRATIVE", description: "", amount: "" },
];

const expenseCategories = ["Affitto", "Box / Garage", "Assicurazione", "Utenze", "Software", "Telefonia", "Cancelleria", "Altro"];

const Panel = ({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-soft">
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

const Tile = ({ icon, label, value, tone = "primary" }: { icon: React.ReactNode; label: string; value: string; tone?: "primary" | "accent" | "secondary" | "success" }) => (
  <div className="rounded-md border border-ledger-foreground/15 bg-ledger-foreground/10 p-4 backdrop-blur-sm">
    <div className={`mb-2 flex items-center gap-2 text-${tone === "success" ? "secondary" : tone}`}>
      {icon}
      <span className="text-xs font-semibold uppercase tracking-wide text-ledger-foreground/80">{label}</span>
    </div>
    <p className="font-display text-2xl font-bold text-ledger-foreground">{value}</p>
  </div>
);

// Convert image URL/blob to base64 data URL
const urlToDataURL = async (url: string) => {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

const LavoriFuturi = () => {
  const [jobs, setJobs] = useState<FutureJob[]>([]);
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    client: "",
    description: "",
    agreed_amount: "",
    expected_payment_date: "",
    notes: "",
    is_recurring: false,
    recurring_start_date: "",
    recurring_monthly_amount: "",
  });
  const [collectedDraft, setCollectedDraft] = useState<Record<string, { date: string; amount: string }>>({});

  // Recurring expense draft
  const [expDraft, setExpDraft] = useState({ name: "", category: "Altro", amount: "", frequency: "monthly", next_due_date: "", notes: "" });

  // Offer builder
  const [offer, setOffer] = useState({
    date: todayISO(),
    committente: "",
    indirizzo: "",
    oggetto: "",
    lines: defaultOfferLines,
    extraNotes: "",
  });

  // Calendar view month
  const [calMonth, setCalMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // Load signature from storage
  const loadSignature = async (uid: string) => {
    const { data: list } = await supabase.storage.from("signatures").list(uid, { limit: 1 });
    const file = list?.[0];
    if (file) {
      const { data } = await supabase.storage.from("signatures").createSignedUrl(`${uid}/${file.name}`, 3600);
      if (data?.signedUrl) setSignatureUrl(data.signedUrl);
    }
  };

  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setSessionUser(uid);
      if (uid) {
        const [{ data: jobRows }, { data: expRows }] = await Promise.all([
          (supabase as any).from("future_jobs").select("*").order("expected_payment_date", { ascending: true, nullsFirst: false }),
          (supabase as any).from("recurring_expenses").select("*").order("next_due_date", { ascending: true, nullsFirst: false }),
        ]);
        if (jobRows) setJobs(jobRows);
        if (expRows) setExpenses(expRows);
        await loadSignature(uid);
      }
    };
    boot();
  }, []);

  // ============= Jobs =============

  const addJob = async () => {
    const isRec = draft.is_recurring;
    const monthly = parseAmount(draft.recurring_monthly_amount);
    const oneShot = parseAmount(draft.agreed_amount);
    if (!draft.client || !draft.description) return toast.error("Inserisci cliente e descrizione");
    if (isRec && (!monthly || !draft.recurring_start_date)) return toast.error("Per i lavori ricorrenti servono data inizio e importo mensile");
    if (!isRec && !oneShot) return toast.error("Inserisci l'importo concordato");

    const row = {
      client: draft.client,
      description: draft.description,
      agreed_amount: isRec ? monthly : oneShot,
      expected_payment_date: isRec ? null : draft.expected_payment_date || null,
      notes: draft.notes || null,
      status: "pending" as const,
      is_recurring: isRec,
      recurring_start_date: isRec ? draft.recurring_start_date : null,
      recurring_monthly_amount: isRec ? monthly : null,
    };
    if (sessionUser) {
      const { data, error } = await (supabase as any).from("future_jobs").insert({ ...row, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Lavoro non salvato", { description: error.message });
      setJobs((items) => [data, ...items]);
    } else {
      setJobs((items) => [{ ...row, id: crypto.randomUUID(), collected_at: null, collected_amount: null, offer_pdf_path: null, offer_pdf_name: null, converted_to_invoice: false } as FutureJob, ...items]);
    }
    setDraft({ client: "", description: "", agreed_amount: "", expected_payment_date: "", notes: "", is_recurring: false, recurring_start_date: "", recurring_monthly_amount: "" });
    toast.success("Lavoro registrato");
  };

  const markCollected = async (job: FutureJob) => {
    const d = collectedDraft[job.id] ?? { date: todayISO(), amount: "" };
    const amount = parseAmount(d.amount) || Number(job.agreed_amount);
    const update = { status: "collected", collected_at: d.date || todayISO(), collected_amount: amount };
    if (sessionUser) {
      const { error } = await (supabase as any).from("future_jobs").update(update).eq("id", job.id);
      if (error) return toast.error("Aggiornamento non riuscito", { description: error.message });
    }
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, ...update } as FutureJob : j)));
    toast.success("Spostato negli incassi effettuati");
  };

  const undoCollected = async (job: FutureJob) => {
    const update = { status: "pending", collected_at: null, collected_amount: null };
    if (sessionUser) await (supabase as any).from("future_jobs").update(update).eq("id", job.id);
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, ...update } as FutureJob : j)));
  };

  const deleteJob = async (job: FutureJob) => {
    if (sessionUser) await (supabase as any).from("future_jobs").delete().eq("id", job.id);
    setJobs((items) => items.filter((j) => j.id !== job.id));
  };

  const uploadOfferPdf = async (job: FutureJob, file: File) => {
    if (!sessionUser) return toast.error("Devi accedere per allegare il PDF");
    const path = `${sessionUser}/${job.id}_${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("offer-pdfs").upload(path, file, { upsert: true });
    if (error) return toast.error("Upload non riuscito", { description: error.message });
    const update = { offer_pdf_path: path, offer_pdf_name: file.name };
    await (supabase as any).from("future_jobs").update(update).eq("id", job.id);
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, ...update } as FutureJob : j)));
    toast.success("Offerta allegata");
  };

  const openOfferPdf = async (job: FutureJob) => {
    if (!job.offer_pdf_path) return;
    const { data } = await supabase.storage.from("offer-pdfs").createSignedUrl(job.offer_pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const convertToInvoice = async (job: FutureJob) => {
    if (!sessionUser) return toast.error("Devi accedere");
    if (job.converted_to_invoice) return toast.info("Già convertita in fattura");
    const year = new Date().getFullYear();
    // Find next invoice number for the year
    const { data: existing } = await (supabase as any)
      .from("invoices")
      .select("invoice_number")
      .eq("year", year)
      .order("invoice_number", { ascending: false })
      .limit(1);
    const nextNum = (existing?.[0]?.invoice_number ?? 0) + 1;
    const taxable = Number(job.agreed_amount);
    const pension = Math.round(taxable * 0.04 * 100) / 100;
    const stamp = taxable + pension >= 77.47 ? 2 : 0;
    const gross = taxable + pension + stamp;
    const { error } = await (supabase as any).from("invoices").insert({
      user_id: sessionUser,
      year,
      invoice_number: nextNum,
      debtor: job.client,
      invoice_date: todayISO(),
      taxable_amount: taxable,
      pension_fund: pension,
      stamp_duty: stamp,
      gross_total: gross,
    });
    if (error) return toast.error("Conversione non riuscita", { description: error.message });
    await (supabase as any).from("future_jobs").update({ converted_to_invoice: true }).eq("id", job.id);
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, converted_to_invoice: true } : j)));
    toast.success(`Fattura n. ${nextNum}/${year} creata in Contabilità`);
  };

  // ============= Recurring expenses =============

  const addExpense = async () => {
    const amount = parseAmount(expDraft.amount);
    if (!expDraft.name || !amount) return toast.error("Inserisci nome e importo");
    const row = {
      name: expDraft.name,
      category: expDraft.category,
      amount,
      frequency: expDraft.frequency,
      next_due_date: expDraft.next_due_date || null,
      notes: expDraft.notes || null,
      active: true,
    };
    if (sessionUser) {
      const { data, error } = await (supabase as any).from("recurring_expenses").insert({ ...row, user_id: sessionUser }).select("*").single();
      if (error) return toast.error("Spesa non salvata", { description: error.message });
      setExpenses((items) => [data, ...items]);
    } else {
      setExpenses((items) => [{ ...row, id: crypto.randomUUID() } as RecurringExpense, ...items]);
    }
    setExpDraft({ name: "", category: "Altro", amount: "", frequency: "monthly", next_due_date: "", notes: "" });
    toast.success("Spesa ricorrente aggiunta");
  };

  const deleteExpense = async (e: RecurringExpense) => {
    if (sessionUser) await (supabase as any).from("recurring_expenses").delete().eq("id", e.id);
    setExpenses((items) => items.filter((x) => x.id !== e.id));
  };

  // ============= Signature upload =============

  const uploadSignature = async (file: File) => {
    if (!sessionUser) return toast.error("Devi accedere");
    const ext = file.name.split(".").pop() || "png";
    const path = `${sessionUser}/signature.${ext}`;
    // Remove old files
    const { data: existing } = await supabase.storage.from("signatures").list(sessionUser);
    if (existing?.length) {
      await supabase.storage.from("signatures").remove(existing.map((f) => `${sessionUser}/${f.name}`));
    }
    const { error } = await supabase.storage.from("signatures").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error("Upload non riuscito", { description: error.message });
    await loadSignature(sessionUser);
    toast.success("Timbro/firma aggiornato");
  };

  // ============= Aggregations =============

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const pending = jobs.filter((j) => j.status === "pending");
  const collected = jobs.filter((j) => j.status === "collected");
  const recurringJobs = pending.filter((j) => j.is_recurring);

  // Compute accrued amount for recurring jobs (dynamic)
  const accruedFor = (j: FutureJob) => {
    if (!j.is_recurring) return Number(j.agreed_amount);
    const months = monthsAccrued(j.recurring_start_date);
    return months * Number(j.recurring_monthly_amount ?? 0);
  };

  const dueSoon = pending.filter((j) => {
    if (j.is_recurring) return false;
    if (!j.expected_payment_date) return false;
    const d = new Date(j.expected_payment_date);
    return d <= in30;
  });

  const totals = useMemo(() => {
    const pendingTotal = pending.reduce((s, j) => s + (j.is_recurring ? accruedFor(j) : Number(j.agreed_amount)), 0);
    const dueSoonTotal = dueSoon.reduce((s, j) => s + Number(j.agreed_amount), 0);
    const collectedTotal = collected.reduce((s, j) => s + Number(j.collected_amount ?? j.agreed_amount), 0);
    const monthlyExpenses = expenses
      .filter((e) => e.active && e.frequency === "monthly")
      .reduce((s, e) => s + Number(e.amount), 0);
    return { pending: pendingTotal, dueSoon: dueSoonTotal, collected: collectedTotal, count: jobs.length, monthlyExpenses };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, expenses]);

  // ============= Offer builder =============

  const updateLine = (id: string, patch: Partial<OfferLine>) => {
    setOffer((o) => ({ ...o, lines: o.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  };
  const addLine = () => {
    setOffer((o) => ({ ...o, lines: [...o.lines, { id: crypto.randomUUID(), title: "", description: "", amount: "" }] }));
  };
  const removeLine = (id: string) => setOffer((o) => ({ ...o, lines: o.lines.filter((l) => l.id !== id) }));

  const offerTotal = offer.lines.reduce((s, l) => s + parseAmount(l.amount), 0);

  const generateOfferPdf = async () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;

    // Logo
    try {
      const img = await urlToDataURL(logoSf);
      doc.addImage(img, "JPEG", margin, 12, 32, 32);
    } catch {}

    // Header right
    doc.setFont("times", "bolditalic");
    doc.setFontSize(11);
    doc.text(profile.fullName, pageW - margin, 18, { align: "right" });
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text(profile.residence, pageW - margin, 24, { align: "right" });
    doc.text(`Cell: ${profile.phone}`, pageW - margin, 29, { align: "right" });
    doc.text(`E-mail: ${profile.email}`, pageW - margin, 34, { align: "right" });
    doc.text(`P.IVA: ${profile.vat}`, pageW - margin, 39, { align: "right" });

    let y = 70;
    doc.setFontSize(11);
    const dataIt = offer.date ? new Date(offer.date).toLocaleDateString("it-IT") : "";
    doc.text(`Roma, ${dataIt}`, margin, y);

    doc.setFont("times", "italic");
    doc.text(`Alla c.a. ${offer.committente || "[COMMITTENTE]"}`, pageW - margin, y, { align: "right" });
    doc.text(offer.indirizzo || "[INDIRIZZO]", pageW - margin, y + 6, { align: "right" });

    y += 28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const oggettoLines = doc.splitTextToSize(`Oggetto: ${offer.oggetto || "[DESCRIZIONE OGGETTO INTERVENTO]"}`, pageW - margin * 2);
    doc.text(oggettoLines, margin, y);
    y += oggettoLines.length * 7 + 6;

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text("Con la presente si emette l'offerta relativa alle seguenti prestazioni:", margin, y);
    y += 8;

    const activeLines = offer.lines.filter((l) => l.title.trim() || l.description.trim() || parseAmount(l.amount));
    activeLines.forEach((l) => {
      if (y > pageH - 60) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`• ${l.title || "—"}`, margin + 2, y);
      const amt = parseAmount(l.amount);
      if (amt) doc.text(money(amt), pageW - margin, y, { align: "right" });
      y += 5;
      if (l.description.trim()) {
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        const descLines = doc.splitTextToSize(l.description, pageW - margin * 2 - 6);
        doc.text(descLines, margin + 6, y);
        y += descLines.length * 4.5 + 2;
      }
      y += 1;
    });

    y += 4;
    if (y > pageH - 80) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Totale forfettario: ${money(offerTotal)}`, pageW - margin, y, { align: "right" });
    y += 8;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text("Importo al netto di IVA e CNPAIA (4%) e degli oneri di istruttoria della pratica.", margin, y);
    y += 8;

    if (offer.extraNotes.trim()) {
      const extra = doc.splitTextToSize(offer.extraNotes, pageW - margin * 2);
      doc.text(extra, margin, y);
      y += extra.length * 5 + 4;
    }

    doc.text("Modalità di pagamento:", margin, y); y += 6;
    doc.text("•  50% all'accettazione della presente offerta;", margin + 4, y); y += 5;
    doc.text("•  50% contestualmente alla consegna/protocollazione della documentazione.", margin + 4, y); y += 12;

    // Signature blocks
    if (y > pageH - 70) { doc.addPage(); y = margin; }
    const blockW = (pageW - margin * 2 - 10) / 2;
    const blockY = y;
    const blockH = 50;
    // Left: my stamp/signature
    doc.setDrawColor(120);
    doc.rect(margin, blockY, blockW, blockH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Timbro e firma del professionista", margin + 3, blockY + 5);
    if (signatureUrl) {
      try {
        const sig = await urlToDataURL(signatureUrl);
        doc.addImage(sig, "PNG", margin + 4, blockY + 8, blockW - 8, blockH - 14);
      } catch {}
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(9);
      doc.text("(carica timbro/firma nelle impostazioni)", margin + 3, blockY + blockH / 2);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(profile.fullName, margin + 3, blockY + blockH - 3);

    // Right: client acceptance
    const rx = margin + blockW + 10;
    doc.rect(rx, blockY, blockW, blockH);
    doc.text("Per accettazione, il cliente", rx + 3, blockY + 5);
    doc.line(rx + 5, blockY + blockH - 10, rx + blockW - 5, blockY + blockH - 10);
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.text("Data e firma", rx + 3, blockY + blockH - 3);

    const fileName = `Offerta_${(offer.committente || "cliente").replace(/[^a-z0-9]+/gi, "_")}_${offer.date}.pdf`;
    doc.save(fileName);
    toast.success("Offerta generata");
  };

  // ============= Calendar events =============

  const calendarEvents = useMemo(() => {
    const events: { date: Date; title: string; type: "job" | "recurring" | "expense"; amount: number; key: string }[] = [];
    pending.filter((j) => !j.is_recurring && j.expected_payment_date).forEach((j) => {
      events.push({ date: new Date(j.expected_payment_date!), title: `${j.client} — ${j.description}`, type: "job", amount: Number(j.agreed_amount), key: `job-${j.id}` });
    });
    // Recurring jobs: next 12 last-day-of-month after start
    recurringJobs.forEach((j) => {
      if (!j.recurring_start_date) return;
      const start = new Date(j.recurring_start_date);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      for (let i = 0; i < 12; i++) {
        const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        if (last >= today) {
          events.push({ date: last, title: `Ricorrente ${j.client}`, type: "recurring", amount: Number(j.recurring_monthly_amount ?? 0), key: `rec-${j.id}-${i}` });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    });
    // Expenses
    expenses.filter((e) => e.active && e.next_due_date).forEach((e) => {
      const d = new Date(e.next_due_date!);
      events.push({ date: d, title: `${e.name} (${e.category})`, type: "expense", amount: Number(e.amount), key: `exp-${e.id}` });
    });
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [pending, recurringJobs, expenses, today]);

  const exportAllICS = () => {
    const events: CalendarEvent[] = calendarEvents.map((e) => ({
      uid: e.key,
      title: e.title,
      description: `Importo: ${money(e.amount)}`,
      date: e.date.toISOString().slice(0, 10),
      category: e.type,
    }));
    if (!events.length) return toast.info("Nessun evento da esportare");
    downloadICS("scadenze-studio-fratoni.ics", events);
    toast.success("File .ics scaricato");
  };

  const monthGrid = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const startWeekday = (first.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(calMonth.getFullYear(), calMonth.getMonth(), d) });
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [calMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof calendarEvents>();
    calendarEvents.forEach((e) => {
      const key = e.date.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [calendarEvents]);

  return (
    <main className="ledger-grid">
      <section className="relative overflow-hidden bg-hero-ledger text-ledger-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="flex flex-col justify-center gap-5">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-secondary">
              <Briefcase className="h-5 w-5" /> Lavori e scadenze
            </div>
            <h1 className="font-display text-4xl font-bold sm:text-6xl">Lavori</h1>
            <p className="max-w-xl text-ledger-foreground/85">
              Gestisci offerte, lavori una tantum e ricorrenti, spese fisse e calendario di tutte le scadenze.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile icon={<Wallet className="h-4 w-4" />} label="Da incassare" value={money(totals.pending)} />
            <Tile icon={<AlarmClock className="h-4 w-4" />} label="In scadenza ≤30gg" value={money(totals.dueSoon)} tone="accent" />
            <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Già incassato" value={money(totals.collected)} tone="success" />
            <Tile icon={<Home className="h-4 w-4" />} label="Spese mensili" value={money(totals.monthlyExpenses)} tone="secondary" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Tabs defaultValue="lavori" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start bg-surface-raised p-1 shadow-soft">
            <TabsTrigger value="lavori">Lavori</TabsTrigger>
            <TabsTrigger value="scadenze">In scadenza</TabsTrigger>
            <TabsTrigger value="incassati">Incassi effettuati</TabsTrigger>
            <TabsTrigger value="ricorrenti">Lavori ricorrenti</TabsTrigger>
            <TabsTrigger value="spese">Spese ricorrenti</TabsTrigger>
            <TabsTrigger value="offerta">Genera offerta</TabsTrigger>
            <TabsTrigger value="calendario">Calendario</TabsTrigger>
          </TabsList>

          {/* ============ LAVORI ============ */}
          <TabsContent value="lavori">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Nuovo lavoro" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Input placeholder="Cliente" value={draft.client} onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))} />
                  <Textarea placeholder="Descrizione prestazione" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />

                  <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Repeat className="h-4 w-4 text-primary" /> Lavoro ricorrente mensile
                    </div>
                    <Switch checked={draft.is_recurring} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_recurring: v }))} />
                  </div>

                  {draft.is_recurring ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Inizio pagamenti</Label>
                        <Input type="date" value={draft.recurring_start_date} onChange={(e) => setDraft((d) => ({ ...d, recurring_start_date: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Importo mensile</Label>
                        <Input placeholder="es. 500,00" value={draft.recurring_monthly_amount} onChange={(e) => setDraft((d) => ({ ...d, recurring_monthly_amount: e.target.value }))} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <Input placeholder="Importo concordato, es. 1500,00" value={draft.agreed_amount} onChange={(e) => setDraft((d) => ({ ...d, agreed_amount: e.target.value }))} />
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Data presunta incasso</Label>
                        <Input type="date" value={draft.expected_payment_date} onChange={(e) => setDraft((d) => ({ ...d, expected_payment_date: e.target.value }))} />
                      </div>
                    </>
                  )}

                  <Textarea placeholder="Note" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                  <Button variant="ledger" onClick={addJob}>Aggiungi lavoro</Button>
                </div>
              </Panel>

              <Panel title={`Lavori in attesa (${pending.length})`} icon={<Clock className="h-5 w-5" />}>
                {pending.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                    Nessun lavoro registrato.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pending.map((job) => {
                      const draftRow = collectedDraft[job.id] ?? { date: todayISO(), amount: "" };
                      const isOverdue = !job.is_recurring && job.expected_payment_date && new Date(job.expected_payment_date) < today;
                      const accrued = accruedFor(job);
                      return (
                        <div key={job.id} className={`rounded-md border p-4 transition ${isOverdue ? "border-accent/60 bg-accent/5" : "border-border bg-card"}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-display text-lg font-bold">{job.client}</p>
                                {job.is_recurring && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"><Repeat className="mr-1 inline h-3 w-3" />Ricorrente</span>}
                                {job.converted_to_invoice && <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-semibold text-secondary">Fatturato</span>}
                                {job.offer_pdf_path && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">📎 Offerta</span>}
                              </div>
                              <p className="text-sm text-muted-foreground">{job.description}</p>
                              {job.is_recurring ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Dal <span className="font-semibold text-foreground">{dateIt(job.recurring_start_date)}</span> · {money(Number(job.recurring_monthly_amount ?? 0))}/mese
                                  {" · prossimo accredito "}<span className="font-semibold text-foreground">{dateIt(nextAccrualDate(job.recurring_start_date)?.toISOString().slice(0, 10) ?? null)}</span>
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Incasso previsto: <span className={isOverdue ? "font-semibold text-accent" : "font-semibold text-foreground"}>{dateIt(job.expected_payment_date)}</span>
                                  {isOverdue ? " · scaduto" : ""}
                                </p>
                              )}
                              {job.notes ? <p className="mt-1 text-xs italic text-muted-foreground">{job.notes}</p> : null}
                            </div>
                            <div className="text-right">
                              <p className="font-display text-xl font-bold text-primary">{money(accrued)}</p>
                              {job.is_recurring && <p className="text-xs text-muted-foreground">maturato</p>}
                            </div>
                          </div>

                          {/* Actions row */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-tint px-3 py-1.5 text-xs font-semibold hover:bg-surface-tint/80">
                              <FileUp className="h-3.5 w-3.5" />
                              {job.offer_pdf_name ? "Sostituisci offerta" : "Allega offerta PDF"}
                              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOfferPdf(job, f); e.target.value = ""; }} />
                            </label>
                            {job.offer_pdf_path && (
                              <Button variant="outline" size="sm" onClick={() => openOfferPdf(job)}>
                                <Download className="h-3.5 w-3.5" /> Apri offerta
                              </Button>
                            )}
                            {!job.converted_to_invoice && (
                              <Button variant="outline" size="sm" onClick={() => convertToInvoice(job)}>
                                <Receipt className="h-3.5 w-3.5" /> Converti in fattura
                              </Button>
                            )}
                          </div>

                          {!job.is_recurring && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                              <Input type="date" value={draftRow.date} onChange={(e) => setCollectedDraft((s) => ({ ...s, [job.id]: { ...draftRow, date: e.target.value } }))} />
                              <Input placeholder={`Importo (${money(Number(job.agreed_amount))})`} value={draftRow.amount} onChange={(e) => setCollectedDraft((s) => ({ ...s, [job.id]: { ...draftRow, amount: e.target.value } }))} />
                              <Button variant="ledger" size="sm" onClick={() => markCollected(job)}>
                                <CheckCircle2 className="h-4 w-4" /> Incassato
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteJob(job)} aria-label="Elimina">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          {job.is_recurring && (
                            <div className="mt-3 flex justify-end">
                              <Button variant="ghost" size="icon" onClick={() => deleteJob(job)} aria-label="Elimina">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </TabsContent>

          {/* ============ SCADENZE ============ */}
          <TabsContent value="scadenze">
            <Panel title={`In scadenza nei prossimi 30 giorni (${dueSoon.length})`} icon={<AlarmClock className="h-5 w-5" />}>
              {dueSoon.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessuna scadenza imminente.
                </p>
              ) : (
                <div className="space-y-2">
                  {dueSoon.map((job) => (
                    <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                      <div>
                        <p className="font-semibold">{job.client}</p>
                        <p className="text-xs text-muted-foreground">{job.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{dateIt(job.expected_payment_date)}</p>
                        <p className="font-bold text-primary">{money(Number(job.agreed_amount))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ============ INCASSATI ============ */}
          <TabsContent value="incassati">
            <Panel title={`Incassi effettuati (${collected.length})`} icon={<Coins className="h-5 w-5" />}>
              {collected.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessun incasso registrato.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full min-w-[640px] border-collapse bg-card text-sm">
                    <thead className="bg-ledger text-ledger-foreground">
                      <tr>
                        {["Cliente", "Descrizione", "Data incasso", "Importo", "Azioni"].map((h) => (
                          <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {collected.map((job) => (
                        <tr key={job.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                          <td className="px-3 py-3 font-semibold">{job.client}</td>
                          <td className="px-3 py-3 text-muted-foreground">{job.description}</td>
                          <td className="px-3 py-3 text-muted-foreground">{dateIt(job.collected_at)}</td>
                          <td className="px-3 py-3 font-bold text-secondary">{money(Number(job.collected_amount ?? job.agreed_amount))}</td>
                          <td className="px-3 py-3">
                            <Button variant="outline" size="sm" onClick={() => undoCollected(job)}>Riporta in lavori</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ============ RICORRENTI ============ */}
          <TabsContent value="ricorrenti">
            <Panel title={`Lavori ricorrenti (${recurringJobs.length})`} icon={<Repeat className="h-5 w-5" />}>
              {recurringJobs.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessun lavoro ricorrente. Attiva l'opzione "Ricorrente mensile" creando un nuovo lavoro.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full min-w-[700px] border-collapse bg-card text-sm">
                    <thead className="bg-ledger text-ledger-foreground">
                      <tr>
                        {["Cliente", "Descrizione", "Inizio", "€/mese", "Mesi maturati", "Maturato", "Prossimo"].map((h) => (
                          <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recurringJobs.map((j) => {
                        const months = monthsAccrued(j.recurring_start_date);
                        const monthly = Number(j.recurring_monthly_amount ?? 0);
                        return (
                          <tr key={j.id} className="border-b border-border/70 transition hover:bg-surface-tint/55">
                            <td className="px-3 py-3 font-semibold">{j.client}</td>
                            <td className="px-3 py-3 text-muted-foreground">{j.description}</td>
                            <td className="px-3 py-3 text-muted-foreground">{dateIt(j.recurring_start_date)}</td>
                            <td className="px-3 py-3 font-bold text-primary">{money(monthly)}</td>
                            <td className="px-3 py-3">{months}</td>
                            <td className="px-3 py-3 font-bold text-secondary">{money(months * monthly)}</td>
                            <td className="px-3 py-3 text-muted-foreground">{dateIt(nextAccrualDate(j.recurring_start_date)?.toISOString().slice(0, 10) ?? null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ============ SPESE RICORRENTI ============ */}
          <TabsContent value="spese">
            <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <Panel title="Nuova spesa ricorrente" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Input placeholder="Nome (es. Affitto box)" value={expDraft.name} onChange={(e) => setExpDraft((d) => ({ ...d, name: e.target.value }))} />
                  <div>
                    <Label className="mb-1 block text-xs uppercase text-muted-foreground">Categoria</Label>
                    <Select value={expDraft.category} onValueChange={(v) => setExpDraft((d) => ({ ...d, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Importo, es. 120,00" value={expDraft.amount} onChange={(e) => setExpDraft((d) => ({ ...d, amount: e.target.value }))} />
                  <div>
                    <Label className="mb-1 block text-xs uppercase text-muted-foreground">Frequenza</Label>
                    <Select value={expDraft.frequency} onValueChange={(v) => setExpDraft((d) => ({ ...d, frequency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensile</SelectItem>
                        <SelectItem value="quarterly">Trimestrale</SelectItem>
                        <SelectItem value="yearly">Annuale</SelectItem>
                        <SelectItem value="one_off">Una tantum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs uppercase text-muted-foreground">Prossima scadenza</Label>
                    <Input type="date" value={expDraft.next_due_date} onChange={(e) => setExpDraft((d) => ({ ...d, next_due_date: e.target.value }))} />
                  </div>
                  <Textarea placeholder="Note" value={expDraft.notes} onChange={(e) => setExpDraft((d) => ({ ...d, notes: e.target.value }))} />
                  <Button variant="ledger" onClick={addExpense}>Aggiungi spesa</Button>
                </div>
              </Panel>

              <Panel title={`Spese ricorrenti (${expenses.length})`} icon={<Home className="h-5 w-5" />}>
                {expenses.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                    Nessuna spesa registrata.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((e) => {
                      const due = e.next_due_date ? new Date(e.next_due_date) : null;
                      const overdue = due && due < today;
                      return (
                        <div key={e.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${overdue ? "border-accent/60 bg-accent/5" : "border-border bg-card"}`}>
                          <div>
                            <p className="font-semibold">{e.name} <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{e.category}</span></p>
                            <p className="text-xs text-muted-foreground">
                              {e.frequency === "monthly" ? "Mensile" : e.frequency === "quarterly" ? "Trimestrale" : e.frequency === "yearly" ? "Annuale" : "Una tantum"}
                              {e.next_due_date ? ` · scadenza ${dateIt(e.next_due_date)}${overdue ? " ⚠ scaduta" : ""}` : ""}
                            </p>
                            {e.notes ? <p className="text-xs italic text-muted-foreground">{e.notes}</p> : null}
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-bold text-primary">{money(Number(e.amount))}</p>
                            <Button variant="ghost" size="icon" onClick={() => deleteExpense(e)} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </TabsContent>

          {/* ============ OFFERTA ============ */}
          <TabsContent value="offerta">
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <Panel
                title="Compila l'offerta"
                icon={<FileSignature className="h-5 w-5" />}
                action={<Button variant="ledger" size="sm" onClick={generateOfferPdf}><Download className="h-4 w-4" /> PDF</Button>}
              >
                <div className="grid gap-3">
                  <div>
                    <Label className="mb-1 block text-xs uppercase text-muted-foreground">Data</Label>
                    <Input type="date" value={offer.date} onChange={(e) => setOffer((o) => ({ ...o, date: e.target.value }))} />
                  </div>
                  <Input placeholder="Committente / Ragione sociale" value={offer.committente} onChange={(e) => setOffer((o) => ({ ...o, committente: e.target.value }))} />
                  <Input placeholder="Indirizzo" value={offer.indirizzo} onChange={(e) => setOffer((o) => ({ ...o, indirizzo: e.target.value }))} />
                  <Textarea placeholder="Oggetto / descrizione intervento" value={offer.oggetto} onChange={(e) => setOffer((o) => ({ ...o, oggetto: e.target.value }))} />

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Prestazioni (titolo, descrizione, importo)</p>
                      <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Voce</Button>
                    </div>
                    <div className="space-y-2">
                      {offer.lines.map((l) => (
                        <div key={l.id} className="rounded-md border border-border bg-card p-3">
                          <div className="grid gap-2 sm:grid-cols-[1.4fr_0.8fr_auto]">
                            <Input placeholder="Titolo prestazione" value={l.title} onChange={(e) => updateLine(l.id, { title: e.target.value })} />
                            <Input placeholder="Importo, es. 350,00" value={l.amount} onChange={(e) => updateLine(l.id, { amount: e.target.value })} />
                            <Button variant="ghost" size="icon" onClick={() => removeLine(l.id)} aria-label="Rimuovi"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                          <Textarea className="mt-2" placeholder="Descrizione di dettaglio (opzionale)" value={l.description} onChange={(e) => updateLine(l.id, { description: e.target.value })} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-right font-display text-lg font-bold text-primary">Totale: {money(offerTotal)}</p>
                  </div>
                  <Textarea placeholder="Note aggiuntive (opzionali)" value={offer.extraNotes} onChange={(e) => setOffer((o) => ({ ...o, extraNotes: e.target.value }))} />
                </div>
              </Panel>

              <div className="space-y-5">
                <Panel title="Timbro e firma" icon={<FileSignature className="h-5 w-5" />}>
                  <div className="grid gap-3">
                    <p className="text-xs text-muted-foreground">Carica un'immagine PNG/JPG con il tuo timbro e firma. Verrà stampata sul PDF dell'offerta nello spazio dedicato, accanto al riquadro per l'accettazione del cliente.</p>
                    {signatureUrl ? (
                      <div className="rounded-md border border-border bg-card p-3">
                        <img src={signatureUrl} alt="Timbro e firma" className="mx-auto max-h-32 object-contain" />
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-4 text-center text-sm text-muted-foreground">
                        Nessuna firma caricata.
                      </p>
                    )}
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface-tint px-3 py-2 text-sm font-semibold hover:bg-surface-tint/80">
                      <Upload className="h-4 w-4" />
                      {signatureUrl ? "Sostituisci immagine" : "Carica timbro/firma"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSignature(f); e.target.value = ""; }} />
                    </label>
                  </div>
                </Panel>

                <Panel title="Anteprima sintetica" icon={<FileSignature className="h-5 w-5" />}>
                  <div className="rounded-md border border-border bg-card p-4 text-sm leading-relaxed">
                    <p className="mb-3"><strong>Roma, {offer.date ? new Date(offer.date).toLocaleDateString("it-IT") : "[DATA]"}</strong></p>
                    <p className="text-right italic">Alla c.a. {offer.committente || "[COMMITTENTE]"}</p>
                    <p className="mb-3 text-right italic">{offer.indirizzo || "[INDIRIZZO]"}</p>
                    <p className="mb-3 font-bold">Oggetto: {offer.oggetto || "[OGGETTO]"}</p>
                    <ul className="space-y-1">
                      {offer.lines.filter((l) => l.title.trim() || parseAmount(l.amount)).map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-3">
                          <span><strong>{l.title || "—"}</strong>{l.description ? ` — ${l.description}` : ""}</span>
                          <span className="font-mono font-semibold">{parseAmount(l.amount) ? money(parseAmount(l.amount)) : ""}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-right text-base font-bold text-primary">Totale: {money(offerTotal)}</p>
                  </div>
                </Panel>
              </div>
            </div>
          </TabsContent>

          {/* ============ CALENDARIO ============ */}
          <TabsContent value="calendario">
            <Panel
              title="Calendario scadenze"
              icon={<CalendarDays className="h-5 w-5" />}
              action={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportAllICS}><Download className="h-4 w-4" /> Esporta .ics</Button>
                </div>
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <p className="font-display text-lg font-bold capitalize">
                  {calMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                </p>
                <Button variant="ghost" size="icon" onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => <div key={d} className="py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map((cell, i) => {
                  if (!cell.date) return <div key={i} className="min-h-[80px] rounded-md border border-transparent" />;
                  const key = cell.date.toISOString().slice(0, 10);
                  const evs = eventsByDay.get(key) ?? [];
                  const isToday = cell.date.getTime() === today.getTime();
                  return (
                    <div key={i} className={`min-h-[80px] rounded-md border p-1.5 text-left ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                      <p className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{cell.date.getDate()}</p>
                      <div className="mt-1 space-y-1">
                        {evs.slice(0, 3).map((e) => (
                          <div key={e.key} className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${e.type === "expense" ? "bg-accent/15 text-accent" : e.type === "recurring" ? "bg-secondary/15 text-secondary" : "bg-primary/15 text-primary"}`} title={`${e.title} — ${money(e.amount)}`}>
                            {e.title}
                          </div>
                        ))}
                        {evs.length > 3 && <p className="text-[10px] text-muted-foreground">+{evs.length - 3} altri</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upcoming list */}
              <div className="mt-6">
                <h4 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Prossimi eventi</h4>
                <ol className="space-y-2">
                  {calendarEvents
                    .filter((e) => e.date >= today)
                    .slice(0, 8)
                    .map((e) => (
                      <li key={e.key} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                        <div>
                          <p className="text-sm font-semibold">{e.title}</p>
                          <p className="text-xs text-muted-foreground">{e.date.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}</p>
                        </div>
                        <p className={`font-bold ${e.type === "expense" ? "text-accent" : e.type === "recurring" ? "text-secondary" : "text-primary"}`}>{money(e.amount)}</p>
                      </li>
                    ))}
                  {calendarEvents.filter((e) => e.date >= today).length === 0 && (
                    <li className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-sm text-muted-foreground">
                      Nessun evento in arrivo.
                    </li>
                  )}
                </ol>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default LavoriFuturi;
