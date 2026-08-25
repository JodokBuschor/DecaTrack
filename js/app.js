const DISCIPLINES = [
  { id:"100m", name:"100 m", order:1, unitHint:"z. B. 10.95 s", color:"#ff5a5f" },
  { id:"longjump", name:"Weitsprung", order:2, unitHint:"z. B. 7.20 m", color:"#ff9f43" },
  { id:"shotput", name:"Kugelstossen", order:3, unitHint:"z. B. 13.50 m", color:"#27c6d9" },
  { id:"highjump", name:"Hochsprung", order:4, unitHint:"z. B. 1.95 m", color:"#b7ff4a" },
  { id:"400m", name:"400 m", order:5, unitHint:"z. B. 49.80 s", color:"#9b5cff" },
  { id:"110h", name:"110 m Hürden", order:6, unitHint:"z. B. 15.20 s", color:"#3b82f6" },
  { id:"discus", name:"Diskus", order:7, unitHint:"z. B. 42.00 m", color:"#22c55e" },
  { id:"polevault", name:"Stabhochsprung", order:8, unitHint:"z. B. 5.00 m", color:"#f43f8c" },
  { id:"javelin", name:"Speer", order:9, unitHint:"z. B. 52.00 m", color:"#14b8a6" },
  { id:"1500m", name:"1500 m", order:10, unitHint:"z. B. 4:35 min", color:"#2563eb" }
];

const ATHLETICS = { id:"athletics", name:"Athletik", order:"A", color:"#8b95a1" };
const STRENGTH = { id:"strength", name:"Krafttraining", color:"#f2c94c" };

const STORAGE_KEY = "decatrack_v1";
const STATUS_START = 50;

const RATING_TEXT = {
  "-5":"Sehr schlecht",
  "-4":"Sehr schwierig",
  "-3":"Schwierig",
  "-2":"Eher schlecht",
  "-1":"Leicht negativ",
  "0":"Neutral",
  "1":"Leicht positiv",
  "2":"Gut",
  "3":"Sehr gut",
  "4":"Stark",
  "5":"Top"
};

function normalizeRating(value) {
  const n = Number(value);
  return Math.max(-5, Math.min(5, Number.isFinite(n) ? n : 0));
}

function migrateLegacyRating(value, sourceVersion) {
  const n = Number(value);
  if (Number(sourceVersion || 0) < 7 && n >= 1 && n <= 5) {
    return {1:-2, 2:-1, 3:0, 4:1, 5:2}[n];
  }
  return normalizeRating(n);
}

function ratingText(value) {
  return RATING_TEXT[String(normalizeRating(value))] || "Neutral";
}

function ratingSelectOptions() {
  return Array.from({length:11}, (_,i)=>i-5).map(v => {
    const label = `${v > 0 ? "+" : ""}${v} · ${RATING_TEXT[String(v)]}`;
    return `<option value="${v}" ${v===0 ? "selected" : ""}>${label}</option>`;
  }).join("");
}

function initialState() {
  const goals = {}, infos = {};
  DISCIPLINES.forEach(d => {
    goals[d.id] = { performance:"", technique:"" };
    infos[d.id] = [];
  });
  goals[ATHLETICS.id] = { performance:"", technique:"" };
  infos[ATHLETICS.id] = [];

  return {
    version: 10,
    goals,
    infos,
    entries: [],
    athleticEntries: [],
    strengthSessions: []
  };
}

function migrateState(parsed) {
  const base = initialState();
  const goals = {...base.goals};
  const infos = {...base.infos};

  DISCIPLINES.forEach(d => {
    const g = parsed?.goals?.[d.id] || {};
    goals[d.id] = {
      performance: g.performance || "",
      technique: g.technique || g.focus || g.notes || ""
    };
    infos[d.id] = Array.isArray(parsed?.infos?.[d.id]) ? parsed.infos[d.id] : [];
  });

  const ag = parsed?.goals?.[ATHLETICS.id] || {};
  goals[ATHLETICS.id] = {
    performance: ag.performance || "",
    technique: ag.technique || ""
  };
  infos[ATHLETICS.id] = Array.isArray(parsed?.infos?.[ATHLETICS.id]) ? parsed.infos[ATHLETICS.id] : [];

  const oldEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const entries = oldEntries.map(e => ({
    ...e,
    description: e.description || e.notes || e.type || "",
    rating: migrateLegacyRating(e.rating ?? 3, parsed?.version)
  }));

  let athleticEntries = Array.isArray(parsed?.athleticEntries) ? parsed.athleticEntries : [];
  // v3 stored athletics per discipline. In v4 all athletics become one central history.
  athleticEntries = athleticEntries.map(e => ({
    ...e,
    disciplineId: ATHLETICS.id,
    description: e.description || e.notes || e.type || "",
    rating: migrateLegacyRating(e.rating ?? 3, parsed?.version)
  }));

  const rawStrengthSessions = Array.isArray(parsed?.strengthSessions)
    ? parsed.strengthSessions
    : (Array.isArray(parsed?.strength)
        ? parsed.strength.map(e => ({
            id: e.id || uid(),
            date: e.date || "",
            rating: Number(e.rating || 3),
            notes: e.notes || "",
            exercises: [{
              id: uid(),
              name: e.exercise || "Übung",
              sets: e.sets || "",
              reps: e.reps || "",
              weight: e.weight || "",
              rating: Number(e.rating || 3)
            }]
          }))
        : []);

  const strengthSessions = rawStrengthSessions.map(session => ({
    ...session,
    rating: migrateLegacyRating(session.rating ?? 3, parsed?.version),
    exercises: Array.isArray(session.exercises)
      ? session.exercises.map(ex => ({
          ...ex,
          rating: migrateLegacyRating(ex.rating ?? 3, parsed?.version)
        }))
      : []
  }));

  return {
    ...base,
    ...parsed,
    version: 10,
    goals,
    infos,
    entries,
    athleticEntries,
    strengthSessions
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed ? migrateState(parsed) : initialState();
  } catch {
    return initialState();
  }
}

