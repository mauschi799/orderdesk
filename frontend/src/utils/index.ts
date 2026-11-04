import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DeliveryStatus, Depot, KanbanColumn, Warehouse } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABELS: Record<string, string> = {
  neu: 'Neu',
  nicht_zugewiesen: 'Nicht zugewiesen',
  zugewiesen: 'Zugewiesen',
  gedruckt: 'Gedruckt',
  in_auslieferung: 'In Auslieferung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};

export const STATUS_COLORS: Record<string, string> = {
  neu: 'bg-slate-100 text-slate-700 border-slate-200',
  nicht_zugewiesen: 'bg-red-50 text-red-700 border-red-200',
  zugewiesen: 'bg-blue-50 text-blue-700 border-blue-200',
  gedruckt: 'bg-violet-50 text-violet-700 border-violet-200',
  in_auslieferung: 'bg-amber-50 text-amber-700 border-amber-200',
  abgeschlossen: 'bg-green-50 text-green-700 border-green-200',
  storniert: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  neu: 'bg-slate-400',
  nicht_zugewiesen: 'bg-red-500',
  zugewiesen: 'bg-blue-500',
  gedruckt: 'bg-violet-500',
  in_auslieferung: 'bg-amber-500',
  abgeschlossen: 'bg-green-500',
  storniert: 'bg-gray-400',
};

// Fallback-Werte, bevor die Warehouse-Liste vom Server geladen ist bzw. falls
// sie aus irgendeinem Grund leer bleibt - danach werden diese Maps zur Laufzeit
// aus den admin-verwalteten Warehouses aufgebaut (siehe lagerLabels/lagerColors unten).
export const LAGER_LABELS: Record<string, string> = {
  frei: 'Frei',
  bengel: 'Bengel',
  trier: 'Trier',
};

export const LAGER_COLORS: Record<string, string> = {
  frei: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bengel: 'bg-orange-50 text-orange-700 border-orange-200',
  trier: 'bg-sky-50 text-sky-700 border-sky-200',
};

// Feste Farbthemen, aus denen beim Anlegen eines Lagers gewählt wird. Als
// Literal-Strings hinterlegt, damit Tailwinds JIT-Scanner die Klassen findet
// (dynamisches `bg-${farbe}-50` würde nicht erkannt).
export const LAGER_FARBEN = ['slate', 'sky', 'orange', 'emerald', 'violet', 'rose', 'amber', 'indigo', 'teal', 'pink'] as const;

export const LAGER_FARBE_CLASSES: Record<string, { badge: string; headerBg: string; headerBorder: string; dot: string; swatch: string }> = {
  slate:   { badge: 'bg-slate-50 text-slate-700 border-slate-200',     headerBg: 'bg-slate-50',   headerBorder: 'border-slate-300', dot: 'bg-slate-400',   swatch: 'bg-slate-400' },
  sky:     { badge: 'bg-sky-50 text-sky-700 border-sky-200',           headerBg: 'bg-sky-50',     headerBorder: 'border-sky-400',   dot: 'bg-sky-500',     swatch: 'bg-sky-500' },
  orange:  { badge: 'bg-orange-50 text-orange-700 border-orange-200',  headerBg: 'bg-orange-50',  headerBorder: 'border-orange-400', dot: 'bg-orange-500', swatch: 'bg-orange-500' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-400', dot: 'bg-emerald-500', swatch: 'bg-emerald-500' },
  violet:  { badge: 'bg-violet-50 text-violet-700 border-violet-200',  headerBg: 'bg-violet-50',  headerBorder: 'border-violet-400', dot: 'bg-violet-500', swatch: 'bg-violet-500' },
  rose:    { badge: 'bg-rose-50 text-rose-700 border-rose-200',        headerBg: 'bg-rose-50',    headerBorder: 'border-rose-400',  dot: 'bg-rose-500',   swatch: 'bg-rose-500' },
  amber:   { badge: 'bg-amber-50 text-amber-700 border-amber-200',     headerBg: 'bg-amber-50',   headerBorder: 'border-amber-400', dot: 'bg-amber-500',  swatch: 'bg-amber-500' },
  indigo:  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',  headerBg: 'bg-indigo-50',  headerBorder: 'border-indigo-400', dot: 'bg-indigo-500', swatch: 'bg-indigo-500' },
  teal:    { badge: 'bg-teal-50 text-teal-700 border-teal-200',        headerBg: 'bg-teal-50',    headerBorder: 'border-teal-400',  dot: 'bg-teal-500',   swatch: 'bg-teal-500' },
  pink:    { badge: 'bg-pink-50 text-pink-700 border-pink-200',        headerBg: 'bg-pink-50',    headerBorder: 'border-pink-400',  dot: 'bg-pink-500',   swatch: 'bg-pink-500' },
};

// Aus der admin-verwalteten Warehouse-Liste aufgebaute Label-/Farb-Maps.
// Fällt auf die statischen LAGER_LABELS/LAGER_COLORS zurück, solange die
// Liste noch nicht geladen ist.
export function lagerLabels(warehouses: Warehouse[] | undefined): Record<string, string> {
  if (!warehouses || warehouses.length === 0) return LAGER_LABELS;
  return Object.fromEntries(warehouses.map(w => [w.code, w.name]));
}

export function lagerColors(warehouses: Warehouse[] | undefined): Record<string, string> {
  if (!warehouses || warehouses.length === 0) return LAGER_COLORS;
  return Object.fromEntries(warehouses.map(w => [w.code, (LAGER_FARBE_CLASSES[w.farbe] || LAGER_FARBE_CLASSES.slate).badge]));
}

export const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  disponent: 'Disponent',
  lagerist: 'Lagerist',
  viewer: 'Betrachter',
  filialen: 'Filiale',
};

// ── Kanban-Spalten: Neu | <ein Warehouse je aktivem Lager> | Erledigt ──────
// Spalten-ID entspricht der Lagerzuweisung (außer 'neu' und 'erledigt') und
// wird aus der admin-verwalteten Warehouse-Liste aufgebaut, statt fest zu sein.
export interface KanbanColumnDef {
  id: KanbanColumn;
  label: string;
  headerBg: string;
  headerBorder: string;
  dotColor: string;
  // Which lager does dropping here assign?
  lager: Depot | null;
  // Which status does dropping here set?
  status: string | null;
}

export function buildKanbanColumns(warehouses: Warehouse[]): KanbanColumnDef[] {
  return [
    {
      id: 'neu',
      label: 'Neu',
      headerBg: 'bg-slate-50',
      headerBorder: 'border-slate-300',
      dotColor: 'bg-slate-400',
      lager: null,
      status: 'neu',
    },
    ...warehouses.map((w): KanbanColumnDef => {
      const c = LAGER_FARBE_CLASSES[w.farbe] || LAGER_FARBE_CLASSES.slate;
      return {
        id: w.code,
        label: w.name,
        headerBg: c.headerBg,
        headerBorder: c.headerBorder,
        dotColor: c.dot,
        lager: w.code,
        status: 'zugewiesen',
      };
    }),
    {
      id: 'erledigt',
      label: 'Erledigt',
      headerBg: 'bg-green-50',
      headerBorder: 'border-green-400',
      dotColor: 'bg-green-500',
      lager: null,
      status: 'abgeschlossen',
    },
  ];
}

export const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
};

