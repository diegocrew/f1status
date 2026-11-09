const CURRENT_YEAR = 2026;
const HISTORY_YEARS = [
  2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
  2013, 2012, 2011, 2010, 2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002, 2001, 2000,
  1999, 1998, 1997, 1996, 1995, 1994, 1993, 1992, 1991, 1990,
  1989, 1988, 1987, 1986, 1985, 1984, 1983, 1982, 1981, 1980,
];
const SEASON_YEARS = [CURRENT_YEAR, ...HISTORY_YEARS];

const TEAM_COLORS = {
  mercedes:     '#00D2BE',
  ferrari:      '#E8002D',
  mclaren:      '#FF8000',
  red_bull:     '#3671C6',
  williams:     '#64C4FF',
  alpine:       '#FF87BC',
  haas:         '#B6BABD',
  rb:           '#6692FF',
  alphatauri:   '#2B4562',
  aston_martin: '#229971',
  alfa_romeo:   '#900000',
  racing_point: '#F596C8',
  renault:      '#FFF500',
  audi:         '#C9B84C',
  cadillac:     '#888888',
  force_india:  '#F596C8',
  lotus:        '#FFB800',
  toro_rosso:   '#469BFF',
  sauber:       '#9B0000',
  manor:        '#ED1C24',
  caterham:     '#005030',
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
  if (s.includes('toro'))       return 'toro_rosso';
  if (s.includes('force_india')) return 'force_india';
  if (s.includes('lotus'))      return 'lotus';
  if (s.includes('manor') || s.includes('marussia')) return 'manor';
  if (s.includes('caterham'))   return 'caterham';
  if (s.includes('rb') || s.includes('racing_bulls') || s.includes('visa')) return 'rb';
  if (s.includes('alphatauri')) return 'alphatauri';
  if (s.includes('aston'))      return 'aston_martin';
  if (s.includes('alfa_romeo')) return 'alfa_romeo';
  if (s.includes('racing_point')) return 'racing_point';
  if (s.includes('renault')) return 'renault';
  if (s === 'sauber')           return 'sauber';
  if (s.includes('audi') || s.includes('sauber') || s.includes('kick')) return 'audi';
  if (s.includes('cadillac') || s.includes('andretti')) return 'cadillac';
  return s;
}

function sprintClass(pts) {
  return { 8:'s8', 7:'s7', 6:'s6', 5:'s5', 4:'s4', 3:'s3', 2:'s2c', 1:'s1c' }[pts] || '';
}

// 2019–2024 awarded +1 for fastest lap to a top-10 finisher, so 26/19/16 are still 1st/2nd/3rd.
const RACE_CLASS = {
  25:'p25', 26:'p25', 18:'p18', 19:'p18', 15:'p15', 16:'p15',
  12:'p12', 10:'p10', 8:'p8', 6:'p6', 4:'p4', 2:'p2', 1:'p1',
};
const PODIUM_CLASS = { 1:'p25', 2:'p18', 3:'p15' };

function raceClass(pts, position) {
  if (position != null) return PODIUM_CLASS[position] || (pts >= 1 ? 'p1' : '');
  return RACE_CLASS[pts] || (pts >= 1 ? 'p1' : '');
}

const RACE_FORM_SCORE = { 25: 20, 26: 20, 18: 16, 19: 16, 15: 13, 16: 13, 12: 10, 10: 8, 8: 6, 6: 5, 4: 4, 2: 3, 1: 2 };

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

function championshipOrder(a, b) {
  if (a.championship_position != null || b.championship_position != null) {
    return (a.championship_position ?? Infinity) - (b.championship_position ?? Infinity)
      || b.total - a.total;
  }
  if (a.championship_status !== b.championship_status) {
    if (a.championship_status === 'DSQ') return 1;
    if (b.championship_status === 'DSQ') return -1;
  }
  return b.total - a.total;
}

