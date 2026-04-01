// Google Apps Script - Deploy como Web App
// Execute as: Me
// Who has access: Anyone

function doGet(e) {
  try {
    const action = e.parameter.action || "getData";
    
    if (action === "getData") {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Schedule");
      const jsonString = sheet.getRange("A1").getValue();
      
      if (!jsonString) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Celda A1 vacía"
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      try {
        const data = JSON.parse(jsonString);
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          data: data
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (parseError) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "JSON inválido en A1",
          raw: jsonString.substring(0, 100)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === "saveData") {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Schedule");
      const jsonString = JSON.stringify(data.data);
      sheet.getRange("A1").setValue(jsonString);
      
      Logger.log("✅ Datos guardados en A1");
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Datos guardados correctamente"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    Logger.log("❌ Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function putDataInA1() {
  // Fallback function to manually sync (optional)
  const data = {
    "members": [
      "DXI Hub Weekly Timing Map",
      "Daniela Mahecha",
      "Daniela Oliva",
      "Laura Álvarez",
      "Natalia Bolaño",
      "Hernan Torres",
      "Ana Piraquive",
      "David Bautista",
      "Nicolas Lopez",
      "Natalia Sanchez",
      "David Guzman",
      "Gabriela Pelayo"
    ],
    "brands": [
      {"id": "b1", "name": "AMERICAN EGG BOARD (WEEKLY)", "color": "#FFFF00"},
      {"id": "b2", "name": "DOVE (MONTHLY)", "color": "#FF8A80"},
      {"id": "b3", "name": "DOVE (Super Bowl)", "color": "#0B77A0"},
      {"id": "b4", "name": "DOVE DECK", "color": "#E59EDD"},
      {"id": "b5", "name": "DXI Hub Weekly Timing Map", "color": "#2D6A4F"},
      {"id": "b6", "name": "Daily", "color": "#1D3557"},
      {"id": "b7", "name": "ELIMINI", "color": "#92D050"},
      {"id": "b8", "name": "From 2/11 to 2/13", "color": "#8F2D56"},
      {"id": "b9", "name": "IHOP (DAILY)", "color": "#FFC000"},
      {"id": "b10", "name": "IKEA PBI adjustments", "color": "#040A10"},
      {"id": "b11", "name": "Last Friday weekly", "color": "#CA6702"},
      {"id": "b12", "name": "MCKINSEY (WEEKLY)", "color": "#00FA00"},
      {"id": "b13", "name": "MONTHLY", "color": "#6A4C93"},
      {"id": "b14", "name": "MSFT (MONTHLY)", "color": "#264653"},
      {"id": "b15", "name": "MSFT LG2C (Monthly, Quaterly and Benchmark)", "color": "#0070C0"},
      {"id": "b16", "name": "Marshalls Weekly wins", "color": "#C00000"},
      {"id": "b17", "name": "Monthly", "color": "#386641"},
      {"id": "b18", "name": "ServiceNow", "color": "#C04F15"},
      {"id": "b19", "name": "TJX Marshalls TAGGING", "color": "#00B0F0"},
      {"id": "b20", "name": "Unilever Crisis Report", "color": "#F2CFEE"},
      {"id": "b21", "name": "WARNER", "color": "#A02B93"},
      {"id": "b22", "name": "Weekly", "color": "#9D4EDD"}
    ]
  };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Schedule");
  const jsonString = JSON.stringify(data);
  sheet.getRange("A1").setValue(jsonString);
  
  Logger.log("✅ JSON guardado en A1");
}
