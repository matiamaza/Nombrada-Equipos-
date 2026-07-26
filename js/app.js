/* global XLSX */
'use strict';

// ── State ──────────────────────────────────────────────────────────
const state = {
  files: [
    { raw: null, data: [], headers: [], name: '' },
    { raw: null, data: [], headers: [], name: '' },
  ],
  results: [],
  filtered: [],
  sortCol: null,
  sortDir: 'asc',
  groupBy: '',
};

// ── Helpers ────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showStep(name) {
  ['step-upload', 'step-config', 'step-results'].forEach(id => {
    const el = $(id);
    el.hidden = true;
    el.classList.remove('active');
  });
  const target = $(name);
  target.hidden = false;
  // micro-delay so display:block is applied before animation
  requestAnimationFrame(() => target.classList.add('active'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 3500);
}

function formatRows(n) {
  return n.toLocaleString('es-AR') + ' fila' + (n !== 1 ? 's' : '');
}

function sanitize(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ── File parsing ───────────────────────────────────────────────────
function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const ext = file.name.split('.').pop().toLowerCase();

    reader.onload = (e) => {
      try {
        let headers = [], data = [];
        if (ext === 'csv') {
          const text = e.target.result;
          const rows = parseCSV(text);
          if (rows.length === 0) throw new Error('Archivo CSV vacío.');
          headers = rows[0].map(sanitize);
          data = rows.slice(1).map(row =>
            Object.fromEntries(headers.map((h, i) => [h, sanitize(row[i])]))
          );
        } else {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: '',
            blankrows: false,
          });
          if (jsonRows.length === 0) throw new Error('Hoja de cálculo vacía.');
          headers = jsonRows[0].map(sanitize);
          // Remove duplicate header names by appending index
          const seen = {};
          headers = headers.map((h, i) => {
            if (!h) h = `Columna_${i + 1}`;
            if (seen[h] !== undefined) { seen[h]++; h = `${h}_${seen[h]}`; }
            else seen[h] = 0;
            return h;
          });
          data = jsonRows.slice(1).map(row =>
            Object.fromEntries(headers.map((h, i) => [h, sanitize(row[i])]))
          );
        }
        resolve({ headers, data });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Error al leer el archivo.'));

    if (ext === 'csv') {
      reader.readAsText(file, 'utf-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

function parseCSV(text) {
  // Handles quoted fields with commas and newlines
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(field); field = '';
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else if (ch === '\r' && !inQuotes) {
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

// ── Drop-zone setup ────────────────────────────────────────────────
function setupDropZone(zoneId, inputId, fileIndex) {
  const zone = $(zoneId);
  const input = $(inputId);

  async function loadFile(file) {
    if (!file) return;
    const allowed = /\.(xlsx|xls|csv)$/i;
    if (!allowed.test(file.name)) {
      toast('Formato no soportado. Usa .xlsx, .xls o .csv', 'error');
      return;
    }
    try {
      const { headers, data } = await parseFile(file);
      state.files[fileIndex] = { raw: file, data, headers, name: file.name };
      renderFileInfo(fileIndex);
      updateNextBtn();
    } catch (err) {
      toast(err.message || 'Error al procesar el archivo.', 'error');
    }
  }

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    loadFile(e.dataTransfer.files[0]);
  });
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });

  input.addEventListener('change', () => loadFile(input.files[0]));
}

function renderFileInfo(idx) {
  const f = state.files[idx];
  const n = idx + 1;
  const infoEl = $('info' + n);
  const dropZone = $('drop' + n);

  $('name' + n).textContent = f.name;
  $('meta' + n).textContent = formatRows(f.data.length) + ' · ' + f.headers.length + ' columnas';
  infoEl.hidden = false;
  dropZone.style.paddingBottom = '12px';
}

function clearFile(idx) {
  const n = idx + 1;
  state.files[idx] = { raw: null, data: [], headers: [], name: '' };
  $('info' + n).hidden = true;
  $('file' + n).value = '';
  $('drop' + n).style.paddingBottom = '';
  updateNextBtn();
}

function updateNextBtn() {
  $('btn-next-config').disabled = !(state.files[0].raw && state.files[1].raw);
}

// ── Config step ────────────────────────────────────────────────────
function buildConfigStep() {
  const [f1, f2] = state.files;

  // Key selects
  ['sel-key1', 'sel-key2'].forEach((selId, idx) => {
    const sel = $(selId);
    const headers = state.files[idx].headers;
    sel.innerHTML = headers.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
    // Attempt auto-select: prefer columns containing keywords
    const auto = headers.find(h => /legajo|id|dni|cuil|codigo|code|employee|empleado/i.test(h));
    if (auto) sel.value = auto;
  });

  // Column checkboxes
  renderColChecks('cols1', f1.headers, 0);
  renderColChecks('cols2', f2.headers, 1);

  // Group-by select in results (will be populated after run)
}

function renderColChecks(containerId, headers, _fileIdx) {
  const el = $(containerId);
  el.innerHTML = headers.map(h => `
    <label class="col-check">
      <input type="checkbox" value="${esc(h)}" checked />
      ${esc(h)}
    </label>
  `).join('');
}

function getSelectedCols(containerId) {
  return [...$(containerId).querySelectorAll('input[type=checkbox]:checked')]
    .map(cb => cb.value);
}

function getJoinType() {
  return document.querySelector('input[name="join"]:checked')?.value || 'inner';
}

// ── Matching / Join ────────────────────────────────────────────────
function runMatch() {
  const key1 = $('sel-key1').value;
  const key2 = $('sel-key2').value;
  const cols1 = getSelectedCols('cols1');
  const cols2 = getSelectedCols('cols2');
  const join  = getJoinType();

  const [f1, f2] = state.files;

  // Build lookup map from file 2
  const map2 = new Map();
  f2.data.forEach(row => {
    const k = normalizeKey(row[key2]);
    if (!map2.has(k)) map2.set(k, []);
    map2.get(k).push(row);
  });

  const usedKeys2 = new Set();
  const results = [];

  // Left pass (file1)
  f1.data.forEach(row1 => {
    const k = normalizeKey(row1[key1]);
    const matches = map2.get(k) || [];
    if (matches.length > 0) {
      matches.forEach(row2 => {
        usedKeys2.add(k);
        results.push(buildRow(row1, row2, cols1, cols2, key1, key2, 'matched'));
      });
    } else if (join === 'left' || join === 'full') {
      results.push(buildRow(row1, null, cols1, cols2, key1, key2, 'left-only'));
    }
  });

  // Right pass: unmatched from file2
  if (join === 'right' || join === 'full') {
    f2.data.forEach(row2 => {
      const k = normalizeKey(row2[key2]);
      if (!usedKeys2.has(k)) {
        results.push(buildRow(null, row2, cols1, cols2, key1, key2, 'right-only'));
      }
    });
  }

  state.results = results;
  state.filtered = [...results];
  state.sortCol = null;
  state.sortDir = 'asc';
  state.groupBy = '';
}

function normalizeKey(val) {
  return String(val ?? '').trim().toLowerCase();
}

function buildRow(row1, row2, cols1, cols2, key1, key2, status) {
  const out = { __status: status };
  cols1.forEach(c => { out[c] = row1 ? (row1[c] ?? '') : ''; });
  // Rename cols2 fields if they clash with cols1
  const usedNames = new Set(cols1);
  cols2.forEach(c => {
    let name = c;
    if (usedNames.has(name) && name !== key2) name = c + ' (Eq.)';
    usedNames.add(name);
    out[name] = row2 ? (row2[c] ?? '') : '';
  });
  return out;
}

function resultColumns() {
  if (!state.results.length) return [];
  return Object.keys(state.results[0]).filter(k => k !== '__status');
}

// ── Results rendering ──────────────────────────────────────────────
function renderResults() {
  renderSummary();
  buildGroupBySelect();
  applyFilterSort();
}

function renderSummary() {
  const total    = state.results.length;
  const matched  = state.results.filter(r => r.__status === 'matched').length;
  const leftOnly = state.results.filter(r => r.__status === 'left-only').length;
  const rightOnly= state.results.filter(r => r.__status === 'right-only').length;

  $('summary-grid').innerHTML = `
    <div class="summary-card"><p class="sc-label">Total filas</p><p class="sc-value sc-blue">${total.toLocaleString('es-AR')}</p></div>
    <div class="summary-card"><p class="sc-label">Con asignación</p><p class="sc-value sc-green">${matched.toLocaleString('es-AR')}</p></div>
    <div class="summary-card"><p class="sc-label">Sin equipo</p><p class="sc-value sc-amber">${leftOnly.toLocaleString('es-AR')}</p></div>
    <div class="summary-card"><p class="sc-label">Sin persona</p><p class="sc-value sc-purple">${rightOnly.toLocaleString('es-AR')}</p></div>
  `;
}

function buildGroupBySelect() {
  const cols = resultColumns();
  const sel  = $('group-by');
  sel.innerHTML = `<option value="">Sin agrupación</option>` +
    cols.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = state.groupBy;
}

function applyFilterSort() {
  const query = $('search-input').value.toLowerCase();
  let data = state.results.filter(row => {
    if (!query) return true;
    return Object.values(row).some(v => String(v).toLowerCase().includes(query));
  });

  if (state.sortCol) {
    const col = state.sortCol;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    data = data.sort((a, b) => {
      const av = String(a[col] ?? '').toLowerCase();
      const bv = String(b[col] ?? '').toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }

  state.filtered = data;
  renderTable();
}

function renderTable() {
  const cols   = resultColumns();
  const thead  = $('result-thead');
  const tbody  = $('result-tbody');
  const noRes  = $('no-results');
  const tableW = $('table-wrap');
  const groupBy = $('group-by').value;

  // Headers
  thead.innerHTML = '<tr>' + cols.map(c => {
    const cls = state.sortCol === c ? state.sortDir : '';
    return `<th class="${cls}" data-col="${esc(c)}">${esc(c)} <span class="sort-arrow" aria-hidden="true"></span></th>`;
  }).join('') + '</tr>';

  // Bind sort
  thead.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      applyFilterSort();
    });
  });

  if (!state.filtered.length) {
    tbody.innerHTML = '';
    noRes.hidden   = false;
    tableW.hidden  = true;
    return;
  }

  noRes.hidden  = true;
  tableW.hidden = false;

  // Group
  const rows = state.filtered;
  let html = '';

  if (groupBy) {
    const groups = new Map();
    rows.forEach(r => {
      const gVal = sanitize(r[groupBy]) || '(vacío)';
      if (!groups.has(gVal)) groups.set(gVal, []);
      groups.get(gVal).push(r);
    });

    groups.forEach((groupRows, gVal) => {
      html += `<tr class="group-row"><td colspan="${cols.length}">${esc(gVal)} &nbsp;(${groupRows.length})</td></tr>`;
      groupRows.forEach(row => { html += buildDataRow(row, cols); });
    });
  } else {
    rows.forEach(row => { html += buildDataRow(row, cols); });
  }

  tbody.innerHTML = html;
}

