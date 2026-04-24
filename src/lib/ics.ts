// Minimal ICS (iCalendar) generator for export to Google/Apple/Outlook calendars.

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD (all-day)
  category?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

const toICSDate = (iso: string) => iso.replace(/-/g, "");

const stamp = () => {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
};

const escape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export const buildICS = (events: CalendarEvent[]) => {
  const now = stamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studio Fratoni//Lavori//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    const start = toICSDate(ev.date);
    // All-day event: DTEND is exclusive (next day).
    const next = new Date(ev.date);
    next.setDate(next.getDate() + 1);
    const end = toICSDate(next.toISOString().slice(0, 10));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}@studio-fratoni`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escape(ev.title)}`,
      ev.description ? `DESCRIPTION:${escape(ev.description)}` : "",
      ev.category ? `CATEGORIES:${escape(ev.category)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
};

export const downloadICS = (filename: string, events: CalendarEvent[]) => {
  const blob = new Blob([buildICS(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
