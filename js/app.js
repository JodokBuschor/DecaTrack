const LEGACY_DISCIPLINES = [
  { id:"100m", name:"100 m", unitHint:"z. B. 10.95 s", color:"#ff5a5f", icon:"sprint" },
  { id:"longjump", name:"Weitsprung", unitHint:"z. B. 7.20 m", color:"#ff9f43", icon:"longjump" },
  { id:"shotput", name:"Kugelstossen", unitHint:"z. B. 13.50 m", color:"#27c6d9", icon:"throw" },
  { id:"highjump", name:"Hochsprung", unitHint:"z. B. 1.95 m", color:"#b7ff4a", icon:"highjump" },
  { id:"400m", name:"400 m", unitHint:"z. B. 49.80 s", color:"#9b5cff", icon:"sprint" },
  { id:"110h", name:"110 m Hürden", unitHint:"z. B. 15.20 s", color:"#3b82f6", icon:"hurdles" },
  { id:"discus", name:"Diskus", unitHint:"z. B. 42.00 m", color:"#22c55e", icon:"throw" },
  { id:"polevault", name:"Stabhochsprung", unitHint:"z. B. 5.00 m", color:"#f43f8c", icon:"polevault" },
  { id:"javelin", name:"Speer", unitHint:"z. B. 52.00 m", color:"#14b8a6", icon:"throw" },
  { id:"1500m", name:"1500 m", unitHint:"z. B. 4:35 min", color:"#2563eb", icon:"endurance" },
  { id:"athletics", name:"Athletik", unitHint:"z. B. Explosivität verbessern", color:"#8b95a1", icon:"athletics" }
];

const STRENGTH = { id:"strength", name:"Krafttraining", color:"#f2c94c" };
const STORAGE_KEY = "decatrack_v1";
const STATUS_START = 50;

const ICON_OPTIONS = [
  { value:"sprint", label:"Sprint / Lauf" },
  { value:"hurdles", label:"Hürden" },
  { value:"longjump", label:"Weitsprung" },
  { value:"highjump", label:"Hochsprung" },
  { value:"polevault", label:"Stabhochsprung" },
  { value:"throw", label:"Wurf / Stoss" },
  { value:"endurance", label:"Ausdauer" },
  { value:"athletics", label:"Athletik / Allgemein" }
];

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

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function ratingSelectOptions(selected = 0) {
  const active = normalizeRating(selected);
  return Array.from({length:11}, (_,i)=>i-5).map(v => {
    const label = `${v > 0 ? "+" : ""}${v} · ${RATING_TEXT[String(v)]}`;
    return `<option value="${v}" ${v===active ? "selected" : ""}>${label}</option>`;
  }).join("");
}

function sanitizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : "#7dc7ff";
}

function legacyIcon(id) {
  return LEGACY_DISCIPLINES.find(d => d.id === id)?.icon || "athletics";
}

function sanitizeDiscipline(d, index = 0) {
  return {
    id:String(d?.id || `discipline-${uid()}`),
    name:String(d?.name || `Disziplin ${index + 1}`).trim() || `Disziplin ${index + 1}`,
    color:sanitizeColor(d?.color),
    icon:String(d?.icon || legacyIcon(d?.id)),
    unitHint:String(d?.unitHint || "z. B. Ziel / Bestleistung")
  };
}

function initialState() {
  return {
    version:12,
    disciplines:[],
    goals:{},
    infos:{},
    entries:[],
    strengthSessions:[]
  };
}

