// Add years here as seasons begin. No historical data before 2026.
const AVAILABLE_YEARS = [2026]; // add 2027 here next year

const TEAM_COLORS = {
  mercedes:     '#00D2BE',
  ferrari:      '#E8002D',
  mclaren:      '#FF8000',
  red_bull:     '#3671C6',
  williams:     '#64C4FF',
  alpine:       '#FF87BC',
  haas:         '#B6BABD',
  rb:           '#6692FF',
  aston_martin: '#229971',
  audi:         '#C9B84C',
  cadillac:     '#888888',
};

function teamKey(id) {
  const s = (id || '').toLowerCase();
  if (s.includes('mercedes'))   return 'mercedes';
  if (s.includes('ferrari'))    return 'ferrari';
  if (s.includes('mclaren'))    return 'mclaren';
  if (s.includes('red_bull') || s.includes('redbull')) return 'red_bull';
  if (s.includes('williams'))   return 'williams';
  if (s.includes('alpine'))     return 'alpine';
  if (s.includes('haas'))       return 'haas';
  if (s.includes('rb') || s.includes('racing_bulls') || s.includes('visa') ||
      s.includes('alphatauri')  || s.includes('toro')) return 'rb';
  if (s.includes('aston'))      return 'aston_martin';
  if (s.includes('audi') || s.includes('sauber') || s.includes('kick')) return 'audi';
  if (s.includes('cadillac') || s.includes('andretti')) return 'cadillac';
  return s;
}

function sprintClass(pts) {
  return { 8:'s8', 7:'s7', 6:'s6', 5:'s5', 4:'s4', 3:'s3', 2:'s2c', 1:'s1c' }[pts] || '';
}

function raceClass(pts) {
  const map = { 25:'p25', 18:'p18', 15:'p15', 12:'p12', 10:'p10', 8:'p8', 6:'p6', 4:'p4', 2:'p2', 1:'p1' };
  return map[pts] || (pts >= 1 ? 'p1' : '');
}

const RACE_FORM_SCORE = { 25: 20, 18: 16, 15: 13, 12: 10, 10: 8, 8: 6, 6: 5, 4: 4, 2: 3, 1: 2 };

function raceScore(pts, status) {
  if (status === 'DNF' || status === 'DNS') return -7;
  if (pts > 0) return RACE_FORM_SCORE[pts] ?? 2; // known pts values; fallback 2
  return 1; // finished outside points
}

function formColor(f) {
  if (f >= 76) return '#C8E6C9'; // green
  if (f >= 51) return '#B3E5FC'; // blue
  if (f >= 26) return '#FFE0B2'; // amber
  return '#FFCDD2';              // red
}

function computeForm(d, last5Races) {
  if (last5Races.length === 0) return null;
  const n = last5Races.length;
  const raw = last5Races.reduce((sum, r) => {
    const pts    = d.race_points[String(r.round)] ?? 0;
    const status = d.race_status?.[String(r.round)] ?? '';
    return sum + raceScore(pts, status);
  }, 0);
  const minRaw = n * -7, maxRaw = n * 20;
  return Math.max(0, Math.min(100, Math.round((raw - minRaw) / (maxRaw - minRaw) * 100)));
}

function fmtDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${+d}.${+m}`;
}
function sprintDate(raceDateStr) {
  const [y, m, d] = raceDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return `${dt.getUTCDate()}.${dt.getUTCMonth() + 1}`;
}

// ── data processing ──────────────────────────────────────────────────────────

function processData(raw) {
  const completedR  = new Set(raw.completed_rounds);
  const completedSR = new Set(raw.completed_sprint_rounds);
  const cancelledR  = new Set(raw.cancelled_rounds);

  // Theoretical max: every driver can win everything
  const futureRaces   = raw.races.filter(r => !r.completed && !r.cancelled).length;
  const futureSprints = raw.sprint_rounds.filter(r => !completedSR.has(r) && !cancelledR.has(r)).length;
  const maxPerDriver  = futureRaces * 25 + futureSprints * 8;

  const drivers = raw.drivers.map(d => ({
    ...d,
    possible: d.total + maxPerDriver,
  })).sort((a, b) => b.total - a.total);

  // Constructors: sum both drivers' theoretical max
  const consMap = {};
  for (const d of drivers) {
    const k = teamKey(d.constructor_id);
    if (!consMap[k]) consMap[k] = {
      name: d.constructor_name,
      total: 0, possible: 0,
      color: TEAM_COLORS[k] || '#ccc',
    };
    consMap[k].total    += d.total;
    consMap[k].possible += d.possible;
  }
  const constructors = Object.values(consMap).sort((a, b) => b.total - a.total);

  return {
    races: raw.races,
    sprintRounds: raw.sprint_rounds.slice().sort((a, b) => a - b),
    completedR, completedSR, cancelledR,
    drivers, constructors,
  };
}

// ── driver table ─────────────────────────────────────────────────────────────

function buildDriverTable(data) {
  const { races, sprintRounds, completedR, completedSR, cancelledR, drivers } = data;

  const tbl   = document.getElementById('driversTbl');
  tbl.innerHTML = '';
  const thead = tbl.createTHead();
  const tbody = tbl.createTBody();

  // Row 1 – group headers
  const gr = thead.insertRow();
  gr.className = 'gh';
  const gth = (txt, cls, cs = 1) => {
    const t = document.createElement('th');
    t.textContent = txt; t.className = cls;
    if (cs > 1) t.colSpan = cs;
    gr.appendChild(t);
  };
  gth('', 'blank'); gth('', 'blank');
  sprintRounds.forEach(rnd => {
    const race = races.find(r => r.round === rnd);
    gth(race ? sprintDate(race.date) : '', 'sgrp');
  });
  races.forEach(race => {
    gth(fmtDate(race.date), 'rgrp');
  });
  gth('', 'tgrp');
  gth('', 'blank');
  gth('', 'blank');
  gth('', 'blank');

  // Row 2 – column labels
  const cr = thead.insertRow();
  cr.className = 'ch';
  const cth = (html, cls) => {
    const t = document.createElement('th');
    t.innerHTML = html; t.className = cls;
    cr.appendChild(t);
  };
  cth('Team', ''); cth('Driver', '');

  sprintRounds.forEach((rnd, i) => {
    const race = races.find(r => r.round === rnd);
    cth(`s${String(i + 1).padStart(2, '0')}<br><small>${race ? race.code : '?'}</small>`, 'sh');
  });
  races.forEach((race, i) => {
    cth(`r${String(i + 1).padStart(2, '0')}<br><small>${race.code}</small>`, 'rh');
  });
  cth('total', 'th');
  cth('max', 'ph');
  cth('form', 'fh');
  cth('proj', 'xh');

  // Data rows
  for (const d of drivers) {
    const tr    = tbody.insertRow();
    const tk    = teamKey(d.constructor_id);
    const color = TEAM_COLORS[tk] || '#ccc';
    if (d.total === 0) tr.classList.add('zero-row');

    const cell = (cls, text = '') => {
      const td = tr.insertCell(); td.className = cls; td.textContent = text; return td;
    };

    const tc = cell('tc', d.constructor_name);
    tc.style.borderLeft = `4px solid ${color}`;

    cell('nc', d.family_name);

    for (const rnd of sprintRounds) {
      const td = tr.insertCell();
      td.className = 'sprint-td';
      if (completedSR.has(rnd)) {
        const pts = d.sprint_points[String(rnd)] ?? 0;
        if (pts > 0) { td.textContent = pts; td.className = sprintClass(pts); }
      } else if (cancelledR.has(rnd)) {
        td.className = 'cancelled'; td.textContent = 'cnc';
      } else {
        td.className = 'future';
      }
    }

    for (const race of races) {
      const td = tr.insertCell();
      td.className = 'race-td';
      if (completedR.has(race.round)) {
        const pts    = d.race_points[String(race.round)] ?? 0;
        const status = d.race_status?.[String(race.round)] ?? '';
        if (pts > 0) {
          td.textContent = pts; td.className = raceClass(pts);
        } else if (status === 'DNF') {
          td.className = 'dnf'; td.textContent = 'DNF';
        } else if (status === 'DNS') {
          td.className = 'dns'; td.textContent = 'DNS';
        }
      } else if (cancelledR.has(race.round)) {
        td.className = 'cancelled'; td.textContent = 'cnc';
      } else {
        td.className = 'future';
      }
    }

    cell('totcell', d.total);
    cell('poscell', d.possible);

    // ── form rating 0–100 (last 5 completed races) ──
    const completedRaceList = races.filter(r => completedR.has(r.round));
    const last5 = completedRaceList.slice(-5);
    const form   = computeForm(d, last5);
    const formTd = tr.insertCell();
    formTd.className = 'formcell';
    if (form !== null) {
      formTd.textContent = form;
      formTd.style.background = formColor(form);
    }

    // ── season projection (last 3 race avg × remaining races) ──
    const last3 = completedRaceList.slice(-3);
    const avg3  = last3.length === 0 ? 0
                : last3.reduce((s, r) => s + (d.race_points[String(r.round)] ?? 0), 0) / last3.length;
    const futureRaceCount = races.filter(r => !r.completed && !r.cancelled).length;
    const projected = Math.round(d.total + avg3 * futureRaceCount);
    cell('projcell', projected);
  }
}

// ── constructors sidebar ─────────────────────────────────────────────────────

function buildConstructors(constructors) {
  const list = document.getElementById('consList');
  list.innerHTML = '';

  for (let i = 0; i < constructors.length; i++) {
    const c   = constructors[i];
    const div = document.createElement('div');
    div.className = 'con-card';
    div.style.setProperty('--tc', c.color);
    div.innerHTML = `
      <span class="con-rank">${i + 1}</span>
      <div class="con-info">
        <div class="con-name">${c.name}</div>
        <div class="con-max">theoretical max ${c.possible.toLocaleString()} pts</div>
      </div>
      <div class="con-pts-wrap">
        <div class="con-pts">${c.total}</div>
        <div class="con-label">pts</div>
      </div>`;
    list.appendChild(div);
  }
}

// ── load & render ─────────────────────────────────────────────────────────────

async function init() {
  const year = +document.getElementById('yearSel').value;
  const st   = document.getElementById('status');

  st.textContent = `Loading ${year}…`;
  st.className   = '';
  document.getElementById('driversTbl').innerHTML = '';
  document.getElementById('consList').innerHTML   = '';

  try {
    const res = await fetch(`data/${year}.json`);
    if (!res.ok) throw new Error(`No data for ${year} — run fetch_data.py first (HTTP ${res.status})`);
    const raw  = await res.json();
    const data = processData(raw);

    buildDriverTable(data);
    buildConstructors(data.constructors);

    st.textContent = '';
    document.getElementById('seasonLabel').textContent = `${year} Season`;
  } catch (e) {
    st.textContent = e.message;
    st.className   = 'error';
    console.error(e);
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────

const sel = document.getElementById('yearSel');
AVAILABLE_YEARS.forEach(y => {
  const o = document.createElement('option');
  o.value = y; o.textContent = `${y} Season`;
  sel.appendChild(o);
});

// Hide the dropdown when only one year is available
if (AVAILABLE_YEARS.length === 1) sel.style.display = 'none';

sel.addEventListener('change', init);
init();
