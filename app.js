const STORAGE_KEY = "dxi-timing-map-2026-v12";
const PRELOADED = window.PRELOADED_DATA || null;

const fallbackColors = ["#2D6A4F", "#1D3557", "#8F2D56", "#CA6702", "#6A4C93", "#264653", "#386641", "#9D4EDD"];

const defaultMembers = PRELOADED?.members?.length ? PRELOADED.members : ["Open Seat"];
const defaultBrands = ensureRequiredBrands(
  (PRELOADED?.brands?.length ? PRELOADED.brands : [{ id: "b1", name: "General", color: "#2D6A4F" }]).map((brand, idx) => ({
    ...brand,
    color: brand.color === "#000000" ? fallbackColors[idx % fallbackColors.length] : brand.color
  }))
);

// Month configuration: [year, monthIndex (0-based), label]
const MONTHS = [
  { year: 2026, month: 0, label: "Jan 2026" },
  { year: 2026, month: 1, label: "Feb 2026" },
  { year: 2026, month: 2, label: "Mar 2026" },
  { year: 2026, month: 3, label: "Apr 2026" },
  { year: 2026, month: 4, label: "May 2026" },
  { year: 2026, month: 5, label: "Jun 2026" },
  { year: 2026, month: 6, label: "Jul 2026" },
  { year: 2026, month: 7, label: "Aug 2026" },
  { year: 2026, month: 8, label: "Sep 2026" },
  { year: 2026, month: 9, label: "Oct 2026" },
  { year: 2026, month: 10, label: "Nov 2026" },
  { year: 2026, month: 11, label: "Dec 2026" },
];
let currentMonthIdx = 3;

const slots = buildSlots();
const lunchSlots = new Set(slots.filter((s) => s.isLunch).map((s) => s.index));

// All weekdays across all months (for state initialization)
const allWeekdays = MONTHS.flatMap((m) => buildMonthWeekdays(m.year, m.month));

// Current month's weekdays (recalculated on tab switch)
let weekdays = buildMonthWeekdays(MONTHS[currentMonthIdx].year, MONTHS[currentMonthIdx].month);
let weeks = chunkWeekdays(weekdays, 5);

const state = loadState() || createInitialState();
let selectedBrandId = state.selectedBrandId || state.brands[0]?.id || null;
let paintMode = "brand";
let isMouseDown = false;

// DOM elements - initialized in init()
let layoutMain;
let totalsPanel;
let toggleTotalsBtn;
let scheduleHead;
let scheduleBody;
let brandPalette;
let brandTemplate;
let brandTotals;
let memberTotals;
let eraserBtn;
let clearMonthBtn;
let addMemberBtn;
let removeMemberBtn;
let addBrandBtn;
let exportExcelBtn;
let templateFileInput;
let recurringBtn;
let legendPanel;
let toggleLegendBtn;

// Brand modal refs
let brandModal, brandModalTitle, brandModalName, brandModalColor, brandModalHex, brandModalSave, brandModalCancel;
let _brandModalResolve = null;

function init() {
  // Initialize DOM elements
  layoutMain = document.getElementById("layoutMain");
  totalsPanel = document.getElementById("totalsPanel");
  toggleTotalsBtn = document.getElementById("toggleTotalsBtn");
  scheduleHead = document.getElementById("scheduleHead");
  scheduleBody = document.getElementById("scheduleBody");
  brandPalette = document.getElementById("brandPalette");
  brandTemplate = document.getElementById("brandTemplate");
  brandTotals = document.getElementById("brandTotals");
  memberTotals = document.getElementById("memberTotals");
  eraserBtn = document.getElementById("eraserBtn");
  clearMonthBtn = document.getElementById("clearMonthBtn");
  addMemberBtn = document.getElementById("addMemberBtn");
  removeMemberBtn = document.getElementById("removeMemberBtn");
  addBrandBtn = document.getElementById("addBrandBtn");
  exportExcelBtn = document.getElementById("exportExcelBtn");
  templateFileInput = document.getElementById("templateFileInput");
  recurringBtn = document.getElementById("recurringBtn");
  legendPanel = document.getElementById("legendPanel");
  toggleLegendBtn = document.getElementById("toggleLegendBtn");

  // Brand modal
  brandModal = document.getElementById("brandModal");
  brandModalTitle = document.getElementById("brandModalTitle");
  brandModalName = document.getElementById("brandModalName");
  brandModalColor = document.getElementById("brandModalColor");
  brandModalHex = document.getElementById("brandModalHex");
  brandModalSave = document.getElementById("brandModalSave");
  brandModalCancel = document.getElementById("brandModalCancel");
  brandModalColor.addEventListener("input", () => { brandModalHex.textContent = brandModalColor.value.toUpperCase(); });
  brandModalSave.addEventListener("click", () => { if (_brandModalResolve) _brandModalResolve(true); });
  brandModalCancel.addEventListener("click", () => { if (_brandModalResolve) _brandModalResolve(false); });
  brandModal.addEventListener("click", (e) => { if (e.target === brandModal && _brandModalResolve) _brandModalResolve(false); });

  renderMonthTabs();
  updateScheduleTitle();
  applyTotalsCollapse(localStorage.getItem("dxi-totals-collapsed") === "1");
  applyLegendCollapse(localStorage.getItem("dxi-legend-collapsed") === "1");
  renderPalette();
  renderTable();
  renderTotals();
  attachEvents();
}

