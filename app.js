/* Glen Track V2 – fixes: safe-area, scrolling, modal scroll, undo actions, templates */

const LS_KEY = "glenTrackV2:data";
const LS_VER = 2;

const $ = (id) => document.getElementById(id);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

/* -------------------------
   Data model
-------------------------- */
function todayKey(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}
function addDays(key, delta) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}
function startOfWeekKey(key, weekStartsMonday = false) {
  const d = new Date(key + "T00:00:00");
  const day = d.getDay(); // 0 Sun
  const offset = weekStartsMonday ? (day === 0 ? 6 : day - 1) : day;
  d.setDate(d.getDate() - offset);
  return todayKey(d);
}
function formatShort(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatMonth(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function defaultState() {
  return {
    v: LS_VER,
    settings: { cals: 2200, protein: 190, weighDay: 1 }, // Monday default
    day: {}, // dayKey -> { closed:boolean, food:{logged:[], planned:[]}, workout:{planned:[], completed:boolean, completedAt?:ts}, }
    foodLibrary: [
      { name: "Greek yogurt", cals: 150, p: 20, c: 8, f: 2, unit: "1 cup" },
      { name: "Banana", cals: 105, p: 1, c: 27, f: 0, unit: "1 medium" },
      { name: "Eggs", cals: 70, p: 6, c: 0, f: 5, unit: "1 egg" },
      { name: "Chicken breast", cals: 165, p: 31, c: 0, f: 4, unit: "100g" },
      { name: "Rice (cooked)", cals: 206, p: 4, c: 45, f: 0, unit: "1 cup" }
    ],
    templates: [
      { id: cryptoId(), name: "Full Body A", exercises: [
        { muscle:"Chest", name:"Bench press", sets:3, reps:8, notes:"" },
        { muscle:"Back", name:"Lat pulldown", sets:3, reps:10, notes:"" },
        { muscle:"Legs", name:"Squat", sets:3, reps:8, notes:"" },
        { muscle:"Arms", name:"Curls", sets:3, reps:12, notes:"" },
      ]},
      { id: cryptoId(), name: "Full Body B", exercises: [
        { muscle:"Legs", name:"Deadlift", sets:3, reps:5, notes:"" },
        { muscle:"Chest", name:"Incline DB press", sets:3, reps:10, notes:"" },
        { muscle:"Back", name:"Row", sets:3, reps:10, notes:"" },
        { muscle:"Shoulders", name:"Overhead press", sets:3, reps:8, notes:"" },
      ]},
    ],
    workoutHistory: [], // {id, dayKey, name, exercises, completedAt}
    weighIns: [], // {id, dayKey(week start or actual day), weight}
    exerciseLibrary: defaultExerciseLibrary()
  };
}

function defaultExerciseLibrary() {
  return [
    ["Chest", ["Bench press","Incline bench press","Dumbbell press","Push-ups","Chest fly"]],
    ["Back", ["Pull-ups","Lat pulldown","Barbell row","Dumbbell row","Seated cable row"]],
    ["Shoulders", ["Overhead press","Dumbbell shoulder press","Lateral raise","Rear delt fly","Face pulls"]],
    ["Arms", ["Biceps curls","Hammer curls","Triceps pushdown","Skull crushers","Dips"]],
    ["Legs", ["Squat","Front squat","Deadlift","Romanian deadlift","Leg press","Lunge"]],
    ["Core", ["Plank","Hanging leg raise","Crunch","Ab wheel","Pallof press"]],
    ["Cardio", ["Walking","Jogging","Cycling","Row machine","Stair climber"]]
  ];
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // soft migrate
    const s = { ...defaultState(), ...parsed };
    s.settings = { ...defaultState().settings, ...(parsed.settings || {}) };
    s.day = parsed.day || {};
    s.foodLibrary = parsed.foodLibrary || defaultState().foodLibrary;
    s.templates = parsed.templates || defaultState().templates;
    s.workoutHistory = parsed.workoutHistory || [];
    s.weighIns = parsed.weighIns || [];
    s.exerciseLibrary = parsed.exerciseLibrary || defaultExerciseLibrary();
    s.v = LS_VER;
    return s;
  } catch {
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function cryptoId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function ensureDay(key) {
  if (!state.day[key]) {
    state.day[key] = {
      closed: false,
      food: { logged: [], planned: [] },
      workout: { planned: [], completed: false, name: "" }
    };
  }
  return state.day[key];
}

/* -------------------------
   App state
-------------------------- */
let state = loadState();
let selectedDay = todayKey();
let currentScreen = "today";
let previousScreenForBack = null;

/* -------------------------
   Service worker
-------------------------- */
(function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./service-worker.js"); }
    catch {}
  });
})();

