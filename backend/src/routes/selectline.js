/**
 * /api/selectline  –  SelectLine import & sync routes
 * Data flows ONE-WAY: SelectLine → MongoDB. Nothing written back.
 */
const express = require('express');
const Delivery = require('../models/Delivery');
const { auth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');
const { notifyImportDone } = require('../services/pushService');
const { queueForGeocoding } = require('../services/geocodeService');
const sl = require('../services/selectlineService');

const router = express.Router();

// Upsert helper – returns { outcome, id }
const upsertDelivery = async (mapped, userId = null) => {
  const existing = await Delivery.findOne({
    $or: [{ lieferscheinNr: mapped.lieferscheinNr }, { selectlineId: mapped.selectlineId }],
  });
  if (existing) {
    // Always refresh address, positions, dates, and notiz from SelectLine.
    // Preserve workflow fields (status, kanbanSpalte, lager) set by dispatchers.
    // Update address sub-fields individually to preserve existing lat/lng coords.
    const addr = mapped.kunde?.adresse || {};
    await Delivery.findByIdAndUpdate(existing._id, {
      'kunde.adresse.strasse': addr.strasse,
      'kunde.adresse.plz':     addr.plz,
      'kunde.adresse.ort':     addr.ort,
      'kunde.adresse.land':    addr.land,
      'kunde.name':            mapped.kunde?.name,
      'kunde.name2':           mapped.kunde?.name2,
      positionen:              mapped.positionen,
      lieferdatum:             mapped.lieferdatum,
      erstelltAm:              mapped.erstelltAm,
      notiz:                   mapped.notiz,
      auftragNr:               mapped.auftragNr,
    });
    return { outcome: 'updated', id: existing._id };
  }
  const doc = await Delivery.create({ ...mapped, ...(userId && { erstelltVon: userId }) });
  return { outcome: 'imported', id: doc._id };
};

// Full pipeline for one document – returns { outcome, id }
const importSingleDocument = async (documentKey, userId) => {
  // Fetch detail; fall back gracefully if endpoint not supported
  let docDetail = null;
  try { docDetail = await sl.getDeliveryNote(documentKey); } catch { /* detail not available */ }

  const rawPositions = await sl.getDeliveryPositions(documentKey);
  const mapped = await sl.mapDocument(docDetail || { Number: documentKey });
  mapped.positionen = await Promise.all(rawPositions.map(async (pos) => {
    const artNr = pos.ArticleNumber || pos.Code;
    const article = artNr ? await sl.getArticle(artNr).catch(() => null) : null;
    const gruppeNr = article?.ArticleGroupNumber ? String(article.ArticleGroupNumber) : null;
    return sl.mapPosition(pos, gruppeNr);
  }));
  return upsertDelivery(mapped, userId);
};

// GET /api/selectline/test
router.get('/test', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const result = await sl.testConnection();
    res.json({ connected: true, ...result });
  } catch (err) {
    res.json({ connected: false, message: err.message });
  }
});

// GET /api/selectline/diagnose  –  probe which paths the API actually answers on
router.get('/diagnose', auth, requireRole('administrator'), async (req, res) => {
  const axios = require('axios');
  const https = require('https');
  const httpsAgent = process.env.SELECTLINE_IGNORE_SSL === 'true'
    ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  let token, tokenType, baseUrl;
  try {
    ({ token, tokenType, baseUrl } = await sl.ensureToken());
  } catch (err) {
    return res.json({ error: `Login fehlgeschlagen: ${err.message}` });
  }

  const probe = async (path, params = {}) => {
    try {
      const r = await axios.get(`${baseUrl}${path}`, {
        headers: { Authorization: `${tokenType} ${token}`, Accept: 'application/json' },
        params,
        httpsAgent,
        timeout: 8000,
      });
      const data = r.data;
      const count = Array.isArray(data) ? data.length
        : (data?.value?.length ?? data?.Data?.length ?? data?.Items?.length ?? '?');
      return { status: r.status, count, sample: Array.isArray(data) ? data[0] : (data?.value?.[0] ?? data?.Data?.[0]) };
    } catch (e) {
      return { status: e.response?.status || 'ERR', error: e.response?.data?.Message || e.message };
    }
  };

  const paths = [
    '/Documents', '/DocumentPositions',
    '/Articles', '/ArticleAccessories', '/ArticleComponents', '/ArticleZubehoer',
    '/Accessories', '/ArticleRelations',
  ];

  const results = {};
  for (const p of paths) {
    results[p] = await probe(p, { take: 2 });
  }

  // Probe article accessories for a known article
  const testArticle = '00033';
  const accPaths = [
    `/ArticleAccessories?filter=ArticleNumber EQ '${testArticle}'`,
    `/ArticleAccessories?filter=Number EQ '${testArticle}'`,
    `/ArticleComponents?filter=ArticleNumber EQ '${testArticle}'`,
    `/ArticleRelations?filter=ArticleNumber EQ '${testArticle}'`,
  ];
  const accResults = {};
  for (const p of accPaths) {
    const [endpoint, qs] = p.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs));
    accResults[p] = await probe(endpoint, params);
  }

  res.json({ baseUrl, tokenType, endpoints: results, accessories: accResults });
});

