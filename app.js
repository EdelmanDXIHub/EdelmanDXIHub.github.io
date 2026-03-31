console.log('app.js loaded');

const STORAGE_KEY = "dxi-timing-map-feb-2026-v8";
const PRELOADED = window.PRELOADED_DATA || null;

const fallbackColors = ["#2D6A4F", "#1D3557", "#8F2D56", "#CA6702", "#6A4C93", "#264653", "#386641", "#9D4EDD"];

const defaultMembers = PRELOADED?.members || ["Open Seat"];
// No default brands - user must create brands manually
const defaultBrands = (PRELOADED?.brands || [])
  .filter(brand => brand.name && brand.name.trim() !== '') // Only include non-empty brands
  .map((brand, idx) => ({
    ...brand,
    color: brand.color === "#000000" ? fallbackColors[idx % fallbackColors.length] : brand.color
  }));

const slots = buildSlots();
const lunchSlots = new Set(slots.filter((s) => s.isLunch).map((s) => s.index));
const weekdays = buildFebruaryWeekdays();
const weeks = chunkWeekdays(weekdays, 5);

// Map to store brand ID to simplified name mapping (b1, b2, b3, etc.)
let brandIdToSimplified = {};
let simplifiedToBrandId = {};

// Function to create brand mapping from loaded brands
function createBrandMapping(brands) {
  brandIdToSimplified = {};
  simplifiedToBrandId = {};
  brands.forEach((brand, idx) => {
    const simplifiedId = 'b' + (idx + 1);
    brandIdToSimplified[brand.id] = simplifiedId;
    simplifiedToBrandId[simplifiedId] = brand.id;
  });
  console.log('✓ Brand mapping created:', brandIdToSimplified);
}

// Will be initialized after Google Sheets loads
let state;
let selectedBrandId;
let paintMode = "brand";
let isMouseDown = false;

const layoutMain = document.getElementById("layoutMain");
const totalsPanel = document.getElementById("totalsPanel");
const toggleTotalsBtn = document.getElementById("toggleTotalsBtn");
const scheduleHead = document.getElementById("scheduleHead");
const scheduleBody = document.getElementById("scheduleBody");
const brandPalette = document.getElementById("brandPalette");
const brandTemplate = document.getElementById("brandTemplate");
const brandTotals = document.getElementById("brandTotals");
const memberTotals = document.getElementById("memberTotals");
const eraserBtn = document.getElementById("eraserBtn");
const clearMonthBtn = document.getElementById("clearMonthBtn");
const addMemberBtn = document.getElementById("addMemberBtn");
const addBrandBtn = document.getElementById("addBrandBtn");
const refreshFromSheetBtn = document.getElementById("refreshFromSheetBtn");
const exportExcelBtn = document.getElementById("exportExcelBtn");
const templateFileInput = document.getElementById("templateFileInput");

// Loading & status indicators
const loadingIndicator = document.getElementById("loadingIndicator");
const statusMessage = document.getElementById("statusMessage");

// Context menu for member actions
const memberContextMenu = document.getElementById("memberContextMenu");
const contextEditMember = document.getElementById("contextEditMember");
const contextDeleteMember = document.getElementById("contextDeleteMember");
let selectedMemberForAction = null;

// Initialize the app
initApp();

// Helper functions for UI feedback
function showLoading(show = true) {
  loadingIndicator.style.display = show ? "block" : "none";
}

function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = "block";
  
  // Auto-hide after 5 seconds
  if (type === "success") {
    setTimeout(() => {
      statusMessage.style.display = "none";
    }, 5000);
  }
}