/* -------------------------
   Modal / toast
-------------------------- */
function openModal(title, bodyHTML, footHTML = "") {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  $("modalFoot").innerHTML = footHTML;
  $("modalOverlay").classList.remove("hidden");
  $("modalOverlay").setAttribute("aria-hidden","false");
  // close when tapping overlay backdrop
  $("modalOverlay").onclick = (e) => {
    if (e.target === $("modalOverlay")) closeModal();
  };
}
function closeModal() {
  $("modalOverlay").classList.add("hidden");
  $("modalOverlay").setAttribute("aria-hidden","true");
  $("modalOverlay").onclick = null;
}
$("modalClose").addEventListener("click", closeModal);

let toastTimer = null;
function toast(msg="Updated ✓") {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1400);
}

/* -------------------------
   Navigation
-------------------------- */
function setScreen(name) {
  currentScreen = name;
  qsa(".screen").forEach(s => s.classList.remove("active"));
  const el = document.querySelector(`.screen[data-screen="${name}"]`);
  if (el) el.classList.add("active");

  qsa(".navItem").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  render();
}
qsa(".navItem").forEach(btn => {
  btn.addEventListener("click", () => {
    previousScreenForBack = null;
    $("btnBackToCal").classList.add("hidden");
    setScreen(btn.dataset.nav);
  });
});

$("btnBackToCal").addEventListener("click", () => {
  if (previousScreenForBack) setScreen(previousScreenForBack);
  previousScreenForBack = null;
  $("btnBackToCal").classList.add("hidden");
});

/* -------------------------
   Day picker (prev/next)
-------------------------- */
$("btnPrevDay").addEventListener("click", () => { selectedDay = addDays(selectedDay, -1); render(); });
$("btnNextDay").addEventListener("click", () => { selectedDay = addDays(selectedDay, +1); render(); });

$("btnPickDay").addEventListener("click", () => {
  // quick pick: today
  const isToday = selectedDay === todayKey();
  openModal(
    "Pick day",
    `
      <div class="list">
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">${isToday ? "Today (selected)" : "Today"}</div>
            <button class="btn primary" id="mGoToday">Select</button>
          </div>
          <div class="listSub">${formatShort(todayKey())}</div>
        </div>
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">Enter date</div>
          </div>
          <div class="listSub">YYYY-MM-DD</div>
          <input id="mDateInput" type="date" />
        </div>
      </div>
    `,
    `<button class="btn" id="mClose">Close</button>`
  );
  $("mGoToday").onclick = () => { selectedDay = todayKey(); closeModal(); render(); };
  $("mClose").onclick = closeModal;
  $("mDateInput").onchange = (e) => {
    const v = e.target.value;
    if (v) { selectedDay = v; closeModal(); render(); }
  };
});

/* -------------------------
   Buttons on Today
-------------------------- */
$("btnGoFood").addEventListener("click", () => setScreen("food"));
$("btnGoWorkouts").addEventListener("click", () => setScreen("workouts"));

$("btnQuickLog").addEventListener("click", () => {
  openModal(
    "Quick Log",
    `
      <div class="list">
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">Add food (logged)</div>
            <button class="btn primary" id="mQuickFood">Add</button>
          </div>
          <div class="listSub">Fast entry with calories + macros + serving size</div>
        </div>
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">Log weigh-in</div>
            <button class="btn" id="mQuickWeight">Log</button>
          </div>
          <div class="listSub">One point per week</div>
        </div>
      </div>
    `,
    `<button class="btn" id="mClose">Close</button>`
  );
  $("mClose").onclick = closeModal;
  $("mQuickFood").onclick = () => { closeModal(); openFoodAddModal({ mode:"logged" }); };
  $("mQuickWeight").onclick = () => { closeModal(); openWeighInModal(); };
});

$("btnCloseDay").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  d.closed = true;
  saveState();
  toast("Day closed ✓");
  render();
});

$("btnReopenDay").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  d.closed = false;
  saveState();
  toast("Reopened");
  render();
});

$("btnWeighIn").addEventListener("click", openWeighInModal);

/* -------------------------
   Food
-------------------------- */
$("btnFoodLibrary").addEventListener("click", () => openFoodLibraryModal());
$("btnCopyPrevDay").addEventListener("click", () => {
  const prev = addDays(selectedDay, -1);
  const dPrev = ensureDay(prev);
  const d = ensureDay(selectedDay);
  // copy logged + planned
  d.food.logged = JSON.parse(JSON.stringify(dPrev.food.logged || []));
  d.food.planned = JSON.parse(JSON.stringify(dPrev.food.planned || []));
  saveState();
  toast("Copied ✓");
  render();
});

