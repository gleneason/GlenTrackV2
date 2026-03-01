/* Glen Track V2 - app.js (single-file vanilla JS)
   - Works with index.html that uses the IDs referenced below.
   - Offline-first via localStorage.
   - Fixes: Food add flow, single exercises + templates, rest timer,
            calendar flat (no bubbles), momentum rings for Calories/Protein
            (no % text in the ring center), safe behavior on iPhone Safari.
*/

(() => {
  "use strict";

  /********************
   * DOM helpers
   ********************/
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, fn, opts) => el && el.addEventListener(evt, fn, opts);

  /********************
   * Constants
   ********************/
  const LS_KEY = "glenTrackV2:data:v2";
  const LS_UI = "glenTrackV2:ui:v2";

  const MAX_FAVS = 10;

  const MOMENTUM = {
    foodLogged: 0.45,
    workoutDone: 0.45,
    closedDay: 0.10,
  };

  /********************
   * Date helpers
   ********************/
  const pad2 = (n) => String(n).padStart(2, "0");

  function toKey(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, delta) {
    const d = fromKey(key);
    d.setDate(d.getDate() + delta);
    return toKey(d);
  }

  function weekRangeFor(dateKey, weekStartsOnMonday = true) {
    const d = fromKey(dateKey);
    const day = d.getDay();
    const offset = weekStartsOnMonday ? 1 : 0;

    const start = new Date(d);
    start.setDate(d.getDate() - ((day - offset + 7) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return { startKey: toKey(start), endKey: toKey(end), start, end };
  }

  function monthTitle(d) {
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  /********************
   * uid
   ********************/
  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  /********************
   * Default libraries
   ********************/
  const DEFAULT_FOOD_LIBRARY = [
    { id: uid(), name: "Greek yogurt", cals: 150, p: 20, c: 8, f: 2, unit: "cup", amount: 1 },
    { id: uid(), name: "Banana", cals: 105, p: 1, c: 27, f: 0, unit: "medium", amount: 1 },
    { id: uid(), name: "Rotisserie chicken", cals: 200, p: 35, c: 0, f: 6, unit: "4 oz", amount: 1 },
    { id: uid(), name: "White rice (cooked)", cals: 205, p: 4, c: 45, f: 0, unit: "cup", amount: 1 },
    { id: uid(), name: "Salmon", cals: 280, p: 25, c: 0, f: 18, unit: "6 oz", amount: 1 },
    { id: uid(), name: "Egg bites", cals: 230, p: 17, c: 11, f: 13, unit: "serving", amount: 1 },
    { id: uid(), name: "Spinach", cals: 25, p: 3, c: 4, f: 0, unit: "cup", amount: 1 },
  ];

  const MUSCLE_GROUPS = [
    { key: "Chest", items: ["Bench press", "Incline bench", "Dumbbell press", "Chest fly"] },
    { key: "Back", items: ["Lat pulldown", "Pull-up", "Seated row", "Barbell row", "Deadlift"] },
    { key: "Shoulders", items: ["Overhead press", "Lateral raise", "Rear delt fly"] },
    { key: "Biceps", items: ["Dumbbell curls", "Barbell curls", "Hammer curls"] },
    { key: "Triceps", items: ["Triceps pushdown", "Skull crushers", "Dips"] },
    { key: "Legs", items: ["Squat", "Leg press", "Lunges", "Romanian deadlift", "Leg curl", "Leg extension"] },
    { key: "Core", items: ["Plank", "Hanging knee raise", "Cable crunch"] },
    { key: "Cardio", items: ["Treadmill", "Bike", "Rowing machine", "Stair climber"] },
  ];

  function ex(name, group) {
    return {
      id: uid(),
      name,
      group,
      weight: null,
      sets: 3,
      reps: 8,
      notes: "",
    };
  }

  const DEFAULT_TEMPLATES = [
    {
      id: uid(),
      name: "Full Body A",
      exercises: [ex("Squat", "Legs"), ex("Bench press", "Chest"), ex("Seated row", "Back"), ex("Overhead press", "Shoulders")],
    },
    {
      id: uid(),
      name: "Full Body B",
      exercises: [ex("Deadlift", "Back"), ex("Incline bench", "Chest"), ex("Lat pulldown", "Back"), ex("Dumbbell curls", "Biceps")],
    },
  ];

  /********************
   * Data model
   ********************/
  function defaultData() {
    return {
      version: 2,
      settings: {
        calTarget: 2200,
        proteinTarget: 190,
        themeColor: "#0B1220",
        unitSystem: "lb",
        prs: {}, // PR tracking by exercise name
      },
      foodLibrary: DEFAULT_FOOD_LIBRARY,
      favorites: [],
      templates: DEFAULT_TEMPLATES,
      days: {},
      weighIns: [],
      workoutHistory: [],
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultData();
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object") return defaultData();
      const base = defaultData();
      d.settings = { ...base.settings, ...(d.settings || {}) };
      d.foodLibrary = Array.isArray(d.foodLibrary) ? d.foodLibrary : base.foodLibrary;
      d.favorites = Array.isArray(d.favorites) ? d.favorites : [];
      d.templates = Array.isArray(d.templates) ? d.templates : base.templates;
      d.days = d.days && typeof d.days === "object" ? d.days : {};
      d.weighIns = Array.isArray(d.weighIns) ? d.weighIns : [];
      d.workoutHistory = Array.isArray(d.workoutHistory) ? d.workoutHistory : [];
      if (!d.settings.prs) d.settings.prs = {};
      return d;
    } catch {
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(LS_KEY, JSON.stringify(DB));
  }

  function loadUI() {
    try {
      const raw = localStorage.getItem(LS_UI);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function saveUI() {
    localStorage.setItem(LS_UI, JSON.stringify(UI));
  }

  function getDay(dateKey) {
    if (!DB.days[dateKey]) {
      DB.days[dateKey] = {
        food: { logged: [], planned: [] },
        workout: { planned: null, completed: null },
        closed: false,
      };
    }
    return DB.days[dateKey];
  }

  /********************
   * App state
   ********************/
  const DB = loadData();
  const UI = loadUI();

  const state = {
    screen: UI.screen || "today",
    dateKey: UI.dateKey || toKey(new Date()),
    calMonth: UI.calMonth ? fromKey(UI.calMonth) : new Date(),
    rest: { running: false, remaining: 0, t: null },
  };

  /********************
   * Theme (Safari-safe)
   ********************/
  function setThemeColor(hex) {
    DB.settings.themeColor = hex;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
    document.documentElement.style.setProperty("--theme", hex);
    saveData();
  }

  /********************
   * Toast
   ********************/
  let toastTimer = null;
  function toast(msg = "Updated ✓") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1400);
  }

  /********************
   * Escape helpers
   ********************/
  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) {
    return escapeHTML(s).replaceAll("\n", " ");
  }

  /********************
   * Screen navigation
   ********************/
  function setScreen(screen) {
    state.screen = screen;
    UI.screen = screen;
    saveUI();

    $$(".screen").forEach((s) => s.classList.remove("active"));
    const target = $(`.screen[data-screen="${screen}"]`);
    if (target) target.classList.add("active");

    $$(".navBtn,[data-nav]").forEach((b) => {
      const k = b.dataset.nav;
      if (!k) return;
      b.classList.toggle("active", k === screen);
    });

    renderAll();
  }

  function setDate(dateKey) {
    state.dateKey = dateKey;
    UI.dateKey = dateKey;
    saveUI();
    renderAll();
  }

  function setCalMonth(d) {
    state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    UI.calMonth = toKey(state.calMonth);
    saveUI();
    renderCalendar();
  }

  function updateDateLabel() {
    const label = $("#uiDateLabel");
    if (!label) return;
    const todayKey = toKey(new Date());
    if (state.dateKey === todayKey) label.textContent = "Today";
    else {
      const d = fromKey(state.dateKey);
      label.textContent = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }
  }

  /********************
   * Momentum + rings
   ********************/
  function computeMomentum(dateKey) {
    const day = getDay(dateKey);
    const hasFood = day.food.logged.length > 0;
    const hasWorkout = !!day.workout.completed;
    const closed = !!day.closed;

    const score =
      (hasFood ? MOMENTUM.foodLogged : 0) +
      (hasWorkout ? MOMENTUM.workoutDone : 0) +
      (closed ? MOMENTUM.closedDay : 0);

    return Math.round(score * 100);
  }

  function ringOnlySVG(progress01, color = "rgba(125,255,138,0.85)") {
    const p = Math.max(0, Math.min(1, Number(progress01 || 0)));
    const r = 52;
    const c = 2 * Math.PI * r;
    const dash = p * c;

    return `
      <div class="ringSvgWrap" aria-hidden="true">
        <svg viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="12"></circle>
          <circle cx="70" cy="70" r="${r}" fill="none"
            stroke="${color}" stroke-linecap="round" stroke-width="12"
            stroke-dasharray="${dash} ${c - dash}"
            transform="rotate(-90 70 70)"></circle>
        </svg>
      </div>
    `;
  }

  /********************
   * Food math
   ********************/
  function sumMacros(entries) {
    return entries.reduce(
      (acc, e) => {
        acc.cals += e.cals;
        acc.p += e.p;
        acc.c += e.c;
        acc.f += e.f;
        return acc;
      },
      { cals: 0, p: 0, c: 0, f: 0 }
    );
  }

  const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n)) : "0");

  function normalizeFoodItem(raw) {
    return {
      id: raw.id || uid(),
      name: String(raw.name || "Food").trim(),
      cals: Number(raw.cals || 0),
      p: Number(raw.p || 0),
      c: Number(raw.c || 0),
      f: Number(raw.f || 0),
      unit: String(raw.unit || "serving"),
      amount: Number(raw.amount || 1),
    };
  }

  function isFav(foodId) {
    return DB.favorites.includes(foodId);
  }

  function toggleFav(foodId) {
    const idx = DB.favorites.indexOf(foodId);
    if (idx >= 0) DB.favorites.splice(idx, 1);
    else {
      if (DB.favorites.length >= MAX_FAVS) return toast(`Favorites max = ${MAX_FAVS}`);
      DB.favorites.unshift(foodId);
    }
    saveData();
    renderFoodLibrary($("#foodSearch")?.value || "");
  }

  function addFoodToDay(dateKey, bucket, foodItem, qty, unitLabel, grams = null) {
    const q = Math.max(0.01, Number(qty || 1));
    const base = normalizeFoodItem(foodItem);

    const entry = {
      id: uid(),
      libId: base.id,
      name: base.name,
      qty: q,
      unit: unitLabel || base.unit || "serving",
      grams: grams != null && grams !== "" ? Number(grams) : null,
      cals: Math.round(base.cals * q),
      p: Math.round(base.p * q),
      c: Math.round(base.c * q),
      f: Math.round(base.f * q),
      createdAt: Date.now(),
    };

    const day = getDay(dateKey);
    day.food[bucket].push(entry);
    saveData();
    toast(bucket === "logged" ? "Food logged ✓" : "Planned ✓");
  }

  function deleteFoodEntry(dateKey, bucket, entryId) {
    const day = getDay(dateKey);
    day.food[bucket] = day.food[bucket].filter((e) => e.id !== entryId);
    saveData();
    toast("Deleted");
  }

  /********************
   * Workouts + PR
   ********************/
  function ensureWorkoutPlan(dateKey) {
    const day = getDay(dateKey);
    if (!day.workout.planned) {
      day.workout.planned = {
        id: uid(),
        templateId: null,
        name: "Workout",
        exercises: [],
        createdAt: Date.now(),
      };
    }
    return day.workout.planned;
  }

  function getPR(exerciseName) {
    const key = String(exerciseName || "").trim().toLowerCase();
    return (DB.settings.prs && DB.settings.prs[key]) || { bestWeight: null, bestReps: null };
  }

  function updatePR(exerciseName, weight, reps) {
    if (!exerciseName) return;
    const key = exerciseName.trim().toLowerCase();
    const w = Number(weight);
    const r = Number(reps);

    if (!DB.settings.prs) DB.settings.prs = {};
    const cur = DB.settings.prs[key] || { bestWeight: null, bestReps: null };

    if (Number.isFinite(w)) {
      if (cur.bestWeight == null || w > cur.bestWeight) cur.bestWeight = w;
    }
    if (Number.isFinite(r)) {
      if (cur.bestReps == null || r > cur.bestReps) cur.bestReps = r;
    }

    DB.settings.prs[key] = cur;
  }

  function markWorkoutComplete(dateKey) {
    const day = getDay(dateKey);
    if (!day.workout.planned || day.workout.planned.exercises.length === 0) {
      toast("Add exercises first");
      return;
    }

    const completed = {
      id: uid(),
      dateKey,
      templateName: day.workout.planned.name || "Workout",
      exercises: day.workout.planned.exercises.map((e) => ({ ...e })),
      durationSec: null,
      completedAt: Date.now(),
    };

    day.workout.completed = completed;
    DB.workoutHistory.unshift(completed);

    completed.exercises.forEach((e) => updatePR(e.name, e.weight, e.reps));

    saveData();
    toast("Workout complete ✓");
  }

  function undoWorkoutComplete(dateKey) {
    const day = getDay(dateKey);
    if (!day.workout.completed) return;
    const id = day.workout.completed.id;

    DB.workoutHistory = DB.workoutHistory.filter((w) => w.id !== id);
    day.workout.completed = null;

    saveData();
    toast("Workout un-completed");
  }

  function deleteWorkoutFromHistory(workoutId) {
    DB.workoutHistory = DB.workoutHistory.filter((w) => w.id !== workoutId);
    Object.keys(DB.days).forEach((k) => {
      if (DB.days[k]?.workout?.completed?.id === workoutId) DB.days[k].workout.completed = null;
    });
    saveData();
    toast("Deleted workout");
    renderWorkouts();
  }

  /********************
   * Rest timer
   ********************/
  function startRestTimer(seconds) {
    const secs = Math.max(0, Number(seconds || 0));
    if (!secs) return;

    state.rest.running = true;
    state.rest.remaining = secs;

    clearInterval(state.rest.t);
    state.rest.t = setInterval(() => {
      state.rest.remaining -= 1;
      renderRestTimerInline();
      if (state.rest.remaining <= 0) {
        clearInterval(state.rest.t);
        state.rest.running = false;
        state.rest.remaining = 0;
        renderRestTimerInline();
        toast("Rest done ✓");
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
    }, 1000);

    renderRestTimerInline();
  }

  function stopRestTimer() {
    clearInterval(state.rest.t);
    state.rest.running = false;
    state.rest.remaining = 0;
    renderRestTimerInline();
  }

  function renderRestTimerInline() {
    const el = $("#restTimerInline");
    if (!el) return;

    if (!state.rest.running) {
      el.innerHTML = `<span class="subtle">Rest timer</span> <button class="btn ghost" id="btnStartRest">Start</button>`;
      return;
    }
    const mm = Math.floor(state.rest.remaining / 60);
    const ss = state.rest.remaining % 60;
    el.innerHTML = `
      <span class="subtle">Rest:</span>
      <strong>${mm}:${pad2(ss)}</strong>
      <button class="btn ghost" id="btnStopRest">Stop</button>
    `;
  }

  /********************
   * Close / unclose day
   ********************/
  function canCloseDay(day) {
    return day.food.logged.length > 0 || !!day.workout.completed;
  }

  function closeDay(dateKey) {
    const day = getDay(dateKey);
    if (!canCloseDay(day)) return toast("Log food or a workout");
    day.closed = true;
    saveData();
    toast("Day closed ✓");
  }

  function uncloseDay(dateKey) {
    const day = getDay(dateKey);
    day.closed = false;
    saveData();
    toast("Day reopened");
  }

  /********************
   * Modal
   ********************/
  function openModal(title, bodyHTML, footHTML = "") {
    const overlay = $("#modalOverlay");
    const titleEl = $("#modalTitle");
    const bodyEl = $("#modalBody");
    const footEl = $("#modalFoot");
    if (!overlay || !titleEl || !bodyEl || !footEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    footEl.innerHTML = footHTML;

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    bodyEl.scrollTop = 0;
  }

  function closeModal() {
    const overlay = $("#modalOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    $("#modalBody").innerHTML = "";
    $("#modalFoot").innerHTML = "";
  }

  /********************
   * Calendar helpers
   ********************/
  function buildCalendarGrid(monthDate) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startDay = first.getDay(); // 0=Sun
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
    return cells;
  }

  function daySignals(dateKey) {
    const day = getDay(dateKey);
    return {
      closed: !!day.closed,
      food: day.food.logged.length > 0,
      workout: !!day.workout.completed,
      planned: day.food.planned.length > 0 || !!day.workout.planned,
    };
  }

  /********************
   * Renders: Today
   ********************/
  function renderToday() {
    updateDateLabel();

    const day = getDay(state.dateKey);
    const totals = sumMacros(day.food.logged);

    const calTarget = Number(DB.settings.calTarget || 0);
    const proteinTarget = Number(DB.settings.proteinTarget || 0);

    const status = day.closed ? "Closed" : "In Progress";
    if ($("#uiStatusLine")) $("#uiStatusLine").textContent = `Status: ${status}`;
    if ($("#uiStatusPill")) $("#uiStatusPill").textContent = status;

    // numbers
    if ($("#uiCals")) $("#uiCals").textContent = `${fmt(totals.cals)} / ${fmt(calTarget)}`;
    if ($("#uiProtein")) $("#uiProtein").textContent = `${fmt(totals.p)} / ${fmt(proteinTarget)}g`;
    if ($("#uiCarbs")) $("#uiCarbs").textContent = `${fmt(totals.c)}g`;
    if ($("#uiFat")) $("#uiFat").textContent = `${fmt(totals.f)}g`;

    if ($("#uiCalsHint")) $("#uiCalsHint").textContent = `${Math.max(0, calTarget - totals.cals)} remaining`;
    if ($("#uiProteinHint")) $("#uiProteinHint").textContent = `${Math.max(0, proteinTarget - totals.p)}g remaining`;

    // mini row
    if ($("#uiFoodSub")) $("#uiFoodSub").textContent = day.food.logged.length ? `${day.food.logged.length} item(s)` : "Not logged";
    if ($("#uiWorkoutSub")) $("#uiWorkoutSub").textContent = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "Not logged");
    if ($("#uiFoodMark")) $("#uiFoodMark").textContent = day.food.logged.length ? "✓" : "—";
    if ($("#uiWorkoutMark")) $("#uiWorkoutMark").textContent = day.workout.completed ? "✓" : "—";

    // close day button
    const closeBtn = $("#btnCloseDay");
    const canClose = canCloseDay(day);
    if (closeBtn) closeBtn.disabled = !canClose || day.closed;
    if ($("#uiCloseHint")) {
      $("#uiCloseHint").textContent = day.closed
        ? "Day is closed. Reopen it from Quick Log."
        : (canClose ? "Ready to close when you are." : "Log food or a workout to enable Close Today.");
    }

    // Momentum host: only a ring (no % text in center)
    const momentum = computeMomentum(state.dateKey) / 100;
    const host = $("#momentumHost");
    if (host) {
      host.innerHTML = `
        <div class="ringRow">
          <div class="ringCard">
            ${ringOnlySVG(Math.min(1, calTarget ? totals.cals / calTarget : 0), "rgba(125,255,138,0.85)")}
            <div class="ringLabel">Calories</div>
            <div class="ringSub">${fmt(totals.cals)} / ${fmt(calTarget)}</div>
          </div>
          <div class="ringCard">
            ${ringOnlySVG(Math.min(1, proteinTarget ? totals.p / proteinTarget : 0), "rgba(0,200,255,0.60)")}
            <div class="ringLabel">Protein</div>
            <div class="ringSub">${fmt(totals.p)} / ${fmt(proteinTarget)}g</div>
          </div>
        </div>

        <div style="height:12px"></div>

        <div class="ringCard" style="min-height:150px;">
          ${ringOnlySVG(momentum, "rgba(255,255,255,0.75)")}
          <div class="ringLabel">Momentum</div>
          <div class="ringSub">Food • Workout • Close day</div>
        </div>
      `;
    }

    renderWeekSnapshot();
  }

  function renderWeekSnapshot() {
    const { start, end } = weekRangeFor(state.dateKey, true);
    const keys = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(toKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    let closed = 0;
    let workouts = 0;
    let totalCals = 0;
    let totalProtein = 0;
    let daysWithFood = 0;

    keys.forEach((k) => {
      const day = getDay(k);
      if (day.closed) closed++;
      if (day.workout.completed) workouts++;
      const tot = sumMacros(day.food.logged);
      if (day.food.logged.length) {
        daysWithFood++;
        totalCals += tot.cals;
        totalProtein += tot.p;
      }
    });

    if ($("#uiClosedDays")) $("#uiClosedDays").textContent = `${closed}/7`;
    if ($("#uiWorkoutsWeek")) $("#uiWorkoutsWeek").textContent = String(workouts);
    if ($("#uiAvgCals")) $("#uiAvgCals").textContent = daysWithFood ? String(Math.round(totalCals / daysWithFood)) : "—";
    if ($("#uiAvgProtein")) $("#uiAvgProtein").textContent = daysWithFood ? String(Math.round(totalProtein / daysWithFood)) : "—";
    if ($("#uiStreak")) $("#uiStreak").textContent = String(calcStreak());
  }

  function calcStreak() {
    let k = state.dateKey;
    let streak = 0;
    while (true) {
      const day = getDay(k);
      if (!day.closed) break;
      streak++;
      k = addDays(k, -1);
      if (streak > 3650) break;
    }
    return streak;
  }

  /********************
   * Render: Food
   ********************/
  function foodBucketCard(title, bucket, items) {
    const rows = items.map((e) => {
      const grams = e.grams != null ? ` • ${e.grams}g` : "";
      return `
        <div class="listItem">
          <div style="min-width:0;">
            <div class="listTitle">${escapeHTML(e.name)} (${escapeHTML(String(e.qty))} ${escapeHTML(e.unit)}${grams})</div>
            <div class="subtle">${e.cals} cals • P ${e.p} • C ${e.c} • F ${e.f}</div>
          </div>
          <button class="btn ghost" data-action="delFood" data-bucket="${bucket}" data-id="${e.id}">Delete</button>
        </div>
      `;
    }).join("");

    return `
      <div class="card">
        <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div>
            <div class="h2">${title}</div>
            <div class="sub">${items.length ? `${items.length} item(s)` : "None"}</div>
          </div>
          <button class="btn primary" data-action="addFood" data-bucket="${bucket}">Add</button>
        </div>
        <div class="divider"></div>
        <div class="list">${rows || `<div class="subtle">None</div>`}</div>
      </div>
    `;
  }

  function renderFood() {
    const day = getDay(state.dateKey);

    // totals
    const tot = sumMacros(day.food.logged);
    if ($("#uiFoodTotCals")) $("#uiFoodTotCals").textContent = fmt(tot.cals);
    if ($("#uiFoodTotP")) $("#uiFoodTotP").textContent = fmt(tot.p);
    if ($("#uiFoodTotC")) $("#uiFoodTotC").textContent = fmt(tot.c);
    if ($("#uiFoodTotF")) $("#uiFoodTotF").textContent = fmt(tot.f);

    const host = $("#mealList");
    if (!host) return;

    host.innerHTML = `
      ${foodBucketCard("Logged", "logged", day.food.logged)}
      ${foodBucketCard("Planned", "planned", day.food.planned)}
    `;
  }

  function renderFoodLibrary(search = "") {
    const q = String(search || "").trim().toLowerCase();

    const sorted = [...DB.foodLibrary].sort((a, b) => {
      const af = isFav(a.id) ? 0 : 1;
      const bf = isFav(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });

    const filtered = q ? sorted.filter((x) => x.name.toLowerCase().includes(q)) : sorted;

    const rows = filtered.map((item) => {
      const fav = isFav(item.id);
      return `
        <div class="listItem">
          <div style="min-width:0;">
            <div class="listTitle">${escapeHTML(item.name)}</div>
            <div class="subtle">${item.cals} cals • P ${item.p} • C ${item.c} • F ${item.f} • default: ${item.amount} ${escapeHTML(item.unit)}</div>
          </div>
          <div class="row" style="display:flex; gap:10px; align-items:center;">
            <button class="btn ghost" data-action="favFood" data-id="${item.id}">${fav ? "★" : "☆"}</button>
            <button class="btn primary" data-action="pickFood" data-id="${item.id}">Use</button>
          </div>
        </div>
      `;
    }).join("");

    openModal(
      "Food Library",
      `
        <label class="field" style="display:block; margin-bottom:10px;">
          <span class="subtle">Search</span>
          <input id="foodSearch" type="text" placeholder="Greek yogurt, banana, rice..." value="${escapeAttr(search)}"
                 style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
        </label>

        <div class="subtle" style="margin-bottom:10px;">
          Favorites: ${DB.favorites.length}/${MAX_FAVS} (★ pins to top)
        </div>

        <div class="list">${rows || `<div class="subtle">No matches.</div>`}</div>

        <div class="divider"></div>

        <div class="h2" style="margin-bottom:6px;">Add new food</div>
        <div class="formGrid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <label class="field">
            <span class="subtle">Name</span>
            <input id="newFoodName" type="text" placeholder="Chicken breast"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Calories</span>
            <input id="newFoodCals" type="number" inputmode="numeric"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Protein</span>
            <input id="newFoodP" type="number" inputmode="numeric"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Carbs</span>
            <input id="newFoodC" type="number" inputmode="numeric"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Fat</span>
            <input id="newFoodF" type="number" inputmode="numeric"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Default unit</span>
            <input id="newFoodUnit" type="text" placeholder="cup / oz / serving"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Default amount</span>
            <input id="newFoodAmt" type="number" inputmode="decimal" value="1"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
        </div>
      `,
      `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <button class="btn ghost" id="btnCloseLib">Close</button>
          <button class="btn primary" id="btnSaveNewFood">Save Food</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#foodSearch"), "input", (e) => renderFoodLibrary(e.target.value));
      on($("#btnCloseLib"), "click", closeModal);
      on($("#btnSaveNewFood"), "click", () => {
        const name = $("#newFoodName").value.trim();
        if (!name) return toast("Name required");
        const item = normalizeFoodItem({
          id: uid(),
          name,
          cals: Number($("#newFoodCals").value || 0),
          p: Number($("#newFoodP").value || 0),
          c: Number($("#newFoodC").value || 0),
          f: Number($("#newFoodF").value || 0),
          unit: $("#newFoodUnit").value.trim() || "serving",
          amount: Number($("#newFoodAmt").value || 1),
        });
        DB.foodLibrary.push(item);
        saveData();
        toast("Saved ✓");
        renderFoodLibrary($("#foodSearch").value || "");
      });
    }, 0);
  }

  function openAddFoodFlow(bucket, preselectedFood = null) {
    const food = preselectedFood || DB.foodLibrary[0] || normalizeFoodItem({ name: "Food", unit: "serving", amount: 1 });

    openModal(
      `Add Food (${bucket === "logged" ? "Logged" : "Planned"})`,
      `
        <div class="subtle" style="margin-bottom:10px;">Serving size + quantity. Optional grams supported.</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <button class="btn ghost" id="btnOpenLibraryInline">Open Library</button>
          <button class="btn ghost" id="btnQuickGY">Quick: Greek yogurt</button>
        </div>

        <div class="card" style="margin:0;">
          <div class="h2" style="margin-bottom:6px;">${escapeHTML(food.name)}</div>
          <div class="subtle">${food.cals} cals • P ${food.p} • C ${food.c} • F ${food.f}</div>
          <div class="divider"></div>

          <div class="formGrid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <label class="field">
              <span class="subtle">Quantity</span>
              <input id="foodQty" type="number" inputmode="decimal" value="1" step="0.25"
                style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
            </label>
            <label class="field">
              <span class="subtle">Serving unit</span>
              <input id="foodUnit" type="text" value="${escapeAttr(food.unit || "serving")}"
                style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
            </label>
            <label class="field" style="grid-column: 1 / -1;">
              <span class="subtle">Optional grams</span>
              <input id="foodGrams" type="number" inputmode="numeric" placeholder="e.g., 170"
                style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
            </label>
          </div>
        </div>
      `,
      `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <button class="btn ghost" id="btnCancelAddFood">Cancel</button>
          <button class="btn primary" id="btnConfirmAddFood">Add</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#btnCancelAddFood"), "click", closeModal);

      on($("#btnOpenLibraryInline"), "click", () => renderFoodLibrary(""));
      on($("#btnQuickGY"), "click", () => {
        const gy = DB.foodLibrary.find((x) => x.name.toLowerCase().includes("greek")) || food;
        openAddFoodFlow(bucket, gy);
      });

      on($("#btnConfirmAddFood"), "click", () => {
        const qty = $("#foodQty").value;
        const unit = $("#foodUnit").value.trim() || "serving";
        const grams = $("#foodGrams").value;
        addFoodToDay(state.dateKey, bucket, food, qty, unit, grams);
        closeModal();
        renderAll();
      });
    }, 0);
  }

  /********************
   * Render: Workouts
   ********************/
  function renderExerciseRow(e) {
    const pr = getPR(e.name);
    const unit = DB.settings.unitSystem || "lb";

    return `
      <div class="card" style="margin:12px 0 0;">
        <div class="cardHead" style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div style="min-width:0;">
            <div class="h2" style="margin-bottom:2px;">${escapeHTML(e.name)}</div>
            <div class="sub">${escapeHTML(e.group || "—")} • PR: ${pr.bestWeight ?? "—"}${pr.bestWeight != null ? unit : ""} / ${pr.bestReps ?? "—"} reps</div>
          </div>
          <button class="btn ghost" data-action="delExercise" data-id="${e.id}">Delete</button>
        </div>

        <div class="formGrid" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
          <label class="field">
            <span class="subtle">Weight (${unit})</span>
            <input data-field="weight" data-id="${e.id}" type="number" inputmode="decimal" value="${e.weight ?? ""}" placeholder="135"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Sets</span>
            <input data-field="sets" data-id="${e.id}" type="number" inputmode="numeric" value="${e.sets ?? 3}"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
          <label class="field">
            <span class="subtle">Reps</span>
            <input data-field="reps" data-id="${e.id}" type="number" inputmode="numeric" value="${e.reps ?? 8}"
              style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
          </label>
        </div>

        <label class="field" style="display:block; margin-top:10px;">
          <span class="subtle">Notes</span>
          <input data-field="notes" data-id="${e.id}" type="text" value="${escapeAttr(e.notes || "")}" placeholder="Optional"
            style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
        </label>

        <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
          <button class="btn ghost" data-action="startRest" data-sec="60">Rest 60s</button>
          <button class="btn ghost" data-action="startRest" data-sec="90">Rest 90s</button>
          <button class="btn ghost" data-action="startRest" data-sec="120">Rest 120s</button>
        </div>
      </div>
    `;
  }

  function renderWorkoutHistory() {
    const rows = DB.workoutHistory.slice(0, 20).map((w) => {
      const d = fromKey(w.dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `
        <div class="listItem">
          <div>
            <div class="listTitle">${escapeHTML(w.templateName || "Workout")} • ${d}</div>
            <div class="subtle">${w.exercises.length} exercise(s)</div>
          </div>
          <button class="btn ghost" data-action="delHistoryWorkout" data-id="${w.id}">Delete</button>
        </div>
      `;
    }).join("");

    return rows || `<div class="subtle">No history yet.</div>`;
  }

  function renderWorkouts() {
    const day = getDay(state.dateKey);

    const status = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "No workout planned");
    if ($("#uiWorkoutStatus")) $("#uiWorkoutStatus").textContent = status;

    const editor = $("#workoutEditor");
    const exHost = $("#exerciseEditor");
    const histHost = $("#workoutHistory");

    if (!editor || !exHost || !histHost) return;

    // Rest timer host always exists when planned
    if (!day.workout.planned) {
      editor.classList.add("hidden");
      exHost.innerHTML = "";
      histHost.innerHTML = renderWorkoutHistory();
      return;
    }

    editor.classList.remove("hidden");

    let restHost = $("#restTimerInline");
    if (!restHost) {
      restHost = document.createElement("div");
      restHost.id = "restTimerInline";
      restHost.style.margin = "10px 0 0";
      editor.insertAdjacentElement("afterbegin", restHost);
    }
    renderRestTimerInline();

    exHost.innerHTML = day.workout.planned.exercises.length
      ? day.workout.planned.exercises.map(renderExerciseRow).join("")
      : `<div class="subtle">No exercises yet. Tap “Add exercise”.</div>`;

    histHost.innerHTML = renderWorkoutHistory();
  }

  function openTemplatesModal() {
    const rows = DB.templates.map((t) => `
      <div class="listItem">
        <div style="min-width:0;">
          <div class="listTitle">${escapeHTML(t.name)}</div>
          <div class="subtle">${t.exercises.length} exercise(s)</div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn primary" data-action="useTemplate" data-id="${t.id}">Use</button>
          <button class="btn ghost" data-action="delTemplate" data-id="${t.id}">Delete</button>
        </div>
      </div>
    `).join("");

    openModal(
      "Workout Templates",
      `
        <div class="subtle" style="margin-bottom:10px;">Use a template, or create your own.</div>
        <div class="list">${rows || `<div class="subtle">No templates yet.</div>`}</div>

        <div class="divider"></div>

        <div class="h2" style="margin-bottom:6px;">Create template</div>
        <label class="field" style="display:block;">
          <span class="subtle">Template name</span>
          <input id="newTplName" type="text" placeholder="Push Day / Upper A / etc"
            style="width:100%; margin-top:6px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.92);" />
        </label>
        <div class="subtle" style="margin-top:6px;">
          Saves whatever is currently planned on the selected day.
        </div>
      `,
      `
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <button class="btn ghost" id="btnCloseTpl">Close</button>
          <button class="btn primary" id="btnSaveTpl">Save Template</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#btnCloseTpl"), "click", closeModal);
      on($("#btnSaveTpl"), "click", () => {
        const name = $("#newTplName").value.trim();
        if (!name) return toast("Name required");

        const day = getDay(state.dateKey);
        if (!day.workout.planned || day.workout.planned.exercises.length === 0) return toast("Plan exercises first");

        DB.templates.unshift({
          id: uid(),
          name,
          exercises: day.workout.planned.exercises.map((e) => ({ ...e, id: uid() })),
        });

        saveData();
        toast("Template saved ✓");
        openTemplatesModal();
      });
    }, 0);
  }

  function openExercisePicker() {
    const groups = MUSCLE_GROUPS.map((g) => `
      <div class="card" style="margin:0 0 12px;">
        <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="h2">${escapeHTML(g.key)}</div>
            <div class="sub">Tap to add</div>
          </div>
        </div>
        <div class="list">
          ${g.items.map((name) => `
            <button class="rowBtn" data-action="pickExercise" data-name="${escapeAttr(name)}" data-group="${escapeAttr(g.key)}">
              <span class="rowLeft">
                <span class="rowTitle">${escapeHTML(name)}</span>
                <span class="rowSub">Add to workout</span>
              </span>
              <span class="rowRight">＋</span>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("");

    openModal("Add exercise", `<div class="subtle" style="margin-bottom:10px;">Grouped by muscle.</div>${groups}`, `
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn ghost" id="btnCloseExPicker">Close</button>
      </div>
    `);

    setTimeout(() => on($("#btnCloseExPicker"), "click", closeModal), 0);
  }

  function addExerciseToPlan(name, group) {
    const plan = ensureWorkoutPlan(state.dateKey);
    plan.exercises.push(ex(name, group));
    saveData();
    toast("Added ✓");
    renderWorkouts();
  }

  /********************
   * Render: Calendar (flat)
   ********************/
  function renderCalendar() {
    const titleEl = $("#uiCalTitle");
    if (titleEl) titleEl.textContent = monthTitle(state.calMonth);

    const gridEl = $("#calGrid");
    if (!gridEl) return;

    const cells = buildCalendarGrid(state.calMonth);
    const todayKey = toKey(new Date());

    gridEl.innerHTML = cells.map((d) => {
      if (!d) return `<div></div>`;
      const key = toKey(d);
      const sig = daySignals(key);

      const dots = `
        <div class="calDots">
          ${sig.food ? `<span class="dot dotFood"></span>` : ``}
          ${sig.workout ? `<span class="dot dotWorkout"></span>` : ``}
          ${sig.closed ? `<span class="dot dotClosed"></span>` : ``}
        </div>
      `;

      return `
        <button class="calDay ${key === state.dateKey ? "selected" : ""} ${key === todayKey ? "today" : ""}"
          data-action="selectDay" data-key="${key}">
          ${d.getDate()}
          ${dots}
        </button>
      `;
    }).join("");

    injectCalendarPreview();
  }

  function injectCalendarPreview() {
    const screen = $(`.screen[data-screen="calendar"]`);
    if (!screen) return;

    let preview = $("#calPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "calPreview";
      preview.className = "card";
      const grid = $("#calGrid");
      grid?.closest(".card")?.insertAdjacentElement("afterend", preview);
    }

    const day = getDay(state.dateKey);
    preview.innerHTML = `
      <div class="cardHead" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="h2">Selected day</div>
          <div class="sub">${fromKey(state.dateKey).toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" })}</div>
        </div>
        <button class="btn primary" id="btnOpenSelected">Open</button>
      </div>

      <div class="divider"></div>

      <div class="miniRow">
        <div class="miniItem"><span class="miniK">Food</span><span class="miniV">${day.food.logged.length ? "✓" : "—"}</span></div>
        <div class="miniItem"><span class="miniK">Workout</span><span class="miniV">${day.workout.completed ? "✓" : "—"}</span></div>
        <div class="miniItem"><span class="miniK">Closed</span><span class="miniV">${day.closed ? "✓" : "—"}</span></div>
        <div class="miniItem"><span class="miniK">Planned</span><span class="miniV">${(day.food.planned.length || day.workout.planned) ? "•" : "—"}</span></div>
      </div>
    `;

    setTimeout(() => on($("#btnOpenSelected"), "click", () => setScreen("today")), 0);
  }

  /********************
   * Render: Analytics (minimal)
   ********************/
  function renderAnalytics() {
    const { start, end } = weekRangeFor(state.dateKey, true);
    if ($("#uiAnalyticsWeek")) {
      $("#uiAnalyticsWeek").textContent = `${start.toLocaleDateString(undefined, { month:"short", day:"numeric" })} – ${end.toLocaleDateString(undefined, { month:"short", day:"numeric" })}`;
    }

    // settings inputs if present
    if ($("#setCals")) $("#setCals").value = DB.settings.calTarget;
    if ($("#setProtein")) $("#setProtein").value = DB.settings.proteinTarget;

    setThemeColor(DB.settings.themeColor || "#0B1220");
  }

  /********************
   * Render all
   ********************/
  function renderAll() {
    updateDateLabel();
    if (state.screen === "today") renderToday();
    if (state.screen === "food") renderFood();
    if (state.screen === "workouts") renderWorkouts();
    if (state.screen === "calendar") renderCalendar();
    if (state.screen === "stats" || state.screen === "analytics") renderAnalytics();
  }

  /********************
   * Events / bindings
   ********************/
  function bindEvents() {
    // bottom nav
    $$(".navBtn,[data-nav]").forEach((b) => {
      on(b, "click", () => setScreen(b.dataset.nav));
    });

    // top date nav
    on($("#btnPrevDay"), "click", () => setDate(addDays(state.dateKey, -1)));
    on($("#btnNextDay"), "click", () => setDate(addDays(state.dateKey, +1)));
    on($("#btnPickDay"), "click", () => {
      setDate(toKey(new Date()));
      toast("Back to Today");
    });

    // today shortcuts
    on($("#btnGoFood"), "click", () => setScreen("food"));
    on($("#btnGoWorkouts"), "click", () => setScreen("workouts"));

    // close day
    on($("#btnCloseDay"), "click", () => {
      closeDay(state.dateKey);
      renderAll();
    });

    // quick log modal
    on($("#btnQuickLog"), "click", () => {
      const day = getDay(state.dateKey);
      openModal(
        "Quick Log",
        `
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" id="qlAddFood">Add Logged Food</button>
            <button class="btn primary" id="qlAddPlanned">Add Planned Food</button>
            <button class="btn" id="qlPlanWorkout">Plan Workout</button>
          </div>

          <div class="divider"></div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn ghost" id="qlCloseDay" ${canCloseDay(day) && !day.closed ? "" : "disabled"}>Close Day</button>
            <button class="btn ghost" id="qlUncloseDay" ${day.closed ? "" : "disabled"}>Reopen Day</button>
            <button class="btn ghost" id="qlUndoWorkout" ${day.workout.completed ? "" : "disabled"}>Undo Workout Complete</button>
          </div>
        `,
        `
          <div style="display:flex; justify-content:flex-end;">
            <button class="btn ghost" id="qlDone">Done</button>
          </div>
        `
      );

      setTimeout(() => {
        on($("#qlDone"), "click", closeModal);
        on($("#qlAddFood"), "click", () => openAddFoodFlow("logged"));
        on($("#qlAddPlanned"), "click", () => openAddFoodFlow("planned"));
        on($("#qlPlanWorkout"), "click", () => {
          ensureWorkoutPlan(state.dateKey);
          saveData();
          closeModal();
          setScreen("workouts");
        });
        on($("#qlCloseDay"), "click", () => {
          closeDay(state.dateKey);
          closeModal();
          renderAll();
        });
        on($("#qlUncloseDay"), "click", () => {
          uncloseDay(state.dateKey);
          closeModal();
          renderAll();
        });
        on($("#qlUndoWorkout"), "click", () => {
          undoWorkoutComplete(state.dateKey);
          closeModal();
          renderAll();
        });
      }, 0);
    });

    // food screen buttons
    on($("#btnFoodLibrary"), "click", () => renderFoodLibrary(""));
    on($("#btnCopyPrevDay"), "click", () => {
      const prevKey = addDays(state.dateKey, -1);
      const prev = getDay(prevKey);
      const cur = getDay(state.dateKey);
      cur.food.logged = prev.food.logged.map((e) => ({ ...e, id: uid(), createdAt: Date.now() }));
      saveData();
      toast("Copied ✓");
      renderAll();
    });

    // workouts screen buttons
    on($("#btnTemplates"), "click", openTemplatesModal);
    on($("#btnPlanWorkout"), "click", () => {
      ensureWorkoutPlan(state.dateKey);
      saveData();
      toast("Planned ✓");
      renderWorkouts();
    });
    on($("#btnAddExercise"), "click", () => {
      ensureWorkoutPlan(state.dateKey);
      saveData();
      openExercisePicker();
    });
    on($("#btnMarkWorkoutComplete"), "click", () => {
      markWorkoutComplete(state.dateKey);
      renderAll();
    });

    // calendar nav
    on($("#btnCalPrev"), "click", () => {
      const d = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
      setCalMonth(d);
    });
    on($("#btnCalNext"), "click", () => {
      const d = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
      setCalMonth(d);
    });

    // settings (if present)
    on($("#btnSaveSettings"), "click", () => {
      if ($("#setCals")) DB.settings.calTarget = Number($("#setCals").value || 0);
      if ($("#setProtein")) DB.settings.proteinTarget = Number($("#setProtein").value || 0);
      saveData();
      toast("Saved ✓");
      renderAll();
    });

    // modal close
    on($("#modalClose"), "click", closeModal);
    on($("#modalOverlay"), "click", (e) => {
      if (e.target && e.target.id === "modalOverlay") closeModal();
    });

    // delegated clicks
    on(document.body, "click", (e) => {
      const t = e.target.closest("[data-action]");
      if (!t) return;
      const action = t.dataset.action;

      // Food actions
      if (action === "addFood") return openAddFoodFlow(t.dataset.bucket);
      if (action === "delFood") {
        deleteFoodEntry(state.dateKey, t.dataset.bucket, t.dataset.id);
        return renderAll();
      }
      if (action === "favFood") return toggleFav(t.dataset.id);
      if (action === "pickFood") {
        const item = DB.foodLibrary.find((x) => x.id === t.dataset.id);
        if (!item) return;
        return openAddFoodFlow("logged", item);
      }

      // Templates
      if (action === "useTemplate") {
        const tpl = DB.templates.find((x) => x.id === t.dataset.id);
        if (!tpl) return;
        const plan = ensureWorkoutPlan(state.dateKey);
        plan.templateId = tpl.id;
        plan.name = tpl.name;
        plan.exercises = tpl.exercises.map((e2) => ({ ...e2, id: uid() }));
        saveData();
        toast("Template applied ✓");
        closeModal();
        return setScreen("workouts");
      }
      if (action === "delTemplate") {
        DB.templates = DB.templates.filter((x) => x.id !== t.dataset.id);
        saveData();
        toast("Template deleted");
        return openTemplatesModal();
      }

      // Exercise picker
      if (action === "pickExercise") {
        addExerciseToPlan(t.dataset.name, t.dataset.group);
        return;
      }

      // Workout plan editing
      if (action === "delExercise") {
        const day = getDay(state.dateKey);
        if (!day.workout.planned) return;
        day.workout.planned.exercises = day.workout.planned.exercises.filter((x) => x.id !== t.dataset.id);
        saveData();
        toast("Deleted");
        return renderWorkouts();
      }

      if (action === "startRest") return startRestTimer(Number(t.dataset.sec));

      if (action === "delHistoryWorkout") return deleteWorkoutFromHistory(t.dataset.id);

      // Calendar day select
      if (action === "selectDay") {
        const key = t.dataset.key;
        setDate(key);
        const d = fromKey(key);
        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        return renderCalendar();
      }
    });

    // delegated inputs for workout editing
    on(document.body, "input", (e) => {
      const el = e.target;
      const id = el?.dataset?.id;
      const field = el?.dataset?.field;
      if (!id || !field) return;

      const day = getDay(state.dateKey);
      const plan = day.workout.planned;
      if (!plan) return;
      const item = plan.exercises.find((x) => x.id === id);
      if (!item) return;

      if (field === "notes") item.notes = el.value;
      else item[field] = el.value === "" ? null : Number(el.value);

      saveData();
    });

    // rest timer buttons
    on(document.body, "click", (e) => {
      if (e.target?.id === "btnStartRest") {
        const secs = Number(prompt("Rest seconds?", "90") || 0);
        startRestTimer(secs);
      }
      if (e.target?.id === "btnStopRest") stopRestTimer();
    });
  }

  /********************
   * Init
   ********************/
  function init() {
    setThemeColor(DB.settings.themeColor || "#0B1220");

    bindEvents();

    setScreen(state.screen);
    setDate(state.dateKey);

    const d = fromKey(state.dateKey);
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));

    renderAll();
  }

  init();
})();