function processData(raw) {
  const historical = raw.year < CURRENT_YEAR;
  const completedR  = new Set(raw.completed_rounds);
  const completedSR = new Set(raw.completed_sprint_rounds);
  const cancelledR  = new Set(raw.cancelled_rounds);

  // Theoretical max: every driver can win everything
  const futureRaces   = raw.races.filter(r => !r.completed && !r.cancelled).length;
  const futureSprints = raw.sprint_rounds.filter(r => !completedSR.has(r) && !cancelledR.has(r)).length;
  const maxPerDriver  = futureRaces * 25 + futureSprints * 8;
  // A team's best finish is 1-2: 25+18 per race, 8+7 per sprint
  const maxPerTeam    = futureRaces * (25 + 18) + futureSprints * (8 + 7);

  const drivers = raw.drivers.map(d => historical
    ? { ...d }
    : { ...d, possible: d.total + maxPerDriver }
  ).sort(championshipOrder);

  // Constructor points are pre-attributed per round. Each team has two future
  // seats, so a substitute driver must not create a third seat in the max.
  const consMap = {};
  const ensure = (k, name) => {
    if (!consMap[k]) consMap[k] = { name, total: 0, possible: 0, color: TEAM_COLORS[k] || '#ccc' };
    return consMap[k];
  };
  for (const c of raw.constructors) {
    const constructor = ensure(teamKey(c.id), c.name);
    constructor.total += c.total;
    if (c.championship_position != null) constructor.championship_position = c.championship_position;
  }
  for (const d of drivers) {
    ensure(teamKey(d.constructor_id), d.constructor_name);
  }
  if (!historical) {
    for (const c of Object.values(consMap)) {
      c.possible = c.total + maxPerTeam;
    }
  }
  const constructors = Object.values(consMap).sort(championshipOrder);

  return {
    historical,
    races: raw.races,
    sprintRounds: raw.sprint_rounds.slice().sort((a, b) => a - b),
    completedR, completedSR, cancelledR,
    drivers, constructors,
  };
}

// ── driver table ─────────────────────────────────────────────────────────────

function buildDriverTable(data) {
  const { historical, races, sprintRounds, completedR, completedSR, cancelledR, drivers } = data;

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
  if (!historical) {
    gth('', 'blank');
    gth('', 'blank');
    gth('', 'blank');
  }

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
  if (!historical) {
    cth('max', 'ph');
    cth('form', 'fh');
    cth('proj', 'xh');
  }

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
          td.textContent = pts;
          td.className = raceClass(pts, d.race_position?.[String(race.round)]);
        } else if (status === 'DNF') {
          td.className = 'dnf'; td.textContent = 'DNF';
        } else if (status === 'DNS') {
          td.className = 'dns'; td.textContent = 'DNS';
        } else if (status === 'DNQ') {
          td.className = 'dnq'; td.textContent = 'DNQ';
        }
      } else if (cancelledR.has(race.round)) {
        td.className = 'cancelled'; td.textContent = 'cnc';
      } else {
        td.className = 'future';
      }
    }

    const total = cell('totcell', d.total);
    if (d.championship_status === 'DSQ') {
      total.textContent = `${d.total} (DSQ)`;
      total.title = 'Excluded from the drivers championship; race points retained.';
    } else if (historical && d.championship_position != null) {
      const earned = Object.values(d.race_points).reduce((sum, pts) => sum + pts, 0)
        + Object.values(d.sprint_points).reduce((sum, pts) => sum + pts, 0);
      if (earned !== d.total) {
        total.title = `${d.total} counted championship points; ${earned} points across all races.`;
      }
    }
    if (!historical) {
      cell('poscell', d.possible);

      const completedRaceList = races.filter(r => completedR.has(r.round));
      const last5 = completedRaceList.slice(-5);
      const form   = computeForm(d, last5);
      const formTd = tr.insertCell();
      formTd.className = 'formcell';
      if (form !== null) {
        formTd.textContent = form;
        formTd.style.background = formColor(form);
      }

      const last3 = completedRaceList.slice(-3);
      const avg3  = last3.length === 0 ? 0
                  : last3.reduce((s, r) => s + (d.race_points[String(r.round)] ?? 0), 0) / last3.length;
      const futureRaceCount = races.filter(r => !r.completed && !r.cancelled).length;
      const projected = Math.round(d.total + avg3 * futureRaceCount);
      cell('projcell', projected);
    }
  }
}