async function refreshFromSheet() {
  try {
    refreshFromSheetBtn.disabled = true;
    showLoading(true);
    console.log('🔄 Manual refresh from Google Sheet initiated...');
    
    // Load fresh complete data from Google Sheets
    const completeData = await loadCompleteDataFromSheets();
    
    if (completeData && completeData.schedule !== null) {
      console.log('✓ Complete data refreshed from Google Sheets');
      
      // Update members if changed
      if (completeData.members && Array.isArray(completeData.members) && completeData.members.length > 0) {
        const newMembers = completeData.members.map(m => m['NAME_TEAM_MEMBERS'] || m.name || m).filter(m => m && typeof m === 'string');
        if (newMembers.length > 0 && JSON.stringify(newMembers) !== JSON.stringify(state.members)) {
          console.log('Members updated:', newMembers.length);
          state.members = newMembers;
          
          // Rebuild assignments with new members
          const oldAssignments = state.assignments;
          state.assignments = {};
          for (const day of weekdays) {
            state.assignments[day.key] = {};
            for (const member of state.members) {
              if (oldAssignments[day.key] && oldAssignments[day.key][member]) {
                state.assignments[day.key][member] = oldAssignments[day.key][member];
              } else {
                state.assignments[day.key][member] = Array.from({ length: slots.length }, (_, i) => 
                  lunchSlots.has(i) ? "LUNCH" : null
                );
              }
            }
          }
        }
      }
      
      // Update brands if changed
      if (completeData.brands && Array.isArray(completeData.brands) && completeData.brands.length > 0) {
        const processedBrands = completeData.brands.map(b => ({
          id: b['ID_BRANDS'] || b.id || '',
          name: b['BransName_BRAN...'] || b.name || '',
          color: b['Color_BRANDS'] || b.color || '#000000',
          order: b['ORDER_BRANDS'] || b.order || 0
        })).filter(b => b.id && b.name);
        
        if (processedBrands.length > 0) {
          const brandsWithOldIds = ensureRequiredBrands(processedBrands);
          // Create brand mapping for data conversion
          createBrandMapping(brandsWithOldIds);
          // Simplify brand IDs
          state.brands = brandsWithOldIds.map((brand, idx) => ({
            ...brand,
            id: 'b' + (idx + 1)
          }));
          console.log('✓ Brands updated and simplified:', state.brands.map(b => b.id).join(', '));
        }
      }
      
      // Update assignments
      Object.assign(state.assignments, completeData.schedule);
      
      saveState();
      
      // Re-render UI
      renderPalette();
      renderTable();
      renderTotals();
      
      showLoading(false);
      showStatus("✓ All data synced from Google Sheet!", "success");
      console.log('✓ Refresh complete - all data updated');
    } else {
      showLoading(false);
      showStatus("⚠ No data in Google Sheet. Using local version.", "error");
      console.warn('Google Sheet returned empty data');
    }
  } catch (error) {
    showLoading(false);
    console.error('💥 Error refreshing from sheet:', error);
    showStatus("Failed to sync. Check console for details.", "error");
  } finally {
    refreshFromSheetBtn.disabled = false;
  }
}

async function initApp() {
  try {
    showLoading(true);
    console.log('🚀 Starting app initialization...');
    console.log('Loading COMPLETE data from Google Sheets (members, brands, schedule)...');
    
    // Load all data from Google Sheets
    const completeData = await loadCompleteDataFromSheets();
    
    if (completeData && completeData.schedule !== null) {
      console.log('✓ Complete synchronized data loaded from Google Sheets');
      // Store data from Google Sheets for use in init()
      window.GOOGLE_SHEETS_SCHEDULE = completeData.schedule || {};
      window.GOOGLE_SHEETS_MEMBERS = completeData.members || [];
      window.GOOGLE_SHEETS_BRANDS = completeData.brands || [];
    } else {
      console.warn('⚠ Google Sheets load failed, will use local data as fallback');
      window.GOOGLE_SHEETS_SCHEDULE = null;
      window.GOOGLE_SHEETS_MEMBERS = null;
      window.GOOGLE_SHEETS_BRANDS = null;
    }
    
  } catch (error) {
    console.error('💥 Critical error loading data from Google Sheets:', error);
    window.GOOGLE_SHEETS_SCHEDULE = null;
    window.GOOGLE_SHEETS_MEMBERS = null;
    window.GOOGLE_SHEETS_BRANDS = null;
  } finally {
    showLoading(false);
  }
  
  // Now initialize the UI with loaded data
  init();
}