let state = loadState();
let route = {page:"dashboard", id:null};
let editingGoals = false;
let detailContext = null;
let strengthDraftExercises = [];
let strengthFormOpen = false;
let calendarCursor = new Date();
let selectedCalendarDate = todayISO();

const app = document.getElementById("app");
const pageTitle = document.getElementById("page-title");
const quickAddBtn = document.getElementById("quick-add-btn");
const entryDialog = document.getElementById("entry-dialog");
const detailDialog = document.getElementById("detail-dialog");

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
function todayISO() {
  const d = new Date();
  const tz = new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return tz.toISOString().slice(0,10);
}
function formatDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"})
    .format(new Date(iso+"T12:00:00"));
}
function escapeHtml(v="") {
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function getDiscipline(id){ return DISCIPLINES.find(d=>d.id===id); }

function getArea(id) {
  if (id === ATHLETICS.id) return ATHLETICS;
  return getDiscipline(id);
}

function isAthletics(id) {
  return id === ATHLETICS.id;
}

function areaColor(id) {
  if (id === ATHLETICS.id) return ATHLETICS.color;
  if (id === STRENGTH.id) return STRENGTH.color;
  return getDiscipline(id)?.color || "#8b95a1";
}

function areaName(id) {
  if (id === ATHLETICS.id) return ATHLETICS.name;
  if (id === STRENGTH.id) return STRENGTH.name;
  return getDiscipline(id)?.name || "Training";
}

function disciplineIcon(id) {
  const common = `viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    "100m": `<svg ${common}><circle cx="14" cy="5" r="2"/><path d="M10 21l2-6 3 2 2 4M12 9l-3 4-4 1M12 9l4 3 3-1M12 9l2-2"/></svg>`,
    "longjump": `<svg ${common}><path d="M3 19h18"/><circle cx="8" cy="7" r="2"/><path d="M9 9l3 3 4 1M12 12l-3 4M12 12l5-3M17 9l3 2"/></svg>`,
    "shotput": `<svg ${common}><circle cx="18" cy="6" r="2.4"/><circle cx="8" cy="7" r="2"/><path d="M9 9l4 3 3-4M12 12l-4 4M12 12l3 5M5 20h14"/></svg>`,
    "highjump": `<svg ${common}><path d="M4 18V8M20 18V8M4 11h16"/><circle cx="10" cy="6" r="2"/><path d="M11 8c2 1 4 2 5 5M13 11l-5 4M15 13l3 4"/></svg>`,
    "400m": `<svg ${common}><circle cx="14" cy="5" r="2"/><path d="M10 21l2-6 3 2 2 4M12 9l-3 4-4 1M12 9l4 3 3-1"/><path d="M4 21h16"/></svg>`,
    "110h": `<svg ${common}><path d="M3 17h7M14 17h7M6 17v-5h5M18 17v-5h-5"/><circle cx="11" cy="5" r="2"/><path d="M11 7l2 4 4 2M13 11l-4 4"/></svg>`,
    "discus": `<svg ${common}><circle cx="8" cy="7" r="2"/><circle cx="18" cy="8" r="2.7"/><path d="M9 9l4 3 4-2M13 12l-5 4M13 12l2 5M4 20h15"/></svg>`,
    "polevault": `<svg ${common}><path d="M4 20L19 4"/><circle cx="9" cy="6" r="2"/><path d="M10 8l3 3 3 1M13 11l-4 4M13 11l2 5"/></svg>`,
    "javelin": `<svg ${common}><circle cx="8" cy="7" r="2"/><path d="M9 9l4 3M13 12l-5 4M13 12l3 5"/><path d="M12 8L21 4M18 4h3v3"/></svg>`,
    "1500m": `<svg ${common}><circle cx="14" cy="5" r="2"/><path d="M10 21l2-6 3 2 2 4M12 9l-3 4-4 1M12 9l4 3 3-1"/><path d="M3 20c4-2 14-2 18 0"/></svg>`,
    "athletics": `<svg ${common}><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>`
  };

  return icons[id] || icons["athletics"];
}

function calcStatus(id) {
  const source = isAthletics(id) ? state.athleticEntries : state.entries;
  const delta = source
    .filter(e => isAthletics(id) ? true : e.disciplineId===id)
    .reduce((sum,e)=>sum+normalizeRating(e.rating),0);
  return clamp(STATUS_START+delta,0,100);
}

function statusClass(s) {
  if (s<35) return "low";
  if (s<55) return "mid";
  if (s<75) return "good";
  return "high";
}
function statusText(s) {
  if (s<35) return "Schwach";
  if (s<55) return "Aufbau";
  if (s<75) return "Gut";
  return "Sehr gut";
}
function ratingBadge(rating, showDelta=true) {
  const delta = normalizeRating(rating);
  const d = delta > 0 ? `+${delta}` : String(delta);
  const cls = delta <= -4 ? "r1"
    : delta <= -2 ? "r2"
    : delta <= 1 ? "r3"
    : delta <= 3 ? "r4"
    : "r5";
  return `<span class="rating-badge ${cls}">${showDelta ? `${d} · ` : ""}${ratingText(rating)}</span>`;
}

function readHash() {
  const raw = location.hash.replace("#","");
  if (!raw) return {page:"dashboard",id:null};
  const [page,id] = raw.split("/");
  return {page,id:id||null};
}
function setRoute(page,id=null) {
  editingGoals = false;
  route = {page,id};
  location.hash = id ? `${page}/${id}` : page;
  render();
}
function updateNav() {
  document.querySelectorAll(".nav-item").forEach(btn=>{
    const target = btn.dataset.route;
    btn.classList.toggle("active",
      target===route.page || (target==="disciplines" && route.page==="discipline")
    );
  });
}

function render() {
  route = readHash();
  updateNav();
  quickAddBtn.hidden = route.page !== "disciplines";

  if (route.page==="dashboard") renderDashboard();
  else if (route.page==="disciplines") renderDisciplines();
  else if (route.page==="discipline") renderArea(route.id);
  else if (route.page==="strength") renderStrength();
  else if (route.page==="data") renderData();
  else renderDashboard();
}

function statusMarkup(status,label="Stand") {
  return `
    <div class="status-block">
      <div class="status-head">
        <span class="status-label">${escapeHtml(label)}</span>
        <span class="status-value">${status}<small style="font-size:11px;color:var(--muted)"> / 100</small></span>
      </div>
      <div class="status-track">
        <div class="status-fill ${statusClass(status)}" style="width:${status}%"></div>
      </div>
    </div>
  `;
}

function areaCard(area) {
  const status = calcStatus(area.id);
  return `
    <article
      class="card discipline-card discipline-colored"
      data-discipline="${area.id}"
      style="--discipline-color:${area.color}"
    >
      <div class="discipline-card-head simple">
        <span class="discipline-event-icon">${disciplineIcon(area.id)}</span>
        <div class="discipline-name">${escapeHtml(area.name)}</div>
      </div>
      ${statusMarkup(status,"Aktueller Stand")}
    </article>
  `;
}


function allAreaStats() {
  return [...DISCIPLINES, ATHLETICS].map(area => ({
    ...area,
    status: calcStatus(area.id),
    entries: getAreaEntries(area.id)
  }));
}

function allCalendarTrainings() {
  const items = [];

  state.entries.forEach(e => {
    items.push({
      id:e.id,
      date:e.date,
      title:getDiscipline(e.disciplineId)?.name || "Disziplin",
      subtitle:e.result || e.description || "Disziplintraining",
      description:e.description || "",
      result:e.result || "",
      rating:e.rating,
      kind:"discipline",
      areaId:e.disciplineId,
      color:areaColor(e.disciplineId)
    });
  });

  state.athleticEntries.forEach(e => {
    items.push({
      id:e.id,
      date:e.date,
      title:"Athletik",
      subtitle:e.result || e.description || "Athletiktraining",
      description:e.description || "",
      result:e.result || "",
      rating:e.rating,
      kind:"athletic",
      areaId:ATHLETICS.id,
      color:ATHLETICS.color
    });
  });

  state.strengthSessions.forEach(s => {
    items.push({
      id:s.id,
      date:s.date,
      title:"Krafttraining",
      subtitle:`${(s.exercises || []).length} Übungen`,
      description:s.notes || "",
      result:"",
      rating:s.rating,
      kind:"strength",
      areaId:STRENGTH.id,
      color:STRENGTH.color
    });
  });

  return items.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}

function trainingsForDate(date) {
  return allCalendarTrainings().filter(item => item.date === date);
}

function calendarMonthTitle(date) {
  return new Intl.DateTimeFormat("de-CH", {month:"long", year:"numeric"}).format(date);
}

function isoFromParts(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2,"0");
  const d = String(day).padStart(2,"0");
  return `${year}-${m}-${d}`;
}

function renderCalendarGrid() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = mondayOffset - 1; i >= 0; i--) {
    const day = prevDays - i;
    const prev = new Date(year, month - 1, day);
    const iso = isoFromParts(prev.getFullYear(), prev.getMonth(), day);
    cells.push(calendarDayCell(day, iso, true));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = isoFromParts(year, month, day);
    cells.push(calendarDayCell(day, iso, false));
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const next = new Date(year, month + 1, nextDay);
    const iso = isoFromParts(next.getFullYear(), next.getMonth(), nextDay);
    cells.push(calendarDayCell(nextDay, iso, true));
    nextDay++;
  }

  return cells.join("");
}

function calendarDayCell(day, iso, outside) {
  const trainings = trainingsForDate(iso);
  const selected = selectedCalendarDate === iso;
  const today = todayISO() === iso;
  const markers = trainings.slice(0,5).map(item =>
    `<span class="calendar-marker" style="background:${item.color}"></span>`
  ).join("");

  return `
    <button
      class="calendar-day ${outside ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""}"
      data-calendar-date="${iso}"
      type="button"
    >
      <span class="calendar-day-number">${day}</span>
      <span class="calendar-markers">${markers}</span>
    </button>
  `;
}

function calendarTrainingCard(item) {
  return `
    <article
      class="calendar-training-card"
      data-calendar-entry-id="${item.id}"
      data-calendar-entry-kind="${item.kind}"
      style="--entry-color:${item.color}"
    >
      <span class="calendar-training-accent"></span>
      <div class="calendar-training-body">
        <div class="entry-top">
          <div>
            <div class="entry-title">${escapeHtml(item.title)}</div>
            <div class="entry-meta">${escapeHtml(item.subtitle)}</div>
          </div>
          ${ratingBadge(item.rating,false)}
        </div>
      </div>
    </article>
  `;
}

function averageStatus() {
  const stats = allAreaStats();
  if (!stats.length) return 50;
  return Math.round(stats.reduce((sum,a)=>sum+a.status,0)/stats.length);
}


function renderDashboard() {
  pageTitle.textContent = "Kalender";

  const selectedTrainings = trainingsForDate(selectedCalendarDate);
  const monthItems = allCalendarTrainings().filter(item => {
    const d = new Date(item.date + "T12:00:00");
    return d.getFullYear() === calendarCursor.getFullYear() &&
      d.getMonth() === calendarCursor.getMonth();
  });
  const activeDays = new Set(monthItems.map(i=>i.date)).size;

  app.innerHTML = `
    <section class="calendar-shell">
      <div class="calendar-toolbar">
        <button class="calendar-nav-btn" data-action="calendar-prev" type="button">‹</button>
        <div class="calendar-title-wrap">
          <p class="eyebrow">TRAININGSKALENDER</p>
          <h2>${escapeHtml(calendarMonthTitle(calendarCursor))}</h2>
        </div>
        <button class="calendar-nav-btn" data-action="calendar-next" type="button">›</button>
      </div>

      <div class="calendar-weekdays">
        <span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
      </div>

      <div class="calendar-grid">
        ${renderCalendarGrid()}
      </div>

      <div class="calendar-month-summary">
        <div>
          <strong>${monthItems.length}</strong>
          <span>Einheiten</span>
        </div>
        <div>
          <strong>${activeDays}</strong>
          <span>Trainingstage</span>
        </div>
        <button class="btn secondary small-btn" data-action="calendar-today" type="button">Heute</button>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">AUSGEWÄHLTER TAG</p>
          <h2>${formatDate(selectedCalendarDate)}</h2>
        </div>
        <span class="muted small">${selectedTrainings.length} ${selectedTrainings.length === 1 ? "Einheit" : "Einheiten"}</span>
      </div>

      ${selectedTrainings.length
        ? `<div class="calendar-training-list">${selectedTrainings.map(calendarTrainingCard).join("")}</div>`
        : `<div class="empty">An diesem Tag ist noch kein Training eingetragen.</div>`
      }
    </section>

    <section class="section">
      <details class="collapsible">
        <summary>Farblegende</summary>
        <div class="collapsible-body">
          <div class="calendar-legend">
            ${[...DISCIPLINES, ATHLETICS, STRENGTH].map(area => `
              <div class="legend-item">
                <span class="legend-dot" style="background:${area.color}"></span>
                <span>${escapeHtml(area.name)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </details>
    </section>
  `;
}

function renderDisciplines() {
  pageTitle.textContent = "Disziplinen";

  const stats = allAreaStats();
  const avg = averageStatus();
  const totalEntries = state.entries.length + state.athleticEntries.length;
  const recent = [...state.entries, ...state.athleticEntries]
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const last = recent[0];

  app.innerHTML = `
    <section class="area-overview">
      <div class="overview-title-row">
        <div>
          <p class="eyebrow">DISZIPLINÜBERSICHT</p>
          <h2>Zehnkampf & Athletik</h2>
        </div>
        <div class="dashboard-score">${avg}</div>
      </div>

      <div class="status-track" style="margin-top:14px">
        <div class="status-fill ${statusClass(avg)}" style="width:${avg}%"></div>
      </div>

      <div class="overview-stats">
        <div class="overview-stat">
          <strong>${stats.length}</strong>
          <span>Bereiche</span>
        </div>
        <div class="overview-stat">
          <strong>${totalEntries}</strong>
          <span>Trainings</span>
        </div>
        <div class="overview-stat">
          <strong>${last ? formatDate(last.date).slice(0,5) : "–"}</strong>
          <span>Letztes Training</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="grid discipline-grid">
        ${[...DISCIPLINES, ATHLETICS].map(areaCard).join("")}
      </div>
    </section>
  `;
}

function renderGoals(area, goal) {
  const isAth = isAthletics(area.id);

  if (!editingGoals) {
    return `
      <div class="goal-summary">
        <div class="goal-display">
          <span>${isAth ? "Athletikziel" : "Leistungsziel"}</span>
          <strong>${goal.performance?.trim() ? escapeHtml(goal.performance) : "Noch kein Ziel gesetzt"}</strong>
        </div>
        <div class="goal-display">
          <span>${isAth ? "Schwerpunkt" : "Technikziel"}</span>
          <strong>${goal.technique?.trim() ? escapeHtml(goal.technique) : "Noch kein Ziel gesetzt"}</strong>
        </div>
      </div>
    `;
  }

  return `
    <form class="goal-form" id="goal-form">
      <label>
        ${isAth ? "Athletikziel" : "Leistungsziel"}
        <input name="performance" value="${escapeHtml(goal.performance||"")}" placeholder="${isAth ? "z. B. Explosivität und Sprintkraft verbessern" : escapeHtml(area.unitHint)}" />
      </label>
      <label>
        ${isAth ? "Schwerpunkt" : "Technikziel"}
        <textarea name="technique" rows="4" placeholder="${isAth ? "z. B. Sprungkraft, Mobilität, Rumpfstabilität..." : "z. B. aktiver Absprung, Rhythmus, Anlaufkontrolle..."}">${escapeHtml(goal.technique||"")}</textarea>
      </label>
      <div class="dialog-actions" style="margin-top:0">
        <button class="btn secondary" type="button" data-action="cancel-goals">Abbrechen</button>
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>
  `;
}

function renderInfoSection(id) {
  const infos = state.infos[id] || [];
  return `
    <details class="collapsible section">
      <summary>${isAthletics(id) ? "Athletik-Infos" : "Disziplin-Infos"}</summary>
      <div class="collapsible-body">
        ${infos.length ? `
          <div class="info-list">
            ${infos.map(i=>`
              <div class="info-row">
                <span>${escapeHtml(i.label)}</span>
                <strong>${escapeHtml(i.value)}</strong>
              </div>`).join("")}
          </div>` : `<p class="muted small">Noch keine Infos eingetragen.</p>`}

        <form id="info-form" class="info-form">
          <div class="info-editor-row">
            <label>
              Bezeichnung
              <input name="label" placeholder="${isAthletics(id) ? "z. B. Beweglichkeit" : "z. B. Anlauflänge"}" required />
            </label>
            <label>
              Wert
              <input name="value" placeholder="${isAthletics(id) ? "z. B. Fokus Hüfte" : "z. B. 18 Schritte"}" required />
            </label>
            <button class="btn primary" type="submit">＋</button>
          </div>
        </form>

        ${infos.length ? `<button class="btn danger small-btn" data-action="clear-infos">Infos löschen</button>` : ""}
      </div>
    </details>
  `;
}

function getAreaEntries(id) {
  const source = isAthletics(id) ? state.athleticEntries : state.entries;
  return source
    .filter(e => isAthletics(id) ? true : e.disciplineId===id)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}

function entryCard(e, kind) {
  return `
    <article class="entry clickable" data-entry-id="${e.id}" data-entry-kind="${kind}">
      <div class="entry-top">
        <div>
          <div class="entry-title">${formatDate(e.date)}</div>
          <div class="entry-meta">Antippen für Details</div>
        </div>
        ${ratingBadge(e.rating)}
      </div>
      ${e.result ? `<div class="entry-result">${escapeHtml(e.result)}</div>` : ""}
      <p class="entry-preview">${escapeHtml(e.description||"")}</p>
    </article>
  `;
}

function renderArea(id) {
  const area = getArea(id);
  if (!area) return setRoute("disciplines");

  pageTitle.textContent = area.name;
  const goal = state.goals[id] || {};
  const status = calcStatus(id);
  const entries = getAreaEntries(id);
  const visibleEntries = entries.slice(0,5);
  const ath = isAthletics(id);
  const last = entries[0];
  const avgRatingValue = entries.length
    ? entries.reduce((sum,e)=>sum+normalizeRating(e.rating),0)/entries.length
    : null;
  const avgRating = avgRatingValue === null
    ? "–"
    : `${avgRatingValue > 0 ? "+" : ""}${avgRatingValue.toFixed(1)}`;

  app.innerHTML = `
    <button class="back-btn" data-action="back-disciplines">← Alle Bereiche</button>

    <section class="area-overview area-overview-colored" style="--area-color:${area.color}">
      <div class="overview-title-row">
        <div class="area-title-with-icon">
          <span class="area-title-icon" style="color:${area.color}">${disciplineIcon(area.id)}</span>
          <div>
            <p class="eyebrow">${ath ? "ATHLETIK" : "DISZIPLIN"}</p>
            <h2>${escapeHtml(area.name)}</h2>
          </div>
        </div>
        <div class="dashboard-score">${status}</div>
      </div>

      <div class="status-track" style="margin-top:14px">
        <div class="status-fill ${statusClass(status)}" style="width:${status}%"></div>
      </div>

      <div class="overview-stats">
        <div class="overview-stat">
          <strong>${entries.length}</strong>
          <span>Trainings</span>
        </div>
        <div class="overview-stat">
          <strong>${avgRating}</strong>
          <span>Ø Bewertung</span>
        </div>
        <div class="overview-stat">
          <strong>${last ? formatDate(last.date).slice(0,5) : "–"}</strong>
          <span>Letztes Training</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card">
        <div class="section-head">
          <h2>Ziele</h2>
          ${!editingGoals ? `<button class="btn secondary small-btn" data-action="edit-goals">Bearbeiten</button>` : ""}
        </div>
        ${renderGoals(area,goal)}
      </div>
    </section>

    ${renderInfoSection(id)}


    <section class="section">
      <div class="section-head">
        <h2>${ath ? "Athletik-Einträge" : "Trainingseinträge"}</h2>
        <span class="muted small">${entries.length} Einträge</span>
      </div>
      ${entries.length
        ? `<div class="entry-list">${visibleEntries.map(e=>entryCard(e,ath?"athletic":"discipline")).join("")}</div>`
        : `<div class="empty">Noch keine Trainings eingetragen.</div>`
      }
      ${entries.length > 5 ? `<p class="muted small history-note">Es werden die letzten 5 von ${entries.length} Einträgen angezeigt.</p>` : ""}
    </section>
  `;
}

function updateEntryDialogArea(areaId) {
  const area = getArea(areaId);
  if (!area) return;

  const ath = isAthletics(areaId);
  document.getElementById("entry-discipline-id").value = areaId;
  document.getElementById("entry-kind").value = ath ? "athletic" : "discipline";
  document.getElementById("dialog-title").textContent = area.name;
  document.getElementById("dialog-eyebrow").textContent = "NEUES TRAINING";
  document.getElementById("rating-help").textContent = ath
    ? "Die Bewertung verändert den Athletik-Status."
    : `Die Bewertung verändert den Status von ${area.name}.`;

  const select = document.getElementById("entry-area-select");
  if (select) select.value = areaId;

  document.getElementById("entry-dialog-accent")?.style.setProperty("--selected-color", area.color);
}

function openEntryDialog(selectedAreaId = "100m") {
  document.getElementById("entry-date").value = todayISO();
  document.getElementById("entry-description").value = "";
  document.getElementById("entry-result").value = "";
  document.getElementById("entry-rating-value").value = "0";
  document.querySelectorAll("[data-entry-rating]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.entryRating === "0");
  });

  updateEntryDialogArea(selectedAreaId);
  entryDialog.showModal();
}

function openDetail(id,kind) {
  if (kind === "strength") {
    const session = state.strengthSessions.find(x=>x.id===id);
    if (!session) return;

    detailContext = {id,kind:"strength"};
    document.getElementById("detail-eyebrow").textContent = "KRAFTTRAINING";
    document.getElementById("detail-title").textContent = formatDate(session.date);
    document.getElementById("detail-content").innerHTML = `
      <div class="detail-grid">
        <div class="detail-row"><span>Gesamtbewertung</span>${ratingBadge(session.rating)}</div>
        <div class="detail-row">
          <span>Übungen</span>
          <div class="exercise-list">
            ${(session.exercises || []).map(ex=>`
              <div class="calendar-strength-exercise">
                <div>
                  <strong>${escapeHtml(ex.name)}</strong>
                  <small>${escapeHtml(ex.sets||"-")} Sätze · ${escapeHtml(ex.reps||"-")} Wdh. · ${escapeHtml(ex.weight||"-")} kg</small>
                </div>
                ${ratingBadge(ex.rating,false)}
              </div>
            `).join("")}
          </div>
        </div>
        ${session.notes ? `<div class="detail-row"><span>Notizen</span><p>${escapeHtml(session.notes)}</p></div>` : ""}
      </div>
    `;
    detailDialog.showModal();
    return;
  }

  const source = kind==="athletic" ? state.athleticEntries : state.entries;
  const e = source.find(x=>x.id===id);
  if (!e) return;

  const title = kind==="athletic" ? ATHLETICS.name : (getDiscipline(e.disciplineId)?.name || "Training");
  detailContext = {id,kind};

  document.getElementById("detail-eyebrow").textContent = kind==="athletic" ? "ATHLETIK-DETAILS" : "TRAININGSDETAILS";
  document.getElementById("detail-title").textContent = title;
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span>Datum</span><strong>${formatDate(e.date)}</strong></div>
      <div class="detail-row"><span>Bewertung</span>${ratingBadge(e.rating)}</div>
      ${e.result ? `<div class="detail-row"><span>Resultat</span><strong>${escapeHtml(e.result)}</strong></div>` : ""}
      <div class="detail-row"><span>Beschreibung</span><p>${escapeHtml(e.description||"")}</p></div>
    </div>
  `;
  detailDialog.showModal();
}

function getExerciseSuggestions() {
  const names = [];
  state.strengthSessions.forEach(session => {
    (session.exercises || []).forEach(ex => {
      const name = String(ex.name || "").trim();
      if (name && !names.some(n => n.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    });
  });
  return names.sort((a,b)=>a.localeCompare(b,"de"));
}

function renderStrengthDraft() {
  const host = document.getElementById("strength-draft-list");
  if (!host) return;
  host.innerHTML = strengthDraftExercises.length
    ? strengthDraftExercises.map((e,i)=>`
      <div class="exercise-summary">
        <strong>${escapeHtml(e.name)}</strong>
        <span>${escapeHtml(e.sets||"-")} S.</span>
        <span>${escapeHtml(e.reps||"-")} Wdh.</span>
        <span>${escapeHtml(e.weight||"-")} kg</span>
        <span>${ratingBadge(e.rating,false)}</span>
      </div>
    `).join("")
    : `<p class="muted small">Noch keine Übung hinzugefügt.</p>`;
}

function strengthSessionCard(s) {
  return `
    <article class="entry">
      <div class="entry-top">
        <div>
          <div class="entry-title">${formatDate(s.date)}</div>
          <div class="entry-meta">${s.exercises.length} Übungen · Gesamtbewertung</div>
        </div>
        ${ratingBadge(s.rating,false)}
      </div>
      <div class="exercise-list">
        ${s.exercises.map(e=>`
          <div class="exercise-summary">
            <strong>${escapeHtml(e.name)}</strong>
            <span>${escapeHtml(e.sets||"-")} S.</span>
            <span>${escapeHtml(e.reps||"-")} Wdh.</span>
            <span>${escapeHtml(e.weight||"-")} kg</span>
            <span>${ratingBadge(e.rating,false)}</span>
          </div>
        `).join("")}
      </div>
      ${s.notes ? `<p class="entry-notes">${escapeHtml(s.notes)}</p>` : ""}
      <button class="btn danger small-btn" style="margin-top:12px" data-delete-strength="${s.id}">Training löschen</button>
    </article>
  `;
}

function renderStrength() {
  pageTitle.textContent = "Krafttraining";

  const sessions = [...state.strengthSessions].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const visibleSessions = sessions.slice(0,5);
  const suggestions = getExerciseSuggestions();
  const lastSession = sessions[0];

  app.innerHTML = `
    <section class="strength-overview">
      <div class="overview-title-row">
        <div>
          <p class="eyebrow">KRAFTÜBERSICHT</p>
          <h2>Dein Krafttraining</h2>
        </div>
        ${lastSession ? ratingBadge(lastSession.rating,false) : ""}
      </div>

      <div class="overview-stats">
        <div class="overview-stat">
          <strong>${sessions.length}</strong>
          <span>Einheiten</span>
        </div>
        <div class="overview-stat">
          <strong>${suggestions.length}</strong>
          <span>Übungen</span>
        </div>
        <div class="overview-stat">
          <strong>${lastSession ? formatDate(lastSession.date).slice(0,5) : "–"}</strong>
          <span>Letztes Training</span>
        </div>
      </div>
    </section>

    <section class="section">
      ${!strengthFormOpen ? `
        <button class="btn primary full" data-action="open-strength-form">＋ Training hinzufügen</button>
      ` : `
        <form class="card strength-session" id="strength-session-form">
          <div class="section-head">
            <h2>Neue Einheit</h2>
            <button class="btn secondary small-btn" type="button" data-action="close-strength-form">Schliessen</button>
          </div>

          <label>
            Datum
            <input type="date" name="date" value="${todayISO()}" required />
          </label>

          <div class="exercise-editor">
            <h3>Übung hinzufügen</h3>

            <datalist id="exercise-history">
              ${suggestions.map(name=>`<option value="${escapeHtml(name)}"></option>`).join("")}
            </datalist>

            <div class="exercise-grid">
              <input class="exercise-name" id="strength-name" type="text" list="exercise-history"
                autocomplete="off" placeholder="Übung auswählen oder neu eingeben" />
              <input id="strength-sets" type="number" min="1" placeholder="Sätze" />
              <input id="strength-reps" type="number" min="1" placeholder="Wdh." />
              <input id="strength-weight" type="number" min="0" step="0.5" placeholder="kg" />
            </div>

            <label style="margin-top:12px">
              Bewertung dieser Übung
              <select id="strength-exercise-rating">
                ${ratingSelectOptions()}
              </select>
            </label>

            ${suggestions.length
              ? `<p class="muted small" style="margin:0 0 10px">${suggestions.length} bereits verwendete Übungen im Dropdown verfügbar.</p>`
              : ""}

            <button type="button" class="btn secondary full" data-action="add-strength-exercise">＋ Übung hinzufügen</button>
          </div>

          <div id="strength-draft-list"></div>

          <label>
            Gesamtbewertung des Trainings
            <select name="rating">
              ${ratingSelectOptions()}
            </select>
          </label>

          <label>
            Notizen zur Einheit
            <textarea name="notes" rows="4" placeholder="Gesamtgefühl, Technik, Besonderheiten..."></textarea>
          </label>

          <button class="btn primary" type="submit">Komplettes Krafttraining speichern</button>
        </form>
      `}
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Verlauf</h2>
        <span class="muted small">${sessions.length} Einheiten</span>
      </div>
      ${sessions.length
        ? `<div class="entry-list">${visibleSessions.map(strengthSessionCard).join("")}</div>`
        : `<div class="empty">Noch keine Krafttrainings gespeichert.</div>`
      }
      ${sessions.length > 5 ? `<p class="muted small history-note">Es werden die letzten 5 von ${sessions.length} Krafttrainings angezeigt.</p>` : ""}
    </section>
  `;

  if (strengthFormOpen) renderStrengthDraft();
}

function renderData() {
  pageTitle.textContent = "Daten & Backup";
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">LOKALE DATEN</p>
      <h2>Deine Daten bleiben auf diesem Gerät.</h2>
      <p class="muted">Alle Einträge werden lokal im Browser gespeichert.</p>
    </section>
    <section class="section">
      <div class="card">
        <h2>Backup-Inhalt</h2>
        ${(() => {
          const b = backupSummary();
          return `
            <div class="backup-grid">
              <div><strong>${b.goals}</strong><span>Zielbereiche</span></div>
              <div><strong>${b.infos}</strong><span>Infos</span></div>
              <div><strong>${b.disciplineEntries}</strong><span>Disziplintrainings</span></div>
              <div><strong>${b.athleticEntries}</strong><span>Athletik</span></div>
              <div><strong>${b.strengthSessions}</strong><span>Krafteinheiten</span></div>
              <div><strong>${b.strengthExercises}</strong><span>Kraftübungen</span></div>
            </div>
          `;
        })()}
      </div>
    </section>
    <section class="section">
      <div class="card data-actions">
        <button class="btn primary" data-action="export">Backup exportieren</button>
        <button class="btn secondary" data-action="import">Backup importieren</button>
        <input class="file-input" id="import-file" type="file" accept=".json,application/json" />
        <button class="btn danger" data-action="reset">Alle lokalen Daten löschen</button>
      </div>
    </section>
  `;
}

function backupSummary() {
  const exerciseCount = state.strengthSessions.reduce((sum,s)=>sum+(s.exercises?.length || 0),0);
  const infoCount = Object.values(state.infos || {}).reduce((sum,list)=>sum+(Array.isArray(list) ? list.length : 0),0);
  const goalCount = Object.values(state.goals || {}).filter(g => g?.performance || g?.technique).length;

  return {
    goals: goalCount,
    infos: infoCount,
    disciplineEntries: state.entries.length,
    athleticEntries: state.athleticEntries.length,
    strengthSessions: state.strengthSessions.length,
    strengthExercises: exerciseCount
  };
}

function exportData() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `decatrack-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>setRoute(btn.dataset.route));
});

quickAddBtn.addEventListener("click",()=>{
  if (route.page==="disciplines") openEntryDialog();
});

document.getElementById("close-dialog").addEventListener("click",()=>entryDialog.close());
document.getElementById("cancel-dialog").addEventListener("click",()=>entryDialog.close());
document.getElementById("close-detail-dialog").addEventListener("click",()=>detailDialog.close());
document.getElementById("close-detail-bottom").addEventListener("click",()=>detailDialog.close());

document.querySelectorAll("[data-entry-rating]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("entry-rating-value").value = btn.dataset.entryRating;
    document.querySelectorAll("[data-entry-rating]").forEach(other => other.classList.remove("active"));
    btn.classList.add("active");
  });
});

document.getElementById("entry-area-select").addEventListener("change", ev => {
  updateEntryDialogArea(ev.target.value);
});

document.getElementById("entry-form").addEventListener("submit",ev=>{
  ev.preventDefault();

  const kind = document.getElementById("entry-kind").value;
  const entry = {
    id:uid(),
    disciplineId:document.getElementById("entry-discipline-id").value,
    date:document.getElementById("entry-date").value,
    description:document.getElementById("entry-description").value.trim(),
    result:document.getElementById("entry-result").value.trim(),
    rating:Number(document.getElementById("entry-rating-value").value || 0)
  };

  if (kind==="athletic") {
    entry.disciplineId = ATHLETICS.id;
    state.athleticEntries.push(entry);
  } else {
    state.entries.push(entry);
  }

  saveState();
  entryDialog.close();
  render();
});

document.getElementById("delete-detail-entry").addEventListener("click",()=>{
  if (!detailContext || !confirm("Diesen Eintrag wirklich löschen?")) return;

  if (detailContext.kind==="athletic") {
    state.athleticEntries = state.athleticEntries.filter(e=>e.id!==detailContext.id);
  } else if (detailContext.kind==="strength") {
    state.strengthSessions = state.strengthSessions.filter(e=>e.id!==detailContext.id);
  } else {
    state.entries = state.entries.filter(e=>e.id!==detailContext.id);
  }

  saveState();
  detailDialog.close();
  detailContext = null;
  render();
});

app.addEventListener("click",ev=>{
  const discipline = ev.target.closest("[data-discipline]");
  if (discipline) return setRoute("discipline",discipline.dataset.discipline);

  const calendarDate = ev.target.closest("[data-calendar-date]")?.dataset.calendarDate;
  if (calendarDate) {
    selectedCalendarDate = calendarDate;
    const selected = new Date(calendarDate + "T12:00:00");
    if (
      selected.getMonth() !== calendarCursor.getMonth() ||
      selected.getFullYear() !== calendarCursor.getFullYear()
    ) {
      calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    return render();
  }

  const calendarEntry = ev.target.closest("[data-calendar-entry-id]");
  if (calendarEntry) {
    return openDetail(calendarEntry.dataset.calendarEntryId, calendarEntry.dataset.calendarEntryKind);
  }

  const entryEl = ev.target.closest("[data-entry-id]");
  if (entryEl) return openDetail(entryEl.dataset.entryId,entryEl.dataset.entryKind);

  const action = ev.target.closest("[data-action]")?.dataset.action;

  if (action==="all-disciplines" || action==="back-disciplines") return setRoute("disciplines");
  if (action==="go-strength") return setRoute("strength");
  if (action==="calendar-prev") {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()-1, 1);
    return render();
  }
  if (action==="calendar-next") {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()+1, 1);
    return render();
  }
  if (action==="calendar-today") {
    calendarCursor = new Date();
    selectedCalendarDate = todayISO();
    return render();
  }
  if (action==="open-strength-form") {
    strengthFormOpen = true;
    strengthDraftExercises = [];
    return render();
  }
  if (action==="close-strength-form") {
    strengthFormOpen = false;
    strengthDraftExercises = [];
    return render();
  }
  if (action==="edit-goals") { editingGoals = true; return render(); }
  if (action==="cancel-goals") { editingGoals = false; return render(); }

  if (action==="clear-infos") {
    if (confirm("Alle Infos löschen?")) {
      state.infos[route.id] = [];
      saveState();
      render();
    }
    return;
  }

  if (action==="add-strength-exercise") {
    const name = document.getElementById("strength-name")?.value.trim();
    if (!name) return alert("Bitte zuerst eine Übung auswählen oder eingeben.");

    strengthDraftExercises.push({
      id:uid(),
      name,
      sets:document.getElementById("strength-sets").value,
      reps:document.getElementById("strength-reps").value,
      weight:document.getElementById("strength-weight").value,
      rating:Number(document.getElementById("strength-exercise-rating").value || 0)
    });

    document.getElementById("strength-name").value = "";
    document.getElementById("strength-sets").value = "";
    document.getElementById("strength-reps").value = "";
    document.getElementById("strength-weight").value = "";
    document.getElementById("strength-exercise-rating").value = "0";
    renderStrengthDraft();
    return;
  }

  const strengthId = ev.target.closest("[data-delete-strength]")?.dataset.deleteStrength;
  if (strengthId && confirm("Dieses Krafttraining löschen?")) {
    state.strengthSessions = state.strengthSessions.filter(s=>s.id!==strengthId);
    saveState();
    render();
    return;
  }

  if (action==="export") return exportData();
  if (action==="import") return document.getElementById("import-file").click();

  if (action==="reset" && confirm("Wirklich alle lokalen Daten löschen?")) {
    state = initialState();
    saveState();
    render();
  }
});

app.addEventListener("submit",ev=>{
  if (ev.target.id==="goal-form") {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    state.goals[route.id] = {
      performance:String(fd.get("performance")||"").trim(),
      technique:String(fd.get("technique")||"").trim()
    };
    saveState();
    editingGoals = false;
    render();
    return;
  }

  if (ev.target.id==="info-form") {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const label = String(fd.get("label")||"").trim();
    const value = String(fd.get("value")||"").trim();
    if (!label || !value) return;
    state.infos[route.id] = [...(state.infos[route.id]||[]),{id:uid(),label,value}];
    saveState();
    render();
    return;
  }

  if (ev.target.id==="strength-session-form") {
    ev.preventDefault();
    if (!strengthDraftExercises.length) return alert("Bitte mindestens eine Übung hinzufügen.");

    const fd = new FormData(ev.target);
    state.strengthSessions.push({
      id:uid(),
      date:String(fd.get("date")||""),
      rating:Number(fd.get("rating")||0),
      notes:String(fd.get("notes")||"").trim(),
      exercises:[...strengthDraftExercises]
    });

    saveState();
    strengthDraftExercises = [];
    strengthFormOpen = false;
    render();
  }
});

document.addEventListener("change",async ev=>{
  if (ev.target.id!=="import-file") return;
  const file = ev.target.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    state = migrateState(data);
    saveState();
    alert("Backup erfolgreich importiert.");
    render();
  } catch {
    alert("Die Datei konnte nicht importiert werden.");
  }
  ev.target.value = "";
});

window.addEventListener("hashchange",render);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
}

saveState();
render();
