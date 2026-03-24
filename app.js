console.log('app.js loaded');

const STORAGE_KEY = "dxi-timing-map-feb-2026-v8";
const PRELOADED = window.PRELOADED_DATA || null;

const fallbackColors = ["#2D6A4F", "#1D3557", "#8F2D56", "#CA6702", "#6A4C93", "#264653", "#386641", "#9D4EDD"];

const defaultMembers = PRELOADED?.members || ["Open Seat"];
const defaultBrands = ensureRequiredBrands(
  (PRELOADED?.brands || [{ id: "b1", name: "General", color: "#2D6A4F" }]).map((brand, idx) => ({
    ...brand,
    color: brand.color === "#000000" ? fallbackColors[idx % fallbackColors.length] : brand.color
  }))
);

const slots = buildSlots();
const lunchSlots = new Set(slots.filter((s) => s.isLunch).map((s) => s.index));
const weekdays = buildFebruaryWeekdays();
const weeks = chunkWeekdays(weekdays, 5);

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
const exportExcelBtn = document.getElementById("exportExcelBtn");
const templateFileInput = document.getElementById("templateFileInput");

// Initialize the app
initApp();

async function initApp() {
  try {
    console.log('Starting app initialization...');
    
    // Members and brands are now in data.js (PRELOADED_DATA)
    // defaultMembers and defaultBrands are already set from PRELOADED
    console.log('Using members from data.js:', defaultMembers.length);
    console.log('Using brands from data.js:', defaultBrands.length);
    
    // Only load schedule/assignments from Google Sheets
    const schedule = await loadScheduleFromSheets();
    console.log('Google Sheets schedule:', schedule);
    
    // Store schedule from Google Sheets for later use
    window.GOOGLE_SHEETS_SCHEDULE = schedule || null;
    
  } catch (error) {
    console.error('Error loading schedule from Google Sheets:', error);
    console.log('Will use local/fallback schedule');
  }
  
  // Now initialize the UI with loaded data
  init();
}

function init() {
  console.log('Initializing UI with members:', defaultMembers.length, 'brands:', defaultBrands.length);
  
  // Create state NOW with the updated defaultMembers and defaultBrands from Google Sheets
  state = loadState() || createInitialState();
  selectedBrandId = state.selectedBrandId || state.brands[0]?.id || null;
  
  applyTotalsCollapse(localStorage.getItem("dxi-totals-collapsed") === "1");
  renderPalette();
  renderTable();
  renderTotals();
  attachEvents();
  
  // Sync initial state to Google Sheets (if not already synced)
  if (!localStorage.getItem('SYNCED_TO_SHEETS')) {
    console.log('Syncing initial schedule to Google Sheets...');
    saveScheduleToSheets(state.assignments).then(() => {
      localStorage.setItem('SYNCED_TO_SHEETS', 'true');
      console.log('Initial sync complete');
    }).catch(error => {
      console.error('Initial sync failed:', error);
    });
  }
}

function ensureRequiredBrands(brands) {
  const out = [...brands];
  const hasLg2c = out.some((b) => b.name.toUpperCase().includes("LG2C"));
  if (!hasLg2c) {
    out.push({ id: `b_lg2c_${Date.now()}`, name: "LG2C (Monthly, Quaterly and Benchmark)", color: "#FF2600" });
  }
  return out;
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
  
  // Also save to Google Sheets (async, non-blocking)
  saveScheduleToSheets(state.assignments).catch(error => {
    console.error('Failed to sync to Google Sheets:', error);
  });
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
    const id = `b${Date.now()}`;
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
  });

  document.addEventListener("mouseup", () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    renderTable();
    renderTotals();
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