function init() {
  console.log('📋 Initializing UI with fresh data...');
  
  // Determine members and brands to use
  let syncedMembers = defaultMembers;
  let syncedBrands = defaultBrands;
  
  // Use Google Sheets data if available
  if (window.GOOGLE_SHEETS_MEMBERS && Array.isArray(window.GOOGLE_SHEETS_MEMBERS) && window.GOOGLE_SHEETS_MEMBERS.length > 0) {
    console.log('✓ Using members from Google Sheets:', window.GOOGLE_SHEETS_MEMBERS.length);
    const membersSet = new Set(window.GOOGLE_SHEETS_MEMBERS.map(m => m['NAME_TEAM_MEMBERS'] || m.name || m).filter(m => m && typeof m === 'string'));
    syncedMembers = membersSet.size > 0 ? Array.from(membersSet) : defaultMembers;
  }
  
  if (window.GOOGLE_SHEETS_BRANDS && Array.isArray(window.GOOGLE_SHEETS_BRANDS) && window.GOOGLE_SHEETS_BRANDS.length > 0) {
    console.log('✓ Using brands from Google Sheets:', window.GOOGLE_SHEETS_BRANDS.length);
    const processedBrands = window.GOOGLE_SHEETS_BRANDS.map(b => ({
      id: b['ID_BRANDS'] || b.id || '',
      name: b['BransName_BRAN...'] || b.name || '',
      color: b['Color_BRANDS'] || b.color || '#000000',
      order: b['ORDER_BRANDS'] || b.order || 0
    })).filter(b => b.id && b.name);
    
    if (processedBrands.length > 0) {
      syncedBrands = ensureRequiredBrands(processedBrands);
      // Create brand mapping (old ID -> b1, b2, b3, etc)
      createBrandMapping(syncedBrands);
      // Update brand IDs to simplified names
      syncedBrands = syncedBrands.map((brand, idx) => ({
        ...brand,
        id: 'b' + (idx + 1)
      }));
      console.log('✓ Brands simplified to:', syncedBrands.map(b => b.id).join(', '));
    }
  }
  
  // If we have Google Sheets data, use it as source of truth
  if (window.GOOGLE_SHEETS_SCHEDULE !== null) {
    console.log('✓ Using schedule from Google Sheets as source of truth');
    
    // Create initial state structure with synced members and brands
    state = {
      members: syncedMembers,
      brands: syncedBrands,
      assignments: {},
      selectedBrandId: syncedBrands[0]?.id || null
    };
    
    // Initialize all assignments
    for (const day of weekdays) {
      state.assignments[day.key] = {};
      for (const member of state.members) {
        state.assignments[day.key][member] = Array.from({ length: slots.length }, (_, i) => 
          lunchSlots.has(i) ? "LUNCH" : null
        );
      }
    }
    
    // Overlay Google Sheets assignments
    const sheetsData = window.GOOGLE_SHEETS_SCHEDULE || {};
    for (const dayKey in sheetsData) {
      if (state.assignments[dayKey]) {
        Object.assign(state.assignments[dayKey], sheetsData[dayKey]);
      }
    }
    
    console.log('✓ State synced with Google Sheets data');
  } else {
    // Fallback to local state only if Google Sheets completely failed
    console.warn('⚠ Google Sheets unavailable, falling back to local storage');
    state = loadState() || {
      members: syncedMembers,
      brands: syncedBrands,
      assignments: {},
      selectedBrandId: syncedBrands[0]?.id || null
    };
  }
  
  selectedBrandId = state.selectedBrandId || state.brands[0]?.id || null;
  
  applyTotalsCollapse(localStorage.getItem("dxi-totals-collapsed") === "1");
  renderPalette();
  renderTable();
  renderTotals();
  attachEvents();
  
  // Save the updated state locally for offline access
  saveState();
  console.log('✓ Local state saved');
}

function ensureRequiredBrands(brands) {
  // No automatic brands - user must create them manually
  return [...brands];
}

function buildSlots() {
  const built = [];
  let idx = 0;
  for (let hour = 8; hour < 17; hour += 1) {
    for (const minute of [0, 30]) {
      built.push({ index: idx, label: toLabel(hour, minute), hour, minute, isLunch: hour === 13 });
      idx += 1;
    }
  }
  return built;
}

function buildFebruaryWeekdays() {
  const out = [];
  for (let day = 1; day <= 28; day += 1) {
    const date = new Date(2026, 1, day);
    const weekDay = date.getDay();
    if (weekDay === 0 || weekDay === 6) continue;
    const key = `2026-02-${String(day).padStart(2, "0")}`;
    out.push({ key, day, label: `${date.toLocaleDateString("en-US", { weekday: "short" })} ${day}` });
  }
  return out;
}

function chunkWeekdays(days, size) {
  const out = [];
  for (let i = 0; i < days.length; i += size) out.push(days.slice(i, i + size));
  return out;
}

function createInitialState() {
  const assignments = {};
  for (const day of weekdays) {
    assignments[day.key] = {};
    for (const member of defaultMembers) {
      let row = Array.from({ length: slots.length }, (_, i) => (lunchSlots.has(i) ? "LUNCH" : null));
      if (PRELOADED?.assignments?.[day.key]?.[member]) {
        const pre = PRELOADED.assignments[day.key][member];
        row = pre.map((v, i) => (lunchSlots.has(i) ? "LUNCH" : v || null));
      }
      assignments[day.key][member] = row;
    }
  }
  return { members: [...defaultMembers], brands: [...defaultBrands], assignments, selectedBrandId: defaultBrands[0]?.id };
}