function foodTotals(dayKey, type="logged") {
  const d = ensureDay(dayKey);
  const items = d.food[type] || [];
  return items.reduce((acc, it) => {
    acc.cals += Number(it.cals||0);
    acc.p += Number(it.p||0);
    acc.c += Number(it.c||0);
    acc.f += Number(it.f||0);
    return acc;
  }, {cals:0,p:0,c:0,f:0});
}

function openFoodLibraryModal() {
  const rows = state.foodLibrary.map((it, idx) => `
    <div class="listItem">
      <div class="listTop">
        <div class="listTitle">${escapeHtml(it.name)} <span style="color:#7E8AA3;font-weight:900">(${escapeHtml(it.unit||"")})</span></div>
        <button class="btn primary" data-add="${idx}">Add</button>
      </div>
      <div class="listSub">${it.cals} cals • P ${it.p} • C ${it.c} • F ${it.f}</div>
    </div>
  `).join("");

  openModal(
    "Food Library",
    `
      <div class="list">
        ${rows || `<div class="listItem"><div class="listTitle">No items yet</div></div>`}
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">Create new library item</div>
            <button class="btn" id="mNewLib">Create</button>
          </div>
          <div class="listSub">Saved items = no retyping later</div>
        </div>
      </div>
    `,
    `<button class="btn" id="mClose">Close</button>`
  );
  $("mClose").onclick = closeModal;

  qsa("[data-add]").forEach(b => {
    b.onclick = () => {
      const idx = Number(b.getAttribute("data-add"));
      closeModal();
      openFoodAddModal({ mode:"logged", fromLibraryIndex: idx });
    };
  });

  $("mNewLib").onclick = () => {
    closeModal();
    openFoodCreateLibraryModal();
  };
}

function openFoodCreateLibraryModal() {
  openModal(
    "New library item",
    `
      <div class="formGrid">
        <label class="field"><span>Name</span><input id="fName" placeholder="e.g., Salmon" /></label>
        <label class="field"><span>Serving size (text)</span><input id="fUnit" placeholder="e.g., 6 oz" /></label>

        <label class="field"><span>Calories</span><input id="fCals" type="number" inputmode="numeric" /></label>
        <label class="field"><span>Protein (g)</span><input id="fP" type="number" inputmode="numeric" /></label>
        <label class="field"><span>Carbs (g)</span><input id="fC" type="number" inputmode="numeric" /></label>
        <label class="field"><span>Fat (g)</span><input id="fF" type="number" inputmode="numeric" /></label>
      </div>
    `,
    `<button class="btn" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Save</button>`
  );
  $("mCancel").onclick = closeModal;
  $("mSave").onclick = () => {
    const it = {
      name: $("fName").value.trim() || "New item",
      unit: $("fUnit").value.trim() || "",
      cals: Number($("fCals").value||0),
      p: Number($("fP").value||0),
      c: Number($("fC").value||0),
      f: Number($("fF").value||0),
    };
    state.foodLibrary.unshift(it);
    saveState();
    closeModal();
    toast("Saved to library ✓");
    render();
  };
}

function openFoodAddModal({ mode="logged", fromLibraryIndex=null } = {}) {
  const base = fromLibraryIndex!=null ? state.foodLibrary[fromLibraryIndex] : null;
  openModal(
    mode === "planned" ? "Add planned food" : "Add logged food",
    `
      <div class="formGrid">
        <label class="field"><span>Food name</span><input id="aName" value="${escapeAttr(base?.name||"")}" placeholder="e.g., Chicken + rice" /></label>
        <label class="field"><span>Serving size</span><input id="aUnit" value="${escapeAttr(base?.unit||"")}" placeholder="e.g., 6 oz / 1 cup / 100g" /></label>

        <label class="field"><span>Calories</span><input id="aCals" type="number" inputmode="numeric" value="${base?.cals ?? ""}" /></label>
        <label class="field"><span>Protein (g)</span><input id="aP" type="number" inputmode="numeric" value="${base?.p ?? ""}" /></label>
        <label class="field"><span>Carbs (g)</span><input id="aC" type="number" inputmode="numeric" value="${base?.c ?? ""}" /></label>
        <label class="field"><span>Fat (g)</span><input id="aF" type="number" inputmode="numeric" value="${base?.f ?? ""}" /></label>

        <div class="listItem">
          <div class="listSub">Tip: If this is something you’ll eat again, save it in Library after you add it.</div>
        </div>
      </div>
    `,
    `
      <button class="btn" id="mCancel">Cancel</button>
      <button class="btn" id="mSaveLib">Save to Library</button>
      <button class="btn primary" id="mAdd">Add</button>
    `
  );
  $("mCancel").onclick = closeModal;

  $("mSaveLib").onclick = () => {
    const it = readFoodForm();
    state.foodLibrary.unshift({ name: it.name, unit: it.unit, cals: it.cals, p: it.p, c: it.c, f: it.f });
    saveState();
    toast("Saved to library ✓");
  };

  $("mAdd").onclick = () => {
    const it = readFoodForm();
    const d = ensureDay(selectedDay);
    d.food[mode].push({ id: cryptoId(), ...it, ts: Date.now() });
    saveState();
    closeModal();
    toast("Added ✓");
    render();
  };
}

