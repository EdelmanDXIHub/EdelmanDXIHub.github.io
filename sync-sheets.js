// Google Sheets Configuration
const SHEET_ID = "1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c";
const SHEET_NAME = "assignments";
const SHEET_RANGE = "A1";

// Google Sheets API Key
let API_KEY = null;

// Google Apps Script Web App URL
let WEB_APP_URL = null;

/**
 * Fetches data from Google Sheet using Sheets API
 * All data (members, brands, assignments) comes from the Sheet
 */
async function loadDataFromSheet() {
  try {
    if (!API_KEY) {
      throw new Error("API Key no configurada");
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!${SHEET_RANGE}?key=${API_KEY}`;
    const response = await fetch(url, { cache: 'no-store' });
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const result = await response.json();
    
    let members = [];
    let brands = [];
    let assignments = {};
    
    if (result.values && result.values[0] && result.values[0][0]) {
      const jsonString = result.values[0][0];
      const sheetData = _decompressData(JSON.parse(jsonString));
      members = Array.isArray(sheetData.members) ? sheetData.members : [];
      brands = Array.isArray(sheetData.brands) ? sheetData.brands : [];
      assignments = sheetData.assignments || {};
      // Also check if members/brands were saved inside assignments as _config
      if (assignments._config) {
        if (Array.isArray(assignments._config.members) && assignments._config.members.length) members = assignments._config.members;
        if (Array.isArray(assignments._config.brands) && assignments._config.brands.length) brands = assignments._config.brands;
        delete assignments._config;
      }
      // If _config had no members, fall back to extracting from assignment keys
      if (!members.length && Object.keys(assignments).length) {
        const memberSet = new Set();
        for (const dayKey of Object.keys(assignments)) {
          for (const name of Object.keys(assignments[dayKey])) {
            memberSet.add(name);
          }
        }
        members = [...memberSet];
        console.log("✅ Members extraídos de assignments (fallback): " + members.length);
      }
      console.log("✅ Datos cargados del Sheet: " + members.length + " miembros, " + brands.length + " marcas, " + Object.keys(assignments).length + " días");
    } else {
      console.warn("⚠️ Celda A1 vacía — se inicializará con datos en blanco");
    }

    window.PRELOADED_DATA = { members, brands, assignments };
    return true;
    
  } catch (error) {
    console.error("❌ Error al cargar Sheet:", error.message);
    window.PRELOADED_DATA = { members: [], brands: [], assignments: {} };
    console.warn("⚠️ Sheet no disponible — datos vacíos");
    return false;
  }
}

/**
 * Sends a day to Google Sheet via fetch GET (GET survives 302 redirects)
 */
let _pendingDays = new Set();
let _syncTimer = null;
let _pendingResolvers = [];
let _flushing = false;
let _postWorks = null; // null = untested, true/false = tested

/**
 * Compress assignments before saving to Sheets.
 * Skips empty member-days (all null/LUNCH) and encodes slot arrays as compact strings.
 * Reduces size from ~163KB to ~5-10KB, well under the 50,000-char Sheets cell limit.
 *   null → '.'   LUNCH → 'L'   brandId → 'Bn' (e.g., 'B0', 'B1', 'B2')
 */
function _compressData(data) {
  const out = {
    _v: 2,
    members: data.members,
    brands: data.brands,
    assignments: {}
  };

  // Build brand ID → index map
  const brandMap = {};
  if (Array.isArray(data.brands)) {
    for (let i = 0; i < data.brands.length; i++) {
      brandMap[data.brands[i].id] = 'B' + i;
    }
  }

  for (const day of Object.keys(data.assignments)) {
    if (day === '_config') {
      out.assignments._config = data.assignments._config;
      continue;
    }
    const dayObj = data.assignments[day];
    if (!dayObj || typeof dayObj !== 'object') continue;

    const compDay = {};
    for (const member of Object.keys(dayObj)) {
      const slots = dayObj[member];
      if (!Array.isArray(slots)) continue;
      // Skip member-days with no brand assignments (only null/LUNCH)
      if (!slots.some(v => v !== null && v !== undefined && v !== 'LUNCH')) continue;
      compDay[member] = slots.map(v => {
        if (v === null || v === undefined) return '.';
        if (v === 'LUNCH') return 'L';
        return brandMap[v] || '.';
      }).join('');
    }
    if (Object.keys(compDay).length > 0) {
      out.assignments[day] = compDay;
    }
  }
  return out;
}

/**
 * Decompress data saved in v2 compact format back to slot arrays.
 * Days/members missing from compressed data are reconstructed by the app as empty.
 */
function _decompressData(data) {
  if (!data || !data._v || data._v < 2) return data; // already expanded
  const out = {
    members: data.members || [],
    brands: data.brands || [],
    assignments: {}
  };
  
  // Build brand index → ID map
  const brandIds = {};
  if (Array.isArray(data.brands)) {
    for (let i = 0; i < data.brands.length; i++) {
      brandIds['B' + i] = data.brands[i].id;
    }
  }

  for (const day of Object.keys(data.assignments)) {
    if (day === '_config') {
      out.assignments._config = data.assignments._config;
      continue;
    }
    out.assignments[day] = {};
    for (const member of Object.keys(data.assignments[day])) {
      const val = data.assignments[day][member];
      if (typeof val !== 'string') { out.assignments[day][member] = val; continue; }
      out.assignments[day][member] = val.split('').map(c => {
        if (c === '.') return null;
        if (c === 'L') return 'LUNCH';
        // c is like 'B0', 'B1', etc.
        return brandIds[c] || null;
      });
    }
  }
  return out;
}

function syncDataToSheet(state, changedDays) {
  if (!WEB_APP_URL) {
    console.warn("⚠️  Web App URL no configurada.");
    return Promise.resolve(false);
  }

  if (changedDays) {
    if (Array.isArray(changedDays)) {
      for (const d of changedDays) _pendingDays.add(d);
    } else {
      _pendingDays.add(changedDays);
    }
  }

  _pendingDays.add("_config");

  const promise = new Promise(resolve => _pendingResolvers.push(resolve));

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => _flushPendingDays(state), 2000);
  return promise;
}

async function _flushPendingDays(state) {
  if (_flushing) {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => _flushPendingDays(state), 1000);
    return;
  }

  _flushing = true;
  try {
    _pendingDays.clear();
    const resolvers = _pendingResolvers.splice(0);

    // Always send full state — avoids read-modify-write race condition
    console.log("🔄 Sincronizando estado completo al Sheet...");
    const result = await _sendFullState(state);

    if (result.ok) {
      console.log("✅ Estado sincronizado correctamente");
    } else {
      console.error("⚠️ Error sincronizando: " + result.error);
    }
    resolvers.forEach(r => r(result.ok));
  } finally {
    _flushing = false;
    if (_pendingDays.size > 0) {
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => _flushPendingDays(state), 500);
    }
  }
}

/**
 * Send full state. Tries POST first; if that fails (302 redirect issue),
 * falls back to GET-based saveAll using chunked approach.
 */
async function _sendFullState(state) {
  // Build complete data
  const fullData = {
    members: state.members,
    brands: state.brands,
    assignments: {}
  };
  fullData.assignments._config = { members: state.members, brands: state.brands };
  for (const key of Object.keys(state.assignments)) {
    fullData.assignments[key] = state.assignments[key];
  }
  const jsonStr = JSON.stringify(_compressData(fullData));
  console.log("📤 Datos: " + Math.round(jsonStr.length / 1024) + "KB (comprimido)");

  // Try POST if not known to fail
  if (_postWorks !== false) {
    const postResult = await _tryPost(jsonStr);
    if (postResult.ok) {
      _postWorks = true;
      return postResult;
    }
    console.warn("⚠️ POST falló, intentando GET...");
    _postWorks = false;
  }

  // Fallback: GET-based full save using saveAll action with chunked data
  return await _sendViaGetChunked(jsonStr);
}

async function _tryPost(jsonStr) {
  try {
    const body = JSON.stringify({ action: "saveAll", data: JSON.parse(jsonStr) });
    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (json.success) return { ok: true };
      if (json.error === "Invalid action") return { ok: false, error: "POST not supported" };
      return { ok: false, error: json.error || "Unknown" };
    } catch {
      return { ok: false, error: "Non-JSON response" };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Fallback: send data via GET in chunks.
 * Each chunk writes to PropertiesService; the last chunk triggers assembly + save.
 */
async function _sendViaGetChunked(jsonStr) {
  // Google Apps Script GET URLs can safely handle ~6000 chars of encoded data
  const CHUNK_SIZE = 5000;
  const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);

  if (totalChunks === 1) {
    // Small enough to send in one GET
    return await _sendGetSaveAll(jsonStr, 0, 1);
  }

  console.log("📦 Enviando en " + totalChunks + " partes...");
  for (let i = 0; i < totalChunks; i++) {
    const chunk = jsonStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const result = await _sendGetSaveAll(chunk, i, totalChunks);
    if (!result.ok) return result;
    // Small delay between chunks
    if (i < totalChunks - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return { ok: true };
}

async function _sendGetSaveAll(data, chunkIndex, totalChunks) {
  try {
    const url = WEB_APP_URL
      + "?action=saveAllChunk"
      + "&chunk=" + chunkIndex
      + "&total=" + totalChunks
      + "&data=" + encodeURIComponent(data);

    const response = await fetch(url);
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      if (json.success) return { ok: true };
      return { ok: false, error: json.error || "Unknown" };
    } catch {
      return { ok: false, error: "Non-JSON: " + text.substring(0, 100) };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Full sync helper
async function fullSyncToSheet() {
  if (!WEB_APP_URL) {
    console.error("❌ Web App URL no configurada");
    return false;
  }
  const currentState = (typeof state !== 'undefined') ? state : null;
  if (!currentState) {
    console.error("❌ No hay datos para sincronizar");
    return false;
  }
  const result = await _sendFullState(currentState);
  return result.ok;
}

/**
 * Configure the API Key and Web App URL
 */
function configureSheetSync(apiKey, webAppUrl) {
  API_KEY = apiKey;
  WEB_APP_URL = webAppUrl;
}

/**
 * Initialize the app - always loads from Sheet first
 */
async function initializeApp() {
  await loadDataFromSheet();
  
  if (typeof init === "function") {
    init();
  }
}

// Auto-load when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