function loadState() {
  try {
    // Priority 1: Try to load schedule from Google Sheets first (for sync across devices)
    if (window.GOOGLE_SHEETS_SCHEDULE && Object.keys(window.GOOGLE_SHEETS_SCHEDULE).length > 0) {
      console.log('Loading state from Google Sheets');
      const state = {
        members: [...defaultMembers],
        brands: [...defaultBrands],
        assignments: window.GOOGLE_SHEETS_SCHEDULE,
        selectedBrandId: defaultBrands[0]?.id
      };
      
      // Ensure all days and members exist
      for (const day of weekdays) {
        state.assignments[day.key] ||= {};
        for (const member of state.members) {
          state.assignments[day.key][member] ||= Array.from({ length: slots.length }, () => null);
          for (const slot of slots) if (slot.isLunch) state.assignments[day.key][member][slot.index] = "LUNCH";
        }
      }
      
      return state;
    }
    
    // Priority 2: Try to load from PRELOADED_DATA (data.js initial schedule)
    if (PRELOADED?.assignments && Object.keys(PRELOADED.assignments).length > 0) {
      console.log('Loading state from data.js (PRELOADED_DATA)');
      const state = {
        members: [...defaultMembers],
        brands: [...defaultBrands],
        assignments: JSON.parse(JSON.stringify(PRELOADED.assignments)), // Deep copy
        selectedBrandId: defaultBrands[0]?.id
      };
      
      // Ensure all days and members exist
      for (const day of weekdays) {
        state.assignments[day.key] ||= {};
        for (const member of state.members) {
          state.assignments[day.key][member] ||= Array.from({ length: slots.length }, () => null);
          for (const slot of slots) if (slot.isLunch) state.assignments[day.key][member][slot.index] = "LUNCH";
        }
      }
      
      return state;
    }
    
    // Priority 3: Fallback to localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.assignments) return null;

    const state = {
      members: [...defaultMembers],
      brands: [...defaultBrands],
      assignments: parsed.assignments,
      selectedBrandId: defaultBrands[0]?.id
    };

    for (const day of weekdays) {
      state.assignments[day.key] ||= {};
      for (const member of state.members) {
        state.assignments[day.key][member] ||= Array.from({ length: slots.length }, () => null);
        for (const slot of slots) if (slot.isLunch) state.assignments[day.key][member][slot.index] = "LUNCH";
      }
    }
    
    console.log('Loaded state from localStorage');
    return state;
  } catch {
    return null;
  }
}

