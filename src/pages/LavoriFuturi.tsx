import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlarmClock,
  Briefcase,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  FileSignature,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { profile } from "@/data/profile";
import logoSf from "@/assets/logo-sf.jpg";

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
};

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const money = (v: number) => eur.format(v || 0);
const parseAmount = (v?: string | null) => (!v ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")));
const dateIt = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");

const offerSections = [
  "ELABORATI GRAFICI",
  "RILIEVO",
  "RELAZIONE",
  "PERIZIA",
  "RENDER",
  "RELAZIONE DI CALCOLO",
  "PROGETTAZIONE",
  "DIREZIONE LAVORI",
  "PRATICHE AMMINISTRATIVE",
];

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

const LavoriFuturi = () => {
  const [jobs, setJobs] = useState<FutureJob[]>([]);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [draft, setDraft] = useState({ client: "", description: "", agreed_amount: "", expected_payment_date: "", notes: "" });
  const [collectedDraft, setCollectedDraft] = useState<Record<string, { date: string; amount: string }>>({});

  // Offer builder
  const [offer, setOffer] = useState({
    date: new Date().toISOString().slice(0, 10),
    committente: "",
    indirizzo: "",
    oggetto: "",
    importo: "",
    selected: [] as string[],
  });

  useEffect(() => {
    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setSessionUser(uid);
      if (uid) {
        const { data: rows } = await (supabase as any)
          .from("future_jobs")
          .select("*")
          .order("expected_payment_date", { ascending: true, nullsFirst: false });
        if (rows) setJobs(rows);
      }
    };
    boot();
  }, []);

  const addJob = async () => {
    const amount = parseAmount(draft.agreed_amount);
    if (!draft.client || !draft.description || !amount) {
      return toast.error("Inserisci cliente, descrizione e importo concordato");
    }
    const row = {
      client: draft.client,
      description: draft.description,
      agreed_amount: amount,
      expected_payment_date: draft.expected_payment_date || null,
      notes: draft.notes || null,
      status: "pending" as const,
    };
    if (sessionUser) {
      const { data, error } = await (supabase as any)
        .from("future_jobs")
        .insert({ ...row, user_id: sessionUser })
        .select("*")
        .single();
      if (error) return toast.error("Lavoro non salvato", { description: error.message });
      setJobs((items) => [data, ...items]);
    } else {
      setJobs((items) => [{ ...row, id: crypto.randomUUID(), collected_at: null, collected_amount: null }, ...items]);
    }
    setDraft({ client: "", description: "", agreed_amount: "", expected_payment_date: "", notes: "" });
    toast.success("Lavoro futuro registrato");
  };

  const markCollected = async (job: FutureJob) => {
    const d = collectedDraft[job.id] ?? { date: new Date().toISOString().slice(0, 10), amount: "" };
    const amount = parseAmount(d.amount) || Number(job.agreed_amount);
    const update = { status: "collected", collected_at: d.date || new Date().toISOString().slice(0, 10), collected_amount: amount };
    if (sessionUser) {
      const { error } = await (supabase as any).from("future_jobs").update(update).eq("id", job.id);
      if (error) return toast.error("Aggiornamento non riuscito", { description: error.message });
    }
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, ...update } as FutureJob : j)));
    toast.success("Spostato negli incassi effettuati");
  };

  const undoCollected = async (job: FutureJob) => {
    const update = { status: "pending", collected_at: null, collected_amount: null };
    if (sessionUser) {
      await (supabase as any).from("future_jobs").update(update).eq("id", job.id);
    }
    setJobs((items) => items.map((j) => (j.id === job.id ? { ...j, ...update } as FutureJob : j)));
  };

  const deleteJob = async (job: FutureJob) => {
    if (sessionUser) {
      await (supabase as any).from("future_jobs").delete().eq("id", job.id);
    }
    setJobs((items) => items.filter((j) => j.id !== job.id));
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const pending = jobs.filter((j) => j.status === "pending");
  const collected = jobs.filter((j) => j.status === "collected");
  const dueSoon = pending.filter((j) => {
    if (!j.expected_payment_date) return false;
    const d = new Date(j.expected_payment_date);
    return d <= in30;
  });
  const overdue = pending.filter((j) => j.expected_payment_date && new Date(j.expected_payment_date) < today);

  const totals = useMemo(
    () => ({
      pending: pending.reduce((s, j) => s + Number(j.agreed_amount), 0),
      dueSoon: dueSoon.reduce((s, j) => s + Number(j.agreed_amount), 0),
      collected: collected.reduce((s, j) => s + Number(j.collected_amount ?? j.agreed_amount), 0),
      count: jobs.length,
    }),
    [jobs, pending, dueSoon, collected],
  );

  const toggleOfferSection = (s: string) => {
    setOffer((o) => ({ ...o, selected: o.selected.includes(s) ? o.selected.filter((x) => x !== s) : [...o.selected, s] }));
  };

  const generateOfferPdf = async () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;

    // Logo
    try {
      const img = await fetch(logoSf).then((r) => r.blob()).then(
        (blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          }),
      );
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
    doc.text("Con la presente si emette l'offerta relativa a:", margin, y);
    y += 8;

    const sections = offer.selected.length ? offer.selected : offerSections;
    sections.forEach((s) => {
      doc.text(`• ${s}`, margin + 4, y);
      y += 6;
    });

    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Competenze professionali e modalità di pagamento", margin, y);
    y += 8;
    doc.setFont("times", "normal");
    const importoFmt = offer.importo ? money(parseAmount(offer.importo)) : "[IMPORTO]";
    const compText = `I compensi previsti per l'espletamento di tutte le attività sopra elencate sono stati determinati forfettariamente in ${importoFmt}, al netto di IVA e CNPAIA (4%) e degli oneri di istruttoria della pratica.`;
    const compLines = doc.splitTextToSize(compText, pageW - margin * 2);
    doc.text(compLines, margin, y);
    y += compLines.length * 6 + 4;

    doc.text("Il pagamento del compenso professionale avverrà secondo le seguenti modalità:", margin, y);
    y += 8;
    doc.text("•  50% all'accettazione della presente offerta;", margin + 4, y);
    y += 6;
    doc.text("•  50% contestualmente alla consegna/protocollazione della documentazione.", margin + 4, y);
    y += 10;
    doc.text("Da concordare la modalità di pagamento.", margin, y);
    y += 10;
    doc.text("In attesa di un vostro riscontro e accettazione, porgo", margin, y);
    y += 10;
    doc.text("Cordiali Saluti", margin, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text(profile.fullName, margin, y);

    y += 30;
    doc.setFont("times", "italic");
    doc.text("Firma cliente per accettazione", pageW - margin, y, { align: "right" });
    doc.line(pageW - margin - 70, y - 4, pageW - margin, y - 4);

    const fileName = `Offerta_${(offer.committente || "cliente").replace(/[^a-z0-9]+/gi, "_")}_${offer.date}.pdf`;
    doc.save(fileName);
    toast.success("Offerta generata");
  };

  return (
    <main className="ledger-grid">
      <section className="relative overflow-hidden bg-hero-ledger text-ledger-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="flex flex-col justify-center gap-5">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-secondary">
              <Briefcase className="h-5 w-5" /> Pipeline lavori futuri
            </div>
            <h1 className="font-display text-4xl font-bold sm:text-6xl">Lavori futuri</h1>
            <p className="max-w-xl text-ledger-foreground/85">
              Tieni traccia delle prestazioni da fatturare, dei pagamenti in scadenza e degli incassi storici.
              Genera offerte professionali in PDF compilando il fac-simile.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile icon={<Wallet className="h-4 w-4" />} label="Da incassare" value={money(totals.pending)} />
            <Tile icon={<AlarmClock className="h-4 w-4" />} label="In scadenza ≤30gg" value={money(totals.dueSoon)} tone="accent" />
            <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Già incassato" value={money(totals.collected)} tone="success" />
            <Tile icon={<Briefcase className="h-4 w-4" />} label="Lavori totali" value={String(totals.count)} tone="secondary" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Tabs defaultValue="pipeline" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start bg-surface-raised p-1 shadow-soft">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="scadenze">In scadenza</TabsTrigger>
            <TabsTrigger value="incassati">Incassi effettuati</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="offerta">Genera offerta</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <Panel title="Nuovo lavoro" icon={<Plus className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Input placeholder="Cliente" value={draft.client} onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))} />
                  <Textarea placeholder="Descrizione prestazione" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                  <Input placeholder="Importo concordato, es. 1500,00" value={draft.agreed_amount} onChange={(e) => setDraft((d) => ({ ...d, agreed_amount: e.target.value }))} />
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Data presunta incasso</label>
                    <Input type="date" value={draft.expected_payment_date} onChange={(e) => setDraft((d) => ({ ...d, expected_payment_date: e.target.value }))} />
                  </div>
                  <Textarea placeholder="Note" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                  <Button variant="ledger" onClick={addJob}>Aggiungi lavoro</Button>
                </div>
              </Panel>
              <Panel title={`Lavori in attesa (${pending.length})`} icon={<Clock className="h-5 w-5" />}>
                {pending.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                    Nessun lavoro futuro registrato.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pending.map((job) => {
                      const draftRow = collectedDraft[job.id] ?? { date: new Date().toISOString().slice(0, 10), amount: "" };
                      const isOverdue = job.expected_payment_date && new Date(job.expected_payment_date) < today;
                      return (
                        <div key={job.id} className={`rounded-md border p-4 transition ${isOverdue ? "border-accent/60 bg-accent/5" : "border-border bg-card"}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-display text-lg font-bold">{job.client}</p>
                              <p className="text-sm text-muted-foreground">{job.description}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Incasso previsto: <span className={isOverdue ? "font-semibold text-accent" : "font-semibold text-foreground"}>{dateIt(job.expected_payment_date)}</span>
                                {isOverdue ? " · scaduto" : ""}
                              </p>
                              {job.notes ? <p className="mt-1 text-xs italic text-muted-foreground">{job.notes}</p> : null}
                            </div>
                            <div className="text-right">
                              <p className="font-display text-xl font-bold text-primary">{money(Number(job.agreed_amount))}</p>
                            </div>
                          </div>
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="scadenze">
            <Panel title={`In scadenza nei prossimi 30 giorni (${dueSoon.length})`} icon={<AlarmClock className="h-5 w-5" />}>
              {dueSoon.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessuna scadenza imminente.
                </p>
              ) : (
                <div className="space-y-2">
                  {overdue.length > 0 && (
                    <p className="text-sm font-semibold text-accent">⚠ {overdue.length} scaduti — sollecita l'incasso!</p>
                  )}
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

          <TabsContent value="incassati">
            <Panel title={`Incassi effettuati (${collected.length})`} icon={<Coins className="h-5 w-5" />}>
              {collected.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessun incasso registrato. Sposta un lavoro dalla pipeline cliccando "Incassato".
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
                            <Button variant="outline" size="sm" onClick={() => undoCollected(job)}>Riporta in pipeline</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="timeline">
            <Panel title="Timeline scadenze" icon={<Clock className="h-5 w-5" />}>
              {jobs.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface-tint/40 p-6 text-center text-muted-foreground">
                  Nessun lavoro per costruire la timeline.
                </p>
              ) : (
                <ol className="relative ml-3 space-y-5 border-l-2 border-primary/30 pl-6">
                  {[...jobs]
                    .sort((a, b) => {
                      const da = a.collected_at || a.expected_payment_date || "9999";
                      const db = b.collected_at || b.expected_payment_date || "9999";
                      return da.localeCompare(db);
                    })
                    .map((job) => {
                      const isCollected = job.status === "collected";
                      const eventDate = isCollected ? job.collected_at : job.expected_payment_date;
                      const isOverdue = !isCollected && eventDate && new Date(eventDate) < today;
                      return (
                        <li key={job.id} className="relative">
                          <span
                            className={`absolute -left-[33px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                              isCollected ? "border-secondary bg-secondary text-secondary-foreground" : isOverdue ? "border-accent bg-accent" : "border-primary bg-surface-raised"
                            }`}
                          >
                            {isCollected ? <CheckCircle2 className="h-3 w-3" /> : null}
                          </span>
                          <div className="rounded-md border border-border bg-card p-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-semibold">{job.client}</p>
                              <p className="text-xs font-semibold text-muted-foreground">
                                {isCollected ? "Incassato " : ""}{dateIt(eventDate)}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">{job.description}</p>
                            <p className={`mt-1 font-bold ${isCollected ? "text-secondary" : "text-primary"}`}>
                              {money(Number(isCollected ? job.collected_amount ?? job.agreed_amount : job.agreed_amount))}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="offerta">
            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Compila l'offerta" icon={<FileSignature className="h-5 w-5" />} action={
                <Button variant="ledger" size="sm" onClick={generateOfferPdf}><Download className="h-4 w-4" /> PDF</Button>
              }>
                <div className="grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">Data</label>
                    <Input type="date" value={offer.date} onChange={(e) => setOffer((o) => ({ ...o, date: e.target.value }))} />
                  </div>
                  <Input placeholder="Committente / Ragione sociale" value={offer.committente} onChange={(e) => setOffer((o) => ({ ...o, committente: e.target.value }))} />
                  <Input placeholder="Indirizzo" value={offer.indirizzo} onChange={(e) => setOffer((o) => ({ ...o, indirizzo: e.target.value }))} />
                  <Textarea placeholder="Oggetto / descrizione intervento" value={offer.oggetto} onChange={(e) => setOffer((o) => ({ ...o, oggetto: e.target.value }))} />
                  <Input placeholder="Importo, es. 2500,00" value={offer.importo} onChange={(e) => setOffer((o) => ({ ...o, importo: e.target.value }))} />
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Prestazioni incluse</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {offerSections.map((s) => (
                        <label key={s} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                          <Checkbox checked={offer.selected.includes(s)} onCheckedChange={() => toggleOfferSection(s)} />
                          <span>{s}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
              <Panel title="Anteprima" icon={<FileSignature className="h-5 w-5" />}>
                <div className="rounded-md border border-border bg-card p-6 text-sm leading-relaxed">
                  <div className="mb-6 flex items-start justify-between">
                    <img src={logoSf} alt="Logo" className="h-20 w-20 object-contain" />
                    <div className="text-right text-xs italic">
                      <p className="font-bold not-italic">{profile.fullName}</p>
                      <p>{profile.residence}</p>
                      <p>Cell: {profile.phone}</p>
                      <p>E-mail: {profile.email}</p>
                    </div>
                  </div>
                  <p className="mb-4">Roma, {offer.date ? new Date(offer.date).toLocaleDateString("it-IT") : "[DATA]"}</p>
                  <p className="text-right italic">Alla c.a. {offer.committente || "[COMMITTENTE]"}</p>
                  <p className="mb-4 text-right italic">{offer.indirizzo || "[INDIRIZZO]"}</p>
                  <p className="mb-4 font-bold">Oggetto: {offer.oggetto || "[DESCRIZIONE OGGETTO INTERVENTO]"}</p>
                  <p>Con la presente si emette l'offerta relativa a:</p>
                  <ul className="my-2 list-disc pl-6">
                    {(offer.selected.length ? offer.selected : offerSections).map((s) => <li key={s}>{s}</li>)}
                  </ul>
                  <p className="mt-3">
                    Compenso forfettario: <strong>{offer.importo ? money(parseAmount(offer.importo)) : "[IMPORTO]"}</strong>, al netto di IVA e CNPAIA (4%).
                  </p>
                </div>
              </Panel>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default LavoriFuturi;