function switchMonth(idx) {
  currentMonthIdx = idx;
  const m = MONTHS[idx];
  weekdays = buildMonthWeekdays(m.year, m.month);
  weeks = chunkWeekdays(weekdays, 5);

  // Ensure all days for this month exist in state
  for (const day of weekdays) {
    state.assignments[day.key] ||= {};
    for (const member of state.members) {
      state.assignments[day.key][member] ||= Array.from({ length: slots.length }, (_, i) => (lunchSlots.has(i) ? "LUNCH" : null));
    }
  }

  renderMonthTabs();
  renderTable();
  renderTotals();
  updateScheduleTitle();
}

function renderMonthTabs() {
  const container = document.getElementById("monthTabs");
  if (!container) return;
  container.innerHTML = "";
  MONTHS.forEach((m, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = m.label;
    btn.className = "month-tab" + (idx === currentMonthIdx ? " active" : "");
    btn.addEventListener("click", () => switchMonth(idx));
    container.appendChild(btn);
  });
}

function updateScheduleTitle() {
  const title = document.querySelector(".scheduler-panel h2");
  if (title) {
    title.textContent = `Interactive Schedule - ${MONTHS[currentMonthIdx].label}`;
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
  for (let hour = 7; hour < 17; hour += 1) {
    for (const minute of [0, 30]) {
      built.push({ index: idx, label: toLabel(hour, minute), hour, minute, isLunch: hour === 13 });
      idx += 1;
    }
  }
  return built;
}

function buildMonthWeekdays(year, month) {
  const out = [];
  const firstOfMonth = new Date(year, month, 1);
  const firstDow = firstOfMonth.getDay(); // 0=Sun, 1=Mon, ...

  // If month doesn't start on Monday, pad with previous month's weekdays
  // so the first displayed week starts on Monday
  if (firstDow !== 1 && firstDow !== 0) {
    // How many weekdays to go back to reach Monday
    const daysBack = firstDow - 1; // e.g. Wed(3) → 2 days back
    for (let i = daysBack; i >= 1; i -= 1) {
      const date = new Date(year, month, 1 - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      out.push({ key, day: date.getDate(), label: `${date.toLocaleDateString("en-US", { weekday: "short" })} ${date.getDate()}`, foreign: true });
    }
  }

  // Add all weekdays of the actual month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const weekDay = date.getDay();
    if (weekDay === 0 || weekDay === 6) continue;
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push({ key, day, label: `${date.toLocaleDateString("en-US", { weekday: "short" })} ${day}` });
  }

  // If the last day of the month doesn't fall on Friday, pad with next month's weekdays
  const lastDate = new Date(year, month, daysInMonth);
  const lastDow = lastDate.getDay();
  if (lastDow !== 5 && lastDow !== 6 && lastDow !== 0) {
    const daysForward = 5 - lastDow; // e.g. Wed(3) → 2 more days to reach Fri
    for (let i = 1; i <= daysForward; i += 1) {
      const date = new Date(year, month, daysInMonth + i);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      out.push({ key, day: date.getDate(), label: `${date.toLocaleDateString("en-US", { weekday: "short" })} ${date.getDate()}`, foreign: true });
    }
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
  for (const day of allWeekdays) {
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.members || !parsed?.brands || !parsed?.assignments) return null;

    parsed.brands = ensureRequiredBrands(parsed.brands);
    for (const day of allWeekdays) {
      parsed.assignments[day.key] ||= {};
      for (const member of parsed.members) {
        parsed.assignments[day.key][member] ||= Array.from({ length: slots.length }, () => null);
        for (const slot of slots) if (slot.isLunch) parsed.assignments[day.key][member][slot.index] = "LUNCH";
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveState(changedDay) {
  state.selectedBrandId = selectedBrandId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  
  // Sync changes to Google Sheet
  if (typeof syncDataToSheet === "function") {
    syncDataToSheet(state, changedDay);
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
    node.querySelector(".brand-delete").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteBrand(brand.id);
    });
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
      if (day.foreign) th.classList.add("foreign-day");
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
        if (weekDays[i].foreign) th.style.background = "#f0f2f1";
        else if (slot.isLunch) th.style.background = "#e3e8e4";
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
          if (day.foreign) {
            td.classList.add("foreign");
            td.style.background = "#f0f2f1";
          } else if (slot.isLunch) {
            td.classList.add("lunch");
            td.textContent = "L";
          } else {
            paintCell(td, state.assignments[day.key][member][slot.index]);
          }
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
      if (day.foreign) continue;
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
    if (day.foreign) continue;
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
  saveState(dayKey);
}

function attachEvents() {
  toggleTotalsBtn.addEventListener("click", () => {
    const collapsed = !totalsPanel.classList.contains("collapsed");
    applyTotalsCollapse(collapsed);
    localStorage.setItem("dxi-totals-collapsed", collapsed ? "1" : "0");
  });

  toggleLegendBtn.addEventListener("click", () => {
    const collapsed = !legendPanel.classList.contains("collapsed");
    applyLegendCollapse(collapsed);
    localStorage.setItem("dxi-legend-collapsed", collapsed ? "1" : "0");
  });

  eraserBtn.addEventListener("click", () => {
    paintMode = paintMode === "erase" ? "brand" : "erase";
    updateEraserVisual();
  });

  clearMonthBtn.addEventListener("click", () => {
    if (!confirm(`Clear all assignments for ${MONTHS[currentMonthIdx].label}?`)) return;
    for (const day of weekdays) {
      if (day.foreign) continue;
      for (const member of state.members) {
        state.assignments[day.key][member] = slots.map((slot) => (slot.isLunch ? "LUNCH" : null));
      }
    }
    renderTable();
    renderTotals();
    saveState();
  });

  addMemberBtn.addEventListener("click", () => {
    const name = prompt("New team member name:");
    if (!name || !name.trim()) return;
    const clean = name.trim();
    if (state.members.includes(clean)) {
      alert("Team member already exists.");
      return;
    }
    state.members.push(clean);
    for (const day of allWeekdays) state.assignments[day.key][clean] = slots.map((slot) => (slot.isLunch ? "LUNCH" : null));
    renderTable();
    renderTotals();
    saveState();
  });

  removeMemberBtn.addEventListener("click", () => {
    if (state.members.length === 0) {
      alert("No team members to remove.");
      return;
    }
    const list = state.members.map((m, i) => `${i + 1}. ${m}`).join("\n");
    const input = prompt("Enter the number of the member to remove:\n\n" + list);
    if (!input) return;
    const idx = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= state.members.length) {
      alert("Invalid selection.");
      return;
    }
    const memberName = state.members[idx];
    if (!confirm(`Remove "${memberName}" and all their assignments?`)) return;
    state.members.splice(idx, 1);
    for (const day of allWeekdays) {
      delete state.assignments[day.key][memberName];
    }
    renderTable();
    renderTotals();
    saveState();
  });

  addBrandBtn.addEventListener("click", async () => {
    const result = await openBrandModal("Add Brand", "", "#1D3557");
    if (!result) return;
    const id = `b${Date.now()}`;
    state.brands.push({ id, name: result.name, color: result.color });
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
    await exportScheduleToNewExcel();
  });

  recurringBtn.addEventListener("click", openRecurringModal);



  scheduleBody.addEventListener("mousedown", (event) => {
    const cell = event.target.closest(".slot-cell");
    if (!cell || cell.classList.contains("lunch") || cell.classList.contains("foreign")) return;
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
    if (!cell || cell.classList.contains("lunch") || cell.classList.contains("foreign")) return;
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

async function exportScheduleToNewExcel() {
  try {
    exportExcelBtn.disabled = true;
    exportExcelBtn.textContent = "Exporting...";

    const workbook = await window.XlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0);
    sheet.name("Schedule");

    // Create header
    sheet.cell("A1").value(`DXI Timing Map - ${MONTHS[currentMonthIdx].label}`).style("bold", true).style("fontSize", 14);
    sheet.cell("A2").value(`Export Date: ${todayStamp()}`).style("italic", true);

    // Column headers
    sheet.cell("A4").value("Team Member").style("bold", true).style("fill", "D3D3D3");
    sheet.cell("B4").value("Date").style("bold", true).style("fill", "D3D3D3");
    sheet.cell("C4").value("Time Range").style("bold", true).style("fill", "D3D3D3");
    sheet.cell("D4").value("Hours").style("bold", true).style("fill", "D3D3D3");
    sheet.cell("E4").value("Brand Assigned").style("bold", true).style("fill", "D3D3D3");

    // Set column widths
    sheet.column("A").width(25);
    sheet.column("B").width(15);
    sheet.column("C").width(22);
    sheet.column("D").width(8);
    sheet.column("E").width(35);

    let rowNum = 5;
    const brandById = new Map(state.brands.map((b) => [b.id, b]));

    // Iterate through each team member
    for (const member of state.members) {
      // Iterate through each weekday
      for (const weekday of weekdays) {
        if (weekday.foreign) continue;
        const dayKey = weekday.key;
        const assignments = state.assignments[dayKey]?.[member] || [];

        // Build consecutive ranges of the same brand
        const ranges = [];
        let current = null;
        for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
          const brandId = assignments[slotIdx];
          if (brandId === "LUNCH" || !brandId) {
            if (current) { ranges.push(current); current = null; }
            continue;
          }
          if (current && current.brandId === brandId) {
            current.endIdx = slotIdx;
          } else {
            if (current) ranges.push(current);
            current = { brandId, startIdx: slotIdx, endIdx: slotIdx };
          }
        }
        if (current) ranges.push(current);

        for (const range of ranges) {
          const startSlot = slots[range.startIdx];
          // End label = start of next slot (i.e. +30 min from endIdx)
          const endMinTotal = slots[range.endIdx].hour * 60 + slots[range.endIdx].minute + 30;
          const endHour = Math.floor(endMinTotal / 60);
          const endMin = endMinTotal % 60;
          const endLabel = toLabel(endHour, endMin);
          const hours = ((range.endIdx - range.startIdx + 1) * 0.5).toFixed(1);
          const brand = brandById.get(range.brandId);
          const brandName = brand ? brand.name : "";

          sheet.cell(`A${rowNum}`).value(member);
          sheet.cell(`B${rowNum}`).value(weekday.label);
          sheet.cell(`C${rowNum}`).value(`${startSlot.label} – ${endLabel}`);
          sheet.cell(`D${rowNum}`).value(Number(hours));
          sheet.cell(`E${rowNum}`).value(brandName);

          if (brand) {
            const cellE = sheet.cell(`E${rowNum}`);
            applyFillColor(cellE, brand.color);
            cellE.style("fontColor", "000000");
          }

          rowNum++;
        }
      }
    }

    // Save and download
    const out = await workbook.outputAsync();
    downloadBlob(out, `DXI_Timing_Map_${todayStamp()}.xlsx`);
  } catch (error) {
    console.error(error);
    alert(`Export failed. ${error?.message || "Please try again."}`);
  } finally {
    exportExcelBtn.disabled = false;
    exportExcelBtn.textContent = "Export Excel";
  }
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

async function editBrand(brandId) {
  const brand = state.brands.find((b) => b.id === brandId);
  if (!brand) return;

  const result = await openBrandModal("Edit Brand", brand.name, brand.color);
  if (!result) return;

  brand.name = result.name;
  brand.color = result.color;
  renderPalette();
  renderTable();
  renderTotals();
  saveState();
}

function deleteBrand(brandId) {
  const brand = state.brands.find((b) => b.id === brandId);
  if (!brand) return;
  if (!confirm(`Delete brand "${brand.name}"? Assignments using this brand will be cleared.`)) return;

  state.brands = state.brands.filter((b) => b.id !== brandId);
  // Remove from assignments
  for (const dayKey of Object.keys(state.assignments)) {
    const day = state.assignments[dayKey];
    for (const member of Object.keys(day)) {
      const slots = day[member];
      if (Array.isArray(slots)) {
        for (let i = 0; i < slots.length; i++) {
          if (slots[i] === brandId) slots[i] = null;
        }
      }
    }
  }
  if (selectedBrandId === brandId) {
    selectedBrandId = state.brands.length ? state.brands[0].id : null;
  }
  renderPalette();
  renderTable();
  renderTotals();
  saveState();
}

function openBrandModal(title, name, color) {
  brandModalTitle.textContent = title;
  brandModalName.value = name;
  brandModalColor.value = color;
  brandModalHex.textContent = color.toUpperCase();
  brandModal.hidden = false;
  brandModalName.focus();
  return new Promise((resolve) => {
    _brandModalResolve = (ok) => {
      _brandModalResolve = null;
      brandModal.hidden = true;
      if (ok) {
        const n = brandModalName.value.trim();
        if (!n) { resolve(null); return; }
        resolve({ name: n, color: brandModalColor.value.toUpperCase() });
      } else {
        resolve(null);
      }
    };
  });
}

function applyTotalsCollapse(collapsed) {
  totalsPanel.classList.toggle("collapsed", collapsed);
  layoutMain.classList.toggle("totals-collapsed", collapsed);
  toggleTotalsBtn.textContent = collapsed ? "Expand" : "Collapse";
  toggleTotalsBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function applyLegendCollapse(collapsed) {
  legendPanel.classList.toggle("collapsed", collapsed);
  toggleLegendBtn.textContent = collapsed ? "Expand" : "Collapse";
  toggleLegendBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function updateEraserVisual() {
  eraserBtn.style.borderColor = paintMode === "erase" ? "#0d7a5f" : "#d8dfd9";
  eraserBtn.style.background = paintMode === "erase" ? "#e6f4ef" : "#f9fcfa";
}

function toLabel(hour, minute) {
  const min = minute === 0 ? "00" : "30";
  return `${hour}:${min}`;
}

/* ── Recurring Schedule Modal ── */
function openRecurringModal() {
  const modal = document.getElementById("recurringModal");
  const memberSel = document.getElementById("recMember");
  const brandSel = document.getElementById("recBrand");
  const startSel = document.getElementById("recStart");
  const endSel = document.getElementById("recEnd");
  const scopeSel = document.getElementById("recScope");
  const weekPicker = document.getElementById("recWeekPicker");
  const weekSel = document.getElementById("recWeek");
  const dayPicker = document.getElementById("recDayPicker");
  const daysGrid = document.getElementById("recDays");

  // Populate members
  memberSel.innerHTML = state.members.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

  // Populate brands
  brandSel.innerHTML = state.brands
    .filter((b) => b.name !== "LUNCH")
    .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
    .join("");
  if (selectedBrandId) brandSel.value = selectedBrandId;

  // Populate time slots (all slots including lunch)
  const timeOptions = slots
    .map((s) => `<option value="${s.index}">${s.label}</option>`)
    .join("");
  startSel.innerHTML = timeOptions;
  endSel.innerHTML = timeOptions;
  // Default end to last slot
  if (slots.length) endSel.value = String(slots[slots.length - 1].index);

  // Populate weeks
  weekSel.innerHTML = weeks.map((_, i) => `<option value="${i}">Week ${i + 1}</option>`).join("");

  // Populate day chips
  function renderDayChips() {
    daysGrid.innerHTML = "";
    for (const day of weekdays) {
      if (day.foreign) continue;
      const chip = document.createElement("span");
      chip.className = "rec-day-chip selected";
      chip.textContent = day.label;
      chip.dataset.key = day.key;
      chip.addEventListener("click", () => chip.classList.toggle("selected"));
      daysGrid.appendChild(chip);
    }
  }
  renderDayChips();

  // Scope switching
  function updateScope() {
    weekPicker.hidden = scopeSel.value !== "monToFri";
    dayPicker.hidden = scopeSel.value !== "pick";
  }
  scopeSel.onchange = updateScope;
  updateScope();

  // Cancel
  document.getElementById("recCancel").onclick = () => { modal.hidden = true; };

  // Apply
  document.getElementById("recApply").onclick = () => {
    const member = memberSel.value;
    const brandId = brandSel.value;
    const startIdx = Number(startSel.value);
    const endIdx = Number(endSel.value);

    if (startIdx > endIdx) {
      alert("Start time must be before or equal to end time.");
      return;
    }

    // Determine which days to apply
    let targetDays;
    if (scopeSel.value === "month") {
      targetDays = weekdays.filter((d) => !d.foreign).map((d) => d.key);
    } else if (scopeSel.value === "monToFri") {
      const wIdx = Number(weekSel.value);
      targetDays = (weeks[wIdx] || []).filter((d) => !d.foreign).map((d) => d.key);
    } else {
      targetDays = [...daysGrid.querySelectorAll(".rec-day-chip.selected")].map((c) => c.dataset.key);
    }

    if (!targetDays.length) {
      alert("No days selected.");
      return;
    }

    // Apply brand to slots in range for each target day
    let count = 0;
    for (const dayKey of targetDays) {
      if (!state.assignments[dayKey]?.[member]) continue;
      for (let i = startIdx; i <= endIdx; i += 1) {
        if (lunchSlots.has(i)) continue;
        state.assignments[dayKey][member][i] = brandId;
        count += 1;
      }
    }

    modal.hidden = true;
    renderTable();
    renderTotals();
    saveState();
    alert(`Applied to ${targetDays.length} day(s), ${count} slot(s) updated.`);
  };

  modal.hidden = false;
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