function readFoodForm() {
  return {
    name: $("aName").value.trim() || "Food",
    unit: $("aUnit").value.trim() || "",
    cals: Number($("aCals").value||0),
    p: Number($("aP").value||0),
    c: Number($("aC").value||0),
    f: Number($("aF").value||0),
  };
}

/* -------------------------
   Workouts
-------------------------- */
$("btnTemplates").addEventListener("click", openTemplatesModal);
$("btnPlanWorkout").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  if (!d.workout) d.workout = { planned: [], completed:false, name:"" };
  d.workout.planned = d.workout.planned || [];
  $("workoutEditor").classList.remove("hidden");
  renderWorkoutEditor();
  saveState();
});
$("btnAddExercise").addEventListener("click", openExercisePickerModal);

$("btnSaveWorkoutLog").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  if (!d.workout) return;
  d.workout.name = d.workout.name || "Workout";
  saveState();
  toast("Saved ✓");
  render();
});

$("btnMarkWorkoutComplete").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  if (!d.workout) return;
  d.workout.completed = true;
  d.workout.completedAt = Date.now();
  // push to history (allow delete)
  state.workoutHistory.unshift({
    id: cryptoId(),
    dayKey: selectedDay,
    name: d.workout.name || "Workout",
    exercises: JSON.parse(JSON.stringify(d.workout.planned || [])),
    completedAt: d.workout.completedAt
  });
  saveState();
  toast("Marked complete ✓");
  render();
});

$("btnUndoWorkoutComplete").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  if (!d.workout) return;
  d.workout.completed = false;
  delete d.workout.completedAt;
  // remove most recent history item for that day (if any)
  const idx = state.workoutHistory.findIndex(h => h.dayKey === selectedDay);
  if (idx >= 0) state.workoutHistory.splice(idx, 1);
  saveState();
  toast("Undone");
  render();
});

$("btnSaveAsTemplate").addEventListener("click", () => {
  const d = ensureDay(selectedDay);
  const ex = (d.workout?.planned || []);
  if (!ex.length) return toast("Add exercises first");
  openModal(
    "Save template",
    `
      <div class="formGrid">
        <label class="field">
          <span>Template name</span>
          <input id="tName" placeholder="e.g., Push Day" />
        </label>
      </div>
    `,
    `<button class="btn" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Save</button>`
  );
  $("mCancel").onclick = closeModal;
  $("mSave").onclick = () => {
    const name = $("tName").value.trim() || "My Template";
    state.templates.unshift({ id: cryptoId(), name, exercises: JSON.parse(JSON.stringify(ex)) });
    saveState();
    closeModal();
    toast("Template saved ✓");
    render();
  };
});

function openTemplatesModal() {
  const list = state.templates.map(t => `
    <div class="listItem">
      <div class="listTop">
        <div class="listTitle">${escapeHtml(t.name)}</div>
        <div class="row">
          <button class="btn" data-use="${t.id}">Use</button>
          <button class="btn danger ghost" data-del="${t.id}">Delete</button>
        </div>
      </div>
      <div class="listSub">${t.exercises.length} exercise(s)</div>
    </div>
  `).join("");

  openModal(
    "Templates",
    `<div class="list">${list || `<div class="listItem"><div class="listTitle">No templates</div></div>`}</div>`,
    `<button class="btn" id="mClose">Close</button>`
  );
  $("mClose").onclick = closeModal;

  qsa("[data-use]").forEach(b => {
    b.onclick = () => {
      const id = b.getAttribute("data-use");
      const t = state.templates.find(x => x.id === id);
      if (!t) return;
      const d = ensureDay(selectedDay);
      d.workout = d.workout || { planned: [], completed:false, name:"" };
      d.workout.name = t.name;
      d.workout.planned = JSON.parse(JSON.stringify(t.exercises));
      d.workout.completed = false;
      delete d.workout.completedAt;
      saveState();
      closeModal();
      $("workoutEditor").classList.remove("hidden");
      toast("Template applied ✓");
      render();
    };
  });

  qsa("[data-del]").forEach(b => {
    b.onclick = () => {
      const id = b.getAttribute("data-del");
      state.templates = state.templates.filter(x => x.id !== id);
      saveState();
      closeModal();
      toast("Template deleted");
      render();
    };
  });
}