function saveState() {
  // Save to localStorage
  const toSave = {
    assignments: state.assignments,
    selectedBrandId: selectedBrandId
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  
  // Save to Google Sheets and refresh data
  saveScheduleToSheets(state.assignments)
    .then(success => {
      if (success) {
        console.log('✓ Schedule saved to Google Sheets, refreshing data...');
        // Wait a moment for Google Sheets to process, then reload the data
        setTimeout(() => {
          loadCompleteDataFromSheets().then(() => {
            renderTable();
            renderTotals();
            console.log('✓ Data refreshed from Google Sheets');
          });
        }, 500);
      } else {
        console.error('Failed to save to Google Sheets');
      }
    })
    .catch(error => {
      console.error('Failed to sync to Google Sheets:', error);
    });
}

async function resetBrandsToGeneralOnly() {
  try {
    console.log('🔄 Resetting brands to General only...');
    const response = await fetch('https://script.google.com/macros/d/AKfycbxaA1DTWe_5ecFbQO_J7F5Qvez7VB4D5lh2CxNDLVhRRnDgMGlqMGlvZG1Sm41m7Kg/usercontent?action=resetBrands');
    const result = await response.json();
    if (result.success) {
      console.log('✓ Brands reset successfully');
      showStatus('✓ Brands reset to General only!', 'success');
      // Refresh the page after a short delay
      setTimeout(() => window.location.reload(), 1000);
    } else {
      console.error('Failed to reset brands:', result);
      showStatus('Failed to reset brands', 'error');
    }
  } catch (error) {
    console.error('Error resetting brands:', error);
    showStatus('Error resetting brands. Check console.', 'error');
  }
}

function renderPalette() {
  brandPalette.innerHTML = "";
  for (const brand of state.brands) {
    const node = brandTemplate.content.firstElementChild.cloneNode(true);
    const radio = node.querySelector("input");
    const swatch = node.querySelector(".swatch");
    const name = node.querySelector(".brand-name");
    radio.value = brand.id;
    radio.checked = paintMode === "brand" && selectedBrandId === brand.id;
    swatch.style.background = brand.color;
    name.textContent = brand.name;
    radio.addEventListener("change", () => {
      selectedBrandId = brand.id;
      paintMode = "brand";
      updateEraserVisual();
      saveState();
    });
    node.addEventListener("dblclick", () => editBrand(brand.id));
    brandPalette.appendChild(node);
  }
  updateEraserVisual();
}

function renderTable() {
  scheduleHead.innerHTML = "";
  scheduleBody.innerHTML = "";

  for (let w = 0; w < weeks.length; w += 1) {
    const weekDays = weeks[w];

    const weekRow = document.createElement("tr");
    weekRow.className = "week-title";
    const weekTh = document.createElement("th");
    weekTh.colSpan = 1 + weekDays.length * slots.length + (weekDays.length - 1);
    weekTh.textContent = `Week ${w + 1}`;
    weekRow.appendChild(weekTh);
    scheduleBody.appendChild(weekRow);

    const dayRow = document.createElement("tr");
    dayRow.className = "day-header";
    const dayFirst = document.createElement("th");
    dayFirst.className = "member-head";
    dayFirst.textContent = "Team Member (Month h)";
    dayRow.appendChild(dayFirst);

    for (let i = 0; i < weekDays.length; i += 1) {
      const day = weekDays[i];
      const th = document.createElement("th");
      th.colSpan = slots.length;
      th.textContent = day.label;
      dayRow.appendChild(th);
      if (i < weekDays.length - 1) {
        const gap = document.createElement("th");
        gap.className = "day-gap";
        dayRow.appendChild(gap);
      }
    }
    scheduleBody.appendChild(dayRow);

    const slotRow = document.createElement("tr");
    slotRow.className = "time-header";
    const slotFirst = document.createElement("th");
    slotFirst.className = "member-head";
    slotRow.appendChild(slotFirst);

    for (let i = 0; i < weekDays.length; i += 1) {
      for (const slot of slots) {
        const th = document.createElement("th");
        th.textContent = compactSlotLabel(slot);
        if (slot.isLunch) th.style.background = "#e3e8e4";
        slotRow.appendChild(th);
      }
      if (i < weekDays.length - 1) {
        const gap = document.createElement("th");
        gap.className = "day-gap";
        slotRow.appendChild(gap);
      }
    }
    scheduleBody.appendChild(slotRow);

    for (const member of state.members) {
      const tr = document.createElement("tr");
      const memberCell = document.createElement("td");
      memberCell.className = "member-cell";
      memberCell.textContent = `${member} (${memberMonthHours(member).toFixed(1)}h)`;
      // Add context menu for member actions
      memberCell.addEventListener("contextmenu", (event) => {
        showMemberContextMenu(event, member);
      });
      tr.appendChild(memberCell);

      for (let i = 0; i < weekDays.length; i += 1) {
        const day = weekDays[i];
        for (const slot of slots) {
          const td = document.createElement("td");
          td.className = "slot-cell";
          td.dataset.member = member;
          td.dataset.slot = String(slot.index);
          td.dataset.day = day.key;
          if (slot.isLunch) {
            td.classList.add("lunch");
            td.textContent = "L";
          }
          paintCell(td, state.assignments[day.key][member][slot.index]);
          tr.appendChild(td);
        }
        if (i < weekDays.length - 1) {
          const gap = document.createElement("td");
          gap.className = "day-gap";
          tr.appendChild(gap);
        }
      }

      scheduleBody.appendChild(tr);
    }
  }
}

function compactSlotLabel(slot) {
  return slot.minute === 0 ? String(slot.hour) : `${slot.hour}.5`;
}

function paintCell(cell, value) {
  if (cell.classList.contains("lunch")) return;
  if (!value) {
    cell.style.background = "#ffffff";
    cell.title = "";
    return;
  }
  const brand = state.brands.find((b) => b.id === value);
  cell.style.background = brand?.color || "#ffffff";
  cell.title = brand?.name || "";
}

function renderTotals() {
  const brandMap = new Map();
  const memberMap = new Map();

  for (const member of state.members) {
    let memberHalfHours = 0;
    for (const day of weekdays) {
      const arr = state.assignments[day.key][member];
      for (let i = 0; i < arr.length; i += 1) {
        const value = arr[i];
        if (lunchSlots.has(i) || !value) continue;
        memberHalfHours += 1;
        brandMap.set(value, (brandMap.get(value) || 0) + 1);
      }
    }
    memberMap.set(member, memberHalfHours * 0.5);
  }

  const brandEntries = [...brandMap.entries()]
    .map(([brandId, hh]) => ({ brand: state.brands.find((b) => b.id === brandId)?.name || "Unknown", hours: hh * 0.5 }))
    .sort((a, b) => b.hours - a.hours || a.brand.localeCompare(b.brand));

  const memberEntries = [...memberMap.entries()]
    .map(([member, hours]) => ({ member, hours }))
    .sort((a, b) => b.hours - a.hours || a.member.localeCompare(b.member));

  brandTotals.innerHTML = renderTotalList(brandEntries.map((x) => ({ key: x.brand, value: `${x.hours.toFixed(1)} h` })), "No brand assignments yet");
  memberTotals.innerHTML = renderTotalList(memberEntries.map((x) => ({ key: x.member, value: `${x.hours.toFixed(1)} h` })), "No member totals yet");
}

function renderTotalList(items, emptyText) {
  if (!items.length) return `<p>${emptyText}</p>`;
  return `<ul class="total-list">${items.map((item) => `<li><span>${escapeHtml(item.key)}</span><strong>${item.value}</strong></li>`).join("")}</ul>`;
}

function memberMonthHours(member) {
  let hh = 0;
  for (const day of weekdays) {
    const arr = state.assignments[day.key][member];
    for (let i = 0; i < arr.length; i += 1) {
      if (lunchSlots.has(i)) continue;
      if (arr[i]) hh += 1;
    }
  }
  return hh * 0.5;
}

function applyToCell(member, dayKey, slotIndex) {
  if (lunchSlots.has(slotIndex)) return;
  state.assignments[dayKey][member][slotIndex] = paintMode === "erase" ? null : selectedBrandId;
  saveState();
}

// Member management functions

function showMemberContextMenu(event, memberName) {
  event.preventDefault();
  selectedMemberForAction = memberName;
  memberContextMenu.style.display = "block";
  memberContextMenu.style.left = event.clientX + "px";
  memberContextMenu.style.top = event.clientY + "px";
}

function hideMemberContextMenu() {
  memberContextMenu.style.display = "none";
  selectedMemberForAction = null;
}

async function editMember(memberName) {
  const newName = prompt(`Rename "${memberName}" to:`, memberName);
  if (!newName || !newName.trim()) return;
  
  const trimmedName = newName.trim();
  
  if (trimmedName === memberName) {
    hideMemberContextMenu();
    return;
  }
  
  if (state.members.includes(trimmedName)) {
    alert("A team member with that name already exists.");
    hideMemberContextMenu();
    return;
  }
  
  // Update member name in state
  const memberIndex = state.members.indexOf(memberName);
  if (memberIndex === -1) {
    hideMemberContextMenu();
    return;
  }
  
  state.members[memberIndex] = trimmedName;
  
  // Update all assignments for this member
  for (const day of weekdays) {
    const dayAssignments = state.assignments[day.key];
    dayAssignments[trimmedName] = dayAssignments[memberName];
    delete dayAssignments[memberName];
  }
  
  saveState();
  renderTable();
  renderTotals();
  hideMemberContextMenu();
}

async function deleteMember(memberName) {
  const confirmed = confirm(`Delete team member "${memberName}" from the schedule?\n\nThis cannot be undone.`);
  if (!confirmed) {
    hideMemberContextMenu();
    return;
  }
  
  // Remove member from state
  const memberIndex = state.members.indexOf(memberName);
  if (memberIndex === -1) {
    hideMemberContextMenu();
    return;
  }
  
  state.members.splice(memberIndex, 1);
  
  // Remove all assignments for this member
  for (const day of weekdays) {
    delete state.assignments[day.key][memberName];
  }
  
  saveState();
  renderTable();
  renderTotals();
  hideMemberContextMenu();
}

function attachEvents() {
  toggleTotalsBtn.addEventListener("click", () => {
    const collapsed = !totalsPanel.classList.contains("collapsed");
    applyTotalsCollapse(collapsed);
    localStorage.setItem("dxi-totals-collapsed", collapsed ? "1" : "0");
  });

  eraserBtn.addEventListener("click", () => {
    paintMode = paintMode === "erase" ? "brand" : "erase";
    updateEraserVisual();
  });

  clearMonthBtn.addEventListener("click", () => {
    if (!confirm("Clear all assignments for the full month?")) return;
    for (const day of weekdays) {
      for (const member of state.members) {
        state.assignments[day.key][member] = slots.map((slot) => (slot.isLunch ? "LUNCH" : null));
      }
    }
    renderTable();
    renderTotals();
    saveState();
  });

  addMemberBtn.addEventListener("click", async () => {
    const name = prompt("New team member name:");
    if (!name || !name.trim()) return;
    const clean = name.trim();
    if (state.members.includes(clean)) {
      alert("Team member already exists.");
      return;
    }
    
    // Add to Google Sheets
    const saved = await addMemberToSheets(clean);
    if (!saved) {
      // Still add locally if sheet save fails
      console.warn('Could not save member to Google Sheets');
    }
    
    state.members.push(clean);
    for (const day of weekdays) state.assignments[day.key][clean] = slots.map((slot) => (slot.isLunch ? "LUNCH" : null));
    renderTable();
    renderTotals();
    saveState();
  });

  addBrandBtn.addEventListener("click", async () => {
    const name = prompt("Brand name:");
    if (!name || !name.trim()) return;
    const color = prompt("Hex color (example: #1D3557):", "#1D3557");
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
      alert("Invalid color. Use format #RRGGBB");
      return;
    }
    // Generate simple brand ID: b1, b2, b3, etc based on count
    const id = `b${state.brands.length + 1}`;
    const cleanColor = color.trim().toUpperCase();
    
    // Add to Google Sheets
    const order = state.brands.length + 1;
    const saved = await addBrandToSheets(id, name.trim(), cleanColor, order);
    if (!saved) {
      console.warn('Could not save brand to Google Sheets');
    }
    
    state.brands.push({ id, name: name.trim(), color: cleanColor });
    selectedBrandId = id;
    paintMode = "brand";
    renderPalette();
    renderTable();
    saveState();
  });

  exportExcelBtn.addEventListener("click", async () => {
    if (!window.XlsxPopulate) {
      alert("Excel export library did not load. Please check your internet connection and reload.");
      return;
    }
    templateFileInput.click();
  });

  refreshFromSheetBtn.addEventListener("click", refreshFromSheet);

  templateFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const templateFileBuffer = await file.arrayBuffer();
    await exportCurrentScheduleToExcel(templateFileBuffer);
    templateFileInput.value = "";
  });

  scheduleBody.addEventListener("mousedown", (event) => {
    const cell = event.target.closest(".slot-cell");
    if (!cell || cell.classList.contains("lunch")) return;
    isMouseDown = true;
    const member = cell.dataset.member;
    const dayKey = cell.dataset.day;
    const slotIndex = Number(cell.dataset.slot);
    applyToCell(member, dayKey, slotIndex);
    paintCell(cell, state.assignments[dayKey][member][slotIndex]);
    renderTotals();
  });

  scheduleBody.addEventListener("mouseover", (event) => {
    if (!isMouseDown) return;
    const cell = event.target.closest(".slot-cell");
    if (!cell || cell.classList.contains("lunch")) return;
    const member = cell.dataset.member;
    const dayKey = cell.dataset.day;
    const slotIndex = Number(cell.dataset.slot);
    applyToCell(member, dayKey, slotIndex);
    paintCell(cell, state.assignments[dayKey][member][slotIndex]);
  });

  scheduleBody.addEventListener("mouseup", () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    renderTable();
    renderTotals();
    saveState();
  });

  document.addEventListener("mouseup", () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    renderTable();
    renderTotals();
    saveState();
  });

  // Context menu event listeners
  contextEditMember.addEventListener("click", () => {
    if (selectedMemberForAction) {
      editMember(selectedMemberForAction);
    }
  });

  contextDeleteMember.addEventListener("click", () => {
    if (selectedMemberForAction) {
      deleteMember(selectedMemberForAction);
    }
  });

  // Close context menu when clicking elsewhere
  document.addEventListener("click", (event) => {
    if (event.target !== memberContextMenu && !memberContextMenu.contains(event.target)) {
      hideMemberContextMenu();
    }
  });

  // Close context menu when pressing Escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideMemberContextMenu();
    }
  });
}

