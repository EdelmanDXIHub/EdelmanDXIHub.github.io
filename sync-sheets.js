// Google Sheets Configuration
const SHEET_ID = "1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c";
const SHEET_NAME = "Schedule";
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
      const data = JSON.parse(jsonString);
      
      // Update global PRELOADED_DATA
      window.PRELOADED_DATA = data;
      
      console.log("✅ Datos cargados del Sheet:");
      console.log(`   - Miembros: ${data.members?.length || 0}`);
      console.log(`   - Marcas: ${data.brands?.length || 0}`);
      console.log(`   - Asignaciones: ${Object.keys(data.assignments || {}).length} días`);
      
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
 * Sends data to Google Sheet via Apps Script
 */
async function syncDataToSheet(state) {
  if (!WEB_APP_URL) {
    console.warn("⚠️  Web App URL no configurada. Datos no sincronizados.");
    return false;
  }

  try {
    console.log("🔄 Sincronizando cambios al Sheet...");
    
    const dataToSync = {
      members: state.members || [],
      brands: state.brands || [],
      assignments: state.assignments || {}
    };

    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "saveData",
        data: dataToSync
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log("✅ Cambios sincronizados al Sheet");
      return true;
    } else {
      throw new Error(result.error || "Error desconocido");
    }

  } catch (error) {
    console.error("❌ Error al sincronizar:", error.message);
    return false;
  }
}

/**
 * Configure the API Key and Web App URL
 */
function configureSheetSync(apiKey, webAppUrl) {
  API_KEY = apiKey;
  WEB_APP_URL = webAppUrl;
  console.log("✅ Sincronización configurada");
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

