/* Glen Track V2 – single-file app (no frameworks)
   - Dark mode only
   - Food library (saved items)
   - Daily food logging + planned meals
   - Workout planning + completed workouts
   - Weekly weigh-in tracking
   - Today screen auto-updates from stored data
   - Modal guaranteed closable
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Service Worker (GitHub Pages + iOS safe) ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=3").catch(() => {});
    });
  }

  // ---------- Storage ----------
  const KEY = "glen-track-v2-state";
  const todayISO = () => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  };
  const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0,10);
  };
  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
  };
  const weekStartISO = (iso) => {
    const d = new Date(iso + "T00:00:00");
    const day = d.getDay(); // 0 Sun
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0,10);
  };
  const clampNum = (v, fallback=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const defaultState = () => ({
    v: 1,
    selectedDay: todayISO(),
    settings: {
      calorieTarget: 2200,
      proteinTarget: 190,
      weighDay: 1, // Monday default
    },
    // Food library: [{id,name,cals,protein,carbs,fat}]
    foodLibrary: [
      { id: crypto.randomUUID(), name: "Chicken breast (6oz)", cals: 280, protein: 52, carbs: 0, fat: 6 },
      { id: crypto.randomUUID(), name: "Rice (1 cup cooked)", cals: 205, protein: 4, carbs: 45, fat: 0 },
      { id: crypto.randomUUID(), name: "Greek yogurt (1 cup)", cals: 150, protein: 20, carbs: 8, fat: 2 },
      { id: crypto.randomUUID(), name: "Banana (1 medium)", cals: 105, protein: 1, carbs: 27, fat: 0 },
      { id: crypto.randomUUID(), name: "Salmon (6oz)", cals: 360, protein: 39, carbs: 0, fat: 22 },
    ],
    // days[iso] = { closed:boolean, food:{meals:[...]}, workout:{planned:[...], completed:boolean, completedAt?}, weighIn?:{lbs, dateISO} }
    days: {},
    // completed workout history: [{iso, exercises:[...]}]
    workoutHistory: []
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  };

  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  let state = load();

  const ensureDay = (iso) => {
    if (!state.days[iso]) {
      state.days[iso] = {
        closed: false,
        food: { meals: [] }, // meals: [{id,type:'logged'|'planned', title, cals,p,c,f, time?}]
        workout: { planned: [], completed: false },
      };
    }
    return state.days[iso];
  };

  // ---------- Modal (bulletproof close) ----------
  const modalOverlay = $("modalOverlay");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalFoot = $("modalFoot");
  const modalCloseBtn = $("modalClose");

  function openModal({ title, bodyHTML, footHTML }) {
    modalTitle.textContent = title || "Modal";
    modalBody.innerHTML = bodyHTML || "";
    modalFoot.innerHTML = footHTML || "";
    modalOverlay.classList.remove("hidden");
    modalOverlay.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modalOverlay.classList.add("hidden");
    modalOverlay.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
    modalFoot.innerHTML = "";
  }

  // close on X
  modalCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    closeModal();
  });

  // close when tapping outside the modal card
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
  });

  // ---------- Toast ----------
  const toast = $("toast");
  let toastTimer = null;
  function showToast(msg="Updated ✓") {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 1200);
  }

  // ---------- Navigation ----------
  const screens = Array.from(document.querySelectorAll(".screen"));
  const navItems = Array.from(document.querySelectorAll(".navItem"));

  function go(screenName) {
    screens.forEach(s => s.classList.toggle("active", s.dataset.screen === screenName));
    navItems.forEach(b => b.classList.toggle("active", b.dataset.nav === screenName));
    renderAll();
  }

  navItems.forEach(btn => btn.addEventListener("click", () => go(btn.dataset.nav)));

  // ---------- Date Controls ----------
  const uiDateLabel = $("uiDateLabel");
  const btnPrevDay = $("btnPrevDay");
  const btnNextDay = $("btnNextDay");
  const btnPickDay = $("btnPickDay");

  function setSelectedDay(iso) {
    state.selectedDay = iso;
    save();
    renderAll();
  }

  btnPrevDay.addEventListener("click", () => setSelectedDay(addDays(state.selectedDay, -1)));
  btnNextDay.addEventListener("click", () => setSelectedDay(addDays(state.selectedDay, +1)));

  btnPickDay.addEventListener("click", () => {
    const current = state.selectedDay;
    openModal({
      title: "Pick a day",
      bodyHTML: `
        <label class="field">
          <span>Date</span>
          <input id="pickDate" type="date" value="${current}" />
        </label>
      `,
      footHTML: `
        <button class="btn ghost" id="pickCancel">Cancel</button>
        <button class="btn primary" id="pickSave">Set</button>
      `
    });

    $("pickCancel").onclick = closeModal;
    $("pickSave").onclick = () => {
      const v = $("pickDate").value || todayISO();
      closeModal();
      setSelectedDay(v);
    };
  });

  // ---------- Today Screen Elements ----------
  const uiStatusLine = $("uiStatusLine");
  const uiStatusPill = $("uiStatusPill");
  const uiCals = $("uiCals");
  const uiCalsHint = $("uiCalsHint");
  const uiProtein = $("uiProtein");
  const uiProteinHint = $("uiProteinHint");
  const uiCarbs = $("uiCarbs");
  const uiFat = $("uiFat");

  const uiFoodSub = $("uiFoodSub");
  const uiWorkoutSub = $("uiWorkoutSub");
  const uiWeighInSub = $("uiWeighInSub");

  const uiFoodMark = $("uiFoodMark");
  const uiWorkoutMark = $("uiWorkoutMark");
  const uiWeighInMark = $("uiWeighInMark");

  const btnGoFood = $("btnGoFood");
  const btnGoWorkouts = $("btnGoWorkouts");
  const btnWeighIn = $("btnWeighIn");

  const btnQuickLog = $("btnQuickLog");
  const btnCloseDay = $("btnCloseDay");
  const uiCloseHint = $("uiCloseHint");

  btnGoFood.addEventListener("click", () => go("food"));
  btnGoWorkouts.addEventListener("click", () => go("workouts"));

  // ---------- Food Screen Elements ----------
  const uiFoodDateSub = $("uiFoodDateSub");
  const btnFoodLibrary = $("btnFoodLibrary");
  const btnCopyPrevDay = $("btnCopyPrevDay");
  const mealList = $("mealList");
  const uiFoodTotCals = $("uiFoodTotCals");
  const uiFoodTotP = $("uiFoodTotP");
  const uiFoodTotC = $("uiFoodTotC");
  const uiFoodTotF = $("uiFoodTotF");

  // ---------- Workouts Screen Elements ----------
  const uiWorkoutDateSub = $("uiWorkoutDateSub");
  const btnTemplates = $("btnTemplates");
  const btnPlanWorkout = $("btnPlanWorkout");
  const workoutEditor = $("workoutEditor");
  const uiWorkoutStatus = $("uiWorkoutStatus");
  const exerciseEditor = $("exerciseEditor");
  const btnAddExercise = $("btnAddExercise");
  const btnMarkWorkoutComplete = $("btnMarkWorkoutComplete");
  const btnSaveWorkoutLog = $("btnSaveWorkoutLog");
  const workoutHistory = $("workoutHistory");

  // ---------- Calendar ----------
  const btnCalPrev = $("btnCalPrev");
  const btnCalNext = $("btnCalNext");
  const uiCalTitle = $("uiCalTitle");
  const calGrid = $("calGrid");

  // ---------- Analytics ----------
  const btnExport = $("btnExport");
  const uiAnalyticsWeek = $("uiAnalyticsWeek");
  const anClosed = $("anClosed");
  const anWorkouts = $("anWorkouts");
  const anAvgCals = $("anAvgCals");
  const anAvgProtein = $("anAvgProtein");
  const weighInList = $("weighInList");
  const btnLogWeighIn = $("btnLogWeighIn");
  const btnReset = $("btnReset");
  const setCals = $("setCals");
  const setProtein = $("setProtein");
  const setWeighDay = $("setWeighDay");
  const btnSaveSettings = $("btnSaveSettings");

  // ---------- Helpers: totals ----------
  function dayTotals(iso) {
    const day = ensureDay(iso);
    const logged = day.food.meals.filter(m => m.type === "logged");
    const totals = logged.reduce((acc,m) => {
      acc.cals += clampNum(m.cals);
      acc.p += clampNum(m.p);
      acc.c += clampNum(m.c);
      acc.f += clampNum(m.f);
      return acc;
    }, {cals:0,p:0,c:0,f:0});
    return totals;
  }

  function hasFoodLogged(iso) {
    const day = ensureDay(iso);
    return day.food.meals.some(m => m.type === "logged");
  }

  function hasWorkoutCompleted(iso) {
    const day = ensureDay(iso);
    return !!day.workout.completed;
  }

  // ---------- Quick Log ----------
  btnQuickLog.addEventListener("click", () => {
    const iso = state.selectedDay;
    openModal({
      title: "Quick Log",
      bodyHTML: `
        <div class="sub">Fast entry for today. Adds to <b>logged</b> totals.</div>
        <div style="height:10px"></div>

        <label class="field">
          <span>Type</span>
          <select id="qlType">
            <option value="food">Food</option>
            <option value="workout">Workout complete</option>
            <option value="weigh">Weekly weigh-in</option>
          </select>
        </label>

        <div id="qlForm"></div>
      `,
      footHTML: `
        <button class="btn ghost" id="qlCancel">Cancel</button>
        <button class="btn primary" id="qlSave">Save</button>
      `
    });

    const qlForm = $("qlForm");
    const qlType = $("qlType");

    const renderQL = () => {
      const t = qlType.value;
      if (t === "food") {
        qlForm.innerHTML = `
          <label class="field"><span>Food name</span><input id="qlName" placeholder="e.g., Chicken + rice" /></label>
          <div class="exInputs" style="grid-template-columns:repeat(4,1fr)">
            <input id="qlCals" inputmode="numeric" placeholder="Cals" />
            <input id="qlP" inputmode="numeric" placeholder="Protein" />
            <input id="qlC" inputmode="numeric" placeholder="Carbs" />
            <input id="qlF" inputmode="numeric" placeholder="Fat" />
          </div>
          <label style="display:flex;gap:10px;align-items:center;margin-top:10px">
            <input id="qlSaveToLib" type="checkbox" />
            <span class="sub">Save this item to Food Library</span>
          </label>
        `;
      } else if (t === "workout") {
        qlForm.innerHTML = `
          <div class="sub">Marks workout completed for <b>${fmtDate(iso)}</b>.</div>
        `;
      } else {
        qlForm.innerHTML = `
          <label class="field"><span>Weight (lbs)</span><input id="qlLbs" inputmode="decimal" placeholder="e.g., 195.0" /></label>
          <div class="sub">Tip: one weigh-in per week (recommended).</div>
        `;
      }
    };

    qlType.addEventListener("change", renderQL);
    renderQL();

    $("qlCancel").onclick = closeModal;
    $("qlSave").onclick = () => {
      const t = qlType.value;
      const day = ensureDay(iso);

      if (t === "food") {
        const name = ($("qlName").value || "").trim() || "Food";
        const cals = clampNum($("qlCals").value);
        const p = clampNum($("qlP").value);
        const c = clampNum($("qlC").value);
        const f = clampNum($("qlF").value);

        day.food.meals.push({
          id: crypto.randomUUID(),
          type: "logged",
          title: name,
          cals, p, c, f,
          time: new Date().toISOString()
        });

        if ($("qlSaveToLib").checked) {
          state.foodLibrary.unshift({ id: crypto.randomUUID(), name, cals, protein:p, carbs:c, fat:f });
        }

        save();
        closeModal();
        showToast("Food logged ✓");
        renderAll();
        return;
      }

      if (t === "workout") {
        day.workout.completed = true;
        day.workout.completedAt = new Date().toISOString();

        // Save snapshot to workoutHistory if planned exists
        if (day.workout.planned?.length) {
          state.workoutHistory.unshift({ iso, exercises: JSON.parse(JSON.stringify(day.workout.planned)) });
          state.workoutHistory = state.workoutHistory.slice(0, 50);
        }

        save();
        closeModal();
        showToast("Workout complete ✓");
        renderAll();
        return;
      }

      // weigh
      const lbs = clampNum($("qlLbs").value, NaN);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        showToast("Enter weight");
        return;
      }
      day.weighIn = { lbs, dateISO: iso };
      save();
      closeModal();
      showToast("Weigh-in saved ✓");
      renderAll();
    };
  });

  // ---------- Close Day ----------
  btnCloseDay.addEventListener("click", () => {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    day.closed = true;
    save();
    showToast("Day closed ✓");
    renderAll();
  });

  // ---------- Weigh-in button ----------
  btnWeighIn.addEventListener("click", () => {
    const iso = state.selectedDay;
    openModal({
      title: "Weekly weigh-in",
      bodyHTML: `
        <div class="sub">Log your weight for <b>${fmtDate(iso)}</b>.</div>
        <div style="height:10px"></div>
        <label class="field">
          <span>Weight (lbs)</span>
          <input id="wiLbs" inputmode="decimal" placeholder="e.g., 195.0" />
        </label>
        <div class="sub">Recommended: one entry per week.</div>
      `,
      footHTML: `
        <button class="btn ghost" id="wiCancel">Cancel</button>
        <button class="btn primary" id="wiSave">Save</button>
      `
    });

    $("wiCancel").onclick = closeModal;
    $("wiSave").onclick = () => {
      const lbs = clampNum($("wiLbs").value, NaN);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        showToast("Enter weight");
        return;
      }
      const day = ensureDay(iso);
      day.weighIn = { lbs, dateISO: iso };
      save();
      closeModal();
      showToast("Weigh-in saved ✓");
      renderAll();
    };
  });

  // ---------- Food: Library ----------
  btnFoodLibrary.addEventListener("click", () => {
    const rows = state.foodLibrary.map(item => `
      <div class="listItem">
        <div class="listTitle">${escapeHTML(item.name)}</div>
        <div class="listSub">${item.cals} cals · P ${item.protein} · C ${item.carbs} · F ${item.fat}</div>
        <div class="listActions">
          <button class="btn primary" data-add="${item.id}">Log</button>
          <button class="btn ghost" data-plan="${item.id}">Plan</button>
          <button class="btn danger ghost" data-del="${item.id}">Delete</button>
        </div>
      </div>
    `).join("");

    openModal({
      title: "Food Library",
      bodyHTML: `
        <div class="sub">Tap <b>Log</b> to count it today. Tap <b>Plan</b> to schedule without counting.</div>
        <div style="height:10px"></div>
        <div class="list">${rows || `<div class="sub">No saved items yet.</div>`}</div>
        <div style="height:12px"></div>
        <div class="divider"></div>
        <div class="h2">Add new</div>
        <div style="height:10px"></div>
        <label class="field"><span>Name</span><input id="libName" placeholder="e.g., Salmon + rice" /></label>
        <div class="exInputs" style="grid-template-columns:repeat(4,1fr)">
          <input id="libCals" inputmode="numeric" placeholder="Cals" />
          <input id="libP" inputmode="numeric" placeholder="Protein" />
          <input id="libC" inputmode="numeric" placeholder="Carbs" />
          <input id="libF" inputmode="numeric" placeholder="Fat" />
        </div>
      `,
      footHTML: `
        <button class="btn ghost" id="libClose">Close</button>
        <button class="btn primary" id="libAdd">Save Item</button>
      `
    });

    // actions
    modalBody.querySelectorAll("[data-add]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-add");
      const item = state.foodLibrary.find(x => x.id === id);
      if (!item) return;
      logFoodFromLibrary(item, "logged");
      showToast("Food logged ✓");
      renderAll();
    }));

    modalBody.querySelectorAll("[data-plan]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-plan");
      const item = state.foodLibrary.find(x => x.id === id);
      if (!item) return;
      logFoodFromLibrary(item, "planned");
      showToast("Planned ✓");
      renderAll();
    }));

    modalBody.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      state.foodLibrary = state.foodLibrary.filter(x => x.id !== id);
      save();
      closeModal();
      showToast("Deleted ✓");
      renderAll();
    }));

    $("libClose").onclick = closeModal;
    $("libAdd").onclick = () => {
      const name = ($("libName").value || "").trim();
      if (!name) { showToast("Add a name"); return; }
      const cals = clampNum($("libCals").value);
      const protein = clampNum($("libP").value);
      const carbs = clampNum($("libC").value);
      const fat = clampNum($("libF").value);

      state.foodLibrary.unshift({ id: crypto.randomUUID(), name, cals, protein, carbs, fat });
      save();
      closeModal();
      showToast("Saved ✓");
      renderAll();
    };
  });

  function logFoodFromLibrary(item, type) {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    day.food.meals.push({
      id: crypto.randomUUID(),
      type,
      title: item.name,
      cals: item.cals,
      p: item.protein,
      c: item.carbs,
      f: item.fat,
      time: new Date().toISOString()
    });
    save();
  }

  // Copy yesterday -> planned meals copy as planned + logged copy as logged (keeps behavior simple)
  btnCopyPrevDay.addEventListener("click", () => {
    const iso = state.selectedDay;
    const prev = addDays(iso, -1);
    const prevDay = ensureDay(prev);
    const curDay = ensureDay(iso);
    curDay.food.meals = JSON.parse(JSON.stringify(prevDay.food.meals || []));
    save();
    showToast("Copied ✓");
    renderAll();
  });

  // ---------- Workouts: templates + editor ----------
  const exerciseLibrary = [
    "Bench Press","Incline DB Press","Push-ups","Overhead Press","Lateral Raises",
    "Pull-ups","Lat Pulldown","Barbell Row","DB Row","Face Pulls",
    "Squat","Front Squat","Leg Press","RDL","Deadlift",
    "Lunges","Leg Curl","Leg Extension","Calf Raises",
    "Bicep Curls","Hammer Curls","Tricep Pushdown","Skull Crushers",
    "Plank","Hanging Leg Raise","Cable Crunch","Farmer Carry"
  ];

  btnTemplates.addEventListener("click", () => {
    const templates = [
      { name:"Full Body A", ex:[
        {name:"Squat", sets:3, reps:8, weight:""},
        {name:"Bench Press", sets:3, reps:8, weight:""},
        {name:"Barbell Row", sets:3, reps:10, weight:""},
        {name:"Plank", sets:3, reps:45, weight:"sec"},
      ]},
      { name:"Full Body B", ex:[
        {name:"Deadlift", sets:3, reps:5, weight:""},
        {name:"Overhead Press", sets:3, reps:8, weight:""},
        {name:"Lat Pulldown", sets:3, reps:10, weight:""},
        {name:"Bicep Curls", sets:3, reps:12, weight:""},
      ]},
    ];

    openModal({
      title: "Templates",
      bodyHTML: `
        <div class="sub">Apply a template to the selected day.</div>
        <div style="height:10px"></div>
        <div class="list">
          ${templates.map((t,i)=>`
            <div class="listItem">
              <div class="listTitle">${t.name}</div>
              <div class="listSub">${t.ex.map(x=>x.name).join(" · ")}</div>
              <div class="listActions">
                <button class="btn primary" data-t="${i}">Use</button>
              </div>
            </div>
          `).join("")}
        </div>
      `,
      footHTML: `<button class="btn ghost" id="tplClose">Close</button>`
    });
    $("tplClose").onclick = closeModal;

    modalBody.querySelectorAll("[data-t]").forEach(btn => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-t"));
      const t = templates[idx];
      const day = ensureDay(state.selectedDay);
      day.workout.planned = JSON.parse(JSON.stringify(t.ex));
      day.workout.completed = false;
      save();
      closeModal();
      showToast("Planned ✓");
      renderAll();
    }));
  });

  btnPlanWorkout.addEventListener("click", () => {
    const day = ensureDay(state.selectedDay);
    if (!day.workout.planned.length) {
      day.workout.planned = [{ name:"Bench Press", sets:3, reps:8, weight:"" }];
    }
    save();
    workoutEditor.classList.remove("hidden");
    renderWorkoutEditor();
  });

  btnAddExercise.addEventListener("click", () => {
    openModal({
      title: "Add exercise",
      bodyHTML: `
        <div class="sub">Choose from the list (more coming).</div>
        <div style="height:10px"></div>
        <div class="list">
          ${exerciseLibrary.map(name=>`
            <div class="listItem">
              <div class="listTitle">${escapeHTML(name)}</div>
              <div class="listActions">
                <button class="btn primary" data-ex="${escapeAttr(name)}">Add</button>
              </div>
            </div>
          `).join("")}
        </div>
      `,
      footHTML: `<button class="btn ghost" id="exClose">Close</button>`
    });
    $("exClose").onclick = closeModal;

    modalBody.querySelectorAll("[data-ex]").forEach(btn => btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-ex");
      const day = ensureDay(state.selectedDay);
      day.workout.planned.push({ name, sets:3, reps:10, weight:"" });
      save();
      closeModal();
      showToast("Added ✓");
      renderAll();
    }));
  });

  btnMarkWorkoutComplete.addEventListener("click", () => {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    day.workout.completed = true;
    day.workout.completedAt = new Date().toISOString();
    if (day.workout.planned?.length) {
      state.workoutHistory.unshift({ iso, exercises: JSON.parse(JSON.stringify(day.workout.planned)) });
      state.workoutHistory = state.workoutHistory.slice(0, 50);
    }
    save();
    showToast("Workout complete ✓");
    renderAll();
  });

  btnSaveWorkoutLog.addEventListener("click", () => {
    save();
    showToast("Workout saved ✓");
    renderAll();
  });

  function renderWorkoutEditor() {
    const day = ensureDay(state.selectedDay);
    const planned = day.workout.planned || [];
    exerciseEditor.innerHTML = planned.map((ex, idx) => `
      <div class="exRow">
        <div class="exTop">
          <div class="exName">${escapeHTML(ex.name)}</div>
          <button class="btn danger ghost" data-del-ex="${idx}">Remove</button>
        </div>
        <div class="exInputs">
          <input data-sets="${idx}" inputmode="numeric" placeholder="Sets" value="${escapeAttr(ex.sets ?? "")}" />
          <input data-reps="${idx}" inputmode="numeric" placeholder="Reps" value="${escapeAttr(ex.reps ?? "")}" />
          <input data-wt="${idx}" placeholder="Weight" value="${escapeAttr(ex.weight ?? "")}" />
        </div>
      </div>
    `).join("");

    exerciseEditor.querySelectorAll("[data-del-ex]").forEach(btn => btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-del-ex"));
      day.workout.planned.splice(i,1);
      save();
      showToast("Removed ✓");
      renderAll();
    }));

    exerciseEditor.querySelectorAll("[data-sets]").forEach(inp => inp.addEventListener("input", () => {
      const i = Number(inp.getAttribute("data-sets"));
      day.workout.planned[i].sets = clampNum(inp.value);
      save();
    }));
    exerciseEditor.querySelectorAll("[data-reps]").forEach(inp => inp.addEventListener("input", () => {
      const i = Number(inp.getAttribute("data-reps"));
      day.workout.planned[i].reps = clampNum(inp.value);
      save();
    }));
    exerciseEditor.querySelectorAll("[data-wt]").forEach(inp => inp.addEventListener("input", () => {
      const i = Number(inp.getAttribute("data-wt"));
      day.workout.planned[i].weight = inp.value;
      save();
    }));
  }

  // ---------- Calendar ----------
  let calAnchor = new Date(state.selectedDay + "T00:00:00");
  calAnchor.setDate(1);

  btnCalPrev.addEventListener("click", () => {
    calAnchor.setMonth(calAnchor.getMonth() - 1);
    renderCalendar();
  });
  btnCalNext.addEventListener("click", () => {
    calAnchor.setMonth(calAnchor.getMonth() + 1);
    renderCalendar();
  });

  function renderCalendar() {
    const y = calAnchor.getFullYear();
    const m = calAnchor.getMonth();
    const title = new Date(y, m, 1).toLocaleDateString(undefined, { month:"long", year:"numeric" });
    uiCalTitle.textContent = title;

    const first = new Date(y, m, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();

    const cells = [];
    for (let i=0;i<startDay;i++) cells.push(null);
    for (let d=1; d<=daysInMonth; d++) {
      const iso = new Date(y, m, d).toISOString().slice(0,10);
      cells.push(iso);
    }

    calGrid.innerHTML = cells.map(iso => {
      if (!iso) return `<div class="calCell" style="opacity:.22;pointer-events:none"></div>`;
      const day = ensureDay(iso);
      const dots = [];
      if (day.closed) dots.push(`<span class="dot dotClosed"></span>`);
      if (day.food.meals.some(x=>x.type==="logged")) dots.push(`<span class="dot dotFood"></span>`);
      if (day.workout.completed) dots.push(`<span class="dot dotWo"></span>`);
      if (day.food.meals.some(x=>x.type==="planned") || (day.workout.planned?.length && !day.workout.completed)) {
        dots.push(`<span class="dot dotPlanned"></span>`);
      }
      const dd = Number(iso.slice(8,10));
      return `
        <div class="calCell" data-iso="${iso}">
          <div class="d">${dd}</div>
          <div class="dots">${dots.join("")}</div>
        </div>
      `;
    }).join("");

    calGrid.querySelectorAll("[data-iso]").forEach(cell => cell.addEventListener("click", () => {
      const iso = cell.getAttribute("data-iso");
      setSelectedDay(iso);
      go("today");
    }));
  }

  // ---------- Analytics / Settings ----------
  btnSaveSettings.addEventListener("click", () => {
    state.settings.calorieTarget = clampNum(setCals.value, 2200);
    state.settings.proteinTarget = clampNum(setProtein.value, 190);
    state.settings.weighDay = clampNum(setWeighDay.value, 1);
    save();
    showToast("Saved ✓");
    renderAll();
  });

  btnReset.addEventListener("click", () => {
    openModal({
      title: "Reset all data?",
      bodyHTML: `<div class="sub">This will wipe food logs, workouts, and weigh-ins on this device.</div>`,
      footHTML: `
        <button class="btn ghost" id="rCancel">Cancel</button>
        <button class="btn danger" id="rYes">Reset</button>
      `
    });
    $("rCancel").onclick = closeModal;
    $("rYes").onclick = () => {
      state = defaultState();
      save();
      closeModal();
      showToast("Reset ✓");
      renderAll();
      go("today");
    };
  });

  btnLogWeighIn.addEventListener("click", () => btnWeighIn.click());

  btnExport.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glen-track-export-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Exported ✓");
  });

  // ---------- Rendering ----------
  function renderAll() {
    const iso = state.selectedDay;
    ensureDay(iso);

    // Date label
    uiDateLabel.textContent = (iso === todayISO()) ? "Today" : fmtDate(iso);

    // Settings inputs
    setCals.value = String(state.settings.calorieTarget ?? 2200);
    setProtein.value = String(state.settings.proteinTarget ?? 190);
    setWeighDay.value = String(state.settings.weighDay ?? 1);

    renderToday();
    renderFood();
    renderWorkouts();
    renderCalendar();
    renderAnalytics();
  }

  function renderToday() {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    const totals = dayTotals(iso);

    const cTarget = state.settings.calorieTarget ?? 2200;
    const pTarget = state.settings.proteinTarget ?? 190;

    uiCals.textContent = `${totals.cals} / ${cTarget}`;
    uiCalsHint.textContent = `${Math.max(0, cTarget - totals.cals)} remaining`;
    uiProtein.textContent = `${totals.p} / ${pTarget}g`;
    uiProteinHint.textContent = `${Math.max(0, pTarget - totals.p)}g remaining`;

    uiCarbs.textContent = `${totals.c}g`;
    uiFat.textContent = `${totals.f}g`;

    const status = day.closed ? "Closed" : "In Progress";
    uiStatusLine.textContent = `Status: ${status}`;
    uiStatusPill.textContent = status;

    // Food summary
    const loggedMeals = day.food.meals.filter(m => m.type === "logged").length;
    uiFoodSub.textContent = loggedMeals ? `${loggedMeals} item(s) logged` : "Not logged";
    uiFoodMark.textContent = loggedMeals ? "✓" : "—";

    // Workout summary
    if (day.workout.completed) {
      uiWorkoutSub.textContent = "Completed";
      uiWorkoutMark.textContent = "✓";
    } else if (day.workout.planned?.length) {
      uiWorkoutSub.textContent = `${day.workout.planned.length} exercise(s) planned`;
      uiWorkoutMark.textContent = "•";
    } else {
      uiWorkoutSub.textContent = "Not logged";
      uiWorkoutMark.textContent = "—";
    }

    // Weigh-in (weekly)
    if (day.weighIn?.lbs) {
      uiWeighInSub.textContent = `${day.weighIn.lbs} lbs`;
      uiWeighInMark.textContent = "✓";
    } else {
      uiWeighInSub.textContent = "Weekly only";
      uiWeighInMark.textContent = "—";
    }

    // Close Day enable
    const canClose = !day.closed && (hasFoodLogged(iso) || hasWorkoutCompleted(iso));
    btnCloseDay.disabled = !canClose;
    uiCloseHint.textContent = canClose ? "Ready to close the day." : "Log food or a workout to enable Close Today.";
  }

  function renderFood() {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    uiFoodDateSub.textContent = `Meals for ${iso === todayISO() ? "Today" : fmtDate(iso)}`;

    const totals = dayTotals(iso);
    uiFoodTotCals.textContent = String(totals.cals);
    uiFoodTotP.textContent = String(totals.p);
    uiFoodTotC.textContent = String(totals.c);
    uiFoodTotF.textContent = String(totals.f);

    // Group meals by logged/planned
    const logged = day.food.meals.filter(m => m.type === "logged");
    const planned = day.food.meals.filter(m => m.type === "planned");

    const section = (title, arr) => `
      <div class="card">
        <div class="cardHead">
          <div>
            <div class="h2">${title}</div>
            <div class="sub">${arr.length ? `${arr.length} item(s)` : "None"}</div>
          </div>
          <button class="btn ghost" data-add="${title}">Add</button>
        </div>
        <div class="list">
          ${arr.map(m => `
            <div class="listItem">
              <div class="listTitle">${escapeHTML(m.title)}</div>
              <div class="listSub">${m.cals} cals · P ${m.p} · C ${m.c} · F ${m.f}</div>
              <div class="listActions">
                ${m.type === "planned" ? `<button class="btn primary" data-convert="${m.id}">Log it</button>` : ``}
                <button class="btn danger ghost" data-del-meal="${m.id}">Delete</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    mealList.innerHTML = section("Logged", logged) + section("Planned", planned);

    mealList.querySelectorAll("[data-add]").forEach(btn => btn.addEventListener("click", () => {
      // open library
      btnFoodLibrary.click();
    }));

    mealList.querySelectorAll("[data-del-meal]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-meal");
      day.food.meals = day.food.meals.filter(m => m.id !== id);
      save();
      showToast("Deleted ✓");
      renderAll();
    }));

    mealList.querySelectorAll("[data-convert]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-convert");
      const meal = day.food.meals.find(m => m.id === id);
      if (!meal) return;
      meal.type = "logged";
      save();
      showToast("Logged ✓");
      renderAll();
    }));
  }

  function renderWorkouts() {
    const iso = state.selectedDay;
    const day = ensureDay(iso);
    uiWorkoutDateSub.textContent = `For ${iso === todayISO() ? "Today" : fmtDate(iso)}`;

    if (day.workout.completed) {
      uiWorkoutStatus.textContent = "Workout completed ✓";
      workoutEditor.classList.remove("hidden");
    } else if (day.workout.planned?.length) {
      uiWorkoutStatus.textContent = `${day.workout.planned.length} exercise(s) planned`;
      workoutEditor.classList.remove("hidden");
    } else {
      uiWorkoutStatus.textContent = "No workout planned";
      workoutEditor.classList.add("hidden");
    }

    if (!workoutEditor.classList.contains("hidden")) renderWorkoutEditor();

    // history
    workoutHistory.innerHTML = (state.workoutHistory || []).slice(0,12).map(h => `
      <div class="listItem">
        <div class="listTitle">${fmtDate(h.iso)}</div>
        <div class="listSub">${(h.exercises||[]).map(x=>x.name).join(" · ") || "—"}</div>
      </div>
    `).join("") || `<div class="sub" style="margin-top:10px">No completed workouts yet.</div>`;
  }

  function renderAnalytics() {
    const iso = state.selectedDay;
    const ws = weekStartISO(iso);
    const weekDays = Array.from({length:7}, (_,i)=> addDays(ws, i));

    uiAnalyticsWeek.textContent = `${fmtDate(ws)} → ${fmtDate(addDays(ws,6))}`;

    let closed = 0, workouts = 0, calsSum = 0, pSum = 0, loggedDays = 0;

    for (const d of weekDays) {
      const day = ensureDay(d);
      if (day.closed) closed++;
      if (day.workout.completed) workouts++;
      const t = dayTotals(d);
      if (t.cals > 0 || t.p > 0) {
        loggedDays++;
        calsSum += t.cals;
        pSum += t.p;
      }
    }

    anClosed.textContent = String(closed);
    anWorkouts.textContent = String(workouts);
    anAvgCals.textContent = loggedDays ? String(Math.round(calsSum / loggedDays)) : "—";
    anAvgProtein.textContent = loggedDays ? String(Math.round(pSum / loggedDays)) : "—";

    // weigh-ins list (latest first)
    const allWeigh = Object.keys(state.days)
      .map(k => state.days[k]?.weighIn ? { iso:k, ...state.days[k].weighIn } : null)
      .filter(Boolean)
      .sort((a,b)=> (a.iso < b.iso ? 1 : -1));

    weighInList.innerHTML = allWeigh.slice(0,20).map(w => `
      <div class="listItem">
        <div class="listTitle">${w.lbs} lbs</div>
        <div class="listSub">${fmtDate(w.iso)}</div>
      </div>
    `).join("") || `<div class="sub" style="margin-top:10px">No weigh-ins yet.</div>`;

    // Today screen “This Week” mini stats
    $("uiClosedDays").textContent = `${closed}/7`;
    $("uiWorkoutsWeek").textContent = String(workouts);
    $("uiAvgCals").textContent = loggedDays ? String(Math.round(calsSum / loggedDays)) : "—";
    $("uiAvgProtein").textContent = loggedDays ? String(Math.round(pSum / loggedDays)) : "—";

    // streak
    // streak counts consecutive closed days ending at selected day, going backwards
    let streak = 0;
    let cursor = iso;
    for (;;) {
      const day = ensureDay(cursor);
      if (!day.closed) break;
      streak++;
      cursor = addDays(cursor, -1);
    }
    $("uiStreak").textContent = String(streak);
  }

  // ---------- Tiny escaping helpers ----------
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHTML(s).replace(/"/g,"&quot;");
  }

  // ---------- Start ----------
  renderAll();
})();