async function exportCurrentScheduleToExcel(templateBuffer) {
  try {
    exportExcelBtn.disabled = true;
    exportExcelBtn.textContent = "Exporting...";

    const workbook = await window.XlsxPopulate.fromDataAsync(templateBuffer.slice(0));
    const sheet = workbook.sheet("Timing FEB") || workbook.sheet(0);

    const weekRows = [8, 52, 94, 136];
    const dayCols = ["D", "AJ", "BP", "CV", "EB"];
    const startOffset = 4;

    const templateMembers = [];
    for (let i = 0; i < 19; i += 1) {
      const row = 8 + i * 2;
      const name = String(sheet.cell(`B${row}`).value() || "").trim();
      templateMembers.push({ name, index: i });
    }

    const brandById = new Map(state.brands.map((b) => [b.id, b]));
    const neutralStyleRefs = buildNeutralSlotStyleRefs(startOffset);

    for (let w = 0; w < weeks.length; w += 1) {
      const weekDays = weeks[w];
      const baseRow = weekRows[w];

      for (const memberDef of templateMembers) {
        const targetMember = state.members.includes(memberDef.name) ? memberDef.name : null;
        const row = baseRow + memberDef.index * 2;

        for (let d = 0; d < weekDays.length; d += 1) {
          const dayKey = weekDays[d].key;
          const dayColNum = colToNum(dayCols[d]);
          const assignmentRow = targetMember ? state.assignments[dayKey][targetMember] : null;

          for (let slot = 0; slot < slots.length; slot += 1) {
            if (lunchSlots.has(slot)) continue;

            const cellRef = `${numToCol(dayColNum + startOffset + slot)}${row}`;
            const cell = sheet.cell(cellRef);
            const brandId = assignmentRow ? assignmentRow[slot] : null;

            const neutralRef = neutralStyleRefs[slot] || `${numToCol(dayColNum + startOffset)}${row}`;
            if (neutralRef) copyCellStyle(sheet.cell(neutralRef), cell);

            if (!brandId) {
              cell.value(null);
              continue;
            }

            const brand = brandById.get(brandId);
            if (!brand) {
              cell.value(null);
              continue;
            }

            applyFillColor(cell, brand.color);
            cell.value(null); // color-only export in schedule cells
          }
        }
      }
    }

    const out = await workbook.outputAsync();
    downloadBlob(out, `TEST_AI - Timing_Map_DXI - Export ${todayStamp()}.xlsx`);
  } catch (error) {
    console.error(error);
    alert(`Export failed. ${error?.message || "Please try again."}`);
  } finally {
    exportExcelBtn.disabled = false;
    exportExcelBtn.textContent = "Export Excel";
  }
}

