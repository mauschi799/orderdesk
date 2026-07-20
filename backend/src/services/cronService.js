const cron = require('node-cron');
const Delivery = require('../models/Delivery');
const ImportSchedule = require('../models/ImportSchedule');
const { notifyImportDone } = require('./pushService');
const { queueForGeocoding } = require('./geocodeService');
const { createAuditLog } = require('./auditService');
const sl = require('./selectlineService');

let activeJob = null;

// Returns { outcome, id }
const upsertDelivery = async (mapped) => {
  const existing = await Delivery.findOne({
    $or: [{ lieferscheinNr: mapped.lieferscheinNr }, { selectlineId: mapped.selectlineId }],
  });
  if (existing) {
    const addr = mapped.kunde?.adresse || {};
    const update = {
      // Update address sub-fields individually to preserve existing lat/lng coords
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
    };
    // Mark as abgeschlossen if SelectLine says it's transferred
    if (mapped.status === 'abgeschlossen' && existing.status !== 'abgeschlossen') {
      update.status = 'abgeschlossen';
      update.kanbanSpalte = 'abgeschlossen';
    }
    await Delivery.findByIdAndUpdate(existing._id, update);
    return { outcome: 'updated', id: existing._id };
  }
  const doc = await Delivery.create(mapped);
  return { outcome: 'imported', id: doc._id };
};

const runImport = async (schedule) => {
  const tage = schedule?.tageRueckblick || 7;
  const dateFrom = new Date(Date.now() - tage * 86400000).toISOString().split('T')[0];
  const results = { imported: 0, updated: 0, skipped: 0, errors: [], dauer: 0 };
  const importedIds = [];
  const started = Date.now();

  try {
    const documents = await sl.getDeliveryNotes({ dateFrom });
    if (documents.length > 0) {
      documents.forEach(d => {
        const bp  = d.BusinessPartner || {};
        const da  = d.DeliveryAddress;
        const daInfo = da === null ? 'null'
          : da === '' ? 'leer'
          : typeof da === 'object' ? JSON.stringify(da)
          : String(da);
        console.log(
          `[Import] ${d.Number}: addr.City=${bp.Address?.City||'?'}` +
          ` | DeliveryAddress=${daInfo}` +
          ` | BillingAddress=${JSON.stringify(d.BillingAddress)}`
        );
      });
    }
    for (const doc of documents) {
      const key = doc.Number || doc.DocumentKey || doc.DeliveryDocumentNumber || doc.Id || doc.id;
      if (!key) {
        results.errors.push(`Kein DocumentKey gefunden. Verfügbare Felder: ${Object.keys(doc).join(', ')}`);
        continue;
      }
      try {
        // List response already contains all header fields – skip separate detail fetch
        const mapped = await sl.mapDocument(doc);

        // Mark as abgeschlossen if already transferred/invoiced in SelectLine
        if (sl.isTransferred(doc)) {
          mapped.status = 'abgeschlossen';
          mapped.kanbanSpalte = 'abgeschlossen';
        }
        const rawPositions = await sl.getDeliveryPositions(key);
        mapped.positionen = await Promise.all(rawPositions.map(async (pos) => {
          const artNr = pos.ArticleNumber || pos.Code;
          const article = artNr ? await sl.getArticle(artNr).catch(() => null) : null;
          const gruppeNr = article?.ArticleGroupNumber ? String(article.ArticleGroupNumber) : null;
          return sl.mapPosition(pos, gruppeNr);
        }));
        mapped.importiert = true;
        mapped.importiertAm = new Date();
        mapped.importQuelle = 'selectline';
        const { outcome, id } = await upsertDelivery(mapped);
        results[outcome]++;
        importedIds.push(id);
      } catch (itemErr) {
        const status = itemErr.response?.status;
        const body = itemErr.response?.data?.Message || itemErr.response?.data?.message || '';
        const detail = status ? `HTTP ${status}${body ? ' – ' + body : ''}` : itemErr.message;
        results.errors.push(`${key}: ${detail}`);
        console.error(`[Import] ${key}: ${detail}`);
      }
    }
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data?.Message || err.response?.data?.message || '';
    const detail = status ? `HTTP ${status}${body ? ' – ' + body : ''}` : err.message;
    results.errors.push(`API: ${detail}`);
    console.error(`[Import] API-Fehler: ${detail}`);
  }

  results.dauer = Date.now() - started;
  if (importedIds.length > 0) queueForGeocoding(importedIds);
  return results;
};

const startCronJob = (cronExpression, schedule) => {
  if (activeJob) { activeJob.stop(); activeJob = null; }
  if (!cronExpression) return false;
  if (!cron.validate(cronExpression)) { console.error('Ungültiger Cron-Ausdruck:', cronExpression); return false; }

  activeJob = cron.schedule(cronExpression, async () => {
    console.log(`[Cron] Auto-Import: ${new Date().toISOString()}`);
    const result = await runImport(schedule);
    const historyEntry = { zeitpunkt: new Date(), ergebnis: result };
    await ImportSchedule.findOneAndUpdate({},
      { $set: { letzterLauf: new Date(), letzterLaufErgebnis: result },
        $push: { historie: { $each: [historyEntry], $slice: -20 } } },
      { upsert: true }
    );
    console.log(`[Cron] ${result.imported} neu, ${result.updated} upd, ${result.skipped} skip, ${result.errors.length} err`);
    await createAuditLog({
      benutzerName: 'System (Auto-Import)',
      aktion: 'import_auto',
      details: {
        beschreibung: `Auto-Sync: ${result.imported} neu, ${result.updated} aktualisiert, ${result.skipped} übersprungen`
      }
    }).catch(() => {});
    if (result.imported + result.updated > 0) await notifyImportDone(result).catch(() => {});
  }, { timezone: 'Europe/Berlin' });

  console.log(`✅ Cron: ${cronExpression}`);
  return true;
};

const initCronFromDB = async () => {
  try {
    const schedule = await ImportSchedule.findOne();
    if (schedule?.aktiv && schedule?.cronExpression) startCronJob(schedule.cronExpression, schedule);
  } catch (err) { console.error('Cron-Init:', err.message); }
};

module.exports = { runImport, startCronJob, initCronFromDB, getActiveJob: () => activeJob };
