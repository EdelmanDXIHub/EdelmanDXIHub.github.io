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
    const response = await fetch(url);
    
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

  // Also sync config (members + brands) whenever state changes
  _pendingDays.add("_config");

  const promise = new Promise(resolve => _pendingResolvers.push(resolve));

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => _flushPendingDays(state), 2000);
  return promise;
}

async function _flushPendingDays(state) {
  const days = [..._pendingDays];
  _pendingDays.clear();
  const resolvers = _pendingResolvers.splice(0);

  if (days.length === 0) {
    resolvers.forEach(r => r(true));
    return;
  }

  console.log("🔄 Sincronizando " + days.length + " ítem(s) al Sheet...");

  let success = 0;
  let lastError = null;
  for (const day of days) {
    let dayData;
    if (day === "_config") {
      dayData = { members: state.members, brands: state.brands };
    } else {
      dayData = state.assignments[day];
    }
    if (dayData) {
      const result = await _sendDayViaGet(day, dayData);
      if (result.ok) {
        success++;
      } else {
        lastError = result.error;
      }
    }
  }

  const allOk = success === days.length;
  if (allOk) {
    console.log("✅ " + success + "/" + days.length + " día(s) sincronizados");
  } else {
    console.error("⚠️ " + success + "/" + days.length + " días OK. Error: " + lastError);
  }
  resolvers.forEach(r => r(allOk));
}

async function _sendDayViaGet(dayKey, dayData) {
  try {
    const url = WEB_APP_URL
      + "?action=saveDay"
      + "&day=" + encodeURIComponent(dayKey)
      + "&data=" + encodeURIComponent(JSON.stringify(dayData));

    const response = await fetch(url);
    const text = await response.text();
    
    try {
      const json = JSON.parse(text);
      if (json.success) {
        return { ok: true };
      } else {
        console.error("❌ Sheet respondió error para " + dayKey + ":", json.error || text);
        return { ok: false, error: json.error || "Unknown error" };
      }
    } catch {
      // If response isn't JSON, log it
      console.error("❌ Respuesta no-JSON para " + dayKey + ":", text.substring(0, 200));
      return { ok: false, error: "Non-JSON response" };
    }
  } catch (error) {
    console.error("❌ Fetch falló para " + dayKey + ":", error.message);
    return { ok: false, error: error.message };
  }
}

// Full sync: push ALL current days to Sheet
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

  const assignments = currentState.assignments;
  const days = Object.keys(assignments);

  console.log("🔄 Full sync: enviando " + days.length + " días al Sheet...");

  let success = 0;
  for (const day of days) {
    const result = await _sendDayViaGet(day, assignments[day]);
    if (result.ok) {
      success++;
      console.log("  ✓ " + day);
    } else {
      console.error("  ✗ " + day + ": " + result.error);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("✅ Full sync: " + success + "/" + days.length + " días");
  return success === days.length;
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