function buildNeutralSlotStyleRefs(startOffset) {
  const refs = {};
  const baseRow = 42; // baseline mostly-empty row in week 1
  const mondayCol = colToNum("D");
  for (let slot = 0; slot < slots.length; slot += 1) refs[slot] = `${numToCol(mondayCol + startOffset + slot)}${baseRow}`;
  return refs;
}

function copyCellStyle(fromCell, toCell) {
  const styleKeys = [
    "fontFamily",
    "fontSize",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "fontColor",
    "horizontalAlignment",
    "verticalAlignment",
    "wrapText",
    "textDirection",
    "textRotation",
    "indent",
    "shrinkToFit",
    "numberFormat",
    "fill",
    "border"
  ];

  for (const key of styleKeys) {
    try {
      const value = fromCell.style(key);
      if (value !== undefined) toCell.style(key, value);
    } catch {
      // Ignore style keys unsupported by this engine/object.
    }
  }
}

function applyFillColor(cell, hexColor) {
  const color = normalizeHex(hexColor);
  if (!color) return;
  const rgb = color.replace("#", "");
  const argb = `FF${rgb}`;

  try { cell.style("fill", argb); } catch {}
  try { cell.style("fill", rgb); } catch {}
  try { cell.style("fill", { type: "solid", color: argb }); } catch {}
  try { cell.style("fill", { type: "solid", color: rgb }); } catch {}
}

