const SPREADSHEET_ID = '1zTHQuHZN3gBRPASAg2hn8CN0qBiC3cl-b1nqDglju4c';

function doGet(e) {
  const action = e.parameter.action;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  try {
    if (action === 'getMembers') {
      return getSheetData(sheet, 'Team_Members', 'NAME_TEAM_MEMBERS');
    } else if (action === 'getBrands') {
      return getBrandsData(sheet);
    } else if (action === 'getSchedule') {
      return getScheduleData(sheet);
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  try {
    if (action === 'addMember') {
      addRow(sheet, 'Team_Members', [data.name]);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'addBrand') {
      addRow(sheet, 'Brands', [data.id, data.name, data.color, data.order]);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'saveSchedule') {
      saveScheduleData(sheet, data.assignments);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetData(spreadsheet, sheetName, columnFilter = null) {
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // If columnFilter is specified, return just the values from that column
    if (columnFilter) {
      const columnIndex = headers.indexOf(columnFilter);
      if (columnIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      const values = data.slice(1).map(row => row[columnIndex]).filter(v => v !== '');
      return ContentService.createTextOutput(JSON.stringify(values)).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Otherwise return full objects
    const rows = data.slice(1).map(row => {
      let obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getBrandsData(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName('Brands');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      let obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getScheduleData(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName('Schedule');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
    }
    const cell = sheet.getRange('A1').getValue();
    if (!cell || cell === '') {
      return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
    }
    const parsed = JSON.parse(cell);
    
    // Create mapping of brand IDs to simplified names (b1, b2, b3, etc)
    const brandsSheet = spreadsheet.getSheetByName('Brands');
    const brandsData = brandsSheet.getDataRange().getValues();
    const brandsHeaders = brandsData[0];
    const idIndex = brandsHeaders.indexOf('ID_BRANDS');
    
    const brandMapping = {};
    let brandCounter = 1;
    for (let i = 1; i < brandsData.length; i++) {
      const brandId = brandsData[i][idIndex];
      if (brandId && brandId !== '') {
        brandMapping[brandId] = 'b' + brandCounter;
        brandCounter++;
      }
    }
    
    // Replace long brand IDs with simplified names in the schedule
    const simplifiedSchedule = {};
    for (const date in parsed) {
      simplifiedSchedule[date] = {};
      for (const member in parsed[date]) {
        const assignments = parsed[date][member];
        simplifiedSchedule[date][member] = assignments.map(assignment => {
          if (assignment && brandMapping[assignment]) {
            return brandMapping[assignment];
          }
          return assignment; // Keep LUNCH and null as-is
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(simplifiedSchedule)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error reading schedule: ' + error);
    return ContentService.createTextOutput(JSON.stringify({})).setMimeType(ContentService.MimeType.JSON);
  }
}

function addRow(spreadsheet, sheetName, values) {
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    sheet.appendRow(values);
    return true;
  } catch (error) {
    Logger.log('Error adding row: ' + error);
    return false;
  }
}

function saveScheduleData(spreadsheet, scheduleData) {
  try {
    const sheet = spreadsheet.getSheetByName('Schedule');
    if (!sheet) {
      Logger.log('Schedule sheet not found');
      return false;
    }
    
    // Create reverse mapping of simplified names (b1, b2, b3) to brand IDs
    const brandsSheet = spreadsheet.getSheetByName('Brands');
    const brandsData = brandsSheet.getDataRange().getValues();
    const brandsHeaders = brandsData[0];
    const idIndex = brandsHeaders.indexOf('ID_BRANDS');
    
    const brandMapping = {};
    let brandCounter = 1;
    for (let i = 1; i < brandsData.length; i++) {
      const brandId = brandsData[i][idIndex];
      if (brandId && brandId !== '') {
        brandMapping['b' + brandCounter] = brandId;
        brandCounter++;
      }
    }
    
    // Convert simplified names back to long IDs before saving
    const expandedSchedule = {};
    for (const date in scheduleData) {
      expandedSchedule[date] = {};
      for (const member in scheduleData[date]) {
        const assignments = scheduleData[date][member];
        expandedSchedule[date][member] = assignments.map(assignment => {
          if (assignment && brandMapping[assignment]) {
            return brandMapping[assignment];
          }
          return assignment; // Keep LUNCH and null as-is
        });
      }
    }
    
    const jsonString = JSON.stringify(expandedSchedule);
    sheet.getRange('A1').setValue(jsonString);
    SpreadsheetApp.flush();
    Logger.log('Schedule saved and flushed: ' + jsonString.substring(0, 100) + '...');
    return true;
  } catch (error) {
    Logger.log('Error saving schedule: ' + error);
    return false;
  }
}