export const formatDateTime = (date: string | Date) => {
  return new Date(date).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`;

export const calcGesamtgewicht = (positionen: any[]) => {
  return positionen.reduce((sum, pos) => sum + (pos.gewicht || 0) * pos.menge, 0);
};

// Netto GG: only positions with ArticleGroup 101–109 (gas fillings)
const isGasGruppe = (gruppeNr?: string | null) => {
  if (!gruppeNr) return false;
  const n = parseInt(gruppeNr, 10);
  return n >= 101 && n <= 109;
};

export const calcNettoGG = (positionen: any[]) => {
  return positionen
    .filter(pos => isGasGruppe(pos.artikelGruppeNr))
    .reduce((sum, pos) => sum + (pos.gewicht || 0) * Math.abs(pos.menge), 0);
};

export const AKTION_LABELS: Record<string, string> = {
  login: 'Angemeldet',
  logout: 'Abgemeldet',
  lieferschein_erstellt: 'Lieferschein erstellt',
  lieferschein_geaendert: 'Lieferschein geändert',
  lieferschein_geloescht: 'Lieferschein gelöscht',
  status_geaendert: 'Status geändert',
  lager_zugewiesen: 'Lager zugewiesen',
  gedruckt: 'Gedruckt',
  auslieferung_gestartet: 'Auslieferung gestartet',
  auslieferung_abgeschlossen: 'Auslieferung abgeschlossen',
  import_gestartet: 'Import gestartet',
  import_abgeschlossen: 'Import abgeschlossen',
  import_manuell: 'Manueller Sync',
  import_auto: 'Automatischer Sync',
  benutzer_erstellt: 'Benutzer erstellt',
  benutzer_geaendert: 'Benutzer geändert',
  benutzer_geloescht: 'Benutzer gelöscht',
  kanban_verschoben: 'Kanban verschoben',
  system_update: 'System-Update gestartet',
};
