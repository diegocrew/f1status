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
  if (sprintRounds.length) gth(`Sprint ×${sprintRounds.length}`, 'sgrp', sprintRounds.length);
  gth(`Races ×${races.length}`, 'rgrp', races.length);
  gth('', 'tgrp');
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
        if (pts > 0) { td.textContent = pts; td.className = sprintClass(pts); td.style.color = color; }
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
        const pts = d.race_points[String(race.round)] ?? 0;
        if (pts > 0) { td.textContent = pts; td.className = raceClass(pts); td.style.color = color; }
      } else if (cancelledR.has(race.round)) {
        td.className = 'cancelled'; td.textContent = 'cnc';
      } else {
        td.className = 'future';
      }
    }

    cell('totcell', d.total);
    cell('poscell', d.possible);
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
  document.getElementById('lastUpdated').textContent = '';

  try {
    const res = await fetch(`data/${year}.json`);
    if (!res.ok) throw new Error(`No data for ${year} — run fetch_data.py first (HTTP ${res.status})`);
    const raw  = await res.json();
    const data = processData(raw);

    buildDriverTable(data);
    buildConstructors(data.constructors);

    st.textContent = '';
    document.getElementById('lastUpdated').textContent =
      `Data fetched ${new Date(raw.fetched_at).toLocaleString()}`;
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
