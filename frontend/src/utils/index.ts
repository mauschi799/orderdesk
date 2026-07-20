import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DeliveryStatus, Depot, KanbanColumn } from '../types';

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

export const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  disponent: 'Disponent',
  lagerist: 'Lagerist',
  viewer: 'Betrachter',
  filialen: 'Filiale',
};

// ── Neue Kanban-Spalten: Neu | Trier | Bengel | Erledigt ───────────────────
// Spalten-ID entspricht der Lagerzuweisung (außer 'neu' und 'erledigt')
export const KANBAN_COLUMNS: {
  id: KanbanColumn;
  label: string;
  headerBg: string;
  headerBorder: string;
  dotColor: string;
  // Which lager does dropping here assign?
  lager: Depot | null;
  // Which status does dropping here set?
  status: string | null;
}[] = [
  {
    id: 'neu',
    label: 'Neu',
    headerBg: 'bg-slate-50',
    headerBorder: 'border-slate-300',
    dotColor: 'bg-slate-400',
    lager: null,
    status: 'neu',
  },
  {
    id: 'trier',
    label: 'Trier',
    headerBg: 'bg-sky-50',
    headerBorder: 'border-sky-400',
    dotColor: 'bg-sky-500',
    lager: 'trier',
    status: 'zugewiesen',
  },
  {
    id: 'bengel',
    label: 'Bengel',
    headerBg: 'bg-orange-50',
    headerBorder: 'border-orange-400',
    dotColor: 'bg-orange-500',
    lager: 'bengel',
    status: 'zugewiesen',
  },
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
};
