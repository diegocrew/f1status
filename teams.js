function teamPeriodValue(periods, year) {
  return periods.find(([from, to]) => year >= from && year <= to)?.[2];
}

function buildTeams(data) {
  const table = document.getElementById('teamsTbl');
  table.replaceChildren();
  table.setAttribute('aria-label', `Formula 1 team history, ${data.from} to ${data.to}`);
  const years = Array.from({ length: data.to - data.from + 1 }, (_, i) => data.from + i);
  const active = data.teams.filter(team => team.first_entry <= data.to &&
    (team.last_entry == null || team.last_entry >= data.to)).length;
  document.getElementById('teamsSummary').textContent =
    `${data.from}–${data.to} · ${data.teams.length} lineages · ${active} teams in ${data.to}`;

  const head = table.createTHead().insertRow();
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = 'Team lineage';
  head.appendChild(corner);
  for (const year of years) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = year;
    head.appendChild(th);
  }

  const body = table.createTBody();
  const notes = document.getElementById('teamsNotes');
  notes.replaceChildren();
  for (const team of data.teams) {
    const row = body.insertRow();
    row.dataset.team = team.id;
    row.style.setProperty('--team-color', team.color);
    const label = document.createElement('th');
    label.scope = 'row';
    const link = document.createElement('a');
    link.href = `#team-note-${team.id}`;
    link.textContent = team.label;
    label.appendChild(link);
    const lifespan = document.createElement('small');
    lifespan.textContent = `${team.first_entry}–${team.last_entry ?? 'present'}`;
    label.appendChild(lifespan);
    row.appendChild(label);

    for (const year of years) {
      const cell = row.insertCell();
      cell.dataset.year = year;
      const name = teamPeriodValue(team.names, year);
      if (!name) {
        cell.className = 'team-inactive';
        cell.textContent = '—';
        cell.setAttribute('aria-label', `${team.label}, ${year}: not active`);
        continue;
      }
      const engine = teamPeriodValue(team.engines, year);
      const title = document.createElement('div');
      title.className = 'team-entry-name';
      title.textContent = name;
      cell.appendChild(title);
      const engineLabel = document.createElement('div');
      engineLabel.className = 'team-engine';
      engineLabel.textContent = `Engine: ${engine}`;
      cell.appendChild(engineLabel);

      const events = [];
      if (year === team.first_entry) events.push(['new', 'New entry']);
      const previousName = teamPeriodValue(team.names, year - 1);
      const previousEngine = teamPeriodValue(team.engines, year - 1);
      if (!previousName && year > data.from && year > team.first_entry) {
        events.push(['new', 'Returned']);
      }
      if (previousName && previousName !== name) events.push(['renamed', 'Name change']);
      if (previousEngine && previousEngine !== engine) events.push(['engine', 'Engine change']);
      if (year === team.last_entry) events.push(['ended', 'Final season']);
      for (const [kind, text] of events) {
        const badge = document.createElement('span');
        badge.className = `team-badge team-${kind}`;
        badge.textContent = text;
        cell.appendChild(badge);
      }
    }

    const note = document.createElement('div');
    note.id = `team-note-${team.id}`;
    note.tabIndex = -1;
    const heading = document.createElement('h3');
    heading.textContent = team.label;
    const text = document.createElement('p');
    text.textContent = team.note;
    note.append(heading, text);
    notes.appendChild(note);
  }

  const sources = document.getElementById('teamsSources');
  sources.replaceChildren();
  for (const source of data.sources) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.label;
    item.appendChild(link);
    sources.appendChild(item);
  }
}