// ── constructors sidebar ─────────────────────────────────────────────────────

function buildConstructors(constructors, historical) {
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
        ${historical ? '' : `<div class="con-max">theoretical max ${c.possible.toLocaleString()} pts</div>`}
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
  const year = selectedYear;
  const view = activeView;
  const request = ++loadRequest;
  const st   = document.getElementById('status');

  st.textContent = view === 'teams' ? 'Loading teams…' : `Loading ${year}…`;
  st.className   = '';
  if (view === 'teams') {
    document.getElementById('teamsTbl').replaceChildren();
    document.getElementById('teamsNotes').replaceChildren();
    document.getElementById('teamsSources').replaceChildren();
    document.getElementById('teamsSummary').textContent = '';
  } else {
    document.getElementById('seasonNote').hidden = year >= 2000;
    document.getElementById('driversTbl').innerHTML = '';
    document.getElementById('consList').innerHTML   = '';
  }

  try {
    const res = await fetch(view === 'teams' ? 'data/teams.json' : `data/${year}.json`);
    if (!res.ok) throw new Error(view === 'teams'
      ? `Could not load team history (HTTP ${res.status})`
      : `No data for ${year} — run fetch_data.py first (HTTP ${res.status})`);
    const raw  = await res.json();
    if (request !== loadRequest) return;
    if (view === 'teams') {
      buildTeams(raw);
    } else {
      const data = processData(raw);
      buildDriverTable(data);
      buildConstructors(data.constructors, data.historical);
    }

    st.textContent = '';
  } catch (e) {
    if (request !== loadRequest) return;
    st.textContent = e.message;
    st.className   = 'error';
    console.error(e);
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────

let selectedYear = CURRENT_YEAR;
let activeView = 'season';
let loadRequest = 0;
const historyToggle = document.getElementById('historyToggle');
const historyMenu = document.getElementById('historyMenu');
const seasonLabel = document.getElementById('seasonLabel');
const teamsToggle = document.getElementById('teamsToggle');

function selectView(view) {
  activeView = view;
  document.getElementById('seasonPanel').hidden = view === 'teams';
  document.getElementById('teamsPanel').hidden = view !== 'teams';
  teamsToggle.setAttribute('aria-pressed', String(view === 'teams'));
  seasonLabel.textContent = view === 'teams' ? 'Team history' : `${selectedYear} Season`;
  historyMenu.hidden = true;
  historyToggle.setAttribute('aria-expanded', 'false');
  init();
}

teamsToggle.addEventListener('click', () => {
  selectView(activeView === 'teams' ? 'season' : 'teams');
});

SEASON_YEARS.forEach(year => {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'history-option';
  option.setAttribute('role', 'menuitem');
  option.dataset.year = year;
  option.textContent = `${year} Season`;
  historyMenu.appendChild(option);
});

historyToggle.addEventListener('click', () => {
  const isExpanded = historyToggle.getAttribute('aria-expanded') === 'true';
  historyToggle.setAttribute('aria-expanded', String(!isExpanded));
  historyMenu.hidden = isExpanded;
});

historyMenu.addEventListener('click', event => {
  const option = event.target.closest('[data-year]');
  if (!option) return;
  selectedYear = Number(option.dataset.year);
  selectView('season');
});

document.addEventListener('click', event => {
  if (!event.target.closest('.history-picker')) {
    historyMenu.hidden = true;
    historyToggle.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    historyMenu.hidden = true;
    historyToggle.setAttribute('aria-expanded', 'false');
    historyToggle.focus();
  }
});

seasonLabel.textContent = `${selectedYear} Season`;
init();