function normalizeHex(value) {
  if (!value) return null;
  let v = String(value).replace("#", "").trim();
  if (v.length === 8) v = v.slice(2);
  if (v.length !== 6) return null;
  return `#${v.toUpperCase()}`;
}

function colToNum(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function numToCol(num) {
  let n = num;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function editBrand(brandId) {
  const brand = state.brands.find((b) => b.id === brandId);
  if (!brand) return;

  const newName = prompt("Edit brand name:", brand.name);
  if (!newName || !newName.trim()) return;

  const newColor = prompt("Edit hex color:", brand.color);
  if (!newColor || !/^#[0-9A-Fa-f]{6}$/.test(newColor.trim())) {
    alert("Invalid color. Use format #RRGGBB");
    return;
  }

  brand.name = newName.trim();
  brand.color = newColor.trim().toUpperCase();
  renderPalette();
  renderTable();
  renderTotals();
  saveState();
}

function applyTotalsCollapse(collapsed) {
  totalsPanel.classList.toggle("collapsed", collapsed);
  layoutMain.classList.toggle("totals-collapsed", collapsed);
  toggleTotalsBtn.textContent = collapsed ? "Expand" : "Collapse";
  toggleTotalsBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function updateEraserVisual() {
  eraserBtn.style.borderColor = paintMode === "erase" ? "#0d7a5f" : "#d8dfd9";
  eraserBtn.style.background = paintMode === "erase" ? "#e6f4ef" : "#f9fcfa";
}

function toLabel(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  const min = minute === 0 ? "00" : "30";
  return `${twelveHour}:${min} ${suffix}`;
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
