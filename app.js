/* Glen Track V2
   Offline-first, clean execution system.
*/
(() => {
  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const fromISODate = (s) => {
    const [y,m,d] = s.split("-").map(Number);
    return new Date(y, m-1, d);
  };
  const addDays = (iso, delta) => {
    const d = fromISODate(iso);
    d.setDate(d.getDate()+delta);
    return toISODate(d);
  };
  const todayISO = () => toISODate(new Date());

  const startOfWeekISO = (iso, weekStartsOnSunday = true) => {
    const d = fromISODate(iso);
    const day = d.getDay(); // 0..6
    const diff = weekStartsOnSunday ? day : ((day + 6) % 7);
    d.setDate(d.getDate() - diff);
    return toISODate(d);
  };

  const fmtDateShort = (iso) => {
    const d = fromISODate(iso);
    return d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
  };

  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  // ---------- Storage ----------
  const KEY = "glen_track_v2_state";

  const defaultSettings = {
    calorieTarget: 2200,
    proteinTarget: 190,
    weighInDay: 0 // Sunday
  };

  // Exercise library seed
  const EX = (id, name, muscle, equipment="") => ({ id, name, muscle, equipment });
  const seedExercises = [
    EX("bench_press","Bench Press","Chest","Barbell"),
    EX("incline_bench","Incline Bench Press","Chest","Barbell"),
    EX("db_press","Dumbbell Press","Chest","Dumbbells"),
    EX("chest_fly","Chest Fly","Chest","Cable/Dumbbells"),

    EX("pull_up","Pull-Up","Back","Bodyweight"),
    EX("lat_pulldown","Lat Pulldown","Back","Machine"),
    EX("barbell_row","Barbell Row","Back","Barbell"),
    EX("db_row","Dumbbell Row","Back","Dumbbells"),
    EX("face_pull","Face Pull","Back/Shoulders","Cable"),

    EX("squat","Back Squat","Legs","Barbell"),
    EX("front_squat","Front Squat","Legs","Barbell"),
    EX("leg_press","Leg Press","Legs","Machine"),
    EX("rdl","Romanian Deadlift","Legs","Barbell"),
    EX("lunge","Lunge","Legs","Dumbbells"),

    EX("ohp","Overhead Press","Shoulders","Barbell"),
    EX("db_shoulder_press","Dumbbell Shoulder Press","Shoulders","Dumbbells"),
    EX("lat_raise","Lateral Raise","Shoulders","Dumbbells"),
    EX("rear_delt_fly","Rear Delt Fly","Shoulders","Dumbbells"),

    EX("bb_curl","Barbell Curl","Arms","Barbell"),
    EX("db_curl","Dumbbell Curl","Arms","Dumbbells"),
    EX("hammer_curl","Hammer Curl","Arms","Dumbbells"),
    EX("tricep_pushdown","Tricep Pushdown","Arms","Cable"),
    EX("skullcrusher","Skull Crushers","Arms","EZ Bar"),

    EX("plank","Plank","Core","Bodyweight"),
    EX("hanging_leg_raise","Hanging Leg Raise","Core","Bodyweight"),
    EX("cable_crunch","Cable Crunch","Core","Cable"),

    EX("run","Run","Cardio",""),
    EX("bike","Bike","Cardio",""),
    EX("row","Row","Cardio",""),
    EX("walk","Walk","Cardio",""),
    EX("stairmaster","Stairmaster","Cardio","")
  ];

  const seedTemplates = [
    { id:"tmpl_fullA", name:"Full Body A", exerciseIds:["squat","bench_press","lat_pulldown","bb_curl","tricep_pushdown"] },
    { id:"tmpl_fullB", name:"Full Body B", exerciseIds:["rdl","ohp","barbell_row","lat_raise","hammer_curl"] }
  ];

  const initialState = () => ({
    version: 2,
    settings: { ...defaultSettings },
    selectedDate: todayISO(),
    foods: {},
    days: {},
    exercises: seedExercises,
    templates: seedTemplates,
    weighIns: []
  });

  const load = () => {
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return initialState();
      const parsed = JSON.parse(raw);
      if(!parsed.version) parsed.version = 2;
      if(!parsed.settings) parsed.settings = { ...defaultSettings };
      if(!parsed.days) parsed.days = {};
      if(!parsed.foods) parsed.foods = {};
      if(!parsed.exercises) parsed.exercises = seedExercises;
      if(!parsed.templates) parsed.templates = seedTemplates;
      if(!parsed.weighIns) parsed.weighIns = [];
      if(!parsed.selectedDate) parsed.selectedDate = todayISO();
      return parsed;
    }catch{
      return initialState();
    }
  };

  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const ensureDay = (iso) => {
    if(!state.days[iso]){
      state.days[iso] = {
        closed: false,
        closedAt: null,
        meals: { breakfast: [], snacks: [], lunch: [], dinner: [] },
        workoutPlan: null,
        workoutLog: null
      };
    }
    return state.days[iso];
  };

  // Meal order (your choice #2)
  const mealKeys = ["breakfast","snacks","lunch","dinner"];

  // ---------- UI Helpers ----------
  const toast = (msg="Updated ✓") => {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> el.classList.add("hidden"), 1100);
  };

  const modal = {
    open(title, bodyHTML, footHTML=""){
      $("#modalTitle").textContent = title;
      $("#modalBody").innerHTML = bodyHTML;
      $("#modalFoot").innerHTML = footHTML;
      $("#modalOverlay").classList.remove("hidden");
      $("#modalOverlay").setAttribute("aria-hidden","false");
    },
    close(){
      $("#modalOverlay").classList.add("hidden");
      $("#modalOverlay").setAttribute("aria-hidden","true");
      $("#modalBody").innerHTML = "";
      $("#modalFoot").innerHTML = "";
    }
  };

  // ---------- Core Calculations ----------
  const sumFoodForDay = (iso) => {
    const day = ensureDay(iso);
    const totals = { cals:0, p:0, c:0, f:0, loggedCount:0, plannedCount:0 };
    for(const mk of mealKeys){
      for(const item of day.meals[mk]){
        if(item.logged){
          totals.cals += (item.cals||0) * (item.servingQty||0);
          totals.p += (item.p||0) * (item.servingQty||0);
          totals.c += (item.c||0) * (item.servingQty||0);
          totals.f += (item.f||0) * (item.servingQty||0);
          totals.loggedCount++;
        } else if(item.planned){
          totals.plannedCount++;
        }
      }
    }
    return totals;
  };

  const mealTotals = (iso, mealKey) => {
    const day = ensureDay(iso);
    const t = { cals:0,p:0,c:0,f:0, loggedCount:0, plannedCount:0 };
    for(const item of day.meals[mealKey]){
      if(item.logged){
        t.cals += (item.cals||0) * (item.servingQty||0);
        t.p += (item.p||0) * (item.servingQty||0);
        t.c += (item.c||0) * (item.servingQty||0);
        t.f += (item.f||0) * (item.servingQty||0);
        t.loggedCount++;
      } else if(item.planned){
        t.plannedCount++;
      }
    }
    return t;
  };

  const hasLoggedFood = (iso) => sumFoodForDay(iso).loggedCount > 0;

  const hasCompletedWorkout = (iso) => {
    const day = ensureDay(iso);
    return !!(day.workoutLog && day.workoutLog.status === "completed");
  };

  const canCloseDay = (iso) => hasLoggedFood(iso) || hasCompletedWorkout(iso);

  const computeStreak = (anchorISO = todayISO()) => {
    let streak = 0;
    let cur = anchorISO;
    while(true){
      const d = state.days[cur];
      if(d && d.closed) streak++;
      else break;
      cur = addDays(cur, -1);
    }
    return streak;
  };

  const weekRange = (iso) => {
    const start = startOfWeekISO(iso, true);
    const days = [];
    for(let i=0;i<7;i++) days.push(addDays(start, i));
    return { start, days };
  };

  const weekStats = (iso) => {
    const { days } = weekRange(iso);
    let closed=0, workouts=0, sumCals=0, sumP=0, calsDays=0;
    for(const d of days){
      if(state.days[d]?.closed) closed++;
      if(hasCompletedWorkout(d)) workouts++;
      const tot = sumFoodForDay(d);
      if(tot.loggedCount>0){
        sumCals += tot.cals;
        sumP += tot.p;
        calsDays++;
      }
    }
    return {
      closed,
      workouts,
      avgCals: calsDays ? Math.round(sumCals / calsDays) : 0,
      avgProtein: calsDays ? Math.round(sumP / calsDays) : 0,
      start: weekRange(iso).start
    };
  };

  const weighInDue = (iso) => {
    const d = fromISODate(iso);
    const dueDay = state.settings.weighInDay;
    if(d.getDay() !== dueDay) return false;
    const start = startOfWeekISO(iso, true);
    const end = addDays(start, 6);
    const has = state.weighIns.some(w => w.dateISO >= start && w.dateISO <= end);
    return !has;
  };

  // ---------- Rendering ----------
  const renderHeaderDate = () => {
    const iso = state.selectedDate;
    $("#uiDateLabel").textContent = iso === todayISO() ? "Today" : fmtDateShort(iso);
  };

  const renderToday = () => {
    const iso = state.selectedDate;
    const day = ensureDay(iso);
    const totals = sumFoodForDay(iso);

    const calsTarget = state.settings.calorieTarget || 0;
    const pTarget = state.settings.proteinTarget || 0;

    $("#uiCals").textContent = `${Math.round(totals.cals)} / ${calsTarget || 0}`;
    $("#uiProtein").textContent = `${Math.round(totals.p)} / ${pTarget || 0}g`;

    $("#uiCarbs").textContent = `${Math.round(totals.c)}g`;
    $("#uiFat").textContent = `${Math.round(totals.f)}g`;

    if(totals.loggedCount > 0){
      $("#uiFoodSub").textContent = `${totals.loggedCount} item${totals.loggedCount===1?"":"s"} logged`;
      $("#uiFoodMark").textContent = "✔";
    } else if(totals.plannedCount > 0){
      $("#uiFoodSub").textContent = `${totals.plannedCount} planned`;
      $("#uiFoodMark").textContent = "◌";
    } else {
      $("#uiFoodSub").textContent = "Not logged";
      $("#uiFoodMark").textContent = "—";
    }

    const hasPlan = !!day.workoutPlan;
    const isDone = hasCompletedWorkout(iso);
    if(isDone){
      $("#uiWorkoutSub").textContent = `Completed`;
      $("#uiWorkoutMark").textContent = "✔";
    } else if(hasPlan){
      $("#uiWorkoutSub").textContent = `Planned`;
      $("#uiWorkoutMark").textContent = "◌";
    } else {
      $("#uiWorkoutSub").textContent = "Not logged";
      $("#uiWorkoutMark").textContent = "—";
    }

    if(weighInDue(iso)){
      $("#uiWeighInSub").textContent = "Due today";
      $("#uiWeighInMark").textContent = "•";
    } else {
      $("#uiWeighInSub").textContent = "Weekly only";
      $("#uiWeighInMark").textContent = "—";
    }

    const closed = !!day.closed;
    $("#uiStatusPill").textContent = closed ? "Day Closed" : "In Progress";
    $("#uiStatusPill").classList.toggle("closed", closed);
    $("#uiStatusLine").textContent = `Status: ${closed ? "Day Closed" : "In Progress"}`;

    const canClose = canCloseDay(iso) && !closed;
    $("#btnCloseDay").disabled = !canClose;
    $("#uiCloseHint").textContent = closed
      ? "Day closed. Review tomorrow."
      : (canCloseDay(iso) ? "Ready to close the day." : "Log food or a workout to enable Close Today.");

    const ws = weekStats(iso);
    $("#uiClosedDays").textContent = `${ws.closed}/7`;
    $("#uiWorkoutsWeek").textContent = `${ws.workouts}`;
    $("#uiAvgCals").textContent = ws.avgCals ? `${ws.avgCals}` : "—";
    $("#uiAvgProtein").textContent = ws.avgProtein ? `${ws.avgProtein}g` : "—";
    $("#uiStreak").textContent = `${computeStreak(todayISO())}`;
  };

  const foodItemHTML = (mealKey, it) => {
    const qty = it.servingQty ?? 1;
    const badge = it.logged ? `<span class="badge logged">logged</span>` : `<span class="badge planned">planned</span>`;
    const macroLine = `${Math.round((it.cals||0)*qty)} cals • P ${Math.round((it.p||0)*qty)}g • C ${Math.round((it.c||0)*qty)}g • F ${Math.round((it.f||0)*qty)}g`;
    const meta = `${qty} × ${it.servingLabel || "serving"} • ${macroLine}`;
    const right = it.logged ? "✔" : "◌";

    return `
      <div class="foodItem">
        <div style="display:flex; justify-content:space-between; gap:12px;">
          <div class="foodMain">
            <div class="foodName">${escapeHTML(it.name)} ${badge}</div>
            <div class="foodMeta">${escapeHTML(meta)}</div>
          </div>
          <div class="foodNums">${right}</div>
        </div>

        <div class="smallRow">
          ${it.logged ? "" : `<button class="smallBtn" data-action="markEaten" data-meal="${mealKey}" data-id="${it.id}">Mark eaten</button>`}
          <button class="smallBtn danger" data-action="deleteFoodEntry" data-meal="${mealKey}" data-id="${it.id}">Delete</button>
        </div>
      </div>
    `;
  };

  const mealCardHTML = (iso, mealKey, label) => {
    const t = mealTotals(iso, mealKey);
    const items = ensureDay(iso).meals[mealKey];

    return `
      <div class="card mealCard">
        <div class="mealHead">
          <div>
            <div class="mealName">${label}
              ${t.plannedCount ? `<span class="badge planned">${t.plannedCount} planned</span>` : ""}
              ${t.loggedCount ? `<span class="badge logged">${t.loggedCount} logged</span>` : ""}
            </div>
            <div class="mealTotals">${Math.round(t.cals)} cals • P ${Math.round(t.p)}g • C ${Math.round(t.c)}g • F ${Math.round(t.f)}g</div>
          </div>
          <div class="mealActions">
            <button class="btn ghost" data-action="repeatMeal" data-meal="${mealKey}">Repeat last</button>
            <button class="btn ghost" data-action="markMealEaten" data-meal="${mealKey}">Mark eaten</button>
            <button class="btn ghost" data-action="addFood" data-meal="${mealKey}">+ Add</button>
          </div>
        </div>

        <div class="mealItems">
          ${items.length ? items.map(it => foodItemHTML(mealKey, it)).join("") : `<div class="sub">No items yet.</div>`}
        </div>
      </div>
    `;
  };

  const renderFood = () => {
    const iso = state.selectedDate;
    ensureDay(iso);

    $("#uiFoodDateSub").textContent = `Meals for ${iso === todayISO() ? "Today" : fmtDateShort(iso)}`;

    const totals = sumFoodForDay(iso);
    $("#uiFoodTotCals").textContent = `${Math.round(totals.cals)}`;
    $("#uiFoodTotP").textContent = `${Math.round(totals.p)}g`;
    $("#uiFoodTotC").textContent = `${Math.round(totals.c)}g`;
    $("#uiFoodTotF").textContent = `${Math.round(totals.f)}g`;

    const mealHTML = [
      mealCardHTML(iso, "breakfast", "Breakfast"),
      mealCardHTML(iso, "snacks", "Snacks"),
      mealCardHTML(iso, "lunch", "Lunch"),
      mealCardHTML(iso, "dinner", "Dinner")
    ].join("");

    $("#mealList").innerHTML = mealHTML;

    $("#mealList").onclick = (e) => {
      const btn = e.target.closest("button");
      if(!btn) return;
      const action = btn.dataset.action;
      const meal = btn.dataset.meal;
      const id = btn.dataset.id;

      if(action === "addFood") toast("Food library UI coming next");
      if(action === "repeatMeal") toast("Repeat meal coming next");
      if(action === "markMealEaten") toast("Mark meal eaten coming next");
      if(action === "deleteFoodEntry") deleteFoodEntry(iso, meal, id);
      if(action === "markEaten") markFoodEaten(iso, meal, id);
    };
  };

  // Minimal delete + mark eaten (safe)
  const deleteFoodEntry = (iso, mealKey, entryId) => {
    const day = ensureDay(iso);
    day.meals[mealKey] = day.meals[mealKey].filter(x => x.id !== entryId);
    save();
    toast("Deleted ✓");
    renderFood();
    renderToday();
  };

  const markFoodEaten = (iso, mealKey, entryId) => {
    const day = ensureDay(iso);
    const entry = day.meals[mealKey].find(x => x.id === entryId);
    if(!entry) return;
    entry.planned = false;
    entry.logged = true;
    save();
    toast("Updated ✓");
    renderFood();
    renderToday();
  };

  // ---------- Screens ----------
  const setActiveScreen = (name) => {
    $$(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === name));
    $$(".navItem").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
    renderHeaderDate();
    if(name === "today") renderToday();
    if(name === "food") renderFood();
    // workouts/calendar/analytics wired in later after you confirm app loads
  };

  // ---------- Close Day ----------
  const closeDay = (iso) => {
    const day = ensureDay(iso);
    if(day.closed) return;
    if(!canCloseDay(iso)){ toast("Log food/workout"); return; }
    day.closed = true;
    day.closedAt = new Date().toISOString();
    save();
    toast("Day Closed ✓");
    renderToday();
  };

  // ---------- Escape ----------
  function escapeHTML(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){ return escapeHTML(s).replaceAll("\n"," "); }

  // ---------- Wiring ----------
  let state = load();

  const bindNav = () => {
    $$(".navItem").forEach(btn => {
      btn.addEventListener("click", () => setActiveScreen(btn.dataset.nav));
    });
  };

  const bindHeaderDate = () => {
    $("#btnPrevDay").onclick = () => { state.selectedDate = addDays(state.selectedDate, -1); save(); setActiveScreen("today"); };
    $("#btnNextDay").onclick = () => { state.selectedDate = addDays(state.selectedDate, +1); save(); setActiveScreen("today"); };
  };

  const bindCoreButtons = () => {
    $("#modalClose").onclick = () => {};
    $("#btnGoFood").onclick = () => setActiveScreen("food");
    $("#btnGoWorkouts").onclick = () => toast("Workout screen loads after base test");
    $("#btnCloseDay").onclick = () => closeDay(state.selectedDate);
  };

  // ---------- Boot ----------
  const init = () => {
    bindNav();
    bindHeaderDate();
    bindCoreButtons();
    ensureDay(todayISO());
    save();
    setActiveScreen("today");
  };

  init();
})();
