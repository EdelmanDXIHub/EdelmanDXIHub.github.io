// Google Sheet Configuration
const SHEET_ID = "1fNhblv3Z1PgnvHL5OB3rFv5uJVWTr2g_HEaWCGQpui4";
const SHEET_NAME = "Schedule";

// Proxy URL (Vercel) - REEMPLAZA con tu URL de Vercel
let PROXY_URL = "https://apptiming-proxy.vercel.app/api";

/**
 * Fetches data from Google Sheet via Vercel Proxy
 */
async function loadDataFromSheet() {
  try {
    console.log("📡 Cargando datos del Google Sheet...");
    
    if (!PROXY_URL) {
      throw new Error("Proxy URL no configurada");
    }
    
    const response = await fetch(`${PROXY_URL}/proxy?action=getData`);
    
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
 * Sends data to Google Sheet via Vercel Proxy
 */
async function syncDataToSheet(state) {
  if (!PROXY_URL) {
    console.warn("⚠️  Proxy URL no configurada. Datos no sincronizados.");
    return false;
  }

  try {
    console.log("🔄 Sincronizando cambios al Sheet...");
    
    const dataToSync = {
      members: state.members || [],
      brands: state.brands || [],
      assignments: state.assignments || {}
    };

    const response = await fetch(`${PROXY_URL}/proxy`, {
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
 * Configure the Proxy URL
 */
function setProxyURL(url) {
  PROXY_URL = url;
  console.log("✅ Proxy URL configurada:", url);
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