function migrateState(parsed) {
  const base = initialState();
  const sourceVersion = Number(parsed?.version || 0);

  const disciplines = Array.isArray(parsed?.disciplines)
    ? parsed.disciplines.map(sanitizeDiscipline)
    : LEGACY_DISCIPLINES.map(sanitizeDiscipline);

  const goals = {};
  const infos = {};

  disciplines.forEach(d => {
    const g = parsed?.goals?.[d.id] || {};
    goals[d.id] = {
      performance:String(g.performance || ""),
      technique:String(g.technique || g.focus || g.notes || "")
    };
    infos[d.id] = Array.isArray(parsed?.infos?.[d.id])
      ? parsed.infos[d.id].map(i => ({
          id:String(i?.id || uid()),
          label:String(i?.label || ""),
          value:String(i?.value || "")
        }))
      : [];
  });

  const normalEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const legacyAthletics = sourceVersion < 12 && Array.isArray(parsed?.athleticEntries)
    ? parsed.athleticEntries.map(e => ({...e, disciplineId:"athletics"}))
    : [];

  const seen = new Set();
  const entries = [...normalEntries, ...legacyAthletics]
    .map(e => ({
      id:String(e?.id || uid()),
      disciplineId:String(e?.disciplineId || disciplines[0]?.id || ""),
      date:String(e?.date || ""),
      description:String(e?.description || e?.notes || e?.type || ""),
      result:String(e?.result || ""),
      rating:migrateLegacyRating(e?.rating ?? 0, sourceVersion)
    }))
    .filter(e => {
      if (!e.disciplineId || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

  const rawStrengthSessions = Array.isArray(parsed?.strengthSessions)
    ? parsed.strengthSessions
    : (Array.isArray(parsed?.strength)
      ? parsed.strength.map(e => ({
          id:e.id || uid(),
          date:e.date || "",
          rating:Number(e.rating || 0),
          notes:e.notes || "",
          exercises:[{
            id:uid(),
            name:e.exercise || "Übung",
            sets:e.sets || "",
            reps:e.reps || "",
            weight:e.weight || "",
            rating:Number(e.rating || 0)
          }]
        }))
      : []);

  const strengthSessions = rawStrengthSessions.map(session => ({
    id:String(session?.id || uid()),
    date:String(session?.date || ""),
    rating:migrateLegacyRating(session?.rating ?? 0, sourceVersion),
    notes:String(session?.notes || ""),
    exercises:Array.isArray(session?.exercises)
      ? session.exercises.map(ex => ({
          id:String(ex?.id || uid()),
          name:String(ex?.name || "Übung"),
          sets:String(ex?.sets ?? ""),
          reps:String(ex?.reps ?? ""),
          weight:String(ex?.weight ?? ""),
          rating:migrateLegacyRating(ex?.rating ?? 0, sourceVersion)
        }))
      : []
  }));

  return {
    ...base,
    version:12,
    disciplines,
    goals,
    infos,
    entries,
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
let infoFormOpen = false;
let editingInfoId = null;
let disciplineFormOpen = false;
let editingDisciplineId = null;
let editingEntryContext = null;
let detailContext = null;
let strengthDraftExercises = [];
let strengthFormOpen = false;
let editingStrengthSessionId = null;
let editingStrengthExerciseIndex = null;
let calendarCursor = new Date();
let selectedCalendarDate = todayISO();

const app = document.getElementById("app");
const pageTitle = document.getElementById("page-title");
const quickAddBtn = document.getElementById("quick-add-btn");
const entryDialog = document.getElementById("entry-dialog");
const detailDialog = document.getElementById("detail-dialog");
const editDetailBtn = document.getElementById("edit-detail-entry");

function saveState() {
  state.version = 12;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function getDiscipline(id) {
  return state.disciplines.find(d => d.id === id);
}

function areaColor(id) {
  if (id === STRENGTH.id) return STRENGTH.color;
  return getDiscipline(id)?.color || "#8b95a1";
}

function areaName(id) {
  if (id === STRENGTH.id) return STRENGTH.name;
  return getDiscipline(id)?.name || "Training";
}

function disciplineIcon(idOrKey) {
  const common = `viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    sprint:`<svg ${common}><circle cx="14" cy="5" r="2"/><path d="M10 21l2-6 3 2 2 4M12 9l-3 4-4 1M12 9l4 3 3-1M12 9l2-2"/></svg>`,
    hurdles:`<svg ${common}><path d="M3 17h7M14 17h7M6 17v-5h5M18 17v-5h-5"/><circle cx="11" cy="5" r="2"/><path d="M11 7l2 4 4 2M13 11l-4 4"/></svg>`,
    longjump:`<svg ${common}><path d="M3 19h18"/><circle cx="8" cy="7" r="2"/><path d="M9 9l3 3 4 1M12 12l-3 4M12 12l5-3M17 9l3 2"/></svg>`,
    highjump:`<svg ${common}><path d="M4 18V8M20 18V8M4 11h16"/><circle cx="10" cy="6" r="2"/><path d="M11 8c2 1 4 2 5 5M13 11l-5 4M15 13l3 4"/></svg>`,
    polevault:`<svg ${common}><path d="M4 20L19 4"/><circle cx="9" cy="6" r="2"/><path d="M10 8l3 3 3 1M13 11l-4 4M13 11l2 5"/></svg>`,
    throw:`<svg ${common}><circle cx="18" cy="6" r="2.4"/><circle cx="8" cy="7" r="2"/><path d="M9 9l4 3 3-4M12 12l-4 4M12 12l3 5M5 20h14"/></svg>`,
    endurance:`<svg ${common}><circle cx="14" cy="5" r="2"/><path d="M10 21l2-6 3 2 2 4M12 9l-3 4-4 1M12 9l4 3 3-1"/><path d="M3 20c4-2 14-2 18 0"/></svg>`,
    athletics:`<svg ${common}><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>`
  };

  const key = getDiscipline(idOrKey)?.icon || idOrKey || "athletics";
  return icons[key] || icons.athletics;
}

function targetIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></svg>`;
}

function calcStatus(id) {
  const delta = state.entries
    .filter(e => e.disciplineId === id)
    .reduce((sum,e)=>sum+normalizeRating(e.rating),0);
  return clamp(STATUS_START+delta,0,100);
}

function statusClass(s) {
  if (s<35) return "low";
  if (s<55) return "mid";
  if (s<75) return "good";
  return "high";
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

function formatWeight(weight) {
  const value = String(weight ?? "").trim();
  if (!value) return "–";
  return /^\d+(?:[.,]\d+)?$/.test(value) ? `${value} kg` : value;
}

function readHash() {
  const raw = location.hash.replace("#","");
  if (!raw) return {page:"dashboard",id:null};
  const [page,id] = raw.split("/");
  return {page,id:id||null};
}

function setRoute(page,id=null) {
  editingGoals = false;
  infoFormOpen = false;
  editingInfoId = null;
  if (page !== "disciplines") {
    disciplineFormOpen = false;
    editingDisciplineId = null;
  }
  if (page !== "strength") {
    strengthFormOpen = false;
    editingStrengthSessionId = null;
    editingStrengthExerciseIndex = null;
    strengthDraftExercises = [];
  }
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
      <div class="discipline-card-head simple discipline-card-top">
        <div class="discipline-card-title-wrap">
          <span class="discipline-event-icon">${disciplineIcon(area.id)}</span>
          <div class="discipline-name">${escapeHtml(area.name)}</div>
        </div>
        <button class="icon-mini discipline-edit-btn" type="button" data-action="edit-discipline" data-discipline-id="${area.id}" aria-label="${escapeHtml(area.name)} bearbeiten">✎</button>
      </div>
      ${statusMarkup(status,"Aktueller Stand")}
    </article>
  `;
}

function allAreaStats() {
  return state.disciplines.map(area => ({
    ...area,
    status:calcStatus(area.id),
    entries:getAreaEntries(area.id)
  }));
}

function allCalendarTrainings() {
  const items = state.entries.map(e => ({
    id:e.id,
    date:e.date,
    title:getDiscipline(e.disciplineId)?.name || "Disziplin",
    subtitle:e.result || e.description || "Training",
    description:e.description || "",
    result:e.result || "",
    rating:e.rating,
    kind:"discipline",
    areaId:e.disciplineId,
    color:areaColor(e.disciplineId)
  }));

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

      <div class="calendar-grid">${renderCalendarGrid()}</div>

      <div class="calendar-month-summary">
        <div><strong>${monthItems.length}</strong><span>Einheiten</span></div>
        <div><strong>${activeDays}</strong><span>Trainingstage</span></div>
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
            ${[...state.disciplines, STRENGTH].map(area => `
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

function renderDisciplineForm() {
  if (!disciplineFormOpen) return "";
  const d = editingDisciplineId ? getDiscipline(editingDisciplineId) : null;
  const selectedIcon = d?.icon || "sprint";
  const selectedColor = d?.color || "#7dc7ff";

  return `
    <form class="card discipline-editor" id="discipline-form">
      <div class="section-head">
        <div>
          <p class="eyebrow">${d ? "DISZIPLIN BEARBEITEN" : "NEUE DISZIPLIN"}</p>
          <h2>${d ? escapeHtml(d.name) : "Disziplin hinzufügen"}</h2>
        </div>
        <button class="btn secondary small-btn" type="button" data-action="cancel-discipline-form">Schliessen</button>
      </div>

      <div class="discipline-editor-grid">
        <label>
          Name
          <input name="name" type="text" value="${escapeHtml(d?.name || "")}" placeholder="z. B. 200 m" required />
        </label>
        <label>
          Icon
          <select name="icon">
            ${ICON_OPTIONS.map(i => `<option value="${i.value}" ${i.value === selectedIcon ? "selected" : ""}>${i.label}</option>`).join("")}
          </select>
        </label>
        <label class="color-field">
          Farbe
          <input name="color" type="color" value="${selectedColor}" />
        </label>
      </div>

      <div class="form-action-row">
        ${d ? `<button class="btn danger" type="button" data-action="delete-discipline" data-discipline-id="${d.id}">Disziplin löschen</button>` : `<span></span>`}
        <button class="btn primary" type="submit">${d ? "Änderungen speichern" : "Disziplin hinzufügen"}</button>
      </div>
    </form>
  `;
}

function renderDisciplines() {
  pageTitle.textContent = "Disziplinen";

  const stats = allAreaStats();
  const avg = averageStatus();
  const recent = [...state.entries].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const last = recent[0];

  app.innerHTML = `
    <section class="area-overview">
      <div class="overview-title-row">
        <div>
          <p class="eyebrow">DISZIPLINÜBERSICHT</p>
          <h2>Deine Trainingsbereiche</h2>
        </div>
        <div class="dashboard-score">${avg}</div>
      </div>

      <div class="status-track" style="margin-top:14px">
        <div class="status-fill ${statusClass(avg)}" style="width:${avg}%"></div>
      </div>

      <div class="overview-stats">
        <div class="overview-stat"><strong>${stats.length}</strong><span>Disziplinen</span></div>
        <div class="overview-stat"><strong>${state.entries.length}</strong><span>Trainings</span></div>
        <div class="overview-stat"><strong>${last ? formatDate(last.date).slice(0,5) : "–"}</strong><span>Letztes Training</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Meine Disziplinen</h2>
          <p class="muted small discipline-help"></p>
        </div>
        ${!disciplineFormOpen ? `<button class="btn primary small-btn" data-action="open-discipline-form" type="button">＋ Disziplin</button>` : ""}
      </div>
      ${renderDisciplineForm()}
      ${state.disciplines.length
        ? `<div class="grid discipline-grid ${disciplineFormOpen ? "section" : ""}">${state.disciplines.map(areaCard).join("")}</div>`
        : `<div class="empty">Noch keine Disziplin vorhanden. Füge z. B. 100 m, 200 m, Weitsprung oder einen eigenen Trainingsbereich hinzu.</div>`
      }
    </section>
  `;
}

function renderGoals(area, goal) {
  if (!editingGoals) {
    return `
      <div class="goal-summary">
        <div class="goal-display">
          <span>Leistungsziel</span>
          <strong>${goal.performance?.trim() ? escapeHtml(goal.performance) : "Noch kein Ziel gesetzt"}</strong>
        </div>
        <div class="goal-display">
          <span>Technikziel / Schwerpunkt</span>
          <strong>${goal.technique?.trim() ? escapeHtml(goal.technique) : "Noch kein Ziel gesetzt"}</strong>
        </div>
      </div>
    `;
  }

  return `
    <form class="goal-form" id="goal-form">
      <label>
        Leistungsziel
        <input name="performance" value="${escapeHtml(goal.performance||"")}" placeholder="${escapeHtml(area.unitHint || "z. B. persönliche Zielleistung")}" />
      </label>
      <label>
        Technikziel / Schwerpunkt
        <textarea name="technique" rows="4" placeholder="z. B. Rhythmus, Anlaufkontrolle, Technikfokus...">${escapeHtml(goal.technique||"")}</textarea>
      </label>
      <div class="dialog-actions" style="margin-top:0">
        <button class="btn secondary" type="button" data-action="cancel-goals">Abbrechen</button>
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>
  `;
}

function renderInfoRow(info) {
  if (editingInfoId === info.id) {
    return `
      <form class="info-edit-form" data-info-edit-form="${info.id}">
        <div class="info-editor-row edit-mode">
          <label>
            Bezeichnung
            <input name="label" value="${escapeHtml(info.label)}" required />
          </label>
          <label>
            Wert
            <input name="value" value="${escapeHtml(info.value)}" required />
          </label>
          <div class="info-edit-actions">
            <button class="btn secondary small-btn" type="button" data-action="cancel-info-edit">Abbrechen</button>
            <button class="btn primary small-btn" type="submit">Speichern</button>
          </div>
        </div>
      </form>
    `;
  }

  return `
    <div class="info-row">
      <div class="info-copy">
        <span>${escapeHtml(info.label)}</span>
        <strong>${escapeHtml(info.value)}</strong>
      </div>
      <div class="info-row-actions">
        <button class="icon-mini" type="button" data-action="edit-info" data-info-id="${info.id}" aria-label="Info bearbeiten">✎</button>
        <button class="icon-mini danger-icon" type="button" data-action="delete-info" data-info-id="${info.id}" aria-label="Info löschen">×</button>
      </div>
    </div>
  `;
}

function renderInfoSection(id) {
  const infos = state.infos[id] || [];
  return `
    <section class="section">
      <div class="card info-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">WISSEN & EINSTELLUNGEN</p>
            <h2>Disziplin-Infos</h2>
          </div>
          ${!infoFormOpen && !editingInfoId ? `<button class="btn secondary small-btn" type="button" data-action="open-info-form">＋ Info</button>` : ""}
        </div>

        ${infos.length
          ? `<div class="info-list">${infos.map(renderInfoRow).join("")}</div>`
          : `<p class="muted small info-empty-note">Noch keine Infos eingetragen.</p>`
        }

        ${infoFormOpen ? `
          <form id="info-form" class="info-form info-add-form">
            <div class="info-editor-row">
              <label>
                Bezeichnung
                <input name="label" placeholder="z. B. Anlauflänge" required />
              </label>
              <label>
                Wert
                <input name="value" placeholder="z. B. 18 Schritte / 34.45 m" required />
              </label>
              <div class="info-edit-actions">
                <button class="btn secondary small-btn" type="button" data-action="cancel-info-form">Abbrechen</button>
                <button class="btn primary small-btn" type="submit">Hinzufügen</button>
              </div>
            </div>
          </form>
        ` : ""}
      </div>
    </section>
  `;
}

function getAreaEntries(id) {
  return state.entries
    .filter(e => e.disciplineId === id)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}

function entryCard(e) {
  return `
    <article class="entry clickable" data-entry-id="${e.id}" data-entry-kind="discipline">
      <div class="entry-top">
        <div>
          <div class="entry-title">${formatDate(e.date)}</div>
          <div class="entry-meta">Antippen für Details oder Bearbeitung</div>
        </div>
        ${ratingBadge(e.rating)}
      </div>
      ${e.result ? `<div class="entry-result">${escapeHtml(e.result)}</div>` : ""}
      <p class="entry-preview">${escapeHtml(e.description||"")}</p>
    </article>
  `;
}

function renderArea(id) {
  const area = getDiscipline(id);
  if (!area) return setRoute("disciplines");

  pageTitle.textContent = area.name;
  const goal = state.goals[id] || {performance:"", technique:""};
  const status = calcStatus(id);
  const entries = getAreaEntries(id);
  const visibleEntries = entries.slice(0,5);
  const last = entries[0];
  const avgRatingValue = entries.length
    ? entries.reduce((sum,e)=>sum+normalizeRating(e.rating),0)/entries.length
    : null;
  const avgRating = avgRatingValue === null
    ? "–"
    : `${avgRatingValue > 0 ? "+" : ""}${avgRatingValue.toFixed(1)}`;

  app.innerHTML = `
    <button class="back-btn" data-action="back-disciplines">← Alle Disziplinen</button>

    <section class="area-overview area-overview-colored" style="--area-color:${area.color}">
      <div class="overview-title-row">
        <div class="area-title-with-icon">
          <span class="area-title-icon" style="color:${area.color}">${disciplineIcon(area.id)}</span>
          <div>
            <p class="eyebrow">DISZIPLIN</p>
            <h2>${escapeHtml(area.name)}</h2>
          </div>
        </div>
        <div class="dashboard-score">${status}</div>
      </div>

      <div class="status-track" style="margin-top:14px">
        <div class="status-fill ${statusClass(status)}" style="width:${status}%"></div>
      </div>

      <div class="overview-stats">
        <div class="overview-stat"><strong>${entries.length}</strong><span>Trainings</span></div>
        <div class="overview-stat"><strong>${avgRating}</strong><span>Ø Bewertung</span></div>
        <div class="overview-stat"><strong>${last ? formatDate(last.date).slice(0,5) : "–"}</strong><span>Letztes Training</span></div>
      </div>
    </section>

    <section class="section">
      <div class="card goals-card">
        <div class="section-head goals-head">
          <div class="goals-title">
            <span class="goal-icon">${targetIcon()}</span>
            <div>
              <p class="eyebrow">DEIN FOKUS</p>
              <h2>Ziele</h2>
            </div>
          </div>
          ${!editingGoals ? `<button class="btn goal-edit-btn small-btn" data-action="edit-goals">Bearbeiten</button>` : ""}
        </div>
        ${renderGoals(area,goal)}
      </div>
    </section>

    ${renderInfoSection(id)}

    <section class="section">
      <div class="section-head">
        <h2>Trainingseinträge</h2>
        <span class="muted small">${entries.length} Einträge</span>
      </div>
      <button class="btn primary full" type="button" data-action="add-area-training" style="margin-bottom:12px">＋ Training hinzufügen</button>
      ${entries.length
        ? `<div class="entry-list">${visibleEntries.map(entryCard).join("")}</div>`
        : `<div class="empty">Noch keine Trainings eingetragen.</div>`
      }
      ${entries.length > 5 ? `<p class="muted small history-note">Es werden die letzten 5 von ${entries.length} Einträgen angezeigt.</p>` : ""}
    </section>
  `;
}

function populateEntryAreaSelect(selectedId) {
  const select = document.getElementById("entry-area-select");
  if (!select) return;
  select.innerHTML = state.disciplines
    .map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`)
    .join("");
  if (selectedId && getDiscipline(selectedId)) select.value = selectedId;
}

function updateEntryDialogArea(areaId) {
  const area = getDiscipline(areaId);
  if (!area) return;

  document.getElementById("entry-discipline-id").value = areaId;
  document.getElementById("entry-kind").value = "discipline";
  document.getElementById("dialog-title").textContent = area.name;
  document.getElementById("rating-help").textContent = `Die Bewertung verändert den Status von ${area.name}.`;
  document.getElementById("entry-area-select").value = areaId;
  document.getElementById("entry-dialog-accent")?.style.setProperty("--selected-color", area.color);
}

function openEntryDialog(selectedAreaId = null, editId = null) {
  if (!state.disciplines.length) {
    alert("Bitte zuerst eine Disziplin hinzufügen.");
    return;
  }

  const existing = editId ? state.entries.find(e => e.id === editId) : null;
  const areaId = existing?.disciplineId || selectedAreaId || state.disciplines[0].id;
  if (!getDiscipline(areaId)) return;

  editingEntryContext = existing ? {id:existing.id} : null;
  populateEntryAreaSelect(areaId);
  document.getElementById("entry-date").value = existing?.date || todayISO();
  document.getElementById("entry-description").value = existing?.description || "";
  document.getElementById("entry-result").value = existing?.result || "";
  document.getElementById("entry-rating-value").value = String(normalizeRating(existing?.rating ?? 0));
  document.querySelectorAll("[data-entry-rating]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.entryRating === String(normalizeRating(existing?.rating ?? 0)));
  });

  document.getElementById("dialog-eyebrow").textContent = existing ? "TRAINING BEARBEITEN" : "NEUES TRAINING";
  document.querySelector("#entry-form button[type='submit']").textContent = existing ? "Änderungen speichern" : "Speichern";
  updateEntryDialogArea(areaId);
  document.getElementById("dialog-eyebrow").textContent = existing ? "TRAINING BEARBEITEN" : "NEUES TRAINING";
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
                  <small>${escapeHtml(ex.sets||"-")} Sätze · ${escapeHtml(ex.reps||"-")} Wdh. · ${escapeHtml(formatWeight(ex.weight))}</small>
                </div>
                ${ratingBadge(ex.rating,false)}
              </div>
            `).join("")}
          </div>
        </div>
        ${session.notes ? `<div class="detail-row"><span>Notizen</span><p>${escapeHtml(session.notes)}</p></div>` : ""}
      </div>
    `;
    editDetailBtn.hidden = false;
    detailDialog.showModal();
    return;
  }

  const e = state.entries.find(x=>x.id===id);
  if (!e) return;
  const title = getDiscipline(e.disciplineId)?.name || "Training";
  detailContext = {id,kind:"discipline"};

  document.getElementById("detail-eyebrow").textContent = "TRAININGSDETAILS";
  document.getElementById("detail-title").textContent = title;
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span>Datum</span><strong>${formatDate(e.date)}</strong></div>
      <div class="detail-row"><span>Bewertung</span>${ratingBadge(e.rating)}</div>
      ${e.result ? `<div class="detail-row"><span>Resultat</span><strong>${escapeHtml(e.result)}</strong></div>` : ""}
      <div class="detail-row"><span>Beschreibung</span><p>${escapeHtml(e.description||"")}</p></div>
    </div>
  `;
  editDetailBtn.hidden = false;
  detailDialog.showModal();
}

function getExerciseSuggestions() {
  const names = [];
  state.strengthSessions.forEach(session => {
    (session.exercises || []).forEach(ex => {
      const name = String(ex.name || "").trim();
      if (name && !names.some(n => n.toLowerCase() === name.toLowerCase())) names.push(name);
    });
  });
  return names.sort((a,b)=>a.localeCompare(b,"de"));
}

function renderStrengthDraft() {
  const host = document.getElementById("strength-draft-list");
  if (!host) return;
  host.innerHTML = strengthDraftExercises.length
    ? `<div class="strength-draft-stack">${strengthDraftExercises.map((e,i)=>`
        <div class="draft-exercise-row ${editingStrengthExerciseIndex === i ? "editing" : ""}">
          <div class="draft-exercise-copy">
            <strong>${escapeHtml(e.name)}</strong>
            <span>${escapeHtml(e.sets||"-")} S. · ${escapeHtml(e.reps||"-")} Wdh. · ${escapeHtml(formatWeight(e.weight))}</span>
          </div>
          ${ratingBadge(e.rating,false)}
          <div class="draft-exercise-actions">
            <button class="icon-mini" type="button" data-action="edit-draft-exercise" data-exercise-index="${i}" aria-label="Übung bearbeiten">✎</button>
            <button class="icon-mini danger-icon" type="button" data-action="remove-draft-exercise" data-exercise-index="${i}" aria-label="Übung entfernen">×</button>
          </div>
        </div>
      `).join("")}</div>`
    : `<p class="muted small">Noch keine Übung hinzugefügt.</p>`;
}

function strengthSessionCard(s) {
  return `
    <article class="entry clickable" data-entry-id="${s.id}" data-entry-kind="strength">
      <div class="entry-top">
        <div>
          <div class="entry-title">${formatDate(s.date)}</div>
          <div class="entry-meta">${s.exercises.length} Übungen · Antippen für Details oder Bearbeitung</div>
        </div>
        ${ratingBadge(s.rating,false)}
      </div>
      <div class="exercise-list">
        ${s.exercises.map(e=>`
          <div class="exercise-summary">
            <strong>${escapeHtml(e.name)}</strong>
            <span>${escapeHtml(e.sets||"-")} S.</span>
            <span>${escapeHtml(e.reps||"-")} Wdh.</span>
            <span>${escapeHtml(formatWeight(e.weight))}</span>
            <span>${ratingBadge(e.rating,false)}</span>
          </div>
        `).join("")}
      </div>
      ${s.notes ? `<p class="entry-notes">${escapeHtml(s.notes)}</p>` : ""}
    </article>
  `;
}

function beginNewStrengthSession() {
  editingStrengthSessionId = null;
  editingStrengthExerciseIndex = null;
  strengthDraftExercises = [];
  strengthFormOpen = true;
  render();
}

function beginEditStrengthSession(id) {
  const session = state.strengthSessions.find(s => s.id === id);
  if (!session) return;
  editingStrengthSessionId = id;
  editingStrengthExerciseIndex = null;
  strengthDraftExercises = clone(session.exercises || []);
  strengthFormOpen = true;
  detailDialog.close();
  route = {page:"strength", id:null};
  location.hash = "strength";
  render();
}

function renderStrength() {
  pageTitle.textContent = "Krafttraining";

  const sessions = [...state.strengthSessions].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const visibleSessions = sessions.slice(0,5);
  const suggestions = getExerciseSuggestions();
  const lastSession = sessions[0];
  const editedSession = editingStrengthSessionId
    ? state.strengthSessions.find(s => s.id === editingStrengthSessionId)
    : null;

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
        <div class="overview-stat"><strong>${sessions.length}</strong><span>Einheiten</span></div>
        <div class="overview-stat"><strong>${suggestions.length}</strong><span>Übungen</span></div>
        <div class="overview-stat"><strong>${lastSession ? formatDate(lastSession.date).slice(0,5) : "–"}</strong><span>Letztes Training</span></div>
      </div>
    </section>

    <section class="section">
      ${!strengthFormOpen ? `
        <button class="btn primary full" data-action="open-strength-form">＋ Training hinzufügen</button>
      ` : `
        <form class="card strength-session" id="strength-session-form">
          <div class="section-head">
            <div>
              <p class="eyebrow">${editedSession ? "TRAINING BEARBEITEN" : "NEUE EINHEIT"}</p>
              <h2>${editedSession ? formatDate(editedSession.date) : "Neue Einheit"}</h2>
            </div>
            <button class="btn secondary small-btn" type="button" data-action="close-strength-form">Schliessen</button>
          </div>

          <label>
            Datum
            <input type="date" name="date" value="${editedSession?.date || todayISO()}" required />
          </label>

          <div class="exercise-editor">
            <h3>${editingStrengthExerciseIndex === null ? "Übung hinzufügen" : "Übung bearbeiten"}</h3>

            <datalist id="exercise-history">
              ${suggestions.map(name=>`<option value="${escapeHtml(name)}"></option>`).join("")}
            </datalist>

            <div class="exercise-grid">
              <input class="exercise-name" id="strength-name" type="text" list="exercise-history" autocomplete="off" placeholder="Übung auswählen oder neu eingeben" />
              <input id="strength-sets" type="number" min="1" inputmode="numeric" placeholder="Sätze" />
              <input id="strength-reps" type="text" inputmode="text" placeholder="Wdh." />
              <input id="strength-weight" type="text" inputmode="text" placeholder="z. B. 100–120 kg" />
            </div>

            <label style="margin-top:12px">
              Bewertung dieser Übung
              <select id="strength-exercise-rating">${ratingSelectOptions()}</select>
            </label>

            ${suggestions.length
              ? `<p class="muted small" style="margin:0 0 10px">${suggestions.length} bereits verwendete Übungen im Dropdown verfügbar.</p>`
              : ""}

            <button type="button" class="btn secondary full" data-action="add-strength-exercise">${editingStrengthExerciseIndex === null ? "＋ Übung übernehmen" : "✓ Änderungen an Übung übernehmen"}</button>
          </div>

          <div id="strength-draft-list"></div>

          <label>
            Gesamtbewertung des Trainings
            <select name="rating">${ratingSelectOptions(editedSession?.rating ?? 0)}</select>
          </label>

          <label>
            Notizen zur Einheit
            <textarea name="notes" rows="4" placeholder="Gesamtgefühl, Technik, Besonderheiten...">${escapeHtml(editedSession?.notes || "")}</textarea>
          </label>

          <button class="btn primary" type="submit">${editedSession ? "Änderungen speichern" : "Komplettes Krafttraining speichern"}</button>
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

function backupSummary() {
  const exerciseCount = state.strengthSessions.reduce((sum,s)=>sum+(s.exercises?.length || 0),0);
  const infoCount = Object.values(state.infos || {}).reduce((sum,list)=>sum+(Array.isArray(list) ? list.length : 0),0);
  const goalCount = Object.values(state.goals || {}).filter(g => g?.performance || g?.technique).length;

  return {
    disciplines:state.disciplines.length,
    goals:goalCount,
    infos:infoCount,
    disciplineEntries:state.entries.length,
    strengthSessions:state.strengthSessions.length,
    strengthExercises:exerciseCount
  };
}

function renderData() {
  pageTitle.textContent = "Daten & Backup";
  const b = backupSummary();
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">LOKALE DATEN</p>
      <h2>Deine Daten bleiben auf diesem Gerät.</h2>
      <p class="muted">Alle Disziplinen, Ziele, Infos und Trainings werden lokal im Browser gespeichert.</p>
    </section>
    <section class="section">
      <div class="card">
        <h2>Backup-Inhalt</h2>
        <div class="backup-grid">
          <div><strong>${b.disciplines}</strong><span>Disziplinen</span></div>
          <div><strong>${b.goals}</strong><span>Zielbereiche</span></div>
          <div><strong>${b.infos}</strong><span>Infos</span></div>
          <div><strong>${b.disciplineEntries}</strong><span>Trainings</span></div>
          <div><strong>${b.strengthSessions}</strong><span>Krafteinheiten</span></div>
          <div><strong>${b.strengthExercises}</strong><span>Kraftübungen</span></div>
        </div>
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

function closeStrengthForm() {
  strengthFormOpen = false;
  editingStrengthSessionId = null;
  editingStrengthExerciseIndex = null;
  strengthDraftExercises = [];
  render();
}

function resetStrengthExerciseInputs() {
  const ids = ["strength-name","strength-sets","strength-reps","strength-weight"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const rating = document.getElementById("strength-exercise-rating");
  if (rating) rating.value = "0";
  editingStrengthExerciseIndex = null;
}

function fillStrengthExerciseInputs(index) {
  const ex = strengthDraftExercises[index];
  if (!ex) return;
  editingStrengthExerciseIndex = index;
  document.getElementById("strength-name").value = ex.name || "";
  document.getElementById("strength-sets").value = ex.sets || "";
  document.getElementById("strength-reps").value = ex.reps || "";
  document.getElementById("strength-weight").value = ex.weight || "";
  document.getElementById("strength-exercise-rating").value = String(normalizeRating(ex.rating));
  document.getElementById("strength-name")?.focus();
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>setRoute(btn.dataset.route));
});

quickAddBtn.addEventListener("click",()=>{
  if (route.page === "disciplines") openEntryDialog();
});

document.getElementById("close-dialog").addEventListener("click",()=>{
  editingEntryContext = null;
  entryDialog.close();
});

document.getElementById("cancel-dialog").addEventListener("click",()=>{
  editingEntryContext = null;
  entryDialog.close();
});

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
  const entry = {
    id:editingEntryContext?.id || uid(),
    disciplineId:document.getElementById("entry-discipline-id").value,
    date:document.getElementById("entry-date").value,
    description:document.getElementById("entry-description").value.trim(),
    result:document.getElementById("entry-result").value.trim(),
    rating:Number(document.getElementById("entry-rating-value").value || 0)
  };

  if (editingEntryContext) {
    const index = state.entries.findIndex(e => e.id === editingEntryContext.id);
    if (index >= 0) state.entries[index] = entry;
  } else {
    state.entries.push(entry);
  }

  saveState();
  editingEntryContext = null;
  entryDialog.close();
  render();
});

editDetailBtn.addEventListener("click",()=>{
  if (!detailContext) return;
  const current = {...detailContext};
  if (current.kind === "strength") return beginEditStrengthSession(current.id);
  detailDialog.close();
  openEntryDialog(null, current.id);
});

document.getElementById("delete-detail-entry").addEventListener("click",()=>{
  if (!detailContext || !confirm("Diesen Eintrag wirklich löschen?")) return;

  if (detailContext.kind === "strength") {
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
  const actionEl = ev.target.closest("[data-action]");
  const action = actionEl?.dataset.action;

  if (action === "open-discipline-form") {
    disciplineFormOpen = true;
    editingDisciplineId = null;
    return render();
  }

  if (action === "edit-discipline") {
    disciplineFormOpen = true;
    editingDisciplineId = actionEl.dataset.disciplineId;
    return render();
  }

  if (action === "cancel-discipline-form") {
    disciplineFormOpen = false;
    editingDisciplineId = null;
    return render();
  }

  if (action === "delete-discipline") {
    const id = actionEl.dataset.disciplineId;
    const discipline = getDiscipline(id);
    if (!discipline) return;
    const entryCount = state.entries.filter(e => e.disciplineId === id).length;
    const message = entryCount
      ? `"${discipline.name}" und ${entryCount} zugehörige Trainings wirklich löschen? Ziele und Infos dieser Disziplin werden ebenfalls entfernt.`
      : `"${discipline.name}" wirklich löschen? Ziele und Infos dieser Disziplin werden ebenfalls entfernt.`;
    if (!confirm(message)) return;
    state.disciplines = state.disciplines.filter(d => d.id !== id);
    state.entries = state.entries.filter(e => e.disciplineId !== id);
    delete state.goals[id];
    delete state.infos[id];
    disciplineFormOpen = false;
    editingDisciplineId = null;
    saveState();
    return render();
  }

  if (action === "all-disciplines" || action === "back-disciplines") return setRoute("disciplines");
  if (action === "add-area-training") return openEntryDialog(route.id);
  if (action === "edit-goals") { editingGoals = true; return render(); }
  if (action === "cancel-goals") { editingGoals = false; return render(); }
  if (action === "open-info-form") { infoFormOpen = true; editingInfoId = null; return render(); }
  if (action === "cancel-info-form") { infoFormOpen = false; return render(); }
  if (action === "edit-info") { editingInfoId = actionEl.dataset.infoId; infoFormOpen = false; return render(); }
  if (action === "cancel-info-edit") { editingInfoId = null; return render(); }
  if (action === "delete-info") {
    const infoId = actionEl.dataset.infoId;
    if (!confirm("Diese Info wirklich löschen?")) return;
    state.infos[route.id] = (state.infos[route.id] || []).filter(i => i.id !== infoId);
    saveState();
    return render();
  }

  if (action === "calendar-prev") {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()-1, 1);
    return render();
  }
  if (action === "calendar-next") {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()+1, 1);
    return render();
  }
  if (action === "calendar-today") {
    calendarCursor = new Date();
    selectedCalendarDate = todayISO();
    return render();
  }

  if (action === "open-strength-form") return beginNewStrengthSession();
  if (action === "close-strength-form") return closeStrengthForm();

  if (action === "edit-draft-exercise") {
    fillStrengthExerciseInputs(Number(actionEl.dataset.exerciseIndex));
    return;
  }

  if (action === "remove-draft-exercise") {
    const index = Number(actionEl.dataset.exerciseIndex);
    strengthDraftExercises.splice(index,1);
    if (editingStrengthExerciseIndex === index) resetStrengthExerciseInputs();
    else if (editingStrengthExerciseIndex !== null && editingStrengthExerciseIndex > index) editingStrengthExerciseIndex--;
    renderStrengthDraft();
    return;
  }

  if (action === "add-strength-exercise") {
    const name = document.getElementById("strength-name")?.value.trim();
    if (!name) return alert("Bitte zuerst eine Übung auswählen oder eingeben.");

    const exercise = {
      id:editingStrengthExerciseIndex !== null
        ? (strengthDraftExercises[editingStrengthExerciseIndex]?.id || uid())
        : uid(),
      name,
      sets:document.getElementById("strength-sets").value.trim(),
      reps:document.getElementById("strength-reps").value.trim(),
      weight:document.getElementById("strength-weight").value.trim(),
      rating:Number(document.getElementById("strength-exercise-rating").value || 0)
    };

    if (editingStrengthExerciseIndex !== null) {
      strengthDraftExercises[editingStrengthExerciseIndex] = exercise;
    } else {
      strengthDraftExercises.push(exercise);
    }

    resetStrengthExerciseInputs();
    renderStrengthDraft();
    return;
  }

  if (action === "export") return exportData();
  if (action === "import") return document.getElementById("import-file")?.click();
  if (action === "reset" && confirm("Wirklich alle lokalen Daten löschen? Auch deine selbst angelegten Disziplinen werden entfernt.")) {
    state = initialState();
    saveState();
    return render();
  }

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
  if (calendarEntry) return openDetail(calendarEntry.dataset.calendarEntryId, calendarEntry.dataset.calendarEntryKind);

  const entryEl = ev.target.closest("[data-entry-id]");
  if (entryEl) return openDetail(entryEl.dataset.entryId,entryEl.dataset.entryKind);

  const discipline = ev.target.closest("[data-discipline]");
  if (discipline) return setRoute("discipline",discipline.dataset.discipline);
});

app.addEventListener("submit",ev=>{
  if (ev.target.id === "discipline-form") {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const name = String(fd.get("name") || "").trim();
    const icon = String(fd.get("icon") || "athletics");
    const color = sanitizeColor(fd.get("color"));
    if (!name) return;

    if (editingDisciplineId) {
      const index = state.disciplines.findIndex(d => d.id === editingDisciplineId);
      if (index >= 0) state.disciplines[index] = {...state.disciplines[index], name, icon, color};
    } else {
      const id = `discipline-${uid()}`;
      state.disciplines.push({id,name,icon,color,unitHint:"z. B. Ziel / Bestleistung"});
      state.goals[id] = {performance:"", technique:""};
      state.infos[id] = [];
    }

    saveState();
    disciplineFormOpen = false;
    editingDisciplineId = null;
    return render();
  }

  if (ev.target.id === "goal-form") {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    state.goals[route.id] = {
      performance:String(fd.get("performance")||"").trim(),
      technique:String(fd.get("technique")||"").trim()
    };
    saveState();
    editingGoals = false;
    return render();
  }

  if (ev.target.id === "info-form") {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const label = String(fd.get("label")||"").trim();
    const value = String(fd.get("value")||"").trim();
    if (!label || !value) return;
    state.infos[route.id] = [...(state.infos[route.id]||[]),{id:uid(),label,value}];
    saveState();
    infoFormOpen = false;
    return render();
  }

  if (ev.target.matches("[data-info-edit-form]")) {
    ev.preventDefault();
    const infoId = ev.target.dataset.infoEditForm;
    const fd = new FormData(ev.target);
    const label = String(fd.get("label")||"").trim();
    const value = String(fd.get("value")||"").trim();
    if (!label || !value) return;
    const index = (state.infos[route.id] || []).findIndex(i => i.id === infoId);
    if (index >= 0) state.infos[route.id][index] = {...state.infos[route.id][index], label, value};
    saveState();
    editingInfoId = null;
    return render();
  }

  if (ev.target.id === "strength-session-form") {
    ev.preventDefault();
    if (!strengthDraftExercises.length) return alert("Bitte mindestens eine Übung hinzufügen.");

    const fd = new FormData(ev.target);
    const session = {
      id:editingStrengthSessionId || uid(),
      date:String(fd.get("date")||""),
      rating:Number(fd.get("rating")||0),
      notes:String(fd.get("notes")||"").trim(),
      exercises:clone(strengthDraftExercises)
    };

    if (editingStrengthSessionId) {
      const index = state.strengthSessions.findIndex(s => s.id === editingStrengthSessionId);
      if (index >= 0) state.strengthSessions[index] = session;
    } else {
      state.strengthSessions.push(session);
    }

    saveState();
    strengthDraftExercises = [];
    strengthFormOpen = false;
    editingStrengthSessionId = null;
    editingStrengthExerciseIndex = null;
    return render();
  }
});

document.addEventListener("change",async ev=>{
  if (ev.target.id !== "import-file") return;
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
