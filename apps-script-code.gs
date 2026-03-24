function doGet(e) {
  const action = e.parameter.action;
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    if (action === 'getMembers') {
      return getSheetData(sheet, 'Team_Members', 'NAME_TEAM_MEMBERS');
    } else if (action === 'getBrands') {
      return getBrandsData(sheet);
    } else if (action === 'getSchedule') {
      return getSheetData(sheet, 'Schedule');
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Invalid action'})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    if (action === 'addMember') {
      addRow(sheet, 'Team_Members', [data.name]);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'addBrand') {
      addRow(sheet, 'Brands', [data.id, data.name, data.color, data.order]);
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } else if (action === 'saveSchedule') {
      // Handle schedule updates
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
    const rows = data.slice(1).map(row => {
      let obj = {};
      headers.forEach((header, i) => {
        if (columnFilter && header !== columnFilter) return;
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
