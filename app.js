// Lead (1) / support (2) driver per season, keyed by driverId
const DRIVER_STATUS = {
  2026: {
    russell: 1, antonelli: 2,
    hamilton: 1, leclerc: 2,
    norris: 1,   piastri: 2,
    verstappen: 1, hadjar: 2,
    sainz: 1,    albon: 2,
    gasly: 1,    colapinto: 2,
    ocon: 1,     bearman: 2,
    lawson: 1,   lindblad: 2,
    hulkenberg: 1, bortileto: 2,
    alonso: 1,   stroll: 2,
    perez: 1,    bottas: 2,
  },
};

const TEAM_COLORS = {
  mercedes:     "#00D2BE",
  ferrari:      "#DC0000",
  mclaren:      "#FF8000",
  red_bull:     "#3671C6",
  williams:     "#005AFF",
  alpine:       "#FF87BC",
  haas:         "#B6BABD",
  rb:           "#6692FF",
  aston_martin: "#358C75",
  audi:         "#52E252",
  cadillac:     "#8B5E3C",
};

function teamKey(id) {
  const s = (id || "").toLowerCase();
  if (s.includes("mercedes"))   return "mercedes";
  if (s.includes("ferrari"))    return "ferrari";
  if (s.includes("mclaren"))    return "mclaren";
  if (s.includes("red_bull") || s.includes("redbull")) return "red_bull";
  if (s.includes("williams"))   return "williams";
  if (s.includes("alpine"))     return "alpine";
  if (s.includes("haas"))       return "haas";
  if (s.includes("rb") || s.includes("racing_bulls") || s.includes("visa") ||
      s.includes("alphatauri")  || s.includes("toro")) return "rb";
  if (s.includes("aston"))      return "aston_martin";
  if (s.includes("audi") || s.includes("sauber") || s.includes("kick")) return "audi";
  if (s.includes("cadillac") || s.includes("andretti")) return "cadillac";
  return s;
}

function sprintClass(pts) {
  return { 8:"s8",7:"s7",6:"s6",5:"s5",4:"s4",3:"s3",2:"s2c",1:"s1c" }[pts] || "";
}

function raceClass(pts) {
  return { 25:"p25",18:"p18",15:"p15",12:"p12",10:"p10",8:"p8",6:"p6",4:"p4",2:"p2",1:"p1" }[pts]
      || (pts >= 1 ? "p1" : "");
}

// ── table builders ──────────────────────────────────────────────────────────

function buildDriverTable(data) {
  const { races, drivers, sprint_rounds, completed_rounds,
          completed_sprint_rounds, cancelled_rounds, year } = data;

  const statusMap    = DRIVER_STATUS[year] || {};
  const sprintRndSet = new Set(sprint_rounds);
  const completedR   = new Set(completed_rounds);
  const completedSR  = new Set(completed_sprint_rounds);
  const cancelledSet = new Set(cancelled_rounds);

  const sprintRounds = sprint_rounds.slice().sort((a, b) => a - b);

  const tbl   = document.getElementById("driversTbl");
  tbl.innerHTML = "";
  const thead = tbl.createTHead();
  const tbody = tbl.createTBody();

  // Row 1 – group headers
  const gr = thead.insertRow();
  gr.className = "gh";
  const gth = (txt, cls, cs = 1) => {
    const t = document.createElement("th");
    t.textContent = txt;
    t.className = cls;
    if (cs > 1) t.colSpan = cs;
    gr.appendChild(t);
  };
  gth("", "blank"); gth("", "blank"); gth("", "blank");
  if (sprintRounds.length) gth(`Sprint ×${sprintRounds.length}`, "sgrp", sprintRounds.length);
  gth(`Races ×${races.length}`, "rgrp", races.length);
  gth("", "tgrp");
  gth("", "blank");

  // Row 2 – column headers
  const cr = thead.insertRow();
  cr.className = "ch";
  const cth = (html, cls) => {
    const t = document.createElement("th");
    t.innerHTML = html;
    t.className = cls;
    cr.appendChild(t);
  };
  cth("#", ""); cth("Team", ""); cth("Name", "");

  sprintRounds.forEach((rnd, i) => {
    const race = races.find(r => r.round === rnd);
    cth(`s${String(i + 1).padStart(2, "0")}<br><small>${race ? race.code : "?"}</small>`, "sh");
  });
  races.forEach((race, i) => {
    cth(`r${String(i + 1).padStart(2, "0")}<br><small>${race.code}</small>`, "rh");
  });
  cth("total", "th");
  cth("possible", "ph");

  // Data rows
  for (const d of drivers) {
    const tr   = tbody.insertRow();
    const tk   = teamKey(d.constructor_id);
    const color = TEAM_COLORS[tk] || "#ccc";
    const st   = statusMap[d.id] || "";

    const cell = (cls, text = "") => {
      const td = tr.insertCell();
      td.className = cls;
      td.textContent = text;
      return td;
    };

    const sc = cell(`sc${st ? " s" + st : ""}`);
    sc.textContent = st;

    const tc = cell("tc", d.constructor_name);
    tc.style.borderLeft = `4px solid ${color}`;

    cell("nc", d.family_name);

    for (const rnd of sprintRounds) {
      const td = tr.insertCell();
      if (completedSR.has(rnd)) {
        const pts = d.sprint_points[String(rnd)] ?? 0;
        if (pts > 0) { td.textContent = pts; td.className = sprintClass(pts); }
      } else if (cancelledSet.has(rnd)) {
        td.className = "cancelled"; td.textContent = "cnc";
      } else {
        td.className = "future";
      }
    }

    for (const race of races) {
      const td = tr.insertCell();
      if (completedR.has(race.round)) {
        const pts = d.race_points[String(race.round)] ?? 0;
        if (pts > 0) { td.textContent = pts; td.className = raceClass(pts); }
      } else if (cancelledSet.has(race.round)) {
        td.className = "cancelled"; td.textContent = "cnc";
      } else {
        td.className = "future";
      }
    }

    cell("totcell", d.total);
    cell("poscell", d.possible);
  }
}

