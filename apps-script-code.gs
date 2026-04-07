const SPREADSHEET_ID = '1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c';
const SHEET_NAME = 'assignments';

// Handle CORS preflight requests
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'debugSheets') {
      return debugSheets();
    } else if (action === 'initData') {
      return initializeData();
    } else if (action === 'getMembers') {
      return getMembers();
    } else if (action === 'getBrands') {
      return getBrands();
    } else if (action === 'getSchedule') {
      return getSchedule();
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}

function doPost(e) {
  try {
    let data;
    
    // Always try to get from parameters first (works for both JSON and form-encoded)
    try {
      if (e.parameter && e.parameter.data) {
        const parsedData = JSON.parse(e.parameter.data);
        data = {
          action: e.parameter.action,
          data: parsedData
        };
      } else if (e.postData && e.postData.contents) {
        // Fall back to parsing entire body as JSON if no parameters
        data = JSON.parse(e.postData.contents);
      }
    } catch (parseError) {
      Logger.log('Parse error details: ' + parseError.toString());
      Logger.log('postData contents: ' + (e.postData ? e.postData.contents : 'none').substring(0, 100));
      Logger.log('parameter.data: ' + (e.parameter ? e.parameter.data : 'none'));
      throw new Error('Failed to parse request: ' + parseError.toString());
    }
    
    const action = data.action;
    
    if (action === 'saveData') {
      if (data.data && data.data.assignments) {
        const currentData = getDataFromCell();
        currentData.assignments = data.data.assignments;
        saveDataToCell(currentData);
        return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON)
          .addHeader('Access-Control-Allow-Origin', '*')
          .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          .addHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
    } else if (action === 'saveSchedule') {
      if (data.data) {
        saveCompleteData(data.data);
      } else {
        saveSchedule(data.assignments);
      }
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON)
        .addHeader('Access-Control-Allow-Origin', '*')
        .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        .addHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type');
  } catch (error) {
    Logger.log('❌ Error in doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({success: false, error: error.toString()})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

// ============= HELPER: Get JSON from cell A1 =============
function getDataFromCell() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    const cellValue = sheet.getRange('A1').getValue();
    
    if (!cellValue || cellValue === '') {
      Logger.log('⚠️ Cell A1 is empty');
      return { members: [], brands: {}, assignments: {} };
    }
    
    const parsed = JSON.parse(cellValue);
    Logger.log('✓ Data loaded from cell A1');
    
    // Backward compatibility: migrate 'schedule' to 'assignments' if needed
    if (parsed.schedule && !parsed.assignments) {
      parsed.assignments = parsed.schedule;
      Logger.log('⚠️ Migrated old data format from schedule to assignments');
    }
    
    return parsed;
  } catch (error) {
    Logger.log('❌ Error reading cell A1: ' + error);
    return { members: [], brands: {}, assignments: {} };
  }
}

// ============= HELPER: Save JSON to cell A1 =============
function saveDataToCell(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    sheet.getRange('A1').setValue(JSON.stringify(data));
    SpreadsheetApp.flush();
    Logger.log('✓ Data saved to cell A1');
    return true;
  } catch (error) {
    Logger.log('❌ Error saving to cell A1: ' + error);
    return false;
  }
}

// ============= GET MEMBERS =============
function getMembers() {
  try {
    const data = getDataFromCell();
    const members = data.members || [];
    Logger.log('✓ Loaded ' + members.length + ' members');
    return ContentService.createTextOutput(JSON.stringify(members)).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    Logger.log('❌ Error in getMembers: ' + error);
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}

// ============= GET BRANDS =============
function getBrands() {
  try {
    const data = getDataFromCell();
    const brands = data.brands || {};
    Logger.log('✓ Loaded ' + Object.keys(brands).length + ' brands');
    return ContentService.createTextOutput(JSON.stringify(brands)).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    Logger.log('❌ Error in getBrands: ' + error);
    return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}

// ============= GET SCHEDULE =============
function getSchedule() {
  try {
    const data = getDataFromCell();
    const schedule = data.assignments || {};
    Logger.log('✓ Loaded schedule with ' + Object.keys(schedule).length + ' days');
    return ContentService.createTextOutput(JSON.stringify(schedule)).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    Logger.log('❌ Error in getSchedule: ' + error);
    return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}

// ============= SAVE COMPLETE DATA =============
function saveCompleteData(completeData) {
  try {
    // Save complete structure: { members, brands, assignments }
    if (completeData && typeof completeData === 'object') {
      const dataToSave = {
        members: completeData.members || [],
        brands: completeData.brands || {},
        assignments: completeData.assignments || {}
      };
      saveDataToCell(dataToSave);
      Logger.log('✓ Saved complete data: ' + Object.keys(dataToSave.assignments).length + ' days');
      return true;
    }
    Logger.log('❌ Invalid data structure for saveCompleteData');
    return false;
  } catch (error) {
    Logger.log('❌ Error in saveCompleteData: ' + error);
    return false;
  }
}

// ============= SAVE SCHEDULE =============
function saveSchedule(newSchedule) {
  try {
    const data = getDataFromCell();
    data.assignments = newSchedule;
    saveDataToCell(data);
    Logger.log('✓ Saved schedule with ' + Object.keys(newSchedule).length + ' days');
    return true;
  } catch (error) {
    Logger.log('❌ Error in saveSchedule: ' + error);
    return false;
  }
}

// ============= DEBUG: Show all sheet info =============
function debugSheets() {
  try {
    const data = getDataFromCell();
    
    const debugInfo = {
      spreadsheet: 'AppTiming',
      sheet: SHEET_NAME,
      dataLocation: 'Cell A1 contains complete JSON',
      members: {
        count: data.members ? data.members.length : 0,
        list: data.members ? data.members.slice(0, 5) : []
      },
      brands: {
        count: data.brands ? Object.keys(data.brands).length : 0,
        list: data.brands ? Object.keys(data.brands).slice(0, 5) : []
      },
      schedule: {
        days: data.assignments ? Object.keys(data.assignments).length : 0,
        firstDate: data.assignments ? Object.keys(data.assignments)[0] : null,
        lastDate: data.assignments ? Object.keys(data.assignments)[Object.keys(data.assignments).length - 1] : null
      }
    };
    
    Logger.log('🔍 DEBUG: ' + JSON.stringify(debugInfo, null, 2));
    return ContentService.createTextOutput(JSON.stringify(debugInfo)).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    Logger.log('❌ Error in debugSheets: ' + error);
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}

// ============= INITIALIZE DATA =============
function initializeData() {
  try {
    const initialData = {
      members: ["Open Seat"],
      brands: {},
      assignments: {}
    };
    
    saveDataToCell(initialData);
    Logger.log('✓ Data initialized in cell A1');
    return ContentService.createTextOutput(JSON.stringify({success: true, message: 'Data initialized'})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  } catch (error) {
    Logger.log('❌ Error initializing data: ' + error);
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON)
      .addHeader('Access-Control-Allow-Origin', '*');
  }
}