function openExercisePickerModal() {
  // grouped by muscle, scrollable modal body (CSS already fixes)
  const groups = state.exerciseLibrary.map(([muscle, items]) => {
    const rows = items.map(name => `
      <div class="listItem">
        <div class="listTop">
          <div class="listTitle">${escapeHtml(name)}</div>
          <button class="btn primary" data-addex="${escapeAttr(muscle)}||${escapeAttr(name)}">Add</button>
        </div>
        <div class="listSub">${escapeHtml(muscle)}</div>
      </div>
    `).join("");
    return `
      <div class="listItem" style="background:rgba(255,255,255,.03)">
        <div class="listTitle">${escapeHtml(muscle)}</div>
      </div>
      ${rows}
    `;
  }).join("");

  openModal(
    "Add exercise",
    `<div class="list">${groups}</div>`,
    `<button class="btn" id="mClose">Close</button>`
  );
  $("mClose").onclick = closeModal;

  qsa("[data-addex]").forEach(b => {
    b.onclick = () => {
      const [muscle, name] = b.getAttribute("data-addex").split("||");
      const d = ensureDay(selectedDay);
      d.workout = d.workout || { planned: [], completed:false, name:"" };
      d.workout.planned.push({ muscle, name, sets: 3, reps: 10, notes: "" });
      saveState();
      closeModal();
      toast("Exercise added ✓");
      $("workoutEditor").classList.remove("hidden");
      render();
    };
  });
}

function renderWorkoutEditor() {
  const d = ensureDay(selectedDay);
  const w = d.workout || { planned: [], completed:false, name:"" };

  const items = (w.planned || []).map((ex, idx) => `
    <div class="listItem">
      <div class="listTop">
        <div class="listTitle">${escapeHtml(ex.name)}</div>
        <button class="btn danger ghost" data-delx="${idx}">Remove</button>
      </div>
      <div class="listSub">${escapeHtml(ex.muscle)} • Sets ${ex.sets} • Reps ${ex.reps}</div>
      <div class="row" style="margin-top:10px">
        <label class="field" style="flex:1">
          <span>Sets</span>
          <input type="number" inputmode="numeric" data-sets="${idx}" value="${ex.sets}" />
        </label>
        <label class="field" style="flex:1">
          <span>Reps</span>
          <input type="number" inputmode="numeric" data-reps="${idx}" value="${ex.reps}" />
        </label>
      </div>
      <label class="field" style="margin-top:10px">
        <span>Notes</span>
        <input data-notes="${idx}" value="${escapeAttr(ex.notes||"")}" placeholder="Optional" />
      </label>
    </div>
  `).join("");

  $("exerciseEditor").innerHTML = items || `<div class="listItem"><div class="listTitle">No exercises yet</div><div class="listSub">Tap “Add exercise”.</div></div>`;

  qsa("[data-delx]").forEach(b => {
    b.onclick = () => {
      const i = Number(b.getAttribute("data-delx"));
      w.planned.splice(i, 1);
      d.workout = w;
      saveState();
      toast("Removed");
      render();
    };
  });

  qsa("[data-sets]").forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.getAttribute("data-sets"));
      w.planned[i].sets = Number(inp.value||0);
      saveState();
    };
  });
  qsa("[data-reps]").forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.getAttribute("data-reps"));
      w.planned[i].reps = Number(inp.value||0);
      saveState();
    };
  });
  qsa("[data-notes]").forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.getAttribute("data-notes"));
      w.planned[i].notes = inp.value || "";
      saveState();
    };
  });
}

/* -------------------------
   Calendar
-------------------------- */
let calCursor = new Date(); // month cursor
$("btnCalPrev").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
$("btnCalNext").addEventListener("click", () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });

