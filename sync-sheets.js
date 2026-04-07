// Google Sheets Configuration
const SHEET_ID = "1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c";
const SHEET_NAME = "assignments";
const SHEET_RANGE = "A1";

// Google Sheets API Key (reemplaza con tu key)
let API_KEY = null;

// Google Apps Script Web App URL
let WEB_APP_URL = null;

/**
 * Fetches data from Google Sheet using Sheets API
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
    
    if (result.values && result.values[0] && result.values[0][0]) {
      const jsonString = result.values[0][0];
      const sheetData = JSON.parse(jsonString);
      
      // Merge: keep members/brands from local data, use assignments from Sheet
      const mergedData = {
        members: window.PRELOADED_DATA?.members || [],
        brands: window.PRELOADED_DATA?.brands || [],
        assignments: sheetData.assignments || sheetData // Handle both full object and assignments-only
      };
      
      // Update global PRELOADED_DATA with merged data
      window.PRELOADED_DATA = mergedData;
      
      console.log("✅ Datos cargados del Sheet:");
      console.log(`   - Miembros: ${mergedData.members?.length || 0}`);
      console.log(`   - Marcas: ${mergedData.brands?.length || 0}`);
      console.log(`   - Asignaciones: ${Object.keys(mergedData.assignments || {}).length} días`);
      
      return true;
    } else {
      throw new Error("Celda A1 vacía o sin datos válidos");
    }
    
  } catch (error) {
    console.error("❌ Error al cargar Sheet:", error.message);
    console.warn("⚠️  Usando datos locales de data.js como fallback");
    return false;
  }
}

/**
 * Sends changed days to Google Sheet via GET requests (bypasses CORS+302 redirect)
 * GET requests survive 302 redirects because data is in the URL, not the body
 */
let _pendingDays = new Set();
let _syncTimer = null;

function syncDataToSheet(state, changedDay) {
  if (!WEB_APP_URL) {
    console.warn("⚠️  Web App URL no configurada. Datos no sincronizados.");
    return false;
  }

  // Track which day(s) need syncing
  if (changedDay) {
    _pendingDays.add(changedDay);
  } else {
    // No specific day = sync everything (e.g. clear month, add member)
    for (const day of Object.keys(state.assignments || {})) {
      _pendingDays.add(day);
    }
  }

  // Debounce: wait 2 seconds after last change before syncing
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
  for (const day of days) {
    const dayData = state.assignments[day];
    if (dayData) {
      const ok = await _sendDayViaGet(day, dayData);
      if (ok) success++;
    }
  }

  console.log("✅ " + success + "/" + days.length + " día(s) sincronizados");
}

function _sendDayViaGet(dayKey, dayData) {
  return new Promise((resolve) => {
    const url = WEB_APP_URL
      + "?action=saveDay"
      + "&day=" + encodeURIComponent(dayKey)
      + "&data=" + encodeURIComponent(JSON.stringify(dayData))
      + "&t=" + Date.now();

    // Image GET request: not subject to CORS, survives 302 redirects
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(true); // onerror expected (server returns JSON, not image)
    img.src = url;

    setTimeout(() => resolve(false), 15000);
  });
}

// Full sync: push ALL current days to Sheet (call from console for manual sync)
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
    const ok = await _sendDayViaGet(day, assignments[day]);
    if (ok) success++;
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("✅ Full sync completo: " + success + "/" + days.length + " días");
  return true;
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
 * Initialize the app - fetch sheet data first, then run main app
 */
async function initializeApp() {
  // Try to load from Sheet first
  const sheetLoaded = await loadDataFromSheet();
  
  // Initialize the main app (from app.js)
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

