import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BookUser, Building2, Briefcase, Copy, CreditCard, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { profile } from "@/data/profile";
import logoSf from "@/assets/logo-sf.jpg";

const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:${profile.surname};${profile.name};;Ing.;\nFN:${profile.fullName}\nTITLE:Ingegnere Civile\nORG:${profile.order}\nTEL;TYPE=CELL:+39${profile.phone}\nEMAIL:${profile.email}\nEMAIL;TYPE=PEC:${profile.pec}\nADR;TYPE=HOME:;;${profile.residence};;;;\nNOTE:P.IVA ${profile.vat} - C.F. ${profile.cf} - Iscrizione Albo n. ${profile.orderNumber}\nEND:VCARD`;

const copy = (label: string, value: string) => {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copiato`);
};

const Row = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <button
    onClick={() => copy(label, value)}
    className="flex w-full items-start justify-between gap-3 rounded-md border border-border bg-card p-3 text-left transition hover:bg-surface-tint"
  >
    <div className="flex items-start gap-3">
      {icon ? <span className="mt-0.5 text-primary">{icon}</span> : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-mono text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
    <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
  </button>
);

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

const Dati = () => {
  const [activeBank, setActiveBank] = useState(profile.banks[0].name);
  const bank = useMemo(() => profile.banks.find((b) => b.name === activeBank) ?? profile.banks[0], [activeBank]);

  return (
    <main className="ledger-grid">
      <section className="relative overflow-hidden bg-hero-ledger text-ledger-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8">
          <div className="flex flex-col justify-center gap-6">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wide text-secondary">
              <BookUser className="h-5 w-5" /> Dati personali e fiscali
            </div>
            <h1 className="font-display text-4xl font-bold sm:text-6xl">Biglietto da visita</h1>
            <p className="max-w-xl text-ledger-foreground/85">
              Tutti i dati anagrafici, fiscali e bancari raccolti in un unico posto. Tocca un campo per copiarlo
              negli appunti.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-secondary">P.IVA {profile.vat}</span>
              <span className="rounded-full border border-ledger-foreground/20 bg-ledger-foreground/10 px-3 py-1">{profile.order} · n° {profile.orderNumber}</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="relative overflow-hidden rounded-2xl border border-ledger-foreground/15 bg-surface-raised p-6 text-foreground shadow-ledger">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-secondary/15 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-primary/15 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <img src={logoSf} alt="Logo SF" className="h-24 w-24 object-contain" />
                <div className="text-right">
                  <p className="font-display text-lg font-bold leading-tight">{profile.fullName}</p>
                  <p className="text-xs text-muted-foreground">Civil Engineer</p>
                  <p className="mt-2 text-xs">{profile.residence}</p>
                  <p className="text-xs">Cell: {profile.phone}</p>
                </div>
              </div>
              <div className="relative mt-6 flex items-center justify-center rounded-xl border border-border bg-surface-tint p-4">
                <QRCodeSVG value={vCard} size={180} level="M" includeMargin />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">Scansiona per salvare il contatto</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Tabs defaultValue="anagrafica" className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start bg-surface-raised p-1 shadow-soft">
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="fiscali">Fiscali e ordine</TabsTrigger>
            <TabsTrigger value="banche">Coordinate bancarie</TabsTrigger>
          </TabsList>

          <TabsContent value="anagrafica">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Identità" icon={<User className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Row label="Nome" value={profile.name} />
                  <Row label="Cognome" value={profile.surname} />
                  <Row label="Nato a" value={`${profile.birth.city}, il ${profile.birth.date}`} icon={<MapPin className="h-4 w-4" />} />
                  <Row label="Residenza" value={profile.residence} icon={<MapPin className="h-4 w-4" />} />
                </div>
              </Panel>
              <Panel title="Contatti" icon={<Mail className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Row label="Telefono" value={profile.phone} icon={<Phone className="h-4 w-4" />} />
                  <Row label="Email" value={profile.email} icon={<Mail className="h-4 w-4" />} />
                  <Row label="PEC" value={profile.pec} icon={<ShieldCheck className="h-4 w-4" />} />
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="fiscali">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Codice fiscale & P.IVA" icon={<ShieldCheck className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Row label="Codice Fiscale" value={profile.cf} />
                  <Row label="Partita IVA" value={profile.vat} />
                </div>
              </Panel>
              <Panel title="Ordine professionale" icon={<Building2 className="h-5 w-5" />}>
                <div className="grid gap-3">
                  <Row label="Ordine" value={profile.order} />
                  <Row label="Numero iscrizione" value={profile.orderNumber} />
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="banche">
            <div className="mb-4 flex flex-wrap gap-2">
              {profile.banks.map((b) => (
                <Button
                  key={b.name}
                  size="sm"
                  variant={activeBank === b.name ? "ledger" : "outline"}
                  onClick={() => setActiveBank(b.name)}
                >
                  <CreditCard className="h-4 w-4" /> {b.name}
                </Button>
              ))}
            </div>
            <Panel title={`${bank.name} · ${bank.holder}`} icon={<CreditCard className="h-5 w-5" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="IBAN" value={bank.iban} />
                <Row label="Intestatario" value={bank.holder} />
                <Row label="Paese" value={bank.country} />
                <Row label="CIN/EU" value={bank.cinEu} />
                <Row label="CIN/IT" value={bank.cinIt} />
                <Row label="ABI" value={bank.abi} />
                <Row label="CAB" value={bank.cab} />
                <Row label="Numero C/C" value={bank.account} />
                <Row label="BIC/SWIFT" value={bank.bic} />
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default Dati;