function renderCalendar() {
  $("uiCalTitle").textContent = formatMonth(calCursor);
  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const last = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0);
  const startDay = first.getDay(); // 0 Sun
  const total = last.getDate();

  const cells = [];
  for (let i=0;i<startDay;i++) cells.push(null);
  for (let d=1; d<=total; d++) cells.push(new Date(calCursor.getFullYear(), calCursor.getMonth(), d));

  $("calGrid").innerHTML = cells.map(dt => {
    if (!dt) return `<div class="calCell" style="opacity:.2"></div>`;
    const key = todayKey(dt);
    const day = ensureDay(key);
    const dots = [];
    if (day.closed) dots.push(`<span class="dot dotClosed"></span>`);
    if ((day.food?.logged||[]).length) dots.push(`<span class="dot dotFood"></span>`);
    if (day.workout?.completed) dots.push(`<span class="dot dotWo"></span>`);
    if ((day.food?.planned||[]).length || (day.workout?.planned||[]).length) dots.push(`<span class="dot dotPlanned"></span>`);
    return `
      <button class="calCell" data-day="${key}" aria-label="${key}">
        <div class="calDay">${dt.getDate()}</div>
        <div class="calDots">${dots.join("")}</div>
      </button>
    `;
  }).join("");

  qsa("[data-day]").forEach(b => {
    b.onclick = () => {
      selectedDay = b.getAttribute("data-day");
      // go to Today but provide a visible Back-to-Calendar chip
      previousScreenForBack = "calendar";
      $("btnBackToCal").classList.remove("hidden");
      setScreen("today");
      toast(formatShort(selectedDay));
    };
  });
}

/* -------------------------
   Analytics / weigh-ins / settings
-------------------------- */
$("btnLogWeighIn").addEventListener("click", openWeighInModal);
$("btnSaveSettings").addEventListener("click", () => {
  state.settings.cals = Number($("setCals").value || state.settings.cals);
  state.settings.protein = Number($("setProtein").value || state.settings.protein);
  state.settings.weighDay = Number($("setWeighDay").value || state.settings.weighDay);
  saveState();
  toast("Saved ✓");
  render();
});

$("btnReset").addEventListener("click", () => {
  openModal(
    "Reset all data?",
    `<div class="listItem"><div class="listTitle">This will erase everything in the app.</div><div class="listSub">Your repo stays fine. This is only local app data.</div></div>`,
    `<button class="btn" id="mCancel">Cancel</button><button class="btn danger" id="mReset">Reset</button>`
  );
  $("mCancel").onclick = closeModal;
  $("mReset").onclick = () => {
    state = defaultState();
    saveState();
    closeModal();
    toast("Reset");
    render();
  };
});

$("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glen-track-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function openWeighInModal() {
  const wkStart = startOfWeekKey(selectedDay, false);
  const existing = state.weighIns.find(w => w.dayKey === wkStart);
  openModal(
    "Weekly weigh-in",
    `
      <div class="list">
        <div class="listItem">
          <div class="listTop">
            <div class="listTitle">Week of ${formatShort(wkStart)}</div>
          </div>
          <div class="listSub">One point per week. Update anytime.</div>
        </div>

        <div class="listItem">
          <div class="inlineFields">
            <div class="listTitle">Weight</div>
            <input id="wVal" type="number" inputmode="decimal" placeholder="e.g., 195.2" value="${existing?.weight ?? ""}" />
          </div>
          <div class="listSub">Stored to Stats automatically</div>
        </div>
      </div>
    `,
    `<button class="btn" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Save</button>`
  );
  $("mCancel").onclick = closeModal;
  $("mSave").onclick = () => {
    const val = Number($("wVal").value || 0);
    if (!val) { toast("Enter weight"); return; }
    if (existing) existing.weight = val;
    else state.weighIns.unshift({ id: cryptoId(), dayKey: wkStart, weight: val });
    saveState();
    closeModal();
    toast("Weigh-in saved ✓");
    render();
  };
}

