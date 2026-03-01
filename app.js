/* Glen Track V2 - app.js (single-file vanilla JS)
   Safari-safe (no replaceAll). Offline-first localStorage.
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
  const LS_KEY = "glenTrackV2:data:v1";
  const LS_UI  = "glenTrackV2:ui:v1";
  const MAX_FAVS = 10;

  const MOMENTUM = {
    foodLogged: 0.45,
    workoutDone: 0.45,
    closedDay: 0.10,
  };

  /********************
   * Safari-safe string escape (no replaceAll)
   ********************/
  function escapeHTML(s) {
    const str = String(s == null ? "" : s);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function escapeAttr(s) {
    return escapeHTML(s).replace(/\n/g, " ");
  }

  /********************
   * uid
   ********************/
  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  /********************
   * Date helpers
   ********************/
  const pad2 = (n) => String(n).padStart(2, "0");

  function toKey(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }
  function fromKey(key) {
    const parts = String(key || "").split("-").map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    return new Date(y, (m || 1) - 1, d || 1);
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
   * Default libraries
   ********************/
  const DEFAULT_FOOD_LIBRARY = [
    { id: uid(), name: "Greek yogurt", cals: 150, p: 20, c: 8, f: 2, unit: "cup", amount: 1 },
    { id: uid(), name: "Banana", cals: 105, p: 1, c: 27, f: 0, unit: "medium", amount: 1 },
    { id: uid(), name: "Rotisserie chicken", cals: 200, p: 35, c: 0, f: 6, unit: "4 oz", amount: 1 },
    { id: uid(), name: "White rice (cooked)", cals: 205, p: 4, c: 45, f: 0, unit: "cup", amount: 1 },
    { id: uid(), name: "Salmon", cals: 280, p: 25, c: 0, f: 18, unit: "6 oz", amount: 1 },
    { id: uid(), name: "Egg bites (3)", cals: 230, p: 17, c: 11, f: 13, unit: "serving", amount: 1 },
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
      weight: null,   // one weight per exercise
      sets: 3,
      reps: 8,
      notes: "",
    };
  }

  const DEFAULT_TEMPLATES = [
    { id: uid(), name: "Full Body A", exercises: [ex("Squat","Legs"), ex("Bench press","Chest"), ex("Seated row","Back"), ex("Overhead press","Shoulders")] },
    { id: uid(), name: "Full Body B", exercises: [ex("Deadlift","Back"), ex("Incline bench","Chest"), ex("Lat pulldown","Back"), ex("Dumbbell curls","Biceps")] },
  ];

  /********************
   * Data model
   ********************/
  function defaultData() {
    return {
      version: 1,
      settings: {
        calTarget: 2200,
        proteinTarget: 190,
        themeColor: "#0B1220",
        weighInDay: 1,
        unitSystem: "lb",
        prs: {}
      },
      foodLibrary: DEFAULT_FOOD_LIBRARY,
      favorites: [],
      templates: DEFAULT_TEMPLATES,
      days: {},
      weighIns: [],
      workoutHistory: []
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultData();
      const data = JSON.parse(raw);
      const base = defaultData();

      if (!data || typeof data !== "object") return base;
      if (!data.settings) data.settings = base.settings;
      if (!data.settings.prs) data.settings.prs = {};
      if (!data.days) data.days = {};
      if (!data.foodLibrary) data.foodLibrary = base.foodLibrary;
      if (!data.templates) data.templates = base.templates;
      if (!data.favorites) data.favorites = [];
      if (!data.workoutHistory) data.workoutHistory = [];
      if (!data.weighIns) data.weighIns = [];
      return data;
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
   * State
   ********************/
  const DB = loadData();
  const UI = loadUI();

  const state = {
    screen: UI.screen || "today",
    dateKey: UI.dateKey || toKey(new Date()),
    calMonth: UI.calMonth ? fromKey(UI.calMonth) : new Date(),
    restTimer: { running: false, remaining: 0, interval: null },
  };

  /********************
   * Theme color (dynamic)
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
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg || "Updated ✓";
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1400);
  }

  /********************
   * Modal
   ********************/
  function openModal(title, bodyHTML, footHTML) {
    const overlay = $("#modalOverlay");
    if (!overlay) return;
    $("#modalTitle").textContent = title || "Modal";
    $("#modalBody").innerHTML = bodyHTML || "";
    $("#modalFoot").innerHTML = footHTML || "";
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    $("#modalBody").scrollTop = 0;
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
   * Navigation
   ********************/
  function setScreen(screen) {
    state.screen = screen;
    UI.screen = screen;
    saveUI();

    $$(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.querySelector(`.screen[data-screen="${screen}"]`);
    if (target) target.classList.add("active");

    $$(".navItem").forEach((b) => b.classList.toggle("active", b.dataset.nav === screen));
    renderAll();
  }

  function setDate(dateKey) {
    state.dateKey = dateKey;
    UI.dateKey = dateKey;
    saveUI();
    renderAll();
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
   * Momentum ring
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

  function ringSVG(percent) {
    const p = Math.max(0, Math.min(100, percent));
    const r = 56;
    const c = 2 * Math.PI * r;
    const dash = (p / 100) * c;

    return `
      <div class="momentumRing" aria-label="Progress ${p}%">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="12" />
          <circle cx="70" cy="70" r="${r}" fill="none"
            stroke="rgba(125,255,138,0.85)"
            stroke-linecap="round"
            stroke-width="12"
            stroke-dasharray="${dash} ${c - dash}"
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div class="momentumCenter">
          <div class="momentumPct">${p}%</div>
          <div class="momentumLbl">Progress</div>
        </div>
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
  function fmtMacro(n) {
    if (n == null) return "—";
    return Number.isFinite(n) ? String(Math.round(n)) : "—";
  }

  /********************
   * Food library + entries
   ********************/
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
    return DB.favorites.indexOf(foodId) >= 0;
  }

  function toggleFav(foodId) {
    const idx = DB.favorites.indexOf(foodId);
    if (idx >= 0) DB.favorites.splice(idx, 1);
    else {
      if (DB.favorites.length >= MAX_FAVS) return toast(`Favorites max = ${MAX_FAVS}`);
      DB.favorites.unshift(foodId);
    }
    saveData();
    renderFoodLibrary($("#foodSearch") ? $("#foodSearch").value : "");
  }

  function addFoodToDay(dateKey, bucket, foodItem, qty, unitLabel, grams) {
    const q = Number(qty || 1);
    const base = normalizeFoodItem(foodItem);

    const entry = {
      id: uid(),
      libId: base.id,
      name: base.name,
      qty: q,
      unit: unitLabel || base.unit || "serving",
      grams: grams !== "" && grams != null ? Number(grams) : null,
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

  function renderFoodLibrary(search) {
    const q = String(search || "").trim().toLowerCase();

    const sorted = DB.foodLibrary.slice().sort((a, b) => {
      const af = isFav(a.id) ? 0 : 1;
      const bf = isFav(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });

    const filtered = q ? sorted.filter((x) => x.name.toLowerCase().indexOf(q) >= 0) : sorted;

    const rows = filtered.map((item) => {
      const fav = isFav(item.id);
      return `
        <div class="listItem">
          <div style="min-width:0;">
            <div class="listTitle">${escapeHTML(item.name)}</div>
            <div class="subtle">${item.cals} cals • P ${item.p} • C ${item.c} • F ${item.f} • default: ${item.amount} ${escapeHTML(item.unit)}</div>
          </div>
          <div class="row" style="gap:10px; justify-content:flex-end;">
            <button class="btn ghost" data-action="favFood" data-id="${item.id}">${fav ? "★" : "☆"}</button>
            <button class="btn" data-action="pickFood" data-id="${item.id}">Use</button>
          </div>
        </div>
      `;
    }).join("");

    openModal(
      "Food Library",
      `
        <div class="field" style="margin-bottom:10px;">
          <span>Search</span>
          <input id="foodSearch" type="text" placeholder="Greek yogurt, banana, rice..." value="${escapeAttr(search || "")}" />
        </div>

        <div class="subtle" style="margin-bottom:10px;">
          Favorites: ${DB.favorites.length}/${MAX_FAVS} (★ pins to top)
        </div>

        <div class="list">${rows || `<div class="subtle">No matches.</div>`}</div>

        <div class="divider"></div>

        <div class="h2" style="margin-bottom:6px;">Add new food</div>
        <div class="formGrid">
          <label class="field"><span>Name</span><input id="newFoodName" type="text" placeholder="Chicken breast" /></label>
          <label class="field"><span>Calories</span><input id="newFoodCals" type="number" inputmode="numeric" /></label>
          <label class="field"><span>Protein</span><input id="newFoodP" type="number" inputmode="numeric" /></label>
          <label class="field"><span>Carbs</span><input id="newFoodC" type="number" inputmode="numeric" /></label>
          <label class="field"><span>Fat</span><input id="newFoodF" type="number" inputmode="numeric" /></label>
          <label class="field"><span>Default unit</span><input id="newFoodUnit" type="text" placeholder="cup / oz / serving" /></label>
          <label class="field"><span>Default amount</span><input id="newFoodAmt" type="number" inputmode="decimal" value="1" /></label>
        </div>
      `,
      `
        <div class="row" style="justify-content:space-between;">
          <button class="btn danger ghost" id="btnCloseLib">Close</button>
          <button class="btn primary" id="btnSaveNewFood">Save Food</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#foodSearch"), "input", (e) => renderFoodLibrary(e.target.value));
      on($("#btnCloseLib"), "click", closeModal);
      on($("#btnSaveNewFood"), "click", () => {
        const name = ($("#newFoodName").value || "").trim();
        if (!name) return toast("Name required");
        const item = normalizeFoodItem({
          id: uid(),
          name,
          cals: Number($("#newFoodCals").value || 0),
          p: Number($("#newFoodP").value || 0),
          c: Number($("#newFoodC").value || 0),
          f: Number($("#newFoodF").value || 0),
          unit: ($("#newFoodUnit").value || "").trim() || "serving",
          amount: Number($("#newFoodAmt").value || 1),
        });
        DB.foodLibrary.push(item);
        saveData();
        toast("Saved ✓");
        renderFoodLibrary($("#foodSearch").value || "");
      });
    }, 0);
  }

  function openAddFoodFlow(bucket, preselectedFood) {
    const list = DB.foodLibrary;
    const food = preselectedFood || list[0] || normalizeFoodItem({ name: "Food", cals: 0, p: 0, c: 0, f: 0, unit: "serving", amount: 1 });

    openModal(
      `Add Food (${bucket === "logged" ? "Logged" : "Planned"})`,
      `
        <div class="subtle" style="margin-bottom:10px;">Serving + quantity supported.</div>

        <div class="row" style="justify-content:space-between; margin-bottom:10px;">
          <button class="btn ghost" id="btnOpenLibraryInline">Open Library</button>
          <button class="btn ghost" id="btnUseQuick">Quick: Greek yogurt</button>
        </div>

        <div class="card" style="margin:0;">
          <div class="h2" style="margin-bottom:8px;">${escapeHTML(food.name)}</div>
          <div class="subtle">${food.cals} cals • P ${food.p} • C ${food.c} • F ${food.f}</div>

          <div class="divider"></div>

          <div class="formGrid">
            <label class="field">
              <span>Quantity</span>
              <input id="foodQty" type="number" inputmode="decimal" value="1" step="0.25" />
            </label>
            <label class="field">
              <span>Serving unit</span>
              <input id="foodUnit" type="text" value="${escapeAttr(food.unit || "serving")}" />
            </label>
            <label class="field">
              <span>Optional grams</span>
              <input id="foodGrams" type="number" inputmode="numeric" placeholder="e.g., 170" />
            </label>
          </div>

          <div class="subtle" style="margin-top:6px;">
            Quantity multiplies the macros. Example: 2 cups = qty 2, unit “cup”.
          </div>
        </div>
      `,
      `
        <div class="row" style="justify-content:space-between;">
          <button class="btn danger ghost" id="btnCancelAddFood">Cancel</button>
          <button class="btn primary" id="btnConfirmAddFood">Add</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#btnCancelAddFood"), "click", closeModal);
      on($("#btnOpenLibraryInline"), "click", () => renderFoodLibrary(""));
      on($("#btnUseQuick"), "click", () => {
        const gy = DB.foodLibrary.find((x) => x.name.toLowerCase().indexOf("greek yogurt") >= 0) || food;
        openAddFoodFlow(bucket, gy);
      });
      on($("#btnConfirmAddFood"), "click", () => {
        addFoodToDay(state.dateKey, bucket, food, $("#foodQty").value, ($("#foodUnit").value || "").trim(), $("#foodGrams").value);
        closeModal();
        renderAll();
      });
    }, 0);
  }

  /********************
   * Workouts
   ********************/
  function ensureWorkoutPlan(dateKey) {
    const day = getDay(dateKey);
    if (!day.workout.planned) {
      day.workout.planned = { id: uid(), templateId: null, name: "Workout", exercises: [], createdAt: Date.now() };
    }
    return day.workout.planned;
  }

  function updatePR(exerciseName, weight, reps) {
    const name = String(exerciseName || "").trim().toLowerCase();
    if (!name) return;

    const w = Number(weight);
    const r = Number(reps);

    const cur = DB.settings.prs[name] || { bestWeight: null, bestReps: null };
    if (Number.isFinite(w) && (cur.bestWeight == null || w > cur.bestWeight)) cur.bestWeight = w;
    if (Number.isFinite(r) && (cur.bestReps == null || r > cur.bestReps)) cur.bestReps = r;
    DB.settings.prs[name] = cur;
  }

  function getPR(exerciseName) {
    const name = String(exerciseName || "").trim().toLowerCase();
    return DB.settings.prs[name] || { bestWeight: null, bestReps: null };
  }

  function markWorkoutComplete(dateKey) {
    const day = getDay(dateKey);
    if (!day.workout.planned || day.workout.planned.exercises.length === 0) return toast("Add exercises first");

    const completed = {
      id: uid(),
      dateKey,
      templateName: day.workout.planned.name || "Workout",
      exercises: day.workout.planned.exercises.map((e) => Object.assign({}, e)),
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
      if (DB.days[k] && DB.days[k].workout && DB.days[k].workout.completed && DB.days[k].workout.completed.id === workoutId) {
        DB.days[k].workout.completed = null;
      }
    });
    saveData();
    toast("Deleted workout");
    renderWorkouts();
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
          <button class="btn danger ghost" data-action="delHistoryWorkout" data-id="${w.id}">Delete</button>
        </div>
      `;
    }).join("");
    return rows || `<div class="subtle">No history yet.</div>`;
  }

  function openTemplatesModal() {
    const rows = DB.templates.map((t) => `
      <div class="listItem">
        <div style="min-width:0;">
          <div class="listTitle">${escapeHTML(t.name)}</div>
          <div class="subtle">${t.exercises.length} exercise(s)</div>
        </div>
        <div class="row" style="gap:10px; justify-content:flex-end;">
          <button class="btn ghost" data-action="useTemplate" data-id="${t.id}">Use</button>
          <button class="btn danger ghost" data-action="delTemplate" data-id="${t.id}">Delete</button>
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
        <label class="field">
          <span>Template name</span>
          <input id="newTplName" type="text" placeholder="Push Day / Upper A / etc" />
        </label>
        <div class="subtle" style="margin-top:6px;">This saves whatever is currently planned on the selected day.</div>
      `,
      `
        <div class="row" style="justify-content:space-between;">
          <button class="btn danger ghost" id="btnCloseTpl">Close</button>
          <button class="btn primary" id="btnSaveTpl">Save Template</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#btnCloseTpl"), "click", closeModal);
      on($("#btnSaveTpl"), "click", () => {
        const name = ($("#newTplName").value || "").trim();
        if (!name) return toast("Name required");
        const day = getDay(state.dateKey);
        if (!day.workout.planned || day.workout.planned.exercises.length === 0) return toast("Plan exercises first");

        const tpl = {
          id: uid(),
          name,
          exercises: day.workout.planned.exercises.map((e) => Object.assign({}, e, { id: uid() })),
        };
        DB.templates.unshift(tpl);
        saveData();
        toast("Template saved ✓");
        openTemplatesModal();
      });
    }, 0);
  }

  function openExercisePicker() {
    const groups = MUSCLE_GROUPS.map((g) => `
      <div class="card" style="margin:0 0 12px;">
        <div class="cardHead">
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

    openModal("Add exercise", `<div class="subtle" style="margin-bottom:10px;">Grouped by muscle.</div>${groups}`,
      `<div class="row" style="justify-content:flex-end;"><button class="btn danger ghost" id="btnCloseExPicker">Close</button></div>`
    );
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
   * Rest timer
   ********************/
  function renderRestTimerInline() {
    const el = $("#restTimerInline");
    if (!el) return;

    if (!state.restTimer.running) {
      el.innerHTML = `<span class="subtle">Rest timer</span> <button class="btn ghost" id="btnStartRest">Start</button>`;
      return;
    }
    const mm = Math.floor(state.restTimer.remaining / 60);
    const ss = state.restTimer.remaining % 60;
    el.innerHTML = `<span class="subtle">Rest:</span> <strong>${mm}:${pad2(ss)}</strong> <button class="btn ghost" id="btnStopRest">Stop</button>`;
  }

  function startRestTimer(seconds) {
    const secs = Math.max(0, Number(seconds || 0));
    if (!secs) return;

    state.restTimer.running = true;
    state.restTimer.remaining = secs;
    clearInterval(state.restTimer.interval);

    state.restTimer.interval = setInterval(() => {
      state.restTimer.remaining -= 1;
      renderRestTimerInline();
      if (state.restTimer.remaining <= 0) {
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        state.restTimer.remaining = 0;
        renderRestTimerInline();
        toast("Rest done ✓");
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
    }, 1000);

    renderRestTimerInline();
  }

  function stopRestTimer() {
    clearInterval(state.restTimer.interval);
    state.restTimer.running = false;
    state.restTimer.remaining = 0;
    renderRestTimerInline();
  }

  /********************
   * Close day + undo
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
   * Calendar
   ********************/
  function setCalMonth(d) {
    state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    UI.calMonth = toKey(state.calMonth);
    saveUI();
    renderCalendar();
  }

  function buildCalendarGrid(monthDate) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startDay = first.getDay();
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
   * Render: Today
   ********************/
  function renderToday() {
    updateDateLabel();

    const day = getDay(state.dateKey);
    const calsTarget = Number(DB.settings.calTarget || 0);
    const proteinTarget = Number(DB.settings.proteinTarget || 0);
    const totals = sumMacros(day.food.logged);

    const status = day.closed ? "Closed" : "In Progress";
    $("#uiStatusLine").textContent = `Status: ${status}`;
    $("#uiStatusPill").textContent = status;

    const uiCals = $("#uiCals");
    const uiCalsHint = $("#uiCalsHint");
    const uiProtein = $("#uiProtein");
    const uiProteinHint = $("#uiProteinHint");

    if (uiCals) uiCals.textContent = `${fmtMacro(totals.cals)} / ${fmtMacro(calsTarget)}`;
    if (uiProtein) uiProtein.textContent = `${fmtMacro(totals.p)} / ${fmtMacro(proteinTarget)}g`;

    if (uiCalsHint) uiCalsHint.textContent = `${Math.max(0, calsTarget - totals.cals)} remaining`;
    if (uiProteinHint) uiProteinHint.textContent = `${Math.max(0, proteinTarget - totals.p)}g remaining`;

    $("#uiCarbs").textContent = `${fmtMacro(totals.c)}g`;
    $("#uiFat").textContent = `${fmtMacro(totals.f)}g`;

    $("#uiFoodSub").textContent = day.food.logged.length ? `${day.food.logged.length} item(s)` : "Not logged";
    $("#uiWorkoutSub").textContent = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "Not logged");
    $("#uiFoodMark").textContent = day.food.logged.length ? "✓" : "—";
    $("#uiWorkoutMark").textContent = day.workout.completed ? "✓" : "—";

    const weighDay = Number(DB.settings.weighInDay);
    const d = fromKey(state.dateKey);
    const isWeighDay = d.getDay() === weighDay;
    $("#uiWeighInSub").textContent = isWeighDay ? "Today" : "Weekly only";
    $("#uiWeighInMark").textContent = "—";

    const closeBtn = $("#btnCloseDay");
    const hint = $("#uiCloseHint");
    const canClose = canCloseDay(day);
    if (closeBtn) closeBtn.disabled = !canClose || day.closed;
    if (hint) {
      hint.textContent = day.closed
        ? "Day is closed. You can reopen it from Quick Log."
        : (canClose ? "Ready to close when you are." : "Log food or a workout to enable Close Today.");
    }

    // Momentum ring
    const momentum = computeMomentum(state.dateKey);
    const host = $("#momentumHost");
    if (host) host.innerHTML = ringSVG(momentum);

    renderWeekSnapshot();
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

  function renderWeekSnapshot() {
    const range = weekRangeFor(state.dateKey, true);
    const start = range.start;
    const end = range.end;

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

    $("#uiClosedDays").textContent = `${closed}/7`;
    $("#uiWorkoutsWeek").textContent = String(workouts);
    $("#uiAvgCals").textContent = daysWithFood ? String(Math.round(totalCals / daysWithFood)) : "—";
    $("#uiAvgProtein").textContent = daysWithFood ? String(Math.round(totalProtein / daysWithFood)) : "—";
    $("#uiStreak").textContent = String(calcStreak());
  }

  /********************
   * Render: Food
   ********************/
  function foodBucketCard(title, bucket, items) {
    const rows = items.map((e) => {
      const grams = e.grams != null ? ` • ${e.grams}g` : "";
      return `
        <div class="listItem">
          <div>
            <div class="listTitle">${escapeHTML(e.name)} (${escapeHTML(String(e.qty))} ${escapeHTML(e.unit)}${grams})</div>
            <div class="subtle">${e.cals} cals • P ${e.p} • C ${e.c} • F ${e.f}</div>
          </div>
          <button class="btn danger ghost" data-action="delFood" data-bucket="${bucket}" data-id="${e.id}">Delete</button>
        </div>
      `;
    }).join("");

    return `
      <div class="card">
        <div class="cardHead">
          <div>
            <div class="h2">${title}</div>
            <div class="sub">${items.length ? `${items.length} item(s)` : "None"}</div>
          </div>
          <button class="btn" data-action="addFood" data-bucket="${bucket}">Add</button>
        </div>
        <div class="list">${rows || `<div class="subtle">None</div>`}</div>
      </div>
    `;
  }

  function renderFood() {
    $("#uiFoodDateSub").textContent = state.dateKey === toKey(new Date()) ? "Meals for Today" : "Meals for selected day";

    const day = getDay(state.dateKey);
    const logged = day.food.logged;
    const planned = day.food.planned;

    const totLogged = sumMacros(logged);
    $("#uiFoodTotCals").textContent = fmtMacro(totLogged.cals);
    $("#uiFoodTotP").textContent = fmtMacro(totLogged.p);
    $("#uiFoodTotC").textContent = fmtMacro(totLogged.c);
    $("#uiFoodTotF").textContent = fmtMacro(totLogged.f);

    const host = $("#mealList");
    if (!host) return;
    host.innerHTML = foodBucketCard("Logged", "logged", logged) + foodBucketCard("Planned", "planned", planned);
  }

  /********************
   * Render: Workouts
   ********************/
  function renderExerciseRow(e) {
    const pr = getPR(e.name);
    const unit = DB.settings.unitSystem || "lb";

    return `
      <div class="card" style="margin:12px 0 0;">
        <div class="cardHead">
          <div style="min-width:0;">
            <div class="h2" style="margin-bottom:2px;">${escapeHTML(e.name)}</div>
            <div class="sub">${escapeHTML(e.group || "—")} • PR: ${pr.bestWeight == null ? "—" : pr.bestWeight + unit} / ${pr.bestReps == null ? "—" : pr.bestReps + " reps"}</div>
          </div>
          <button class="btn danger ghost" data-action="delExercise" data-id="${e.id}">Delete</button>
        </div>

        <div class="formGrid">
          <label class="field">
            <span>Weight (${unit})</span>
            <input data-field="weight" data-id="${e.id}" type="number" inputmode="decimal" value="${e.weight == null ? "" : e.weight}" placeholder="e.g., 135" />
          </label>
          <label class="field">
            <span>Sets</span>
            <input data-field="sets" data-id="${e.id}" type="number" inputmode="numeric" value="${e.sets == null ? 3 : e.sets}" />
          </label>
          <label class="field">
            <span>Reps</span>
            <input data-field="reps" data-id="${e.id}" type="number" inputmode="numeric" value="${e.reps == null ? 8 : e.reps}" />
          </label>
        </div>

        <label class="field" style="margin-top:10px;">
          <span>Notes</span>
          <input data-field="notes" data-id="${e.id}" type="text" value="${escapeAttr(e.notes || "")}" placeholder="Optional" />
        </label>

        <div class="row" style="margin-top:10px; justify-content:space-between;">
          <button class="btn ghost" data-action="startRest" data-sec="60">Rest 60s</button>
          <button class="btn ghost" data-action="startRest" data-sec="90">Rest 90s</button>
          <button class="btn ghost" data-action="startRest" data-sec="120">Rest 120s</button>
        </div>
      </div>
    `;
  }

  function renderWorkouts() {
    $("#uiWorkoutDateSub").textContent = state.dateKey === toKey(new Date()) ? "Plan or log for Today" : "Plan or log for selected day";

    const day = getDay(state.dateKey);
    const status = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "No workout planned");
    $("#uiWorkoutStatus").textContent = status;

    const editor = $("#workoutEditor");
    if (!editor) return;

    if (!day.workout.planned) {
      editor.classList.add("hidden");
      $("#exerciseEditor").innerHTML = "";
      $("#workoutHistory").innerHTML = renderWorkoutHistory();
      return;
    }

    editor.classList.remove("hidden");
    renderRestTimerInline();

    $("#exerciseEditor").innerHTML = day.workout.planned.exercises.length
      ? day.workout.planned.exercises.map(renderExerciseRow).join("")
      : `<div class="subtle">No exercises yet. Tap “Add exercise”.</div>`;

    $("#workoutHistory").innerHTML = renderWorkoutHistory();
  }

  /********************
   * Render: Calendar
   ********************/
  function injectCalendarPreview() {
    const preview = $("#calPreview");
    if (!preview) return;

    const day = getDay(state.dateKey);
    preview.className = "card";
    preview.innerHTML = `
      <div class="cardHead">
        <div>
          <div class="h2">Selected day</div>
          <div class="sub">${fromKey(state.dateKey).toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" })}</div>
        </div>
        <button class="btn" id="btnOpenSelected">Open</button>
      </div>

      <div class="miniRow">
        <div class="miniItem"><span class="miniK">Food</span><span class="miniV">${day.food.logged.length ? "✓" : "—"}</span></div>
        <div class="miniItem"><span class="miniK">Workout</span><span class="miniV">${day.workout.completed ? "✓" : "—"}</span></div>
        <div class="miniItem"><span class="miniK">Closed</span><span class="miniV">${day.closed ? "✓" : "—"}</span></div>
      </div>
    `;

    setTimeout(() => on($("#btnOpenSelected"), "click", () => setScreen("today")), 0);
  }

  function renderCalendar() {
    const titleEl = $("#uiCalTitle");
    if (titleEl) titleEl.textContent = monthTitle(state.calMonth);

    const gridEl = $("#calGrid");
    if (!gridEl) return;

    const cells = buildCalendarGrid(state.calMonth);
    const todayKey = toKey(new Date());

    gridEl.innerHTML = cells.map((d) => {
      if (!d) return `<div class="calCell empty"></div>`;
      const key = toKey(d);
      const sig = daySignals(key);

      const dots = `
        <div class="calDots">
          ${sig.closed ? `<span class="dot dotClosed"></span>` : ``}
          ${sig.food ? `<span class="dot dotFood"></span>` : ``}
          ${sig.workout ? `<span class="dot dotWo"></span>` : ``}
          ${!sig.closed && !sig.food && !sig.workout && sig.planned ? `<span class="dot dotPlanned"></span>` : ``}
        </div>
      `;

      return `
        <button class="calCell ${key === state.dateKey ? "selected" : ""} ${key === todayKey ? "today" : ""}"
          data-action="selectDay" data-key="${key}">
          <div class="calNum">${d.getDate()}</div>
          ${dots}
        </button>
      `;
    }).join("");

    injectCalendarPreview();
  }

  /********************
   * Render: Analytics
   ********************/
  function renderAnalytics() {
    const range = weekRangeFor(state.dateKey, true);
    $("#uiAnalyticsWeek").textContent =
      `${range.start.toLocaleDateString(undefined, { month:"short", day:"numeric" })} – ${range.end.toLocaleDateString(undefined, { month:"short", day:"numeric" })}`;

    const keys = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      keys.push(toKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    let closed = 0, workouts = 0, totalCals = 0, totalProtein = 0, daysWithFood = 0;

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

    $("#anClosed").textContent = String(closed);
    $("#anWorkouts").textContent = String(workouts);
    $("#anAvgCals").textContent = daysWithFood ? String(Math.round(totalCals / daysWithFood)) : "—";
    $("#anAvgProtein").textContent = daysWithFood ? String(Math.round(totalProtein / daysWithFood)) : "—";

    const list = $("#weighInList");
    if (list) {
      const rows = DB.weighIns
        .slice()
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        .map((w) => `
          <div class="listItem">
            <div>
              <div class="listTitle">${fromKey(w.dateKey).toLocaleDateString(undefined, { month:"short", day:"numeric" })}</div>
              <div class="subtle">${w.weight} ${DB.settings.unitSystem}</div>
            </div>
            <button class="btn danger ghost" data-action="delWeighIn" data-id="${w.id}">Delete</button>
          </div>
        `).join("");
      list.innerHTML = rows || `<div class="subtle">No weigh-ins yet.</div>`;
    }

    $("#setCals").value = DB.settings.calTarget;
    $("#setProtein").value = DB.settings.proteinTarget;
    $("#setWeighDay").value = String(DB.settings.weighInDay || 1);
    $("#setTheme").value = (DB.settings.themeColor || "#0B1220").toLowerCase();

    setThemeColor(DB.settings.themeColor || "#0B1220");
  }

  /********************
   * Render: all
   ********************/
  function renderAll() {
    updateDateLabel();
    if (state.screen === "today") renderToday();
    if (state.screen === "food") renderFood();
    if (state.screen === "workouts") renderWorkouts();
    if (state.screen === "calendar") renderCalendar();
    if (state.screen === "analytics") renderAnalytics();
  }

  /********************
   * Service worker
   ********************/
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  /********************
   * Launch overlay (always dismiss, even if something errors)
   ********************/
  function hideLaunchOverlaySoon() {
    const el = $("#launchOverlay");
    if (!el) return;
    setTimeout(() => el.classList.add("hidden"), 350);  // quick fade
    setTimeout(() => { el.style.display = "none"; }, 900);
  }

  /********************
   * Events
   ********************/
  function bindEvents() {
    // Bottom nav
    $$(".navItem").forEach((b) => on(b, "click", () => setScreen(b.dataset.nav)));

    // top date nav
    on($("#btnPrevDay"), "click", () => setDate(addDays(state.dateKey, -1)));
    on($("#btnNextDay"), "click", () => setDate(addDays(state.dateKey, +1)));
    on($("#btnPickDay"), "click", () => { setDate(toKey(new Date())); toast("Back to Today"); });

    // Today screen shortcuts
    on($("#btnGoFood"), "click", () => setScreen("food"));
    on($("#btnGoWorkouts"), "click", () => setScreen("workouts"));

    // Close day
    on($("#btnCloseDay"), "click", () => { closeDay(state.dateKey); renderAll(); });

    // Quick Log
    on($("#btnQuickLog"), "click", () => {
      const day = getDay(state.dateKey);
      openModal(
        "Quick Log",
        `
          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <button class="btn" id="qlAddFood">Add Logged Food</button>
            <button class="btn" id="qlAddPlanned">Add Planned Food</button>
            <button class="btn" id="qlPlanWorkout">Plan Workout</button>
          </div>

          <div class="divider"></div>

          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <button class="btn ghost" id="qlCloseDay" ${canCloseDay(day) && !day.closed ? "" : "disabled"}>Close Day</button>
            <button class="btn ghost" id="qlUncloseDay" ${day.closed ? "" : "disabled"}>Reopen Day</button>
            <button class="btn ghost" id="qlUndoWorkout" ${day.workout.completed ? "" : "disabled"}>Undo Workout Complete</button>
          </div>
        `,
        `<div class="row" style="justify-content:flex-end;"><button class="btn danger ghost" id="qlDone">Done</button></div>`
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
        on($("#qlCloseDay"), "click", () => { closeDay(state.dateKey); renderAll(); closeModal(); });
        on($("#qlUncloseDay"), "click", () => { uncloseDay(state.dateKey); renderAll(); closeModal(); });
        on($("#qlUndoWorkout"), "click", () => { undoWorkoutComplete(state.dateKey); renderAll(); closeModal(); });
      }, 0);
    });

    // Food actions
    on($("#btnFoodLibrary"), "click", () => renderFoodLibrary(""));
    on($("#btnCopyPrevDay"), "click", () => {
      const prevKey = addDays(state.dateKey, -1);
      const prev = getDay(prevKey);
      const cur = getDay(state.dateKey);
      cur.food.logged = prev.food.logged.map((e) => Object.assign({}, e, { id: uid(), createdAt: Date.now() }));
      saveData();
      toast("Copied ✓");
      renderAll();
    });

    // Workouts actions
    on($("#btnTemplates"), "click", openTemplatesModal);
    on($("#btnPlanWorkout"), "click", () => { ensureWorkoutPlan(state.dateKey); saveData(); toast("Planned ✓"); renderWorkouts(); });
    on($("#btnAddExercise"), "click", () => { ensureWorkoutPlan(state.dateKey); saveData(); openExercisePicker(); });
    on($("#btnMarkWorkoutComplete"), "click", () => { markWorkoutComplete(state.dateKey); renderAll(); });
    on($("#btnSaveWorkoutLog"), "click", () => { saveData(); toast("Saved ✓"); renderWorkouts(); });

    // Calendar month nav
    on($("#btnCalPrev"), "click", () => setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1)));
    on($("#btnCalNext"), "click", () => setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1)));

    // Analytics settings
    on($("#btnSaveSettings"), "click", () => {
      DB.settings.calTarget = Number($("#setCals").value || 0);
      DB.settings.proteinTarget = Number($("#setProtein").value || 0);
      DB.settings.weighInDay = Number($("#setWeighDay").value || 1);
      DB.settings.themeColor = ($("#setTheme").value || "#0B1220");
      saveData();
      setThemeColor(DB.settings.themeColor);
      toast("Saved ✓");
      renderAll();
    });

    on($("#btnReset"), "click", () => {
      const ok = confirm("Reset all data? This cannot be undone.");
      if (!ok) return;
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_UI);
      location.reload();
    });

    on($("#btnLogWeighIn"), "click", () => {
      openModal(
        "Log weigh-in",
        `<label class="field"><span>Weight (${DB.settings.unitSystem})</span><input id="wiVal" type="number" inputmode="decimal" placeholder="e.g., 195" /></label>`,
        `<div class="row" style="justify-content:space-between;">
           <button class="btn danger ghost" id="wiCancel">Cancel</button>
           <button class="btn primary" id="wiSave">Save</button>
         </div>`
      );
      setTimeout(() => {
        on($("#wiCancel"), "click", closeModal);
        on($("#wiSave"), "click", () => {
          const v = Number($("#wiVal").value);
          if (!Number.isFinite(v) || v <= 0) return toast("Enter a weight");
          DB.weighIns.push({ id: uid(), dateKey: state.dateKey, weight: v });
          saveData();
          closeModal();
          toast("Saved ✓");
          renderAnalytics();
        });
      }, 0);
    });

    // Modal close
    on($("#modalClose"), "click", closeModal);
    on($("#modalOverlay"), "click", (e) => { if (e.target && e.target.id === "modalOverlay") closeModal(); });

    // Delegated clicks
    on(document.body, "click", (e) => {
      const node = e.target.closest ? e.target.closest("[data-action]") : null;
      if (!node) return;
      const action = node.dataset.action;

      if (action === "addFood") return openAddFoodFlow(node.dataset.bucket);
      if (action === "delFood") { deleteFoodEntry(state.dateKey, node.dataset.bucket, node.dataset.id); return renderAll(); }
      if (action === "favFood") return toggleFav(node.dataset.id);
      if (action === "pickFood") {
        const item = DB.foodLibrary.find((x) => x.id === node.dataset.id);
        if (item) openAddFoodFlow("logged", item);
        return;
      }

      if (action === "useTemplate") {
        const tpl = DB.templates.find((x) => x.id === node.dataset.id);
        if (!tpl) return;
        const plan = ensureWorkoutPlan(state.dateKey);
        plan.templateId = tpl.id;
        plan.name = tpl.name;
        plan.exercises = tpl.exercises.map((e) => Object.assign({}, e, { id: uid() }));
        saveData();
        toast("Template applied ✓");
        closeModal();
        setScreen("workouts");
        return;
      }

      if (action === "delTemplate") {
        DB.templates = DB.templates.filter((x) => x.id !== node.dataset.id);
        saveData();
        toast("Template deleted");
        openTemplatesModal();
        return;
      }

      if (action === "pickExercise") return addExerciseToPlan(node.dataset.name, node.dataset.group);

      if (action === "delExercise") {
        const day = getDay(state.dateKey);
        if (!day.workout.planned) return;
        day.workout.planned.exercises = day.workout.planned.exercises.filter((x) => x.id !== node.dataset.id);
        saveData();
        toast("Deleted");
        renderWorkouts();
        return;
      }

      if (action === "startRest") return startRestTimer(Number(node.dataset.sec || 0));
      if (action === "delHistoryWorkout") return deleteWorkoutFromHistory(node.dataset.id);

      if (action === "selectDay") {
        const key = node.dataset.key;
        setDate(key);
        const d = fromKey(key);
        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        renderCalendar();
        return;
      }

      if (action === "delWeighIn") {
        DB.weighIns = DB.weighIns.filter((x) => x.id !== node.dataset.id);
        saveData();
        toast("Deleted");
        renderAnalytics();
        return;
      }
    });

    // Delegated inputs for workout editing
    on(document.body, "input", (e) => {
      const el = e.target;
      const id = el && el.dataset ? el.dataset.id : null;
      const field = el && el.dataset ? el.dataset.field : null;
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

    // Rest timer inline buttons
    on(document.body, "click", (e) => {
      if (e.target && e.target.id === "btnStartRest") {
        const secs = Number(prompt("Rest seconds?", "90") || 0);
        startRestTimer(secs);
      }
      if (e.target && e.target.id === "btnStopRest") stopRestTimer();
    });
  }

  /********************
   * Init
   ********************/
  function init() {
    try {
      // Set theme immediately
      setThemeColor(DB.settings.themeColor || "#0B1220");

      // Bind events + initial nav
      bindEvents();

      setScreen(state.screen);
      setDate(state.dateKey);

      // Calendar month sync
      const d = fromKey(state.dateKey);
      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));

      renderAll();
      registerSW();
    } catch (err) {
      // If anything goes wrong, NEVER trap the user on the launch overlay.
      // eslint-disable-next-line no-console
      console.error("GlenTrack init error:", err);
      toast("Error: open Safari console");
    } finally {
      hideLaunchOverlaySoon();
    }
  }

  // Dismiss launch overlay on DOM ready AND window load (belt + suspenders for Safari)
  on(document, "DOMContentLoaded", () => {
    init();
    hideLaunchOverlaySoon();
  });
  on(window, "load", hideLaunchOverlaySoon);
})();