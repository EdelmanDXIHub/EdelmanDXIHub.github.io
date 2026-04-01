// Google Sheet Configuration
const SHEET_ID = "1fNhblv3Z1PgnvHL5OB3rFv5uJVWTr2g_HEaWCGQpui4";
const SHEET_NAME = "Schedule";

// Google Apps Script Web App URL (deployed as web app)
let WEB_APP_URL = null;

/**
 * Fetches data from Google Sheet via Apps Script endpoint (JSONP to avoid CORS)
 */
function loadDataFromSheet() {
  return new Promise((resolve) => {
    try {
      console.log("📡 Cargando datos del Google Sheet...");
      
      if (!WEB_APP_URL) {
        throw new Error("Web App URL no configurada");
      }
      
      // Use JSONP callback to bypass CORS
      const callbackName = `jsonp_callback_${Date.now()}`;
      window[callbackName] = function(response) {
        delete window[callbackName];
        
        if (response.success && response.data) {
          // Update global PRELOADED_DATA
          window.PRELOADED_DATA = response.data;
          
          console.log("✅ Datos cargados del Sheet:");
          console.log(`   - Miembros: ${response.data.members?.length || 0}`);
          console.log(`   - Marcas: ${response.data.brands?.length || 0}`);
          console.log(`   - Asignaciones: ${Object.keys(response.data.assignments || {}).length} días`);
          
          resolve(true);
        } else {
          throw new Error(response.error || "Respuesta inválida");
        }
      };
      
      const script = document.createElement('script');
      script.src = `${WEB_APP_URL}?action=getData&callback=${callbackName}`;
      script.onerror = () => {
        console.error("❌ Error al cargar Script");
        console.warn("⚠️  Usando datos locales de data.js como fallback");
        resolve(false);
      };
      
      document.head.appendChild(script);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (window[callbackName]) {
          console.warn("⚠️  Timeout al cargar datos del Sheet, usando fallback");
          delete window[callbackName];
          resolve(false);
        }
      }, 10000);
      
    } catch (error) {
      console.error("❌ Error al cargar Sheet:", error.message);
      console.warn("⚠️  Usando datos locales de data.js como fallback");
      resolve(false);
    }
  });
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

