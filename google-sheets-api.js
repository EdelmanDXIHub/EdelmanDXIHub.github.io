// Google Apps Script endpoint
const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbzxK0u26mDGZqjLx0YlPM2_VxQBetAqSs_eUr3-upe_7IbCcHPk08huiMYVMESWfilVcw/exec';

// Fetch members from Google Sheets
async function fetchMembers() {
  try {
    const response = await fetch(`${GOOGLE_SHEETS_API}?action=getMembers`);
    const data = await response.json();
    if (Array.isArray(data)) {
      return data.map(row => row['NAME_TEAM_MEMBERS'] || row['Name'] || '').filter(name => name);
    }
    return [];
  } catch (error) {
    console.error('Error fetching members:', error);
    return [];
  }
}

// Fetch brands from Google Sheets
async function fetchBrands() {
  try {
    const response = await fetch(`${GOOGLE_SHEETS_API}?action=getBrands`);
    const data = await response.json();
    if (Array.isArray(data)) {
      return data.map(row => ({
        id: row['ID_BRANDS'] || row['BrandId'] || '',
        name: row['BransName_BRAN...'] || row['BrandName'] || '',
        color: row['Color_BRANDS'] || row['Color'] || '#000000',
        order: row['ORDER_BRANDS'] || 0
      })).filter(b => b.id && b.name);
    }
    return [];
  } catch (error) {
    console.error('Error fetching brands:', error);
    return [];
  }
}

// Add member to Google Sheets
async function addMemberToSheets(name) {
  try {
    const response = await fetch(GOOGLE_SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'addMember',
        name: name
      })
    });
    const result = await response.json();
    return result.success || false;
  } catch (error) {
    console.error('Error adding member:', error);
    return false;
  }
}

// Add brand to Google Sheets
async function addBrandToSheets(id, name, color, order) {
  try {
    const response = await fetch(GOOGLE_SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'addBrand',
        id: id,
        name: name,
        color: color,
        order: order
      })
    });
    const result = await response.json();
    return result.success || false;
  } catch (error) {
    console.error('Error adding brand:', error);
    return false;
  }
}

// Save schedule changes to Google Sheets
async function saveScheduleToSheets(scheduleData) {
  try {
    const response = await fetch(GOOGLE_SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveSchedule',
        data: scheduleData
      })
    });
    const result = await response.json();
    return result.success || false;
  } catch (error) {
    console.error('Error saving schedule:', error);
    return false;
  }
}
