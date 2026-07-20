require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const AuditLog = require('../models/AuditLog');

const ago = (days) => new Date(Date.now() - days * 86_400_000);
const ahead = (days) => new Date(Date.now() + days * 86_400_000);
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000);

const pos = (artikelnummer, beschreibung, menge, leergewicht, fuellgewicht) => ({
  artikelnummer, beschreibung, menge, leergewicht, fuellgewicht, einheit: 'Stk',
});
const p11 = (n) => pos('G-11KG', 'Propangas 11 kg Flasche', n, 7.8, 18.8);
const p33 = (n) => pos('G-33KG', 'Propangas 33 kg Flasche', n, 24.5, 57.5);
const p5  = (n) => pos('G-5KG',  'Propangas 5 kg Flasche',  n, 5.8, 10.8);
const pb  = (n) => pos('B-11KG', 'Butangas 11 kg Flasche',  n, 7.5, 18.5);

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/orderdesk');
  console.log('Verbunden mit MongoDB');

  await User.deleteMany({});
  await Delivery.deleteMany({});
  await AuditLog.deleteMany({});

  // ── Benutzer ──────────────────────────────────────────────────────────────
  const admin = await User.create({
    name: 'Administrator', username: 'admin', pin: '1234', role: 'administrator',
  });
  const disponent = await User.create({
    name: 'Max Mustermann', username: 'disponent', pin: '2345', role: 'disponent',
    createdBy: admin._id,
  });
  const lagerBengel = await User.create({
    name: 'Klaus Weber', username: 'lagerist', pin: '3456', role: 'lagerist',
    depot: 'bengel', createdBy: admin._id,
  });
  const lagerTrier = await User.create({
    name: 'Thomas Langer', username: 'lagerist_trier', pin: '4567', role: 'lagerist',
    depot: 'trier', createdBy: admin._id,
  });
  await User.create({
    name: 'Anna Müller', username: 'viewer', pin: '5678', role: 'viewer',
    createdBy: admin._id,
  });

  // ── Lieferscheine ─────────────────────────────────────────────────────────
  const deliveries = await Delivery.insertMany([

    // ── ABGESCHLOSSEN ──
    {
      lieferscheinNr: 'LS-2025-0001', selectlineId: 'SL-1001', auftragNr: 'A-20250115',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(30),
      kunde: { kundennummer: 'K-1001', name: 'Bäckerei Schmidt GmbH',
        adresse: { strasse: 'Simeonstraße 19', plz: '54290', ort: 'Trier', land: 'DE' },
        telefon: '0651-12345' },
      lieferdatum: ago(28), erstelltAm: ago(30),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'trier',
      positionen: [p11(5), p33(2)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(29), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Thomas Langer', fahrzeug: 'TRI-GAS 1',
        gestartetAm: ago(28), abgeschlossenAm: ago(28) },
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0002', selectlineId: 'SL-1002', auftragNr: 'A-20250116',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(25),
      kunde: { kundennummer: 'K-1002', name: 'Restaurant Zum Goldenen Löwen',
        adresse: { strasse: 'Burgstraße 5', plz: '54634', ort: 'Bitburg', land: 'DE' },
        telefon: '06561-4567' },
      lieferdatum: ago(22), erstelltAm: ago(25),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'bengel',
      positionen: [p11(10)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(23), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 1',
        gestartetAm: ago(22), abgeschlossenAm: ago(22) },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0003', selectlineId: 'SL-1003',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(20),
      kunde: { kundennummer: 'K-1003', name: 'Campingplatz Mosel-Idyll GmbH',
        adresse: { strasse: 'Baldwinstraße 2', plz: '56856', ort: 'Zell (Mosel)', land: 'DE' },
        telefon: '06542-8910' },
      lieferdatum: ago(18), erstelltAm: ago(20),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'bengel',
      positionen: [p5(20), p11(8)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(19), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 1',
        gestartetAm: ago(18), abgeschlossenAm: ago(18) },
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0004', selectlineId: 'SL-1004',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(15),
      kunde: { kundennummer: 'K-1004', name: 'Hotel Eifelblick',
        adresse: { strasse: 'Leopoldstraße 16', plz: '54550', ort: 'Daun', land: 'DE' },
        telefon: '06592-2233' },
      lieferdatum: ago(12), erstelltAm: ago(15),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'bengel',
      positionen: [p11(15), p33(5)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(13), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 2',
        gestartetAm: ago(12), abgeschlossenAm: ago(12) },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0005', selectlineId: 'SL-1005',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(10),
      kunde: { kundennummer: 'K-1005', name: 'Gasversorgung Eifel KG',
        adresse: { strasse: 'Bahnhofstraße 10', plz: '54634', ort: 'Bitburg', land: 'DE' },
        telefon: '06561-9876' },
      lieferdatum: ago(8), erstelltAm: ago(10),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'bengel',
      positionen: [p33(20)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(9), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 1',
        gestartetAm: ago(8), abgeschlossenAm: ago(8) },
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0006',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1006', name: 'Brauerei Moseltal GmbH',
        adresse: { strasse: 'Brückenstraße 5', plz: '54338', ort: 'Schweich', land: 'DE' },
        telefon: '06502-1188' },
      lieferdatum: ago(6), erstelltAm: ago(7),
      status: 'abgeschlossen', kanbanSpalte: 'abgeschlossen', lager: 'trier',
      positionen: [p11(6), pb(4)],
      druckStatus: { gedruckt: true, gedrucktAm: ago(7), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Thomas Langer', fahrzeug: 'TRI-GAS 1',
        gestartetAm: ago(6), abgeschlossenAm: ago(6) },
      erstelltVon: disponent._id,
    },

    // ── IN_AUSLIEFERUNG ──
    {
      lieferscheinNr: 'LS-2025-0007', selectlineId: 'SL-1007',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(3),
      kunde: { kundennummer: 'K-1007', name: 'Stadtwerke Wittlich GmbH',
        adresse: { strasse: 'Kurfürstenstraße 25', plz: '54516', ort: 'Wittlich', land: 'DE' },
        telefon: '06571-6000' },
      lieferdatum: new Date(), erstelltAm: ago(3),
      status: 'in_auslieferung', kanbanSpalte: 'in_auslieferung', lager: 'bengel',
      positionen: [p33(12), p11(8)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(4), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 1',
        gestartetAm: hoursAgo(2) },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0008', selectlineId: 'SL-1008',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(2),
      kunde: { kundennummer: 'K-1008', name: 'Metzgerei Hartz & Söhne',
        adresse: { strasse: 'Gestade 14', plz: '54470', ort: 'Bernkastel-Kues', land: 'DE' },
        telefon: '06531-2244' },
      lieferdatum: new Date(), erstelltAm: ago(2),
      status: 'in_auslieferung', kanbanSpalte: 'in_auslieferung', lager: 'trier',
      positionen: [p11(4), p5(10)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(3), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Thomas Langer', fahrzeug: 'TRI-GAS 1',
        gestartetAm: hoursAgo(1) },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0009',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1009', name: 'Gaststätte Zur Linde',
        adresse: { strasse: 'Moselstraße 8', plz: '56253', ort: 'Treis-Karden', land: 'DE' },
        telefon: '02672-4433' },
      lieferdatum: new Date(), erstelltAm: ago(1),
      status: 'in_auslieferung', kanbanSpalte: 'in_auslieferung', lager: 'bengel',
      positionen: [p11(3), p33(1)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(5), druckAnzahl: 1 },
      auslieferung: { fahrer: 'Klaus Weber', fahrzeug: 'BEN-GAS 2',
        gestartetAm: hoursAgo(3) },
      erstelltVon: admin._id,
    },

    // ── GEDRUCKT ──
    {
      lieferscheinNr: 'LS-2025-0010', selectlineId: 'SL-1010',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(2),
      kunde: { kundennummer: 'K-1010', name: 'Weingut Mosel-Terrassen',
        adresse: { strasse: 'Uferallee 28', plz: '54492', ort: 'Zeltingen-Rachtig', land: 'DE' },
        telefon: '06532-1177' },
      lieferdatum: ahead(1), erstelltAm: ago(2),
      status: 'gedruckt', kanbanSpalte: 'gedruckt', lager: 'bengel',
      positionen: [p33(8), p11(5)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(2), druckAnzahl: 1 },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0011', selectlineId: 'SL-1011',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(1),
      kunde: { kundennummer: 'K-1011', name: 'Eifel-Therme Bad Bertrich',
        adresse: { strasse: 'Kurfürstenstraße 38', plz: '56864', ort: 'Bad Bertrich', land: 'DE' },
        telefon: '02674-9330' },
      lieferdatum: ahead(1), erstelltAm: ago(1),
      status: 'gedruckt', kanbanSpalte: 'gedruckt', lager: 'bengel',
      positionen: [p33(6), pb(3)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(1), druckAnzahl: 1 },
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0012',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1012', name: 'Bäckerei Kettern',
        adresse: { strasse: 'Olewiger Straße 5', plz: '54295', ort: 'Trier', land: 'DE' },
        telefon: '0651-78956' },
      lieferdatum: ahead(1), erstelltAm: ago(1),
      status: 'gedruckt', kanbanSpalte: 'gedruckt', lager: 'trier',
      positionen: [p11(8)],
      druckStatus: { gedruckt: true, gedrucktAm: hoursAgo(6), druckAnzahl: 2 },
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0013', selectlineId: 'SL-1013',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1013', name: 'Metallbau Kirch GmbH',
        adresse: { strasse: 'Saarstraße 12', plz: '54329', ort: 'Konz', land: 'DE' },
        telefon: '06501-15678' },
      lieferdatum: ahead(2), erstelltAm: new Date(),
      status: 'gedruckt', kanbanSpalte: 'gedruckt', lager: 'trier',
      positionen: [p33(3), p11(6)],
      druckStatus: { gedruckt: true, gedrucktAm: new Date(), druckAnzahl: 1 },
      erstelltVon: disponent._id,
    },

    // ── ZUGEWIESEN ──
    {
      lieferscheinNr: 'LS-2025-0014', selectlineId: 'SL-1014',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(1),
      kunde: { kundennummer: 'K-1014', name: 'Landgasthof Hubertus',
        adresse: { strasse: 'Hauptstraße 12', plz: '54552', ort: 'Mehren', land: 'DE' },
        telefon: '06592-9911' },
      lieferdatum: ahead(2), erstelltAm: ago(1),
      status: 'zugewiesen', kanbanSpalte: 'zugewiesen', lager: 'bengel',
      positionen: [p11(12), p5(5)],
      zugewiesenAn: lagerBengel._id, zugewiesenAm: hoursAgo(8),
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0015', selectlineId: 'SL-1015',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(1),
      kunde: { kundennummer: 'K-1015', name: 'Getränkemarkt Endres',
        adresse: { strasse: 'Bahnhofstraße 14', plz: '54568', ort: 'Gerolstein', land: 'DE' },
        telefon: '06591-3344' },
      lieferdatum: ahead(3), erstelltAm: ago(1),
      status: 'zugewiesen', kanbanSpalte: 'zugewiesen', lager: 'bengel',
      positionen: [p11(20), p33(4)],
      zugewiesenAn: lagerBengel._id, zugewiesenAm: hoursAgo(6),
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0016',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1016', name: 'Pflegeheim St. Nikolaus',
        adresse: { strasse: 'Moselweinstraße 15', plz: '56829', ort: 'Pommern', land: 'DE' },
        telefon: '02672-8822' },
      lieferdatum: ahead(3), erstelltAm: ago(1),
      status: 'zugewiesen', kanbanSpalte: 'zugewiesen', lager: 'bengel',
      positionen: [p5(30)],
      zugewiesenAn: lagerBengel._id, zugewiesenAm: hoursAgo(5),
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0017', selectlineId: 'SL-1017',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1017', name: 'Autohaus Müller & Söhne',
        adresse: { strasse: 'Römerstraße 150', plz: '54292', ort: 'Trier', land: 'DE' },
        telefon: '0651-99100' },
      lieferdatum: ahead(2), erstelltAm: new Date(),
      status: 'zugewiesen', kanbanSpalte: 'zugewiesen', lager: 'trier',
      positionen: [p33(5)],
      zugewiesenAn: lagerTrier._id, zugewiesenAm: hoursAgo(3),
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0018',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1018', name: 'Bauunternehmen Heinrich GmbH',
        adresse: { strasse: 'Brückenstraße 18', plz: '54338', ort: 'Schweich', land: 'DE' },
        telefon: '06502-7766' },
      lieferdatum: ahead(4), erstelltAm: new Date(),
      status: 'zugewiesen', kanbanSpalte: 'zugewiesen', lager: 'trier',
      positionen: [p33(8), p11(4)],
      zugewiesenAn: lagerTrier._id, zugewiesenAm: hoursAgo(2),
      erstelltVon: disponent._id,
    },

    // ── NICHT_ZUGEWIESEN ──
    {
      lieferscheinNr: 'LS-2025-0019', selectlineId: 'SL-1019',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1019', name: 'Ferienwohnanlage Cochem GmbH',
        adresse: { strasse: 'Moselpromenade 23', plz: '56812', ort: 'Cochem', land: 'DE' },
        telefon: '02671-7799' },
      lieferdatum: ahead(3), erstelltAm: new Date(),
      status: 'nicht_zugewiesen', kanbanSpalte: 'nicht_zugewiesen',
      positionen: [p11(16), p5(8)],
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0020', selectlineId: 'SL-1020',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1020', name: 'Weingut Karl Erbes',
        adresse: { strasse: 'Uferallee 28', plz: '54539', ort: 'Ürzig', land: 'DE' },
        telefon: '06532-2180' },
      lieferdatum: ahead(4), erstelltAm: new Date(),
      status: 'nicht_zugewiesen', kanbanSpalte: 'nicht_zugewiesen',
      positionen: [p11(12)],
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0021',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1021', name: 'Privathaushalt Wagner',
        adresse: { strasse: 'Saarstraße 5', plz: '54329', ort: 'Konz', land: 'DE' },
        telefon: '06501-11223' },
      lieferdatum: ahead(5), erstelltAm: new Date(),
      status: 'nicht_zugewiesen', kanbanSpalte: 'nicht_zugewiesen',
      positionen: [p11(2)],
      erstelltVon: disponent._id,
    },

    // ── NEU ──
    {
      lieferscheinNr: 'LS-2025-0022', selectlineId: 'SL-1022',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1022', name: 'Freizeitpark Vulkaneifel GmbH',
        adresse: { strasse: 'Leopoldstraße 5', plz: '54550', ort: 'Daun', land: 'DE' },
        telefon: '06592-5544' },
      lieferdatum: ahead(5), erstelltAm: new Date(),
      status: 'neu', kanbanSpalte: 'neu',
      positionen: [p33(10), p11(15), p5(20)],
      erstelltVon: admin._id,
    },
    {
      lieferscheinNr: 'LS-2025-0023', selectlineId: 'SL-1023',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1023', name: 'Eifelbad Gerolstein',
        adresse: { strasse: 'Sarresdorfer Straße 44', plz: '54568', ort: 'Gerolstein', land: 'DE' },
        telefon: '06591-8866' },
      lieferdatum: ahead(6), erstelltAm: new Date(),
      status: 'neu', kanbanSpalte: 'neu',
      positionen: [p33(15)],
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0024',
      importQuelle: 'manuell',
      kunde: { kundennummer: 'K-1024', name: 'Grundschule Wittlich-Mitte',
        adresse: { strasse: 'Neustraße 5', plz: '54516', ort: 'Wittlich', land: 'DE' },
        telefon: '06571-2233' },
      lieferdatum: ahead(7), erstelltAm: new Date(),
      status: 'neu', kanbanSpalte: 'neu',
      positionen: [p5(6), p11(4)],
      erstelltVon: disponent._id,
    },
    {
      lieferscheinNr: 'LS-2025-0025', selectlineId: 'SL-1025',
      importQuelle: 'selectline', importiert: true, importiertAm: new Date(),
      kunde: { kundennummer: 'K-1025', name: 'Volksbank Trier eG',
        adresse: { strasse: 'Fleischstraße 12', plz: '54290', ort: 'Trier', land: 'DE' },
        telefon: '0651-14700' },
      lieferdatum: ahead(8), erstelltAm: new Date(),
      status: 'neu', kanbanSpalte: 'neu',
      positionen: [p11(3)],
      erstelltVon: admin._id,
    },

    // ── STORNIERT ──
    {
      lieferscheinNr: 'LS-2025-0026', selectlineId: 'SL-1026',
      importQuelle: 'selectline', importiert: true, importiertAm: ago(5),
      kunde: { kundennummer: 'K-1026', name: 'Hagebau Trier GmbH',
        adresse: { strasse: 'Luxemburger Straße 95', plz: '54294', ort: 'Trier', land: 'DE' },
        telefon: '0651-88330' },
      lieferdatum: ago(3), erstelltAm: ago(5),
      status: 'storniert', kanbanSpalte: 'abgeschlossen',
      notiz: 'Kunde hat Bestellung telefonisch storniert',
      positionen: [p11(20), p33(5)],
      erstelltVon: admin._id,
    },
  ]);

  const d = deliveries;

  // ── Audit-Log ─────────────────────────────────────────────────────────────
  await AuditLog.insertMany([

    // Benutzer angelegt
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'benutzer_erstellt', timestamp: ago(30), details: { beschreibung: 'Benutzer "disponent" angelegt' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'benutzer_erstellt', timestamp: ago(30), details: { beschreibung: 'Benutzer "lagerist" (Depot Bengel) angelegt' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'benutzer_erstellt', timestamp: ago(30), details: { beschreibung: 'Benutzer "lagerist_trier" (Depot Trier) angelegt' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'benutzer_erstellt', timestamp: ago(30), details: { beschreibung: 'Benutzer "viewer" angelegt' } },

    // Erster Import vor 30 Tagen
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'login',              timestamp: ago(30), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_gestartet',   timestamp: ago(30), details: { beschreibung: 'SelectLine Import gestartet' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_abgeschlossen', timestamp: ago(30), details: { beschreibung: '3 Lieferscheine importiert' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'lieferschein_erstellt', lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(30), details: { beschreibung: 'Aus SelectLine importiert' } },

    // LS-0001 Workflow
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'login',           timestamp: ago(29), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'lager_zugewiesen', lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(29), details: { vonLager: null, zuLager: 'trier', beschreibung: 'Lager Trier zugewiesen' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'status_geaendert', lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(29), details: { vonStatus: 'neu', zuStatus: 'zugewiesen' } },
    { benutzer: lagerTrier._id, benutzerName: 'Thomas Langer', aktion: 'login',            timestamp: ago(29), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: lagerTrier._id, benutzerName: 'Thomas Langer', aktion: 'gedruckt',         lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(29), details: { beschreibung: 'Lieferschein gedruckt' } },
    { benutzer: lagerTrier._id, benutzerName: 'Thomas Langer', aktion: 'auslieferung_gestartet', lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(28), details: { beschreibung: 'Fahrer: Thomas Langer · Fahrzeug: TRI-GAS 1' } },
    { benutzer: lagerTrier._id, benutzerName: 'Thomas Langer', aktion: 'auslieferung_abgeschlossen', lieferschein: d[0]._id, lieferscheinNr: 'LS-2025-0001', timestamp: ago(28), details: { vonStatus: 'in_auslieferung', zuStatus: 'abgeschlossen' } },

    // Import vor 25 Tagen
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'import_gestartet',   timestamp: ago(25), details: { beschreibung: 'SelectLine Import gestartet' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'import_abgeschlossen', timestamp: ago(25), details: { beschreibung: '2 Lieferscheine importiert' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'lieferschein_erstellt', lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(25), details: { beschreibung: 'Aus SelectLine importiert' } },

    // LS-0002 Workflow
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'lager_zugewiesen', lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(24), details: { vonLager: null, zuLager: 'bengel', beschreibung: 'Lager Bengel zugewiesen' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'status_geaendert', lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(24), details: { vonStatus: 'neu', zuStatus: 'zugewiesen' } },
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber',  aktion: 'login',            timestamp: ago(23), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber',  aktion: 'gedruckt',         lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(23), details: { beschreibung: 'Lieferschein gedruckt' } },
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber',  aktion: 'auslieferung_gestartet', lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(22), details: { beschreibung: 'Fahrer: Klaus Weber · Fahrzeug: BEN-GAS 1' } },
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber',  aktion: 'auslieferung_abgeschlossen', lieferschein: d[1]._id, lieferscheinNr: 'LS-2025-0002', timestamp: ago(22), details: { vonStatus: 'in_auslieferung', zuStatus: 'abgeschlossen' } },

    // Stornierung vor 5 Tagen
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'lieferschein_erstellt', lieferschein: d[25]._id, lieferscheinNr: 'LS-2025-0026', timestamp: ago(5), details: { beschreibung: 'Aus SelectLine importiert' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'status_geaendert',      lieferschein: d[25]._id, lieferscheinNr: 'LS-2025-0026', timestamp: ago(3), details: { vonStatus: 'neu', zuStatus: 'storniert', beschreibung: 'Kunde hat telefonisch storniert' } },

    // Import vor 3 Tagen
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'login',               timestamp: ago(3), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_gestartet',    timestamp: ago(3), details: { beschreibung: 'Automatischer SelectLine Import' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_abgeschlossen', timestamp: ago(3), details: { beschreibung: '5 Lieferscheine importiert' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'lieferschein_erstellt', lieferschein: d[6]._id, lieferscheinNr: 'LS-2025-0007', timestamp: ago(3), details: { beschreibung: 'Automatisch importiert' } },

    // LS-0007 Workflow (heute in Auslieferung)
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'login',            timestamp: hoursAgo(9), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'lager_zugewiesen', lieferschein: d[6]._id, lieferscheinNr: 'LS-2025-0007', timestamp: hoursAgo(8), details: { vonLager: null, zuLager: 'bengel' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'status_geaendert', lieferschein: d[6]._id, lieferscheinNr: 'LS-2025-0007', timestamp: hoursAgo(8), details: { vonStatus: 'neu', zuStatus: 'zugewiesen' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'lager_zugewiesen', lieferschein: d[13]._id, lieferscheinNr: 'LS-2025-0014', timestamp: hoursAgo(8), details: { vonLager: null, zuLager: 'bengel' } },
    { benutzer: disponent._id, benutzerName: 'Max Mustermann', aktion: 'status_geaendert', lieferschein: d[13]._id, lieferscheinNr: 'LS-2025-0014', timestamp: hoursAgo(8), details: { vonStatus: 'neu', zuStatus: 'zugewiesen' } },

    // Lagerist-Aktivitäten heute
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber',  aktion: 'login',            timestamp: hoursAgo(7), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: lagerTrier._id,  benutzerName: 'Thomas Langer', aktion: 'login',            timestamp: hoursAgo(6), details: { beschreibung: 'Anmeldung erfolgreich' } },
    { benutzer: disponent._id,   benutzerName: 'Max Mustermann', aktion: 'lager_zugewiesen', lieferschein: d[14]._id, lieferscheinNr: 'LS-2025-0015', timestamp: hoursAgo(6), details: { vonLager: null, zuLager: 'bengel' } },
    { benutzer: disponent._id,   benutzerName: 'Max Mustermann', aktion: 'status_geaendert', lieferschein: d[14]._id, lieferscheinNr: 'LS-2025-0015', timestamp: hoursAgo(6), details: { vonStatus: 'neu', zuStatus: 'zugewiesen' } },
    { benutzer: disponent._id,   benutzerName: 'Max Mustermann', aktion: 'kanban_verschoben', lieferschein: d[15]._id, lieferscheinNr: 'LS-2025-0016', timestamp: hoursAgo(5), details: { beschreibung: 'In Spalte "Zugewiesen" verschoben' } },
    { benutzer: disponent._id,   benutzerName: 'Max Mustermann', aktion: 'kanban_verschoben', lieferschein: d[16]._id, lieferscheinNr: 'LS-2025-0017', timestamp: hoursAgo(3), details: { beschreibung: 'In Spalte "Trier" verschoben' } },

    // Drucken
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber', aktion: 'gedruckt', lieferschein: d[9]._id,  lieferscheinNr: 'LS-2025-0010', timestamp: hoursAgo(2), details: { beschreibung: 'Lieferschein gedruckt' } },
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber', aktion: 'gedruckt', lieferschein: d[10]._id, lieferscheinNr: 'LS-2025-0011', timestamp: hoursAgo(1), details: { beschreibung: 'Lieferschein gedruckt' } },
    { benutzer: lagerTrier._id,  benutzerName: 'Thomas Langer', aktion: 'gedruckt', lieferschein: d[11]._id, lieferscheinNr: 'LS-2025-0012', timestamp: hoursAgo(6), details: { beschreibung: 'Lieferschein 2× gedruckt' } },

    // Auslieferung heute
    { benutzer: lagerBengel._id, benutzerName: 'Klaus Weber', aktion: 'auslieferung_gestartet', lieferschein: d[6]._id, lieferscheinNr: 'LS-2025-0007', timestamp: hoursAgo(2), details: { beschreibung: 'Fahrer: Klaus Weber · Fahrzeug: BEN-GAS 1' } },
    { benutzer: lagerTrier._id,  benutzerName: 'Thomas Langer', aktion: 'auslieferung_gestartet', lieferschein: d[7]._id, lieferscheinNr: 'LS-2025-0008', timestamp: hoursAgo(1), details: { beschreibung: 'Fahrer: Thomas Langer · Fahrzeug: TRI-GAS 1' } },

    // Neuester Import (vor 1 Stunde)
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_gestartet',    timestamp: hoursAgo(1), details: { beschreibung: 'Automatischer SelectLine Import' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'import_abgeschlossen', timestamp: hoursAgo(1), details: { beschreibung: '4 neue Lieferscheine importiert' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'lieferschein_erstellt', lieferschein: d[21]._id, lieferscheinNr: 'LS-2025-0022', timestamp: hoursAgo(1), details: { beschreibung: 'Automatisch importiert' } },
    { benutzer: admin._id, benutzerName: 'Administrator', aktion: 'lieferschein_erstellt', lieferschein: d[22]._id, lieferscheinNr: 'LS-2025-0023', timestamp: hoursAgo(1), details: { beschreibung: 'Automatisch importiert' } },
  ]);

  console.log('✅ Seed erfolgreich!');
  console.log(`   ${deliveries.length} Lieferscheine`);
  console.log('');
  console.log('Zugangsdaten:');
  console.log('  admin          / PIN: 1234  (Administrator)');
  console.log('  disponent      / PIN: 2345  (Disponent)');
  console.log('  lagerist       / PIN: 3456  (Lagerist · Depot Bengel)');
  console.log('  lagerist_trier / PIN: 4567  (Lagerist · Depot Trier)');
  console.log('  viewer         / PIN: 5678  (Nur-Lesen)');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