function buildDataRow(row, cols) {
  const dot = row.__status === 'matched'
    ? '<span class="status-dot ok" title="Con asignación"></span>'
    : row.__status === 'left-only'
      ? '<span class="status-dot warn" title="Sin equipo asignado"></span>'
      : '';
  return '<tr>' + cols.map((c, i) =>
    `<td>${i === 0 ? dot : ''}${esc(String(row[c] ?? ''))}</td>`
  ).join('') + '</tr>';
}

// ── Export ─────────────────────────────────────────────────────────
function exportCSV() {
  const cols = resultColumns();
  const rows = state.filtered;
  const lines = [cols.join(',')];
  rows.forEach(row => {
    lines.push(cols.map(c => csvCell(String(row[c] ?? ''))).join(','));
  });
  downloadBlob(lines.join('\r\n'), 'nombrada-cruce.csv', 'text/csv;charset=utf-8;');
}

function csvCell(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function exportXLSX() {
  const cols = resultColumns();
  const rows = state.filtered;
  const wsData = [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = cols.map(c => ({ wch: Math.min(40, Math.max(c.length + 2, 10)) }));

  // Header style (best effort – some viewers support it)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (cell) {
      cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'DBEAFE' } } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cruce Nombrada');
  XLSX.writeFile(wb, 'nombrada-cruce.xlsx');
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Escape HTML ────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Drop zones
  setupDropZone('drop1', 'file1', 0);
  setupDropZone('drop2', 'file2', 1);

  // Clear buttons
  $('clear1').addEventListener('click', () => clearFile(0));
  $('clear2').addEventListener('click', () => clearFile(1));

  // Step 1 → 2
  $('btn-next-config').addEventListener('click', () => {
    buildConfigStep();
    showStep('step-config');
  });

  // Step 2 → 1
  $('btn-back-upload').addEventListener('click', () => showStep('step-upload'));

  // Join radio styling
  document.querySelectorAll('input[name="join"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.join-opt').forEach(el => el.classList.remove('selected'));
      radio.closest('.join-opt').classList.add('selected');
    });
  });

  // Run match
  $('btn-run').addEventListener('click', () => {
    const key1 = $('sel-key1').value;
    const key2 = $('sel-key2').value;
    if (!key1 || !key2) { toast('Selecciona las columnas clave de cada archivo.', 'error'); return; }
    if (getSelectedCols('cols1').length === 0 && getSelectedCols('cols2').length === 0) {
      toast('Selecciona al menos una columna para mostrar.', 'error'); return;
    }
    runMatch();
    renderResults();
    showStep('step-results');
    toast(`Cruce completado: ${state.results.length.toLocaleString('es-AR')} filas generadas.`, 'success');
  });

  // Step 3 → 2
  $('btn-back-config').addEventListener('click', () => showStep('step-config'));

  // Restart
  $('btn-restart').addEventListener('click', () => {
    clearFile(0); clearFile(1);
    $('search-input').value = '';
    showStep('step-upload');
  });

  // Search
  $('search-input').addEventListener('input', applyFilterSort);

  // Group-by
  $('group-by').addEventListener('change', (e) => {
    state.groupBy = e.target.value;
    renderTable();
  });

  // Export
  $('btn-export-csv').addEventListener('click', () => {
    if (!state.filtered.length) { toast('No hay datos para exportar.', 'error'); return; }
    exportCSV();
  });
  $('btn-export-xlsx').addEventListener('click', () => {
    if (!state.filtered.length) { toast('No hay datos para exportar.', 'error'); return; }
    exportXLSX();
  });
});
