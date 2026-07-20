/**
 * SelectLine REST API Client
 *
 * Auth flow:   POST /Login  →  AccessToken  →  Bearer header on all requests
 * Read-only:   The app NEVER writes back to SelectLine.
 *
 * Endpoints used:
 *   POST   /Login
 *   GET    /Documents?filter=KindFlag EQ 'L'
 *   GET    /Documents/{documentKey}
 *   GET    /Documents/{documentKey}/Positions
 *   GET    /Articles/{articleNumber}
 *   GET    /Articles/{articleNumber}/Stocks
 *   POST   /Documents/{documentKey}/PrintPdf
 */

const axios = require('axios');
const https = require('https');
const BrandSettings = require('../models/BrandSettings'); // for dynamic URL fallback

// ── HTTPS agent (self-signed cert on local servers) ───────────────────────────
const _httpsAgent = new https.Agent({ rejectUnauthorized: false });
const _getHttpsAgent = () =>
  process.env.SELECTLINE_IGNORE_SSL === 'true' ? _httpsAgent : undefined;

// ── Token cache ────────────────────────────────────────────────────────────────
let _tokenCache = {
  token: null,
  tokenType: 'LoginId', // SelectLine Mobile API returns TokenType: "LoginId"
  expiresAt: null,
  baseUrl: null,
};

const TOKEN_MARGIN_MS = 60_000; // renew 60s before expiry

/**
 * Returns base URL from env or DB settings
 */
const getBaseUrl = async () => {
  if (process.env.SELECTLINE_API_URL) return process.env.SELECTLINE_API_URL.replace(/\/$/, '');
  // Could also read from BrandSettings/DB config – extend here if needed
  return null;
};

/**
 * Authenticates against POST /Login and caches the token.
 * Automatically called before every API request.
 */
const ensureToken = async () => {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) throw new Error('SELECTLINE_API_URL nicht konfiguriert');

  // Validate cached token
  if (
    _tokenCache.token &&
    _tokenCache.baseUrl === baseUrl &&
    _tokenCache.expiresAt &&
    Date.now() < _tokenCache.expiresAt - TOKEN_MARGIN_MS
  ) {
    return { token: _tokenCache.token, tokenType: _tokenCache.tokenType, baseUrl };
  }

  // Credentials from env
  const username = process.env.SELECTLINE_USERNAME;
  const password = process.env.SELECTLINE_PASSWORD;
  const appKey   = process.env.SELECTLINE_APP_KEY || '';
  const mandant  = process.env.SELECTLINE_MANDANT || '';

  if (!username || !password) {
    throw new Error('SELECTLINE_USERNAME / SELECTLINE_PASSWORD nicht konfiguriert');
  }

  // SelectLine Mobile API: lowercase field names + AppKey required
  const res = await axios.post(`${baseUrl}/login`, {
    username,
    password,
    ...(appKey   && { AppKey: appKey }),
    ...(mandant  && { mandant }),
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    httpsAgent: _getHttpsAgent(),
    timeout: 15_000,
  });

  const data = res.data;
  const token     = data.AccessToken || data.access_token || data.Token;
  const tokenType = data.TokenType   || data.token_type   || 'LoginId';
  if (!token) throw new Error('SelectLine Login: kein AccessToken in der Antwort');

  const expiresIn = data.ExpiresIn || data.expires_in || 3600; // default 1h
  _tokenCache = { token, tokenType, baseUrl, expiresAt: Date.now() + expiresIn * 1000 };

  return { token, tokenType, baseUrl };
};

/**
 * Invalidate token (on 401)
 */
const invalidateToken = () => { _tokenCache.token = null; _tokenCache.tokenType = 'LoginId'; _tokenCache.expiresAt = null; };

/**
 * Authenticated GET helper with auto-retry on 401
 */
