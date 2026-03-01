/* Glen Track V2 - app.js (single-file vanilla JS)
   Data stored in localStorage (offline-first).
   Requirements handled:
   - Calories + Protein rings (no % in center)
   - Calendar: no bubble days, no heavy border
   - Add single exercises (not just templates)
   - Food: serving unit + quantity + optional grams
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
  const LS_UI  = "glenTrackV2:ui:v2";
  const MAX_FAVS = 10;

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

  const DEFAULT_TEMPLATES = [
    { id: uid(), name: "Full Body A", exercises: [ex("Squat","Legs"), ex("Bench press","Chest"), ex("Seated row","Back"), ex("Overhead press","Shoulders")] },
    { id: uid(), name: "Full Body B", exercises: [ex("Deadlift","Back"), ex("Incline bench","Chest"), ex("Lat pulldown","Back"), ex("Dumbbell curls","Biceps")] },
  ];

  function ex(name, group) {
    return { id: uid(), name, group, weight: null, sets: 3, reps: 8, notes: "" };
  }

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
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return defaultData();

      const d = defaultData();
      data.settings ||= d.settings;
      data.foodLibrary ||= d.foodLibrary;
      data.favorites ||= [];
      data.templates ||= d.templates;
      data.days ||= {};
      data.weighIns ||= [];
      data.workoutHistory ||= [];
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
      return JSON.parse(localStorage.getItem(LS_UI) || "{}") || {};
    } catch { return {}; }
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
    restTimer: { running:false, remaining:0, interval:null },
  };

  /********************
   * Theme color
   ********************/
  function setThemeColor(hex) {
    DB.settings.themeColor = hex;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
    document.documentElement.style.setProperty("--theme", hex);
    saveData();
  }

  /********************
   * Toast
   ********************/
  let toastTimer = null;
  function toast(msg="Updated ✓") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1400);
  }

  /********************
   * Modal
   ********************/
  function openModal(title, bodyHTML, footHTML="") {
    const overlay = $("#modalOverlay");
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHTML;
    $("#modalFoot").innerHTML = footHTML;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden","false");
    $("#modalBody").scrollTop = 0;
  }
  function closeModal() {
    const overlay = $("#modalOverlay");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden","true");
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

    $$(".screen").forEach(s => s.classList.remove("active"));
    $(`.screen[data-screen="${screen}"]`)?.classList.add("active");

    $$(".navItem").forEach(b => b.classList.toggle("active", b.dataset.nav === screen));

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
      label.textContent = d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
    }
  }

  /********************
   * Rings (Calories + Protein)
   ********************/
  function ringSVG(progress01) {
    const p = Math.max(0, Math.min(1, progress01));
    const r = 28;
    const c = 2 * Math.PI * r;
    const dash = p * c;

    return `
      <div class="ringSvgWrap" aria-hidden="true">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="10" />
          <circle cx="36" cy="36" r="${r}" fill="none"
            stroke="rgba(125,255,138,0.85)"
            stroke-linecap="round"
            stroke-width="10"
            stroke-dasharray="${dash} ${c - dash}"
            transform="rotate(-90 36 36)"
          />
        </svg>
        <div class="ringDot"></div>
      </div>
    `;
  }

  /********************
   * Food math
   ********************/
  function sumMacros(entries) {
    return entries.reduce((acc,e) => {
      acc.cals += e.cals; acc.p += e.p; acc.c += e.c; acc.f += e.f;
      return acc;
    }, { cals:0, p:0, c:0, f:0 });
  }
  const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n)) : "—");

  /********************
   * Favorites
   ********************/
  function isFav(id){ return DB.favorites.includes(id); }
  function toggleFav(id){
    const idx = DB.favorites.indexOf(id);
    if (idx >= 0) DB.favorites.splice(idx,1);
    else {
      if (DB.favorites.length >= MAX_FAVS) return toast(`Favorites max = ${MAX_FAVS}`);
      DB.favorites.unshift(id);
    }
    saveData();
    renderFoodLibrary($("#foodSearch")?.value || "");
  }

  /********************
   * Food entry
   ********************/
  function normalizeFoodItem(raw){
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

  function addFoodToDay(dateKey, bucket, foodItem, qty, unitLabel, grams=null){
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

  function deleteFoodEntry(dateKey, bucket, entryId){
    const day = getDay(dateKey);
    day.food[bucket] = day.food[bucket].filter(e => e.id !== entryId);
    saveData();
    toast("Deleted");
  }

  /********************
   * Workouts
   ********************/
  function ensureWorkoutPlan(dateKey){
    const day = getDay(dateKey);
    if (!day.workout.planned){
      day.workout.planned = { id: uid(), templateId:null, name:"Workout", exercises:[], createdAt:Date.now() };
    }
    return day.workout.planned;
  }

  function markWorkoutComplete(dateKey){
    const day = getDay(dateKey);
    if (!day.workout.planned || day.workout.planned.exercises.length === 0) return toast("Add exercises first");

    const completed = {
      id: uid(),
      dateKey,
      templateName: day.workout.planned.name || "Workout",
      exercises: day.workout.planned.exercises.map(e => ({...e})),
      completedAt: Date.now(),
    };

    day.workout.completed = completed;
    DB.workoutHistory.unshift(completed);
    saveData();
    toast("Workout complete ✓");
  }

  function deleteWorkoutFromHistory(workoutId){
    DB.workoutHistory = DB.workoutHistory.filter(w => w.id !== workoutId);
    Object.keys(DB.days).forEach(k => {
      if (DB.days[k]?.workout?.completed?.id === workoutId) DB.days[k].workout.completed = null;
    });
    saveData();
    toast("Deleted workout");
    renderWorkouts();
  }

  /********************
   * Close / Unclose day
   ********************/
  function canCloseDay(day){
    return day.food.logged.length > 0 || !!day.workout.completed;
  }
  function closeDay(dateKey){
    const day = getDay(dateKey);
    if (!canCloseDay(day)) return toast("Log food or a workout");
    day.closed = true;
    saveData();
    toast("Day closed ✓");
  }
  function uncloseDay(dateKey){
    const day = getDay(dateKey);
    day.closed = false;
    saveData();
    toast("Day reopened");
  }

  /********************
   * Calendar
   ********************/
  function setCalMonth(d){
    state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    UI.calMonth = toKey(state.calMonth);
    saveUI();
    renderCalendar();
  }

  function buildCalendarGrid(monthDate){
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startDay = first.getDay(); // Sun start
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0).getDate();
    const cells = [];
    for (let i=0;i<startDay;i++) cells.push(null);
    for (let d=1; d<=daysInMonth; d++) cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
    return cells;
  }

  function daySignals(dateKey){
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
  function renderToday(){
    updateDateLabel();
    const day = getDay(state.dateKey);
    const totals = sumMacros(day.food.logged);

    const status = day.closed ? "Closed" : "In Progress";
    $("#uiStatusLine").textContent = `Status: ${status}`;
    $("#uiStatusPill").textContent = status;

    // Rings: calories + protein (no percent label)
    const calTarget = Number(DB.settings.calTarget || 0);
    const proTarget = Number(DB.settings.proteinTarget || 0);

    const calProg = calTarget ? (totals.cals / calTarget) : 0;
    const proProg = proTarget ? (totals.p / proTarget) : 0;

    $("#macroRingsRow").innerHTML = `
      <div class="ringCard">
        ${ringSVG(calProg)}
        <div class="ringMeta">
          <div class="ringTitle">Calories</div>
          <div class="ringSub">${fmt(totals.cals)} / ${fmt(calTarget)} • ${fmt(Math.max(0, calTarget - totals.cals))} remaining</div>
        </div>
      </div>
      <div class="ringCard">
        ${ringSVG(proProg)}
        <div class="ringMeta">
          <div class="ringTitle">Protein</div>
          <div class="ringSub">${fmt(totals.p)} / ${fmt(proTarget)}g • ${fmt(Math.max(0, proTarget - totals.p))}g remaining</div>
        </div>
      </div>
    `;

    $("#uiFoodSub").textContent = day.food.logged.length ? `${day.food.logged.length} item(s)` : "Not logged";
    $("#uiWorkoutSub").textContent = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "Not logged");

    const closeBtn = $("#btnCloseDay");
    const hint = $("#uiCloseHint");
    const canClose = canCloseDay(day);
    closeBtn.disabled = !canClose || day.closed;

    hint.textContent = day.closed
      ? "Day is closed. Reopen from Quick Log."
      : (canClose ? "Ready to close when you are." : "Log food or a workout to enable Close Today.");

    renderWeekSnapshot();
  }

  function renderWeekSnapshot(){
    const { start, end } = weekRangeFor(state.dateKey, true);
    const keys = [];
    const cur = new Date(start);
    while (cur <= end){
      keys.push(toKey(cur));
      cur.setDate(cur.getDate()+1);
    }

    let closed=0, workouts=0, totalCals=0, totalProtein=0, daysWithFood=0;

    keys.forEach(k => {
      const d = getDay(k);
      if (d.closed) closed++;
      if (d.workout.completed) workouts++;
      const tot = sumMacros(d.food.logged);
      if (d.food.logged.length){
        daysWithFood++;
        totalCals += tot.cals;
        totalProtein += tot.p;
      }
    });

    $("#uiClosedDays").textContent = `${closed}/7`;
    $("#uiWorkoutsWeek").textContent = String(workouts);
    $("#uiAvgCals").textContent = daysWithFood ? String(Math.round(totalCals/daysWithFood)) : "—";
    $("#uiAvgProtein").textContent = daysWithFood ? String(Math.round(totalProtein/daysWithFood)) : "—";
    $("#uiStreak").textContent = String(calcStreak());
  }

  function calcStreak(){
    let k = state.dateKey;
    let streak = 0;
    while (true){
      const d = getDay(k);
      if (!d.closed) break;
      streak++;
      k = addDays(k, -1);
      if (streak > 3650) break;
    }
    return streak;
  }

  /********************
   * Render: Food
   ********************/
  function renderFood(){
    $("#uiFoodDateSub").textContent = state.dateKey === toKey(new Date()) ? "Meals for Today" : "Meals for selected day";
    const day = getDay(state.dateKey);

    const logged = day.food.logged;
    const planned = day.food.planned;

    const tot = sumMacros(logged);
    $("#uiFoodTotCals").textContent = fmt(tot.cals);
    $("#uiFoodTotP").textContent = fmt(tot.p);
    $("#uiFoodTotC").textContent = fmt(tot.c);
    $("#uiFoodTotF").textContent = fmt(tot.f);

    $("#mealList").innerHTML = `
      ${foodBucketCard("Logged","logged",logged)}
      ${foodBucketCard("Planned","planned",planned)}
    `;
  }

  function foodBucketCard(title, bucket, items){
    const rows = items.map(e => {
      const grams = e.grams != null ? ` • ${e.grams}g` : "";
      return `
        <div class="listItem">
          <div style="min-width:0;">
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
            <div class="subtle">${items.length ? `${items.length} item(s)` : "None"}</div>
          </div>
          <button class="btn" data-action="addFood" data-bucket="${bucket}">Add</button>
        </div>
        <div class="list">${rows || `<div class="subtle">None</div>`}</div>
      </div>
    `;
  }

  function renderFoodLibrary(search=""){
    const q = String(search||"").trim().toLowerCase();
    const sorted = [...DB.foodLibrary].sort((a,b) => {
      const af = isFav(a.id) ? 0 : 1;
      const bf = isFav(b.id) ? 0 : 1;
      if (af !== bf) return af-bf;
      return a.name.localeCompare(b.name);
    });

    const filtered = q ? sorted.filter(x => x.name.toLowerCase().includes(q)) : sorted;

    const rows = filtered.map(item => {
      const fav = isFav(item.id);
      return `
        <div class="listItem">
          <div style="min-width:0;">
            <div class="listTitle">${escapeHTML(item.name)}</div>
            <div class="subtle">${item.cals} cals • P ${item.p} • C ${item.c} • F ${item.f} • default: ${item.amount} ${escapeHTML(item.unit)}</div>
          </div>
          <div class="row" style="gap:10px;">
            <button class="btn ghost" data-action="favFood" data-id="${item.id}">${fav ? "★" : "☆"}</button>
            <button class="btn" data-action="pickFood" data-id="${item.id}">Use</button>
          </div>
        </div>
      `;
    }).join("");

    openModal(
      "Food Library",
      `
        <label class="field" style="margin-bottom:10px;">
          <span>Search</span>
          <input id="foodSearch" type="text" placeholder="Greek yogurt, banana, rice..." value="${escapeAttr(search)}" />
        </label>

        <div class="subtle" style="margin-bottom:10px;">Favorites: ${DB.favorites.length}/${MAX_FAVS} (★ pins to top)</div>

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
        <div class="row spaceBetween">
          <button class="btn danger ghost" id="btnCloseLib">Close</button>
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

  function openAddFoodFlow(bucket, preselectedFood=null){
    const food = preselectedFood || DB.foodLibrary[0] || normalizeFoodItem({ name:"Food" });

    openModal(
      `Add Food (${bucket === "logged" ? "Logged" : "Planned"})`,
      `
        <div class="row" style="gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn" id="btnOpenLibraryInline">Open Library</button>
        </div>

        <div class="card" style="margin:0;">
          <div class="h2" style="margin-bottom:6px;">${escapeHTML(food.name)}</div>
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

          <div class="subtle" style="margin-top:8px;">
            Quantity = multiplier. Example: 2 cups → qty 2, unit “cup”.
          </div>
        </div>
      `,
      `
        <div class="row spaceBetween">
          <button class="btn danger ghost" id="btnCancelAddFood">Cancel</button>
          <button class="btn primary" id="btnConfirmAddFood">Add</button>
        </div>
      `
    );

    setTimeout(() => {
      on($("#btnCancelAddFood"), "click", closeModal);
      on($("#btnOpenLibraryInline"), "click", () => renderFoodLibrary(""));
      on($("#btnConfirmAddFood"), "click", () => {
        addFoodToDay(
          state.dateKey,
          bucket,
          food,
          $("#foodQty").value,
          ($("#foodUnit").value || "").trim() || "serving",
          $("#foodGrams").value
        );
        closeModal();
        renderAll();
      });
    }, 0);
  }

  /********************
   * Render: Workouts
   ********************/
  function renderWorkouts(){
    $("#uiWorkoutDateSub").textContent = state.dateKey === toKey(new Date()) ? "Plan or log for Today" : "Plan or log for selected day";

    const day = getDay(state.dateKey);
    const status = day.workout.completed ? "Completed" : (day.workout.planned ? "Planned" : "No workout planned");
    $("#uiWorkoutStatus").textContent = status;

    const editor = $("#workoutEditor");
    if (!editor) return;

    if (!day.workout.planned){
      editor.classList.add("hidden");
      $("#exerciseEditor").innerHTML = `<div class="subtle">No workout planned.</div>`;
      $("#workoutHistory").innerHTML = renderWorkoutHistory();
      return;
    }

    editor.classList.remove("hidden");

    $("#exerciseEditor").innerHTML = day.workout.planned.exercises.length
      ? day.workout.planned.exercises.map(renderExerciseRow).join("")
      : `<div class="subtle">No exercises yet. Tap “Add exercise”.</div>`;

    $("#workoutHistory").innerHTML = renderWorkoutHistory();
  }

  function renderExerciseRow(e){
    const unit = DB.settings.unitSystem || "lb";
    return `
      <div class="card" style="margin:12px 0 0;">
        <div class="row spaceBetween" style="gap:12px;">
          <div style="min-width:0;">
            <div class="h2" style="margin:0 0 4px;">${escapeHTML(e.name)}</div>
            <div class="subtle">${escapeHTML(e.group || "—")}</div>
          </div>
          <button class="btn danger ghost" data-action="delExercise" data-id="${e.id}">Delete</button>
        </div>

        <div class="divider"></div>

        <div class="formGrid">
          <label class="field">
            <span>Weight (${unit})</span>
            <input data-field="weight" data-id="${e.id}" type="number" inputmode="decimal" value="${e.weight ?? ""}" placeholder="e.g., 135" />
          </label>
          <label class="field">
            <span>Sets</span>
            <input data-field="sets" data-id="${e.id}" type="number" inputmode="numeric" value="${e.sets ?? 3}" />
          </label>
          <label class="field">
            <span>Reps</span>
            <input data-field="reps" data-id="${e.id}" type="number" inputmode="numeric" value="${e.reps ?? 8}" />
          </label>
        </div>

        <label class="field" style="margin-top:12px;">
          <span>Notes</span>
          <input data-field="notes" data-id="${e.id}" type="text" value="${escapeAttr(e.notes || "")}" placeholder="Optional" />
        </label>
      </div>
    `;
  }

  function renderWorkoutHistory(){
    const rows = DB.workoutHistory.slice(0, 20).map(w => {
      const d = fromKey(w.dateKey).toLocaleDateString(undefined, { month:"short", day:"numeric" });
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

  function openTemplatesModal(){
    const rows = DB.templates.map(t => `
      <div class="listItem">
        <div style="min-width:0;">
          <div class="listTitle">${escapeHTML(t.name)}</div>
          <div class="subtle">${t.exercises.length} exercise(s)</div>
        </div>
        <div class="row" style="gap:10px;">
          <button class="btn ghost" data-action="useTemplate" data-id="${t.id}">Use</button>
          <button class="btn danger ghost" data-action="delTemplate" data-id="${t.id}">Delete</button>
        </div>
      </div>
    `).join("");

    openModal(
      "Workout Templates",
      `<div class="list">${rows || `<div class="subtle">No templates yet.</div>`}</div>`,
      `<div class="row" style="justify-content:flex-end;"><button class="btn danger ghost" id="btnCloseTpl">Close</button></div>`
    );

    setTimeout(() => on($("#btnCloseTpl"), "click", closeModal), 0);
  }

  function openExercisePicker(){
    const groups = MUSCLE_GROUPS.map(g => `
      <div class="card" style="margin:0 0 12px;">
        <div class="h2" style="margin-bottom:8px;">${escapeHTML(g.key)}</div>
        <div class="list">
          ${g.items.map(name => `
            <button class="listItem" style="width:100%; text-align:left;" data-action="pickExercise" data-name="${escapeAttr(name)}" data-group="${escapeAttr(g.key)}">
              <div>
                <div class="listTitle">${escapeHTML(name)}</div>
                <div class="subtle">Tap to add</div>
              </div>
              <div class="pill">＋</div>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("");

    openModal("Add exercise", `<div class="subtle" style="margin-bottom:10px;">Grouped by muscle.</div>${groups}`,
      `<div class="row" style="justify-content:flex-end;"><button class="btn danger ghost" id="btnCloseEx">Close</button></div>`
    );

    setTimeout(() => on($("#btnCloseEx"), "click", closeModal), 0);
  }

  function addExerciseToPlan(name, group){
    const plan = ensureWorkoutPlan(state.dateKey);
    plan.exercises.push(ex(name, group));
    saveData();
    toast("Added ✓");
    renderWorkouts();
  }

  /********************
   * Render: Calendar
   ********************/
  function renderCalendar(){
    $("#uiCalTitle").textContent = monthTitle(state.calMonth);

    const gridEl = $("#calGrid");
    const cells = buildCalendarGrid(state.calMonth);
    const todayKey = toKey(new Date());

    gridEl.innerHTML = cells.map(d => {
      if (!d) return `<div class="calCell empty"></div>`;
      const key = toKey(d);
      const sig = daySignals(key);
      return `
        <button class="calCell ${key === state.dateKey ? "selected" : ""} ${key === todayKey ? "today" : ""}"
          data-action="selectDay" data-key="${key}">
          <div class="calNum">${d.getDate()}</div>
          <div class="calDots">
            ${sig.closed ? `<span class="dot dotClosed"></span>` : ``}
            ${sig.food ? `<span class="dot dotFood"></span>` : ``}
            ${sig.workout ? `<span class="dot dotWo"></span>` : ``}
            ${(!sig.closed && !sig.food && !sig.workout && sig.planned) ? `<span class="dot dotPlanned"></span>` : ``}
          </div>
        </button>
      `;
    }).join("");

    injectCalendarPreview();
  }

  function injectCalendarPreview(){
    const screen = $(`.screen[data-screen="calendar"]`);
    if (!screen) return;

    let preview = $("#calPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "calPreview";
      preview.className = "card";
      screen.appendChild(preview);
    }

    const day = getDay(state.dateKey);
    preview.innerHTML = `
      <div class="row spaceBetween">
        <div>
          <div class="h2">Selected day</div>
          <div class="subtle">${fromKey(state.dateKey).toLocaleDateString(undefined,{ weekday:"long", month:"short", day:"numeric" })}</div>
        </div>
        <button class="btn" id="btnOpenSelected">Open</button>
      </div>
      <div class="divider"></div>
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <div class="pill">Food: <strong>${day.food.logged.length ? "✓" : "—"}</strong></div>
        <div class="pill">Workout: <strong>${day.workout.completed ? "✓" : "—"}</strong></div>
        <div class="pill">Closed: <strong>${day.closed ? "✓" : "—"}</strong></div>
      </div>
    `;

    setTimeout(() => on($("#btnOpenSelected"), "click", () => setScreen("today")), 0);
  }

  /********************
   * Render: Analytics
   ********************/
  function renderAnalytics(){
    const { start, end } = weekRangeFor(state.dateKey, true);
    $("#uiAnalyticsWeek").textContent =
      `${start.toLocaleDateString(undefined,{ month:"short", day:"numeric" })} – ${end.toLocaleDateString(undefined,{ month:"short", day:"numeric" })}`;

    const keys = [];
    const cur = new Date(start);
    while (cur <= end){ keys.push(toKey(cur)); cur.setDate(cur.getDate()+1); }

    let closed=0, workouts=0, totalCals=0, totalProtein=0, daysWithFood=0;
    keys.forEach(k => {
      const d = getDay(k);
      if (d.closed) closed++;
      if (d.workout.completed) workouts++;
      const tot = sumMacros(d.food.logged);
      if (d.food.logged.length){ daysWithFood++; totalCals += tot.cals; totalProtein += tot.p; }
    });

    $("#anClosed").textContent = String(closed);
    $("#anWorkouts").textContent = String(workouts);
    $("#anAvgCals").textContent = daysWithFood ? String(Math.round(totalCals/daysWithFood)) : "—";
    $("#anAvgProtein").textContent = daysWithFood ? String(Math.round(totalProtein/daysWithFood)) : "—";

    // weigh-ins list
    const list = $("#weighInList");
    list.innerHTML = DB.weighIns
      .slice().sort((a,b) => b.dateKey.localeCompare(a.dateKey))
      .map(w => `
        <div class="listItem">
          <div>
            <div class="listTitle">${fromKey(w.dateKey).toLocaleDateString(undefined,{ month:"short", day:"numeric" })}</div>
            <div class="subtle">${w.weight} ${DB.settings.unitSystem}</div>
          </div>
          <button class="btn danger ghost" data-action="delWeighIn" data-id="${w.id}">Delete</button>
        </div>
      `).join("") || `<div class="subtle">No weigh-ins yet.</div>`;

    $("#setCals").value = DB.settings.calTarget;
    $("#setProtein").value = DB.settings.proteinTarget;
    $("#setWeighDay").value = "1";

    setThemeColor(DB.settings.themeColor || "#0B1220");
  }

  /********************
   * Render all
   ********************/
  function renderAll(){
    updateDateLabel();
    if (state.screen === "today") renderToday();
    if (state.screen === "food") renderFood();
    if (state.screen === "workouts") renderWorkouts();
    if (state.screen === "calendar") renderCalendar();
    if (state.screen === "analytics") renderAnalytics();
  }

  /********************
   * Events
   ********************/
  function bindEvents(){
    // bottom nav
    $$(".navItem").forEach(b => on(b,"click", () => setScreen(b.dataset.nav)));

    // top day nav
    on($("#btnPrevDay"), "click", () => setDate(addDays(state.dateKey,-1)));
    on($("#btnNextDay"), "click", () => setDate(addDays(state.dateKey,+1)));
    on($("#btnPickDay"), "click", () => { setDate(toKey(new Date())); toast("Back to Today"); });

    // today quick jumps
    on($("#btnGoFood"), "click", () => setScreen("food"));
    on($("#btnGoWorkouts"), "click", () => setScreen("workouts"));

    // close day
    on($("#btnCloseDay"), "click", () => { closeDay(state.dateKey); renderAll(); });

    // quick log
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
        on($("#qlCloseDay"), "click", () => { closeDay(state.dateKey); closeModal(); renderAll(); });
        on($("#qlUncloseDay"), "click", () => { uncloseDay(state.dateKey); closeModal(); renderAll(); });
      }, 0);
    });

    // Food
    on($("#btnFoodLibrary"), "click", () => renderFoodLibrary(""));
    on($("#btnCopyPrevDay"), "click", () => {
      const prevKey = addDays(state.dateKey, -1);
      const prev = getDay(prevKey);
      const cur = getDay(state.dateKey);
      cur.food.logged = prev.food.logged.map(e => ({...e, id:uid(), createdAt:Date.now()}));
      saveData();
      toast("Copied ✓");
      renderAll();
    });

    // Workouts
    on($("#btnTemplates"), "click", openTemplatesModal);
    on($("#btnPlanWorkout"), "click", () => { ensureWorkoutPlan(state.dateKey); saveData(); toast("Planned ✓"); renderWorkouts(); });
    on($("#btnAddExercise"), "click", () => { ensureWorkoutPlan(state.dateKey); saveData(); openExercisePicker(); });
    on($("#btnMarkWorkoutComplete"), "click", () => { markWorkoutComplete(state.dateKey); renderAll(); });
    on($("#btnSaveWorkoutLog"), "click", () => { saveData(); toast("Saved ✓"); renderWorkouts(); });

    // Calendar nav
    on($("#btnCalPrev"), "click", () => setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()-1, 1)));
    on($("#btnCalNext"), "click", () => setCalMonth(new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()+1, 1)));

    // Stats settings
    on($("#btnSaveSettings"), "click", () => {
      DB.settings.calTarget = Number($("#setCals").value || 0);
      DB.settings.proteinTarget = Number($("#setProtein").value || 0);
      saveData();
      toast("Saved ✓");
      renderAll();
    });

    on($("#btnReset"), "click", () => {
      if (!confirm("Reset all data? This cannot be undone.")) return;
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_UI);
      location.reload();
    });

    on($("#btnLogWeighIn"), "click", () => {
      openModal(
        "Log weigh-in",
        `
          <label class="field">
            <span>Weight (${DB.settings.unitSystem})</span>
            <input id="wiVal" type="number" inputmode="decimal" placeholder="e.g., 195" />
          </label>
        `,
        `
          <div class="row spaceBetween">
            <button class="btn danger ghost" id="wiCancel">Cancel</button>
            <button class="btn primary" id="wiSave">Save</button>
          </div>
        `
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

    // modal close
    on($("#modalClose"), "click", closeModal);
    on($("#modalOverlay"), "click", (e) => { if (e.target?.id === "modalOverlay") closeModal(); });

    // Delegated clicks
    on(document.body, "click", (e) => {
      const t = e.target.closest("[data-action]");
      if (!t) return;

      const action = t.dataset.action;

      if (action === "addFood") return openAddFoodFlow(t.dataset.bucket);

      if (action === "delFood") {
        deleteFoodEntry(state.dateKey, t.dataset.bucket, t.dataset.id);
        return renderAll();
      }

      if (action === "favFood") return toggleFav(t.dataset.id);

      if (action === "pickFood") {
        const item = DB.foodLibrary.find(x => x.id === t.dataset.id);
        if (!item) return;
        return openAddFoodFlow("logged", item);
      }

      if (action === "useTemplate") {
        const tpl = DB.templates.find(x => x.id === t.dataset.id);
        if (!tpl) return;
        const plan = ensureWorkoutPlan(state.dateKey);
        plan.templateId = tpl.id;
        plan.name = tpl.name;
        plan.exercises = tpl.exercises.map(e => ({...e, id: uid()}));
        saveData();
        toast("Template applied ✓");
        closeModal();
        return setScreen("workouts");
      }

      if (action === "delTemplate") {
        DB.templates = DB.templates.filter(x => x.id !== t.dataset.id);
        saveData();
        toast("Template deleted");
        return openTemplatesModal();
      }

      if (action === "pickExercise") {
        return addExerciseToPlan(t.dataset.name, t.dataset.group);
      }

      if (action === "delExercise") {
        const day = getDay(state.dateKey);
        if (!day.workout.planned) return;
        day.workout.planned.exercises = day.workout.planned.exercises.filter(x => x.id !== t.dataset.id);
        saveData();
        toast("Deleted");
        return renderWorkouts();
      }

      if (action === "delHistoryWorkout") return deleteWorkoutFromHistory(t.dataset.id);

      if (action === "selectDay") {
        const key = t.dataset.key;
        setDate(key);
        const d = fromKey(key);
        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        return renderCalendar();
      }

      if (action === "delWeighIn") {
        DB.weighIns = DB.weighIns.filter(x => x.id !== t.dataset.id);
        saveData();
        toast("Deleted");
        return renderAnalytics();
      }
    });

    // Delegated workout inputs
    on(document.body, "input", (e) => {
      const el = e.target;
      const id = el?.dataset?.id;
      const field = el?.dataset?.field;
      if (!id || !field) return;

      const day = getDay(state.dateKey);
      const plan = day.workout.planned;
      if (!plan) return;

      const item = plan.exercises.find(x => x.id === id);
      if (!item) return;

      if (field === "notes") item.notes = el.value;
      else item[field] = el.value === "" ? null : Number(el.value);

      saveData();
    });
  }

  /********************
   * Escape helpers
   ********************/
  function escapeHTML(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){ return escapeHTML(s).replaceAll("\n"," "); }

  /********************
   * uid
   ********************/
  function uid(){
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  /********************
   * Init
   ********************/
  function init(){
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