// POST /api/selectline/import
router.post('/import', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  const { dateFrom, dateTo } = req.body;
  const started = Date.now();
  await createAuditLog({ benutzer: req.user._id, benutzerName: req.user.name, aktion: 'import_gestartet',
    details: { beschreibung: `SelectLine Import ${dateFrom||''}–${dateTo||''}` }, req });

  const results = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const importedIds = [];
  try {
    const documents = await sl.getDeliveryNotes({ dateFrom, dateTo });
    for (const doc of documents) {
      const key = doc.Number || doc.DocumentKey || doc.DeliveryDocumentNumber || doc.Id;
      try {
        const { outcome, id } = await importSingleDocument(key, req.user._id);
        results[outcome]++;
        importedIds.push(id);
      } catch (itemErr) {
        results.errors.push({ key, error: itemErr.message });
      }
    }
    results.dauer = Date.now() - started;
    await createAuditLog({ benutzer: req.user._id, benutzerName: req.user.name, aktion: 'import_manuell',
      details: { beschreibung: `Manueller Sync: ${results.imported} neu, ${results.updated} aktualisiert, ${results.skipped} übersprungen` }, req });
    if (importedIds.length > 0) queueForGeocoding(importedIds);
    if (results.imported + results.updated > 0) notifyImportDone(results).catch(() => {});
    res.json({ message: 'Import abgeschlossen', ...results });
  } catch (err) {
    res.status(502).json({ message: `SelectLine Fehler: ${err.response?.data?.Message || err.message}` });
  }
});

// POST /api/selectline/import-single
router.post('/import-single', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  const { documentKey } = req.body;
  if (!documentKey) return res.status(400).json({ message: 'documentKey fehlt' });
  try {
    const { outcome, id } = await importSingleDocument(documentKey, req.user._id);
    queueForGeocoding([id]);
    res.json({ message: 'Fertig', outcome, documentKey });
  } catch (err) {
    res.status(502).json({ message: err.response?.data?.Message || err.message });
  }
});