const slGet = async (path, params = {}, attempt = 1) => {
  const { token, tokenType, baseUrl } = await ensureToken();
  try {
    const res = await axios.get(`${baseUrl}${path}`, {
      headers: { Authorization: `${tokenType} ${token}`, Accept: 'application/json' },
      params,
      httpsAgent: _getHttpsAgent(),
      timeout: 30_000,
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 401 && attempt === 1) {
      invalidateToken();
      return slGet(path, params, 2);
    }
    // Enrich error with status + response body for easier debugging
    if (err.response) {
      const msg = err.response.data?.Message || err.response.data?.message || JSON.stringify(err.response.data);
      throw new Error(`HTTP ${err.response.status} ${path}: ${msg}`);
    }
    throw err;
  }
};

/**
 * Authenticated POST helper (used for PrintPdf)
 */
const slPost = async (path, body = {}, attempt = 1) => {
  const { token, tokenType, baseUrl } = await ensureToken();
  try {
    const res = await axios.post(`${baseUrl}${path}`, body, {
      headers: {
        Authorization: `${tokenType} ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/pdf, application/json',
      },
      httpsAgent: _getHttpsAgent(),
      responseType: 'arraybuffer',
      timeout: 30_000,
    });
    return res;
  } catch (err) {
    if (err.response?.status === 401 && attempt === 1) {
      invalidateToken();
      return slPost(path, body, 2);
    }
    throw err;
  }
};

// ── API methods ────────────────────────────────────────────────────────────────

/**
 * Test connection: login + lightweight request
 */
const testConnection = async () => {
  const { token, tokenType, baseUrl } = await ensureToken();
  return { connected: true, baseUrl, tokenType, tokenOk: !!token };
};

/**
 * GET /Documents?filter=KindFlag EQ 'L'
 * Optional extra filters: DateFrom, DateTo, Skip, Take
 */
// SelectLine expects German date format DD.MM.YYYY
const toSlDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };

// SelectLine Mobile API caps results at ~10 per request and ignores the skip parameter.
// Workaround: query day by day using Date GE/LE filters so we get up to 10 docs per day
// across the entire lookback window instead of only the 10 most recent overall.
const getDeliveryNotes = async ({ dateFrom, dateTo } = {}) => {
  const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 14 * 86400000);
  const to   = dateTo   ? new Date(dateTo)   : new Date();

  const all = [];
  const seenIds = new Set();

  // Iterate day by day from oldest to newest
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (day <= end) {
    const slDay = toSlDate(day.toISOString().split('T')[0]);
    const filter = `KindFlag EQ 'L' AND Date GE '${slDay}' AND Date LE '${slDay}'`;

    try {
      const data = await slGet('/Documents', { filter, take: 50 });
      const page = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);

      let added = 0;
      for (const doc of page) {
        const id = String(doc.Number || doc.Id || doc.DocumentKey || '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        all.push(doc);
        added++;
      }
      if (added > 0) console.log(`[SL] ${slDay}: ${added} Dok (gesamt: ${all.length})`);
    } catch (err) {
      console.warn(`[SL] ${slDay}: ${err.message}`);
    }

    day.setDate(day.getDate() + 1);
  }

  console.log(`[SL] Dokumente gesamt: ${all.length}`);
  return all;
};

/**
 * GET single document via filter (path params not supported by SelectLine Mobile API)
 */
const getDeliveryNote = async (documentKey) => {
  const filters = [
    `Number EQ '${documentKey}'`,
    `DocumentNumber EQ '${documentKey}'`,
    `BelegNr EQ '${documentKey}'`,
  ];
  for (const filter of filters) {
    try {
      const data = await slGet('/Documents', { filter, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) return arr[0];
    } catch { /* try next */ }
  }
  return null;
};

/**
 * GET positions for a document.
 * Confirmed working: /DocumentPositions?filter=DocumentNumber EQ '{key}'
 */
const getDeliveryPositions = async (documentKey) => {
  try {
    const data = await slGet('/DocumentPositions', {
      filter: `DocumentNumber EQ '${documentKey}'`,
      take: 500,
    });
    return Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
  } catch (err) {
    console.warn(`[SL] Positionen für ${documentKey}: ${err.message}`);
    return [];
  }
};

/**
 * GET a specific address by its Number from SelectLine.
 */
const _addressCache = new Map();
let _addressEndpoint = null; // cached working endpoint
const getAddress = async (addressNumber) => {
  if (!addressNumber) return null;
  const key = String(addressNumber);
  if (_addressCache.has(key)) return _addressCache.get(key);

  const endpoints = [
    { ep: '/Addresses',              filter: `Number EQ '${key}'` },
    { ep: '/BusinessPartnerAddresses', filter: `Number EQ '${key}'` },
    { ep: '/CustomerAddresses',      filter: `Number EQ '${key}'` },
    { ep: '/Adressen',               filter: `Number EQ '${key}'` },
  ];

  // If we already know which endpoint works, use it directly
  if (_addressEndpoint) {
    try {
      const data = await slGet(_addressEndpoint, { filter: `Number EQ '${key}'`, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) { _addressCache.set(key, arr[0]); return arr[0]; }
    } catch { /* fall through to probe */ }
  }

  for (const { ep, filter } of endpoints) {
    try {
      const data = await slGet(ep, { filter, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) {
        console.log(`[SL] ✓ Adress-Endpoint: ${ep}`);
        _addressEndpoint = ep;
        _addressCache.set(key, arr[0]);
        return arr[0];
      }
    } catch (err) {
      if (err.message?.includes('HTTP 404') || err.message?.includes('HTTP 400')) continue;
      break; // other errors: stop probing
    }
  }
  _addressCache.set(key, null);
  return null;
};

/**
 * GET a customer / business-partner record by their number.
 * Used to find the customer's StandardLieferadresse when the document itself
 * doesn't carry an explicit delivery address (doc.DeliveryAddress is always null
 * in the SelectLine Mobile API).
 * Results are cached per customer number.
 */
const _bpCache = new Map();
let _bpConfig = null; // { ep, filterField } — cached after first success

const getBusinessPartner = async (number) => {
  if (!number) return null;
  const key = String(number);
  if (_bpCache.has(key)) return _bpCache.get(key);

  const candidates = [
    { ep: '/Customers',        filterField: 'Number' },
    { ep: '/BusinessPartners', filterField: 'Number' },
    { ep: '/Customers',        filterField: 'AddressNumber' },
    { ep: '/BusinessPartners', filterField: 'AddressNumber' },
    { ep: '/Kunden',           filterField: 'Number' },
  ];

  if (_bpConfig) {
    try {
      const { ep, filterField } = _bpConfig;
      const data = await slGet(ep, { filter: `${filterField} EQ '${key}'`, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) { _bpCache.set(key, arr[0]); return arr[0]; }
    } catch { /* fall through to probe */ }
  }

  for (const { ep, filterField } of candidates) {
    try {
      const data = await slGet(ep, { filter: `${filterField} EQ '${key}'`, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) {
        console.log(`[SL] ✓ Kunde ${key} via ${ep}(${filterField}), Felder:`, Object.keys(arr[0]).join(', '));
        _bpConfig = { ep, filterField };
        _bpCache.set(key, arr[0]);
        return arr[0];
      }
    } catch (err) {
      if (err.message?.includes('HTTP 404') || err.message?.includes('HTTP 400')) continue;
      break; // non-404 error: stop probing
    }
  }
  console.log(`[SL] Kein Kunden-Endpoint für Nr ${key} gefunden`);
  _bpCache.set(key, null);
  return null;
};

/**
 * GET article via filter (path params not supported by SelectLine Mobile API).
 * On first successful call, logs the available fields for weight mapping.
 */
const _articleCache = new Map();
let _articleFieldsLogged = false;
const getArticle = async (articleNumber) => {
  if (_articleCache.has(articleNumber)) return _articleCache.get(articleNumber);

  const filterCandidates = [
    { endpoint: '/Articles', filter: `Number EQ '${articleNumber}'` },
    { endpoint: '/Articles', filter: `ArticleNumber EQ '${articleNumber}'` },
    { endpoint: '/Articles', filter: `Code EQ '${articleNumber}'` },
    { endpoint: '/Artikel',  filter: `Number EQ '${articleNumber}'` },
  ];

  for (const { endpoint, filter } of filterCandidates) {
    try {
      const data = await slGet(endpoint, { filter, take: 1 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      if (arr.length > 0) {
        if (!_articleFieldsLogged) {
          console.log('[SL] ✓ Artikel gefunden via', endpoint);
          console.log('[SL] Artikelfelder:', Object.keys(arr[0]));
          _articleFieldsLogged = true;
        }
        _articleCache.set(articleNumber, arr[0]);
        return arr[0];
      }
    } catch (err) {
      if (err.message?.includes('HTTP 404') || err.message?.includes('HTTP 400')) continue;
      throw err;
    }
  }
  _articleCache.set(articleNumber, null);
  return null;
};

/**
 * Fetch the Zubehör (accessory) articles for a given article number.
 * SelectLine links Füllung → Pfandflasche via the Zubehör relationship.
 */
let _accessoryConfig = null; // { endpoint, filterField } — cached after first success
let _accessoryFieldsLogged = false;
const getArticleAccessories = async (articleNumber) => {
  // If we already know the working endpoint + filter field, use them directly
  if (_accessoryConfig) {
    try {
      const { endpoint, filterField } = _accessoryConfig;
      const data = await slGet(endpoint, { filter: `${filterField} EQ '${articleNumber}'`, take: 10 });
      return Array.isArray(data) ? data : (data?.value || data?.Data || []);
    } catch { return []; }
  }

  const candidates = [
    { endpoint: '/ArticleAccessories', filterField: 'ArticleNumber' },
    { endpoint: '/ArticleAccessories', filterField: 'Number' },
    { endpoint: '/Accessories',        filterField: 'ArticleNumber' },
    { endpoint: '/ArticleZubehoer',    filterField: 'ArticleNumber' },
    { endpoint: '/ArticleComponents',  filterField: 'ArticleNumber' },
    { endpoint: '/ArticleRelations',   filterField: 'ArticleNumber' },
  ];

  for (const { endpoint, filterField } of candidates) {
    try {
      const data = await slGet(endpoint, { filter: `${filterField} EQ '${articleNumber}'`, take: 10 });
      const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
      _accessoryConfig = { endpoint, filterField };
      if (!_accessoryFieldsLogged) {
        console.log(`[SL] ✓ Zubehör-Endpoint: ${endpoint} (filter: ${filterField})`);
        if (arr.length > 0) console.log('[SL] Zubehörfelder:', Object.keys(arr[0]));
        _accessoryFieldsLogged = true;
      }
      return arr;
    } catch (err) {
      if (err.message?.includes('HTTP 404') || err.message?.includes('HTTP 400')) continue;
      throw err;
    }
  }
  console.warn('[SL] Kein Zubehör-Endpoint gefunden für', articleNumber);
  return [];
};


/**
 * GET article stocks via filter.
 */
const getArticleStocks = async (articleNumber) => {
  try {
    const data = await slGet('/ArticleStocks', { filter: `Number EQ '${articleNumber}'` });
    return Array.isArray(data) ? data : (data?.value || data?.Data || []);
  } catch {
    return [];
  }
};

/**
 * Print a document as PDF.
 * Tries multiple endpoint variants since path params aren't supported.
 */
const printPdf = async (documentKey, masterName = '!BLATT1') => {
  const { token, tokenType, baseUrl } = await ensureToken();
  const axios = require('axios');
  const https = require('https');
  const httpsAgent = _getHttpsAgent();

  const bodies = [
    { Number: documentKey,       MasterName: masterName },
    { DocumentNumber: documentKey, MasterName: masterName },
    { filter: `Number EQ '${documentKey}'`, MasterName: masterName },
  ];
  const endpoints = [
    '/Documents/PrintPdf',
    '/Documents/Print',
    `/Documents/${encodeURIComponent(documentKey)}/PrintPdf`,
    `/Documents/${encodeURIComponent(documentKey)}/Print`,
  ];

  for (const endpoint of endpoints) {
    for (const body of bodies) {
      try {
        const res = await axios.post(`${baseUrl}${endpoint}`, body, {
          headers: {
            Authorization: `${tokenType} ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/pdf, application/json, */*',
          },
          httpsAgent,
          responseType: 'arraybuffer',
          timeout: 30_000,
        });
        const ct = res.headers['content-type'] || '';
        if (ct.includes('pdf') || res.data?.byteLength > 100) {
          console.log(`[SL] ✓ Print via ${endpoint}`);
          return { buffer: Buffer.from(res.data), contentType: ct || 'application/pdf' };
        }
      } catch (err) {
        if (err.response?.status === 404 || err.response?.status === 405) continue;
        // Log but continue trying
        console.warn(`[SL] Print ${endpoint}: HTTP ${err.response?.status || err.message}`);
      }
    }
  }
  throw new Error(`Kein funktionierender Print-Endpoint für ${documentKey} gefunden`);
};

// ── Transform helpers ──────────────────────────────────────────────────────────

/**
 * Map a raw SelectLine Mobile API document to our Delivery schema.
 * Field names confirmed from live API response (CamelCase English).
 */
const _addrObj = (a) => a && typeof a === 'object' && Object.keys(a).length > 0 ? a : null;

const addrToFields = (addr) => {
  const rawCountry = addr.CountryFlag || addr.CountryId || addr.CountryCode || addr.Country || addr.Land || 'DE';
  return {
    strasse: addr.Street  || addr.Street1  || addr.Strasse || '',
    plz:     addr.ZipCode || addr.PostalCode || addr.PLZ   || '',
    ort:     addr.City    || addr.Town || addr.Ort          || '',
    land:    rawCountry === 'D' ? 'DE' : rawCountry,
  };
};

/**
 * Map a raw SelectLine document to our Delivery schema.
 * async because it may fetch the delivery address.
 *
 * Address resolution priority (SelectLine Mobile API):
 *  1. doc-level delivery address fields (DeliveryAddress, ShipToAddress, …)
 *  2. bp-level delivery address fields (bp.DeliveryAddress, bp.ShippingAddress, …)
 *  3. Customer record's delivery address number → fetch via /Addresses
 *  4. Fallback: bp.Address (often the billing / HQ address for multi-location customers)
 *
 * Note: bp.ReferenceAddressNumber always equals bp.Address.Number in practice —
 *       re-fetching it via getAddress() just returns the same billing address.
 *       The actual delivery address must come from the customer record (step 3).
 */
const mapDocument = async (doc) => {
  const bp     = doc.BusinessPartner || {};
  const bpAddr = bp.Address || {};
  const refNr  = bp.ReferenceAddressNumber;

  let deliveryAddr = null;
  let deliveryName  = null; // Name aus der Lieferadresse (LastName || Company)
  let deliveryName2 = null; // Name2 aus der Lieferadresse (FirstName || Department)

  // 1) /Documents/L{number}/DeliveryAddresses — ab SelectLine 25.4 verfügbar
  const docNumber = doc.Number || doc.DocumentKey || String(doc.Id ?? '');
  if (docNumber) {
    const prefixes = ['L', 'QL', 'LS', 'LF'];
    for (const prefix of prefixes) {
      try {
        const data = await slGet(`/Documents/${prefix}${docNumber}/DeliveryAddresses`, { take: 1 });
        const arr = Array.isArray(data) ? data : (data?.value || data?.Data || data?.Items || []);
        if (arr.length > 0) {
          const da = arr[0];
          // Adresse sitzt in da.Address (DeliveryAddressDetailAddress)
          const rawAddr = da.Address || da.Adresse || null;
          if (rawAddr && (rawAddr.Street || rawAddr.City || rawAddr.ZipCode || rawAddr.Strasse || rawAddr.Ort || rawAddr.PLZ)) {
            deliveryAddr  = rawAddr;
            deliveryName  = da.LastName || da.Company || null;
            deliveryName2 = da.FirstName || da.Department || null;
            console.log(`[SL] ✓ Lieferadresse via /Documents/${prefix}${docNumber}/DeliveryAddresses:`, rawAddr);
            break;
          }
        }
      } catch { /* Prefix nicht unterstützt — nächsten versuchen */ }
    }
  }

  // 2) Document-level delivery address (ältere API-Versionen)
  if (!deliveryAddr) {
    deliveryAddr = _addrObj(doc.DeliveryAddress)
      || _addrObj(doc.ShipToAddress)
      || _addrObj(doc.ShippingAddress)
      || _addrObj(doc.Lieferadresse)
      || _addrObj(doc.LieferAdresse)
      || null;
  }

  // 3) BusinessPartner carries separate delivery address (some API versions)
  if (!deliveryAddr) {
    deliveryAddr = _addrObj(bp.DeliveryAddress)
      || _addrObj(bp.ShippingAddress)
      || _addrObj(bp.StandardDeliveryAddress)
      || null;
  }

  // 4) Look up customer record to find their StandardLieferadresse
  const bpNumber = bp.Number || bp.CustomerNumber;
  if (!deliveryAddr && bpNumber) {
    const customer = await getBusinessPartner(bpNumber).catch(() => null);
    if (customer) {
      const stdNr = customer.DefaultDeliveryAddressNumber
        || customer.ShippingAddressNumber
        || customer.DeliveryAddressNumber
        || customer.StandardDeliveryAddressNumber
        || customer.StandardLieferadresseNummer;
      if (stdNr) {
        deliveryAddr = await getAddress(String(stdNr)).catch(() => null);
      }
      if (!deliveryAddr) {
        deliveryAddr = _addrObj(customer.DeliveryAddress)
          || _addrObj(customer.ShippingAddress)
          || _addrObj(customer.StandardDeliveryAddress)
          || null;
      }
    }
  }

  // 5) Fallback: bp.Address (Rechnungsadresse / Hauptadresse)
  const addr = _addrObj(deliveryAddr) || _addrObj(bpAddr) || {};

  return {
    lieferscheinNr: doc.Number || doc.DeliveryDocumentNumber || doc.DocumentKey || doc.Id,
    selectlineId:   doc.Number || doc.DocumentKey || String(doc.Id ?? ''),
    auftragNr:      doc.OurReference || doc.ContractNumber || null,

    kunde: {
      kundennummer: refNr || bp.Number || bp.CustomerNumber || null,
      name:         deliveryName  || bp.LastName || bp.Company || bp.Name || bp.DisplayName || doc.DisplayName || '',
      name2:        deliveryName2 || bp.FirstName || bp.Name2 || null,
      adresse:      addrToFields(addr),
      telefon:      bp.Phone || bp.Phone1 || bp.Telephone || bp.Tel || null,
      email:        bp.Email || bp.EMail  || bp.EmailAddress || null,
    },

    lieferdatum: new Date(doc.DeliveryDate || doc.Date || Date.now()),
    erstelltAm:  new Date(doc.Date || Date.now()),
    notiz:       doc.HeaderText || doc.ExtraText || doc.DeliveryText || null,

    positionen:   [],
    importiert:   true,
    importiertAm: new Date(),
    importQuelle: 'selectline',
    status:       'neu',
    kanbanSpalte: 'neu',
  };
};

/**
 * Map a SelectLine Mobile API position to our Position schema.
 * Article data (for weights) is merged in separately.
 */
// artikelGruppeNr is passed in after fetching the article separately
const mapPosition = (pos, artikelGruppeNr = null) => ({
  artikelnummer:  pos.ArticleNumber || pos.Code || '',
  beschreibung:   pos.Name || pos.AdditionalDescription || pos.Description || '',
  menge:          parseFloat(pos.Quantity ?? pos.ActualQuantity ?? 0),
  einheit:        pos.QuantityUnit || pos.Unit || 'Stk',
  gewicht:        parseFloat(pos.Weight ?? 0) || 0,
  artikelGruppeNr,
});

/**
 * Determines if a SelectLine document has already been transferred/invoiced.
 * Uses StatusFlag, StatusLabel, and OutstandingTakeoverAmount.
 *
 * SelectLine StatusFlag values (typical):
 *   'O' = Offen (open)
 *   'T' = Übergeben/Transferred
 *   'A' = Abgeschlossen (completed)
 *   'S' = Storniert (cancelled)
 *   'R' = Rechnungsgestellt (invoiced)
 *   'E' = Erledigt (done)
 *   'G' = Geliefert (delivered, but not yet invoiced – import as normal)
 */
// SelectLine Mobile API returns numeric StatusFlag: 0=Offen, 1=Teilbeliefert, 2=Erledigt
const TRANSFERRED_FLAGS  = new Set(['T', 'A', 'R', 'E', 'F', 'C']); // letter fallback
const OPEN_FLAGS         = new Set(['O', 'G', 'N', '']);
const TRANSFERRED_LABELS = ['übergeben', 'fakturiert', 'abgeschlossen', 'erledigt', 'invoiced', 'transferred'];

const isTransferred = (doc) => {
  const rawFlag = doc.StatusFlag;
  const label   = (doc.StatusLabel || '').toString().toLowerCase();

  // Numeric StatusFlag (confirmed: Mobile API returns 0/1/2)
  const numFlag = Number(rawFlag);
  if (!isNaN(numFlag) && rawFlag !== null && rawFlag !== '') {
    if (numFlag === 0 || numFlag === 1) return false; // Offen / Teilbeliefert
    if (numFlag >= 2)                  return true;   // Erledigt, etc.
  }

  // Letter-based fallback (classic SelectLine)
  const flag = (rawFlag ?? '').toString().trim().toUpperCase();
  if (OPEN_FLAGS.has(flag)) return false;
  if (TRANSFERRED_FLAGS.has(flag)) return true;
  if (TRANSFERRED_LABELS.some(l => label.includes(l))) return true;
  if (doc.OutstandingTakeoverAmount === 0 && (doc.GrossAmount ?? 0) !== 0) return true;

  return false;
};

module.exports = {
  ensureToken,
  invalidateToken,
  testConnection,
  isTransferred,
  getDeliveryNotes,
  getDeliveryNote,
  getDeliveryPositions,
  getArticle,
  getAddress,
  getBusinessPartner,
  getArticleStocks,
  printPdf,
  mapDocument,
  mapPosition,
};
