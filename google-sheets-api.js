// Google Apps Script endpoint
const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbzQaqZnabbXXgbtmqyhkmg0myib7rvoahpLD3o1l-zU47lrdEYAJU2_hQ_rqEkDmt_7/exec';

// Fetch members from Google Sheets
async function fetchMembers() {
  try {
    console.log('Fetching members from Google Sheets...');
    const response = await fetch(`${GOOGLE_SHEETS_API}?action=getMembers`);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Members data received:', data);
    
    if (Array.isArray(data)) {
      const members = data
        .map(row => {
          console.log('Processing row:', row);
          return row['NAME_TEAM_MEMBERS'] || row['Name'] || row['name'] || '';
        })
        .filter(name => name && name.trim());
      
      console.log('Final members:', members);
      return members;
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
    console.log('Fetching brands from Google Sheets...');
    const response = await fetch(`${GOOGLE_SHEETS_API}?action=getBrands`);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Brands data received:', data);
    
    if (Array.isArray(data)) {
      const brands = data
        .map(row => {
          console.log('Processing brand row:', row);
          return {
            id: row['ID_BRANDS'] || row['BrandId'] || row['id'] || '',
            name: row['BransName_BRAN...'] || row['BrandName'] || row['name'] || '',
            color: row['Color_BRANDS'] || row['Color'] || row['color'] || '#000000',
            order: row['ORDER_BRANDS'] || row['Order'] || row['order'] || 0
          };
        })
        .filter(b => b.id && b.name);
      
      console.log('Final brands:', brands);
      return brands;
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
    console.log('Adding member:', name);
    const response = await fetch(GOOGLE_SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'addMember',
        name: name
      })
    });
    const result = await response.json();
    console.log('Add member result:', result);
    return result.success || false;
  } catch (error) {
    console.error('Error adding member:', error);
    return false;
  }
}

// Add brand to Google Sheets
async function addBrandToSheets(id, name, color, order) {
  try {
    console.log('Adding brand:', id, name, color, order);
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
    console.log('Add brand result:', result);
    return result.success || false;
  } catch (error) {
    console.error('Error adding brand:', error);
    return false;
  }
}

// Save schedule changes to Google Sheets
async function saveScheduleToSheets(scheduleData) {
  try {
    console.log('Saving schedule to Google Sheets...');
    const response = await fetch(GOOGLE_SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveSchedule',
        assignments: scheduleData
      })
    });
    const result = await response.json();
    console.log('Schedule saved result:', result);
    return result.success || false;
  } catch (error) {
    console.error('Error saving schedule:', error);
    return false;
  }
}

// Load schedule from Google Sheets
async function loadScheduleFromSheets() {
  try {
    console.log('Loading schedule from Google Sheets...');
    const response = await fetch(`${GOOGLE_SHEETS_API}?action=getSchedule`);
    console.log('Schedule response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Schedule data received:', data);
    
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      console.log('Schedule loaded from Google Sheets');
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error loading schedule:', error);
    return null;
  }
}