// POST /api/selectline/import-manual
router.post('/import-manual', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  try {
    const items = Array.isArray(req.body.data) ? req.body.data : [req.body.data];
    const results = { imported: 0, updated: 0, skipped: 0, errors: [] };
    const ids = [];
    for (const item of items) {
      try {
        const mapped = await sl.mapDocument(item);
        mapped.positionen = (item.Positions || item.Positionen || item.Artikel || []).map(p => sl.mapPosition(p));
        const { outcome, id } = await upsertDelivery(mapped, req.user._id);
        results[outcome]++;
        ids.push(id);
      } catch (e) { results.errors.push({ error: e.message }); }
    }
    if (ids.length > 0) queueForGeocoding(ids);
    res.json({ message: 'Manueller Import abgeschlossen', ...results });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/selectline/diagnose-address/:key
// Vollständige Diagnose: rohes Dokument-JSON + expand-Versuche + Kunden-Lookup
router.get('/diagnose-address/:key', auth, requireRole('administrator'), async (req, res) => {
  const { key } = req.params;
  const axios = require('axios');
  const https = require('https');
  const httpsAgent = process.env.SELECTLINE_IGNORE_SSL === 'true'
    ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  let token, tokenType, baseUrl;
  try {
    ({ token, tokenType, baseUrl } = await sl.ensureToken());
  } catch (err) {
    return res.status(502).json({ message: `Login fehlgeschlagen: ${err.message}` });
  }

  const rawGet = async (path, params = {}) => {
    try {
      const r = await axios.get(`${baseUrl}${path}`, {
        headers: { Authorization: `${tokenType} ${token}`, Accept: 'application/json' },
        params,
        httpsAgent,
        timeout: 10_000,
      });
      return { ok: true, status: r.status, data: r.data };
    } catch (e) {
      return { ok: false, status: e.response?.status, error: e.response?.data?.Message || e.message };
    }
  };

  // 1) Standard-Fetch
  const standard = await rawGet('/Documents', { filter: `Number EQ '${key}'`, take: 1 });
  const doc = standard.ok
    ? (Array.isArray(standard.data) ? standard.data[0] : (standard.data?.value?.[0] ?? standard.data?.Data?.[0]))
    : null;

  // 2) Mit OData expand=DeliveryAddress
  const withExpand   = await rawGet('/Documents', { filter: `Number EQ '${key}'`, take: 1, expand: 'DeliveryAddress' });
  // 3) Mit $expand ($ prefix)
  const withDollar   = await rawGet('/Documents', { filter: `Number EQ '${key}'`, take: 1, '$expand': 'DeliveryAddress' });
  // 4) Pfad-basiert (falls unterstützt)
  const pathBased    = await rawGet(`/Documents/${encodeURIComponent(key)}`);
  // 5) Separate Adress-Endpunkte für dieses Dokument
  const addrByDoc    = await rawGet('/Addresses', { filter: `DocumentNumber EQ '${key}'`, take: 5 });
  const addrByDocAlt = await rawGet('/DocumentAddresses', { filter: `DocumentNumber EQ '${key}'`, take: 5 });
  const addrByDocDe  = await rawGet('/BelegAdressen', { filter: `BelegNr EQ '${key}'`, take: 5 });

  const bp = doc?.BusinessPartner || {};

  res.json({
    documentKey: key,
    // Vollständiges rohes Dokument
    rawDoc: doc,
    // Nur Adress-relevante Felder des Dokuments
    docAddressFields: doc ? Object.fromEntries(
      Object.entries(doc).filter(([k]) => /delivery|liefер|ship|addr|billing/i.test(k))
    ) : null,
    // BusinessPartner-Felder
    bp: {
      allFields: Object.keys(bp),
      Number: bp.Number,
      CustomerNumber: bp.CustomerNumber,
      ReferenceAddressNumber: bp.ReferenceAddressNumber,
      Address: bp.Address,
      DeliveryAddress: bp.DeliveryAddress,
    },
    // Ergebnisse der expand-Versuche
    expandTests: {
      'expand=DeliveryAddress':  withExpand.ok  ? { DeliveryAddress: (Array.isArray(withExpand.data) ? withExpand.data[0] : withExpand.data?.value?.[0])?.DeliveryAddress } : withExpand,
      '$expand=DeliveryAddress': withDollar.ok  ? { DeliveryAddress: (Array.isArray(withDollar.data) ? withDollar.data[0] : withDollar.data?.value?.[0])?.DeliveryAddress } : withDollar,
      'Pfad /Documents/key':     pathBased.ok   ? { DeliveryAddress: pathBased.data?.DeliveryAddress, status: pathBased.status } : pathBased,
    },
    // Alternative Adress-Endpunkte
    addressEndpoints: {
      '/Addresses?DocumentNumber':      addrByDoc,
      '/DocumentAddresses?DocumentNumber': addrByDocAlt,
      '/BelegAdressen?BelegNr':         addrByDocDe,
    },
  });
});

// GET /api/selectline/documents  (raw proxy, admin only)
router.get('/documents', auth, requireRole('administrator'), async (req, res) => {
  try {
    const docs = await sl.getDeliveryNotes(req.query);
    res.json({ count: docs.length, documents: docs });
  } catch (err) { res.status(502).json({ message: err.response?.data?.Message || err.message }); }
});

// GET /api/selectline/documents/:key
router.get('/documents/:key', auth, requireRole('administrator'), async (req, res) => {
  try { res.json(await sl.getDeliveryNote(req.params.key)); }
  catch (err) { res.status(err.response?.status||502).json({ message: err.response?.data?.Message||err.message }); }
});

// GET /api/selectline/documents/:key/positions
router.get('/documents/:key/positions', auth, requireRole('administrator'), async (req, res) => {
  try {
    const positions = await sl.getDeliveryPositions(req.params.key);
    res.json({ count: positions.length, positions });
  } catch (err) { res.status(502).json({ message: err.message }); }
});

// GET /api/selectline/articles/:articleNumber
router.get('/articles/:articleNumber', auth, requireRole('administrator'), async (req, res) => {
  try {
    const article = await sl.getArticle(req.params.articleNumber);
    if (!article) return res.status(404).json({ message: 'Artikel nicht gefunden' });
    res.json(article);
  } catch (err) { res.status(502).json({ message: err.message }); }
});

// GET /api/selectline/articles/:articleNumber/stocks
router.get('/articles/:articleNumber/stocks', auth, requireRole('administrator'), async (req, res) => {
  try { res.json({ stocks: await sl.getArticleStocks(req.params.articleNumber) }); }
  catch (err) { res.status(502).json({ message: err.message }); }
});

// Je Depot verwendet SelectLine eine eigene Druckvorlage (unterschiedlicher
// Ausgabedrucker, gleicher Beleginhalt). "frei" hat kein eigenes Depot-Formular
// und nutzt daher dieselbe Vorlage wie Bengel — ebenso der Fallback, falls dem
// Lieferschein noch gar kein Lager zugewiesen ist.
const LAGER_MASTER_NAMES = {
  trier:  'MG_LIEF_GG_1011121',
  bengel: 'MG_LIEF_BG_20250427',
  frei:   'MG_LIEF_BG_20250427',
};
const DEFAULT_MASTER_NAME = LAGER_MASTER_NAMES.bengel;

// POST /api/selectline/documents/:key/print-pdf
router.post('/documents/:key/print-pdf', auth, requireRole('administrator', 'disponent', 'lagerist'), async (req, res) => {
  const { key } = req.params;
  try {
    // Lieferschein zuerst laden, um die passende Depot-Druckvorlage zu bestimmen
    const delivery = await Delivery.findOne({ $or: [{ lieferscheinNr: key }, { selectlineId: key }] });
    const masterName = req.body.masterName
      || (delivery?.lager && LAGER_MASTER_NAMES[delivery.lager])
      || DEFAULT_MASTER_NAME;

    const { buffer, contentType } = await sl.printPdf(key, masterName);

    // Mark delivery printed
    if (delivery) {
      delivery.druckStatus = { gedruckt: true, gedrucktAm: new Date(), gedrucktVon: req.user._id,
        druckAnzahl: (delivery.druckStatus?.druckAnzahl || 0) + 1 };
      if (delivery.status === 'zugewiesen') { delivery.status = 'gedruckt'; delivery.kanbanSpalte = 'gedruckt'; }
      await delivery.save();
      await createAuditLog({ benutzer: req.user._id, benutzerName: req.user.name, aktion: 'gedruckt',
        lieferschein: delivery._id, lieferscheinNr: delivery.lieferscheinNr,
        details: { beschreibung: `PDF via SelectLine (${masterName})` }, req });
    }

    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="Lieferschein_${key}.pdf"`);
    res.send(buffer);
  } catch (err) {
    // Try to decode arraybuffer error
    if (err.response?.data && typeof err.response.data !== 'string') {
      try {
        const t = Buffer.from(err.response.data).toString('utf8');
        return res.status(err.response.status||502).json({ message: JSON.parse(t).Message || t });
      } catch {}
    }
    res.status(err.response?.status||502).json({ message: err.response?.data?.Message || err.message });
  }
});

module.exports = router;
