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
      const sheetData = JSON.parse(jsonString);
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
    const days = [..._pendingDays];
    _pendingDays.clear();
    const resolvers = _pendingResolvers.splice(0);

    if (days.length === 0) {
      resolvers.forEach(r => r(true));
      return;
    }

    console.log("🔄 Sincronizando estado completo al Sheet...");

    // Always send the FULL state via POST (avoids read-modify-write race conditions)
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
 * Send the complete state as a single POST request.
 * This avoids the read-modify-write race condition that caused data loss
 * when sending individual days via GET.
 */
async function _sendFullState(state) {
  try {
    // Build the complete data object matching what loadDataFromSheet expects
    const fullData = {
      members: state.members,
      brands: state.brands,
      assignments: {}
    };

    // Save _config inside assignments so loadDataFromSheet can read it
    fullData.assignments._config = { members: state.members, brands: state.brands };

    // Copy all assignments
    for (const key of Object.keys(state.assignments)) {
      fullData.assignments[key] = state.assignments[key];
    }

    const body = JSON.stringify({ action: "saveAll", data: fullData });
    console.log("📤 Enviando " + Math.round(body.length / 1024) + "KB al Sheet...");

    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });
    const text = await response.text();

    try {
      const json = JSON.parse(text);
      if (json.success) {
        return { ok: true };
      } else {
        console.error("❌ Sheet respondió error:", json.error || text);
        return { ok: false, error: json.error || "Unknown error" };
      }
    } catch {
      console.error("❌ Respuesta no-JSON:", text.substring(0, 200));
      return { ok: false, error: "Non-JSON response" };
    }
  } catch (error) {
    console.error("❌ Fetch falló:", error.message);
    return { ok: false, error: error.message };
  }
}

// Full sync: push complete state to Sheet
async function fullSyncToSheet() {
  if (!WEB_APP_URL) {
    console.error("❌ Web App URL no configurada");
    return false;
  }
  const currentState = (typeof state !== 'undefined') ? state : null;
  if (!currentState || !currentState.assignments) {
    console.error("❌ No hay datos para sincronizar");
    return false;
  }

  console.log("🔄 Full sync: enviando estado completo al Sheet...");
  const result = await _sendFullState(currentState);
  if (result.ok) {
    console.log("✅ Full sync completado");
  } else {
    console.error("❌ Full sync falló: " + result.error);
  }
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

