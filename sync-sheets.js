// Google Sheet Configuration
const SHEET_ID = "1fNhblv3Z1PgnvHL5OB3rFv5uJVWTr2g_HEaWCGQpui4";
const SHEET_NAME = "Schedule";

// Google Apps Script Web App URL (deployed as web app)
let WEB_APP_URL = null;

/**
 * Fetches data from Google Sheet via Apps Script endpoint (GET)
 */
async function loadDataFromSheet() {
  try {
    console.log("📡 Cargando datos del Google Sheet...");
    
    if (!WEB_APP_URL) {
      throw new Error("Web App URL no configurada");
    }
    
    const response = await fetch(`${WEB_APP_URL}?action=getData`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // Update global PRELOADED_DATA
      window.PRELOADED_DATA = result.data;
      
      console.log("✅ Datos cargados del Sheet:");
      console.log(`   - Miembros: ${result.data.members?.length || 0}`);
      console.log(`   - Marcas: ${result.data.brands?.length || 0}`);
      console.log(`   - Asignaciones: ${Object.keys(result.data.assignments || {}).length} días`);
      
      return true;
    } else {
      throw new Error(result.error || "Respuesta inválida");
    }
    
  } catch (error) {
    console.error("❌ Error al cargar Sheet:", error.message);
    console.warn("⚠️  Usando datos locales de data.js como fallback");
    return false;
  }
}

/**
 * Sends data to Google Sheet via Apps Script Web App (POST)
 */
async function syncDataToSheet(state) {
  // Only sync if we have the Web App URL configured
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
 * Configure the Web App URL (set this after deploying Google Apps Script)
 */
function setWebAppURL(url) {
  WEB_APP_URL = url;
  console.log("✅ Web App URL configurada:", url);
}

/**
 * Initialize the app - fetch sheet data first, then run main app
 */
async function initializeApp() {
  // Try to load from Sheet first
  const sheetLoaded = await loadDataFromSheet();
  
  // If Sheet load failed, data.js will provide the fallback via window.PRELOADED_DATA
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

