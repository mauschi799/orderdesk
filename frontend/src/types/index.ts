export type Role = 'administrator' | 'disponent' | 'lagerist' | 'viewer' | 'filialen';
export type FahrzeugTyp = 'lkw' | 'transporter' | 'pkw' | 'anhaenger' | 'sonstige';

export interface Driver {
  _id: string;
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
  geburtsdatum: string | null;
  standort: string;
  fuehrerscheinNr: string;
  fuehrerscheinKlassen: string[];
  fuehrerscheinAblauf: string | null;
  adrSchein: boolean;
  adrAblauf: string | null;
  aktiv: boolean;
  notiz: string;
  dokumente: VehicleDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDocument {
  _id: string;
  name: string;
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  hochgeladenAm: string;
  hochgeladenVon?: { _id: string; name: string } | string;
}

export interface Vehicle {
  _id: string;
  nummernschild: string;
  hersteller: string;
  modell: string;
  typ: FahrzeugTyp;
  standort: string;
  baujahr: number | null;
  zugelasseneGesamtmasse: number | null;
  leergewicht: number | null;
  tuevFaellig: string | null;
  uvvFaellig: string | null;
  hauptuntersuchungFaellig: string | null;
  aktiv: boolean;
  notiz: string;
  dokumente: VehicleDocument[];
  createdAt: string;
  updatedAt: string;
}
export type Depot = 'frei' | 'bengel' | 'trier' | null;
export type DeliveryStatus = 'neu' | 'nicht_zugewiesen' | 'zugewiesen' | 'gedruckt' | 'in_auslieferung' | 'abgeschlossen' | 'storniert';
// Kanban Spalten: Neu | Trier | Bengel | Erledigt  (+ interne Status-Spalten)
export type KanbanColumn = 'neu' | 'trier' | 'bengel' | 'erledigt' | 'nicht_zugewiesen' | 'zugewiesen' | 'gedruckt' | 'in_auslieferung' | 'abgeschlossen';

export interface LagerBerechtigung {
  aktiv: boolean;
  filialen: string[];
}

export interface User {
  _id: string;
  name: string;
  username: string;
  role: Role;
  depot: Depot;
  filiale?: string | null;
  lagerMelden?: LagerBerechtigung | null;
  lagerLesen?: LagerBerechtigung | null;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface LagerPosition {
  artikelnummer: string;
  beschreibung: string;
  menge: number;
  einheit: string;
}

export interface LagerProdukt {
  _id: string;
  typ?: 'produkt' | 'trenner';
  artikelnummer: string;
  beschreibung: string;
  einheit: string;
  aktiv: boolean;
  sortierung: number;
  verfuegbarIn: string[];
  createdAt: string;
}

export interface LagerMeldung {
  _id: string;
  filiale: string;
  gemeldetVon: User | string;
  gemeldetAm: string;
  positionen: LagerPosition[];
  notiz?: string;
  createdAt: string;
}

export interface Position {
  artikelnummer: string;
  beschreibung: string;
  menge: number;
  gewicht: number;
  einheit: string;
  artikelGruppeNr?: string | null;
}

export interface Adresse {
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  lat?: number;
  lng?: number;
}

export interface Kunde {
  kundennummer?: string;
  name: string;
  name2?: string;
  adresse?: Adresse;
  telefon?: string;
  email?: string;
}

export interface DruckStatus {
  gedruckt: boolean;
  gedrucktAm?: string;
  gedrucktVon?: User | string;
  druckAnzahl: number;
}

export interface Auslieferung {
  fahrer?: string;
  fahrzeug?: string;
  gestartetAm?: string;
  abgeschlossenAm?: string;
}

export interface Delivery {
  _id: string;
  lieferscheinNr: string;
  auftragNr?: string;
  selectlineId?: string;
  kunde: Kunde;
  lieferdatum: string;
  erstelltAm: string;
  notiz?: string;
  positionen: Position[];
  status: DeliveryStatus;
  lager: Depot;
  kanbanSpalte: KanbanColumn;
  kanbanPosition: number;
  druckStatus: DruckStatus;
  auslieferung?: Auslieferung;
  zugewiesenAn?: User | string;
  zugewiesenAm?: string;
  importiert: boolean;
  importQuelle: 'selectline' | 'manuell';
  erstelltVon?: User | string;
  gesamtgewichtNetto?: number;
  gesamtMenge?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  _id: string;
  benutzer: User | string;
  benutzerName: string;
  aktion: string;
  lieferschein?: Delivery | string;
  lieferscheinNr?: string;
  details?: {
    vonStatus?: string;
    zuStatus?: string;
    vonLager?: string;
    zuLager?: string;
    beschreibung?: string;
  };
  timestamp: string;
}

export interface DashboardStats {
  gesamt: number;
  heute: number;
  offen: number;
  nachStatus: Record<string, number>;
  nachLager: Record<string, number>;
  recentActivity: AuditLog[];
}

export interface KanbanData {
  neu: Delivery[];
  trier: Delivery[];
  bengel: Delivery[];
  erledigt: Delivery[];
  // Legacy status columns (still supported)
  nicht_zugewiesen?: Delivery[];
  zugewiesen?: Delivery[];
  gedruckt?: Delivery[];
  in_auslieferung?: Delivery[];
  abgeschlossen?: Delivery[];
}

export type TourStatus = 'geplant' | 'bereit' | 'in_auslieferung' | 'abgeschlossen';
export interface TourDeliveryItem {
  _id?: string;
  delivery: Delivery | string;
  reihenfolge: number;
  lieferscheinNr?: string;
  kundeName?: string;
  adresse?: string;
  geplantAnkunft?: string;
  tatsaechlichAnkunft?: string;
  abgeschlossen: boolean;
}
export interface Tour {
  _id: string;
  name: string;
  datum: string;
  lager: Depot;
  status: TourStatus;
  fahrer?: string;
  fahrzeug?: string;
  fahrerId?: Driver | string | null;
  fahrzeugId?: Vehicle | string | null;
  notiz?: string;
  lieferscheine: TourDeliveryItem[];
  gestartetAm?: string;
  abgeschlossenAm?: string;
  erstelltVon?: User | string;
  anzahlLieferscheine?: number;
  createdAt: string;
  updatedAt: string;
}
