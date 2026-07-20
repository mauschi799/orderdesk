const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'GasDispo/1.0 (gasdispo@localhost)';

// Simple in-memory cache to respect Nominatim rate limits (1 req/sec)
const geocodeCache = new Map();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim: max 1 request/second

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Geocode an address string using Nominatim
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lng: number, displayName: string} | null>}
 */
const geocodeAddress = async (address) => {
  if (!address || address.trim().length < 5) return null;

  const cacheKey = address.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  try {
    lastRequestTime = Date.now();
    const response = await axios.get(`${NOMINATIM_URL}/search`, {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        countrycodes: 'de,at,ch,lu,be',
        addressdetails: 1
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    if (!response.data?.length) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const result = response.data[0];
    const coords = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name
    };

    geocodeCache.set(cacheKey, coords);
    return coords;
  } catch (err) {
    console.error('Geocoding Fehler:', err.message);
    return null;
  }
};

/**
 * Geocode a Kunde address object
 */
const geocodeKunde = async (adresse) => {
  if (!adresse) return null;
  const parts = [adresse.strasse, adresse.plz, adresse.ort, adresse.land || 'Deutschland'].filter(Boolean);
  return geocodeAddress(parts.join(', '));
};

/**
 * Batch geocode multiple deliveries (respects rate limiting)
 */
const geocodeDeliveries = async (deliveries) => {
  const results = [];
  for (const delivery of deliveries) {
    if (delivery.kunde?.adresse?.lat && delivery.kunde?.adresse?.lng) {
      results.push({ id: delivery._id, lat: delivery.kunde.adresse.lat, lng: delivery.kunde.adresse.lng });
      continue;
    }
    const coords = await geocodeKunde(delivery.kunde?.adresse);
    results.push({ id: delivery._id, ...coords });
  }
  return results;
};

module.exports = { geocodeAddress, geocodeKunde, geocodeDeliveries };