/* -------------------------
   Rendering
-------------------------- */
function render() {
  // top date label
  $("uiDateLabel").textContent = (selectedDay === todayKey()) ? "Today" : formatShort(selectedDay);

  // ensure day exists
  const d = ensureDay(selectedDay);

  // TODAY summary should reflect logged totals
  const logged = foodTotals(selectedDay, "logged");
  const targetCals = state.settings.cals;
  const targetProtein = state.settings.protein;

  const remainingCals = Math.max(0, targetCals - logged.cals);
  const remainingProtein = Math.max(0, targetProtein - logged.p);

  $("uiCals").textContent = `${logged.cals} / ${targetCals}`;
  $("uiCalsHint").textContent = `${remainingCals} remaining`;
  $("uiProtein").textContent = `${logged.p} / ${targetProtein}g`;
  $("uiProteinHint").textContent = `${remainingProtein}g remaining`;
  $("uiCarbs").textContent = `${logged.c}g`;
  $("uiFat").textContent = `${logged.f}g`;

  const foodLoggedCount = (d.food?.logged || []).length;
  const woCompleted = !!d.workout?.completed;
  $("uiFoodSub").textContent = foodLoggedCount ? `${foodLoggedCount} item(s)` : "Not logged";
  $("uiWorkoutSub").textContent = woCompleted ? "Completed" : ((d.workout?.planned||[]).length ? "Planned" : "Not logged");

  $("uiFoodMark").textContent = foodLoggedCount ? "✓" : "—";
  $("uiWorkoutMark").textContent = woCompleted ? "✓" : "—";

  // Close day enable + reopen
  const canClose = foodLoggedCount > 0 || woCompleted;
  $("btnCloseDay").disabled = !canClose || d.closed;
  $("btnReopenDay").classList.toggle("hidden", !d.closed);

  if (d.closed) {
    $("uiStatusPill").textContent = "Closed";
    $("uiStatusLine").textContent = "Status: Closed";
    $("uiStatusPill").style.borderColor = "rgba(183,255,74,.35)";
  } else {
    $("uiStatusPill").textContent = "In Progress";
    $("uiStatusLine").textContent = "Status: In Progress";
    $("uiStatusPill").style.borderColor = "rgba(255,255,255,.10)";
  }
  $("uiCloseHint").textContent = d.closed ? "Day is closed. You can reopen if it was a mistake." : (canClose ? "Ready when you are." : "Log food or a workout to enable Close Today.");

  // weigh-in line
  const wkStart = startOfWeekKey(selectedDay, false);
  const wi = state.weighIns.find(w => w.dayKey === wkStart);
  $("uiWeighInSub").textContent = wi ? `${wi.weight}` : "Weekly only";
  $("uiWeighInMark").textContent = wi ? "✓" : "—";

  // FOOD screen
  $("uiFoodDateSub").textContent = (selectedDay === todayKey()) ? "Meals for Today" : `Meals for ${formatShort(selectedDay)}`;
  $("uiFoodTotCals").textContent = logged.cals;
  $("uiFoodTotP").textContent = logged.p;
  $("uiFoodTotC").textContent = logged.c;
  $("uiFoodTotF").textContent = logged.f;

  renderMealList();

  // WORKOUTS screen
  $("uiWorkoutDateSub").textContent = (selectedDay === todayKey()) ? "Plan or log for Today" : `Plan or log for ${formatShort(selectedDay)}`;
  renderWorkoutScreen();

  // Calendar + analytics
  renderCalendar();
  renderAnalytics();
}

function renderMealList() {
  const d = ensureDay(selectedDay);
  const logged = d.food?.logged || [];
  const planned = d.food?.planned || [];

  const section = (title, arr, mode) => `
    <div class="card">
      <div class="cardHead">
        <div>
          <div class="h2">${title}</div>
          <div class="sub">${arr.length ? `${arr.length} item(s)` : "None"}</div>
        </div>
        <button class="btn" data-addfood="${mode}">Add</button>
      </div>
      <div class="divider"></div>
      <div class="list">
        ${arr.map(it => `
          <div class="listItem">
            <div class="listTop">
              <div class="listTitle">${escapeHtml(it.name)} ${it.unit ? `<span style="color:#7E8AA3;font-weight:900">(${escapeHtml(it.unit)})</span>`:""}</div>
              <button class="btn danger ghost" data-delfood="${mode}||${it.id}">Delete</button>
            </div>
            <div class="listSub">${it.cals} cals • P ${it.p} • C ${it.c} • F ${it.f}</div>
          </div>
        `).join("") || `<div class="listItem"><div class="listTitle">None</div></div>`}
      </div>
    </div>
  `;

  $("mealList").innerHTML =
    section("Logged", logged, "logged") +
    section("Planned", planned, "planned");

  qsa("[data-addfood]").forEach(b => {
    b.onclick = () => openFoodAddModal({ mode: b.getAttribute("data-addfood") });
  });

  qsa("[data-delfood]").forEach(b => {
    b.onclick = () => {
      const [mode, id] = b.getAttribute("data-delfood").split("||");
      const d = ensureDay(selectedDay);
      d.food[mode] = (d.food[mode] || []).filter(x => x.id !== id);
      saveState();
      toast("Deleted");
      render();
    };
  });
}

