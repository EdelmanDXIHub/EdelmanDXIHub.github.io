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
 * ALWAYS uses Sheet data — never falls back to data.js
 */
async function loadDataFromSheet() {
  try {
    console.log("📡 Cargando datos del Google Sheet...");
    
    if (!API_KEY) {
      throw new Error("API Key no configurada");
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!${SHEET_RANGE}?key=${API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Always use members/brands from data.js (those are the source of truth for structure)
    const members = window.PRELOADED_DATA?.members || [];
    const brands = window.PRELOADED_DATA?.brands || [];
    
    let assignments = {};
    
    if (result.values && result.values[0] && result.values[0][0]) {
      const jsonString = result.values[0][0];
      const sheetData = JSON.parse(jsonString);
      assignments = sheetData.assignments || sheetData;
      console.log("✅ Asignaciones cargadas del Sheet: " + Object.keys(assignments).length + " días");
    } else {
      console.warn("⚠️ Celda A1 vacía — se inicializará con datos en blanco");
    }

    const mergedData = { members, brands, assignments };
    window.PRELOADED_DATA = mergedData;
    
    console.log(`   - Miembros: ${members.length}`);
    console.log(`   - Marcas: ${brands.length}`);
    
    return true;
    
  } catch (error) {
    console.error("❌ Error al cargar Sheet:", error.message);
    // Still use members/brands from data.js but assignments stay empty
    const members = window.PRELOADED_DATA?.members || [];
    const brands = window.PRELOADED_DATA?.brands || [];
    window.PRELOADED_DATA = { members, brands, assignments: {} };
    console.warn("⚠️ Usando miembros/marcas locales, asignaciones vacías (Sheet no disponible)");
    return false;
  }
}

/**
 * Sends a day to Google Sheet via fetch GET (GET survives 302 redirects)
 */
let _pendingDays = new Set();
let _syncTimer = null;

function syncDataToSheet(state, changedDay) {
  if (!WEB_APP_URL) {
    console.warn("⚠️  Web App URL no configurada.");
    return false;
  }

  if (changedDay) {
    _pendingDays.add(changedDay);
  } else {
    for (const day of Object.keys(state.assignments || {})) {
      _pendingDays.add(day);
    }
  }

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => _flushPendingDays(state), 2000);
  return true;
}

async function _flushPendingDays(state) {
  const days = [..._pendingDays];
  _pendingDays.clear();
  if (days.length === 0) return;

  console.log("🔄 Sincronizando " + days.length + " día(s) al Sheet...");

  let success = 0;
  let lastError = null;
  for (const day of days) {
    const dayData = state.assignments[day];
    if (dayData) {
      const result = await _sendDayViaGet(day, dayData);
      if (result.ok) {
        success++;
      } else {
        lastError = result.error;
      }
    }
  }

  if (success === days.length) {
    console.log("✅ " + success + "/" + days.length + " día(s) sincronizados");
  } else {
    console.error("⚠️ " + success + "/" + days.length + " días OK. Error: " + lastError);
  }
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
  console.log("✅ Sincronización configurada");
  console.log("📊 Google Sheet: https://docs.google.com/spreadsheets/d/" + SHEET_ID);
  console.log("📡 Web App URL: " + WEB_APP_URL);
  console.log("📋 Tab: " + SHEET_NAME + " | Celda: " + SHEET_RANGE);
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