function buildConstructorsTable(data) {
  const { drivers } = data;
  const cons = {};

  for (const d of drivers) {
    const k = teamKey(d.constructor_id);
    if (!cons[k]) cons[k] = { name: d.constructor_name, total: 0, possible: 0, color: TEAM_COLORS[k] || "#ccc" };
    cons[k].total    += d.total;
    cons[k].possible += d.possible;
  }

  const sorted = Object.values(cons).sort((a, b) => b.total - a.total);
  const tbl    = document.getElementById("consTbl");
  tbl.innerHTML = "";
  const thead = tbl.createTHead();
  const tbody = tbl.createTBody();

  const hr = thead.insertRow();
  ["Team", "Total", "Possible"].forEach(h => {
    const t = document.createElement("th"); t.textContent = h; hr.appendChild(t);
  });

  for (const c of sorted) {
    const tr = tbody.insertRow();
    const nt = tr.insertCell(); nt.textContent = c.name; nt.className = "cn"; nt.style.borderLeft = `4px solid ${c.color}`;
    const tt = tr.insertCell(); tt.textContent = c.total;    tt.className = "totcell";
    const pt = tr.insertCell(); pt.textContent = c.possible; pt.className = "poscell";
  }
}

// ── data loading ────────────────────────────────────────────────────────────

async function loadYear(year) {
  const res = await fetch(`data/${year}.json`);
  if (!res.ok) throw new Error(`No data for ${year} yet — run fetch_data.py first (HTTP ${res.status})`);
  return res.json();
}

async function init() {
  const year   = +document.getElementById("yearSel").value;
  const st     = document.getElementById("status");
  st.textContent = `Loading ${year}…`;
  st.className   = "";
  st.style.display = "block";
  document.getElementById("main").style.display = "none";
  document.getElementById("driversTbl").innerHTML = "";
  document.getElementById("consTbl").innerHTML    = "";

  try {
    const data = await loadYear(year);
    buildDriverTable(data);
    buildConstructorsTable(data);
    st.style.display = "none";
    document.getElementById("main").style.display = "flex";
    document.getElementById("lastUpdated").textContent =
      `Data fetched ${new Date(data.fetched_at).toLocaleString()}`;
  } catch (e) {
    st.textContent = e.message;
    st.className   = "error";
    console.error(e);
  }
}

// ── boot ────────────────────────────────────────────────────────────────────

const sel = document.getElementById("yearSel");
const cy  = new Date().getFullYear();
for (let y = cy; y >= 2018; y--) {
  const o = document.createElement("option");
  o.value = y; o.textContent = `${y} Season`;
  if (y === cy) o.selected = true;
  sel.appendChild(o);
}
sel.addEventListener("change", init);
init();