function renderWorkoutScreen() {
  const d = ensureDay(selectedDay);
  const w = d.workout || { planned: [], completed:false, name:"" };
  const hasPlan = (w.planned || []).length > 0;

  $("uiWorkoutStatus").textContent = w.completed ? "Completed ✓" : (hasPlan ? "Planned" : "No workout planned");

  // show editor if there is a plan
  $("workoutEditor").classList.toggle("hidden", !hasPlan);

  if (hasPlan) renderWorkoutEditor();

  // history list with delete
  const items = state.workoutHistory.slice(0, 14).map(h => `
    <div class="listItem">
      <div class="listTop">
        <div class="listTitle">${escapeHtml(h.name || "Workout")}</div>
        <button class="btn danger ghost" data-delhist="${h.id}">Delete</button>
      </div>
      <div class="listSub">${formatShort(h.dayKey)} • ${h.exercises.length} exercise(s)</div>
    </div>
  `).join("");

  $("workoutHistory").innerHTML = items || `<div class="listItem"><div class="listTitle">No history yet</div><div class="listSub">Mark a workout complete to see it here.</div></div>`;

  qsa("[data-delhist]").forEach(b => {
    b.onclick = () => {
      const id = b.getAttribute("data-delhist");
      state.workoutHistory = state.workoutHistory.filter(x => x.id !== id);
      saveState();
      toast("Deleted");
      render();
    };
  });
}

function renderAnalytics() {
  // week summary based on selected day week
  const wkStart = startOfWeekKey(selectedDay, false);
  const wkEnd = addDays(wkStart, 6);
  $("uiAnalyticsWeek").textContent = `${formatShort(wkStart)} – ${formatShort(wkEnd)}`;

  // compute week stats
  let closed = 0, workouts = 0, sumCals = 0, sumP = 0, daysWithFood = 0;
  for (let i=0;i<7;i++) {
    const key = addDays(wkStart, i);
    const d = ensureDay(key);
    if (d.closed) closed++;
    if (d.workout?.completed) workouts++;
    const t = foodTotals(key, "logged");
    if ((d.food?.logged||[]).length) {
      daysWithFood++;
      sumCals += t.cals;
      sumP += t.p;
    }
  }
  const avgCals = daysWithFood ? Math.round(sumCals / daysWithFood) : 0;
  const avgP = daysWithFood ? Math.round(sumP / daysWithFood) : 0;

  $("anClosed").textContent = closed;
  $("anWorkouts").textContent = workouts;
  $("anAvgCals").textContent = avgCals || "—";
  $("anAvgProtein").textContent = avgP || "—";

  // mirror on Today card
  $("uiClosedDays").textContent = closed;
  $("uiWorkoutsWeek").textContent = workouts;
  $("uiAvgCals").textContent = avgCals || "—";
  $("uiAvgProtein").textContent = avgP || "—";

  // streak (consecutive closed days ending today)
  let streak = 0;
  let k = todayKey();
  while (true) {
    const d = ensureDay(k);
    if (!d.closed) break;
    streak++;
    k = addDays(k, -1);
  }
  $("uiStreak").textContent = String(streak);

  // weigh-in list
  const rows = state.weighIns
    .slice()
    .sort((a,b) => (a.dayKey < b.dayKey ? 1 : -1))
    .slice(0, 12)
    .map(w => `
      <div class="listItem">
        <div class="listTop">
          <div class="listTitle">${w.weight}</div>
          <button class="btn danger ghost" data-delw="${w.id}">Delete</button>
        </div>
        <div class="listSub">Week of ${formatShort(w.dayKey)}</div>
      </div>
    `).join("");

  $("weighInList").innerHTML = rows || `<div class="listItem"><div class="listTitle">No weigh-ins yet</div><div class="listSub">Log one from Today or Stats.</div></div>`;

  qsa("[data-delw]").forEach(b => {
    b.onclick = () => {
      const id = b.getAttribute("data-delw");
      state.weighIns = state.weighIns.filter(x => x.id !== id);
      saveState();
      toast("Deleted");
      render();
    };
  });

  // settings fields
  $("setCals").value = state.settings.cals;
  $("setProtein").value = state.settings.protein;
  $("setWeighDay").value = String(state.settings.weighDay);
}

/* -------------------------
   helpers
-------------------------- */
function escapeHtml(str="") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function escapeAttr(str="") {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

/* -------------------------
   Init
-------------------------- */
render();
setScreen("today");
