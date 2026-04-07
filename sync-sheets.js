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
 * Sends data to Google Sheet via Apps Script
 */
async function syncDataToSheet(state) {
  if (!WEB_APP_URL) {
    console.warn("⚠️  Web App URL no configurada. Datos no sincronizados.");
    return false;
  }

  try {
    console.log("🔄 Sincronizando cambios al Sheet...");
    
    // Only sync assignments to Sheet, not members/brands (those stay local)
    const assignmentsOnly = {
      assignments: state.assignments || {}
    };

    // Use form-encoded data to avoid CORS preflight
    const formData = new URLSearchParams();
    formData.append('action', 'saveData');
    formData.append('data', JSON.stringify(assignmentsOnly));

    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Parse response text and check if it's valid JSON
    const responseText = await response.text();
    console.log("📤 Response from Apps Script:", responseText.substring(0, 100));
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Response was not JSON:", responseText);
      throw new Error("Invalid response from server");
    }
    
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

