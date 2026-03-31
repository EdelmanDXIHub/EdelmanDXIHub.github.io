const SPREADSHEET_ID = '1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c';
const SHEET_NAME = 'Schedule';

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'debugSheets') {
      return debugSheets();
    } else if (action === 'getMembers') {
      return getMembers();
    } else if (action === 'getBrands') {
      return getBrands();
    } else if (action === 'getSchedule') {
      return getSchedule();
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  try {
    if (action === 'saveSchedule') {
      saveSchedule(data.schedule);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
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
      return { members: [], brands: {}, schedule: {} };
    }
    
    const parsed = JSON.parse(cellValue);
    Logger.log('✓ Data loaded from cell A1');
    return parsed;
  } catch (error) {
    Logger.log('❌ Error reading cell A1: ' + error);
    return { members: [], brands: {}, schedule: {} };
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
    return ContentService.createTextOutput(JSON.stringify(members)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Error in getMembers: ' + error);
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============= GET BRANDS =============
function getBrands() {
  try {
    const data = getDataFromCell();
    const brands = data.brands || {};
    Logger.log('✓ Loaded ' + Object.keys(brands).length + ' brands');
    return ContentService.createTextOutput(JSON.stringify(brands)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Error in getBrands: ' + error);
    return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============= GET SCHEDULE =============
function getSchedule() {
  try {
    const data = getDataFromCell();
    const schedule = data.schedule || {};
    Logger.log('✓ Loaded schedule with ' + Object.keys(schedule).length + ' days');
    return ContentService.createTextOutput(JSON.stringify(schedule)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Error in getSchedule: ' + error);
    return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============= SAVE SCHEDULE =============
function saveSchedule(newSchedule) {
  try {
    const data = getDataFromCell();
    data.schedule = newSchedule;
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
        days: data.schedule ? Object.keys(data.schedule).length : 0,
        firstDate: data.schedule ? Object.keys(data.schedule)[0] : null,
        lastDate: data.schedule ? Object.keys(data.schedule)[Object.keys(data.schedule).length - 1] : null
      }
    };
    
    Logger.log('🔍 DEBUG: ' + JSON.stringify(debugInfo, null, 2));
    return ContentService.createTextOutput(JSON.stringify(debugInfo)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Error in debugSheets: ' + error);
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
