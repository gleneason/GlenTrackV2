/* Glen Track — dark-mode PWA · localStorage only
   Features included:
   - Today w/ momentum ring + close/unclose day
   - Food meals + serving size + quantity + library favorites + search
   - Workouts w/ templates, weight per exercise, rest timer, PR tracking, undo complete, delete
   - Calendar clean layout + preview chips
   - Stats: settings + PR list + weigh-ins
*/

const STORE_KEY = "glentrack.clean.v1";
const $ = (id) => document.getElementById(id);

function toast(msg, undoLabel = "", undoFn = null, ms = 7000){
  const t = $("toast");
  const m = $("toastMsg");
  const b = $("toastBtn");
  if (!t || !m || !b) return;
  m.textContent = msg;
  if (undoFn && undoLabel){
    b.textContent = undoLabel;
    b.style.display = "inline-block";
    b.onclick = () => { try{ undoFn(); }catch{} hideToast(); };
  } else {
    b.style.display = "none";
    b.onclick = null;
  }
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(hideToast, ms);
}
function hideToast(){ $("toast")?.classList.add("hidden"); }

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0,10);
}
function addDaysISO(iso, n){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return new Date(d - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function startOfWeekISO(iso){
  const d = new Date(iso + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // monday=0
  d.setDate(d.getDate() - day);
  return new Date(d - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function weekDates(start){
  return Array.from({length:7}, (_,i)=>addDaysISO(start,i));
}
function uid(p="id"){
  return `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function n0(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function nf(v, d=1){ const x = Number(v); return Number.isFinite(x) ? x : d; }

function load(){
  try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); }
  catch { return fresh(); }
}
function save(d){ localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
function fresh(){ return normalize({}); }

function normalize(d){
  d.version ??= 1;
  d.settings ??= { cals: 2100, protein: 190 };
  d.selectedDate ??= todayISO();

  d.days ??= {}; // per date: { closed:boolean, closedAt, unclosedAt }
  d.weighIns ??= []; // {id,date,lbs}
  d.prs ??= {}; // key: exerciseName -> {bestWeight,bestReps,date}

  d.foodLibrary ??= []; // {id,name,brand,servingSize,calories,protein,carbs,fat,fav:boolean,updatedAt}
  d.foodLog ??= {}; // date -> array of {id,mealType,name,brand,servingSize,qty,calories,protein,carbs,fat,createdAt,updatedAt,deletedAt}

  d.workoutTemplates ??= defaultWorkoutTemplates();
  d.workouts ??= {}; // date -> {id,date,templateId,templateName,restSec,exercises:[{id,group,name,sets,reps,weight,notes}], completed:boolean, completedAt, deletedAt}

  return d;
}

function defaultWorkoutTemplates(){
  return [
    {
      id: "tmpl_fullA",
      name: "Full Body A",
      groups: [
        { group: "Chest", exercises: ["Bench Press", "Incline Dumbbell Press"] },
        { group: "Back", exercises: ["Lat Pulldown", "Seated Row"] },
        { group: "Legs", exercises: ["Squat", "Romanian Deadlift"] },
        { group: "Shoulders", exercises: ["Overhead Press", "Lateral Raises"] },
        { group: "Arms", exercises: ["Bicep Curls", "Tricep Pushdown"] },
        { group: "Core", exercises: ["Plank"] }
      ]
    },
    {
      id: "tmpl_fullB",
      name: "Full Body B",
      groups: [
        { group: "Chest", exercises: ["Dumbbell Bench Press"] },
        { group: "Back", exercises: ["Pull-ups (Assisted)", "One-Arm Dumbbell Row"] },
        { group: "Legs", exercises: ["Leg Press", "Hamstring Curl"] },
        { group: "Shoulders", exercises: ["Arnold Press", "Rear Delt Fly"] },
        { group: "Arms", exercises: ["Hammer Curls", "Skull Crushers"] },
        { group: "Core", exercises: ["Hanging Knee Raise"] }
      ]
    }
  ];
}

const MEALS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
];

function setThemeColor(hex){
  const meta = document.querySelector('meta[name="theme-color"]') || $("metaThemeColor");
  if (meta) meta.setAttribute("content", hex);
}

function showScreen(name){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelector(`.screen[data-screen="${name}"]`)?.classList.add("active");

  document.querySelectorAll(".navItem").forEach(b => {
    b.classList.toggle("active", b.dataset.nav === name);
  });

  const tint = {
    today: "#0B1220",
    food: "#091521",
    workouts: "#08131F",
    calendar: "#0A1624",
    analytics: "#08121D"
  }[name] || "#0B1220";
  setThemeColor(tint);

  render();
}

function selectedDate(){ return load().selectedDate || todayISO(); }
function setSelectedDate(iso){
  const d = load();
  d.selectedDate = iso;
  save(d);
  $("uiDateLabel").textContent = formatNiceDate(iso);
  render();
}

function formatNiceDate(iso){
  const t = todayISO();
  if (iso === t) return "Today";
  if (iso === addDaysISO(t, -1)) return "Yesterday";
  if (iso === addDaysISO(t, 1)) return "Tomorrow";
  return iso;
}

/* -------------------- TODAY / MOMENTUM -------------------- */

function dayHasFood(d, iso){
  const items = (d.foodLog[iso] || []).filter(x => !x.deletedAt);
  return items.length > 0;
}
function dayHasWorkout(d, iso){
  const w = d.workouts[iso];
  return !!(w && !w.deletedAt && (w.completed || (w.exercises?.length>0)));
}
function dayHasWeigh(d, iso){
  return d.weighIns.some(x => x.date === iso);
}
function canCloseDay(d, iso){
  return dayHasFood(d, iso) || dayHasWorkout(d, iso) || dayHasWeigh(d, iso);
}
function isClosed(d, iso){
  return !!d.days[iso]?.closed;
}

function closeDay(){
  const d = load();
  const iso = selectedDate();
  if (!canCloseDay(d, iso)){
    toast("Log food, workout, or weigh-in first.");
    return;
  }
  d.days[iso] ??= {};
  d.days[iso].closed = true;
  d.days[iso].closedAt = new Date().toISOString();
  save(d);
  toast("Day closed ✓", "Undo", () => uncloseDay(true));
  render();
}
function uncloseDay(silent=false){
  const d = load();
  const iso = selectedDate();
  if (!d.days[iso]?.closed) return;
  d.days[iso].closed = false;
  d.days[iso].unclosedAt = new Date().toISOString();
  save(d);
  if (!silent) toast("Day reopened");
  render();
}

function computeMomentum(d, iso){
  let score = 0;
  if (isClosed(d, iso)) score += 60;
  if (dayHasFood(d, iso)) score += 20;
  const w = d.workouts[iso];
  if (w && w.completed && !w.deletedAt) score += 20;
  return Math.max(0, Math.min(100, score));
}

/* -------------------- FOOD -------------------- */

function totalsForFoods(items){
  return items.reduce((a,f)=>{
    const q = nf(f.qty, 1);
    a.cals += n0(f.calories) * q;
    a.p += n0(f.protein) * q;
    a.c += n0(f.carbs) * q;
    a.f += n0(f.fat) * q;
    return a;
  }, {cals:0,p:0,c:0,f:0});
}

function addFoodFromLibraryToMeal(libId, mealKey){
  const d = load();
  const iso = selectedDate();
  const lib = d.foodLibrary.find(x=>x.id===libId);
  if (!lib) return;

  d.foodLog[iso] ??= [];
  d.foodLog[iso].push({
    id: uid("food"),
    mealType: mealKey,
    name: lib.name,
    brand: lib.brand || "",
    servingSize: lib.servingSize || "1 serving",
    qty: 1,
    calories: n0(lib.calories),
    protein: n0(lib.protein),
    carbs: n0(lib.carbs),
    fat: n0(lib.fat),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  save(d);
  render();
  toast("Added from library");
}

function upsertFoodLibrary(entry){
  const d = load();
  const key = (entry.name||"").trim().toLowerCase() + "|" + (entry.brand||"").trim().toLowerCase();
  const existing = d.foodLibrary.find(x => (x.name||"").trim().toLowerCase() + "|" + (x.brand||"").trim().toLowerCase() === key);
  if (existing){
    existing.servingSize = entry.servingSize;
    existing.calories = n0(entry.calories);
    existing.protein = n0(entry.protein);
    existing.carbs = n0(entry.carbs);
    existing.fat = n0(entry.fat);
    existing.updatedAt = new Date().toISOString();
  } else {
    d.foodLibrary.unshift({
      id: uid("lib"),
      name: entry.name,
      brand: entry.brand || "",
      servingSize: entry.servingSize || "1 serving",
      calories: n0(entry.calories),
      protein: n0(entry.protein),
      carbs: n0(entry.carbs),
      fat: n0(entry.fat),
      fav: false,
      updatedAt: new Date().toISOString()
    });
  }
  save(d);
}

function deleteFoodItem(foodId){
  const d = load();
  const iso = selectedDate();
  const arr = d.foodLog[iso] || [];
  const idx = arr.findIndex(x=>x.id===foodId);
  if (idx < 0) return;

  const deleted = {...arr[idx]};
  arr[idx].deletedAt = new Date().toISOString();
  save(d);
  render();

  toast(`Deleted "${deleted.name}"`, "Undo", () => {
    const d2 = load();
    const arr2 = d2.foodLog[iso] || [];
    const f = arr2.find(x=>x.id===foodId);
    if (f){ delete f.deletedAt; save(d2); render(); toast("Restored"); }
  });
}

function copyYesterdayFoods(){
  const d = load();
  const iso = selectedDate();
  const prev = addDaysISO(iso, -1);
  const prevItems = (d.foodLog[prev] || []).filter(x=>!x.deletedAt);
  if (!prevItems.length){ toast("No foods yesterday"); return; }

  d.foodLog[iso] ??= [];
  const cloned = prevItems.map(x=>({
    ...x,
    id: uid("food"),
    date: iso,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: undefined
  }));
  d.foodLog[iso].push(...cloned);
  save(d);
  render();
  toast("Copied yesterday");
}

/* -------------------- WORKOUTS -------------------- */

function seedExercisesFromTemplate(tmpl){
  const arr = [];
  tmpl.groups.forEach(g=>{
    g.exercises.forEach(name=>{
      arr.push({
        id: uid("ex"),
        group: g.group,
        name,
        sets: 3,
        reps: 10,
        weight: 0,
        notes: ""
      });
    });
  });
  return arr;
}

function planWorkout(){
  const d = load();
  const iso = selectedDate();
  const tmpl = d.workoutTemplates[0];
  if (!tmpl){ toast("No templates yet"); return; }

  d.workouts[iso] = {
    id: uid("wo"),
    date: iso,
    templateId: tmpl.id,
    templateName: tmpl.name,
    restSec: 90,
    exercises: seedExercisesFromTemplate(tmpl),
    completed: false,
    completedAt: null
  };
  save(d);
  render();
  toast("Workout planned");
}

function saveWorkout(){
  const d = load();
  const iso = selectedDate();
  const w = d.workouts[iso];
  if (!w) return;

  w.restSec = n0($("woRestSec")?.value) || w.restSec || 90;

  w.exercises.forEach(ex=>{
    const key = (ex.name||"").trim();
    if (!key) return;
    const best = d.prs[key] || { bestWeight: 0, bestReps: 0, date: null };
    const weight = n0(ex.weight);
    const reps = n0(ex.reps);
    const improved = (weight > best.bestWeight) || (weight === best.bestWeight && reps > best.bestReps);
    if (improved){
      d.prs[key] = { bestWeight: weight, bestReps: reps, date: iso };
    }
  });

  save(d);
  render();
  toast("Saved");
}

function deleteWorkout(){
  const d = load();
  const iso = selectedDate();
  const w = d.workouts[iso];
  if (!w) return;
  w.deletedAt = new Date().toISOString();
  save(d);
  render();
  toast("Workout deleted", "Undo", () => {
    const d2 = load();
    const w2 = d2.workouts[iso];
    if (w2){ delete w2.deletedAt; save(d2); render(); toast("Restored"); }
  });
}

function markWorkoutComplete(){
  const d = load();
  const iso = selectedDate();
  const w = d.workouts[iso];
  if (!w || w.deletedAt) return;

  w.completed = true;
  w.completedAt = new Date().toISOString();
  save(d);
  render();
  toast("Workout completed ✓", "Undo", () => undoWorkoutComplete());
}
function undoWorkoutComplete(){
  const d = load();
  const iso = selectedDate();
  const w = d.workouts[iso];
  if (!w || w.deletedAt) return;

  w.completed = false;
  w.completedAt = null;
  save(d);
  render();
  toast("Marked incomplete");
}

function groupExerciseLibrary(d){
  const lib = {
    "Chest": ["Bench Press","Incline Dumbbell Press","Dumbbell Fly","Push-ups"],
    "Back": ["Lat Pulldown","Seated Row","Pull-ups (Assisted)","One-Arm Dumbbell Row","Face Pull"],
    "Legs": ["Squat","Leg Press","Romanian Deadlift","Hamstring Curl","Leg Extension","Calf Raise"],
    "Shoulders": ["Overhead Press","Arnold Press","Lateral Raises","Rear Delt Fly"],
    "Arms": ["Bicep Curls","Hammer Curls","Tricep Pushdown","Skull Crushers"],
    "Core": ["Plank","Hanging Knee Raise","Cable Crunch"]
  };

  (d.workoutTemplates || []).forEach(t=>{
    (t.groups||[]).forEach(g=>{
      lib[g.group] ??= [];
      (g.exercises||[]).forEach(name=>{
        if (!lib[g.group].includes(name)) lib[g.group].push(name);
      });
    });
  });

  Object.keys(lib).forEach(k => lib[k] = lib[k].slice().sort((a,b)=>a.localeCompare(b)));
  return lib;
}

/* -------------------- MODAL -------------------- */

function openModal(title, bodyNode, footerButtons=[]){
  $("modalTitle").textContent = title;
  const body = $("modalBody");
  const foot = $("modalFoot");
  body.innerHTML = "";
  foot.innerHTML = "";

  if (bodyNode) body.appendChild(bodyNode);

  footerButtons.forEach(b=>{
    const btn = document.createElement("button");
    btn.className = "btn " + (b.kind || "ghost");
    btn.textContent = b.label;
    btn.onclick = b.onClick;
    foot.appendChild(btn);
  });

  $("modalOverlay").classList.remove("hidden");
  $("modalOverlay").setAttribute("aria-hidden","false");
}
function closeModal(){
  $("modalOverlay").classList.add("hidden");
  $("modalOverlay").setAttribute("aria-hidden","true");
  $("modalBody").innerHTML = "";
  $("modalFoot").innerHTML = "";
}
$("modalClose")?.addEventListener("click", closeModal);
$("modalOverlay")?.addEventListener("click", (e)=>{
  if (e.target?.id === "modalOverlay") closeModal();
});

/* -------------------- RENDER (minimal) -------------------- */

function render(){
  const d = load();
  const iso = selectedDate();
  $("uiDateLabel").textContent = formatNiceDate(iso);

  // Always refresh Today
  renderToday(d, iso);

  const active = document.querySelector(".screen.active")?.dataset?.screen || "today";
  if (active === "analytics") renderStats(d);
}

/* Basic Today render (macros come from food log) */
function renderToday(d, iso){
  const foodItems = (d.foodLog[iso] || []).filter(x=>!x.deletedAt);
  const foodTotals = totalsForFoods(foodItems);

  $("uiCals").textContent = Math.round(foodTotals.cals) || "0";
  $("uiProtein").textContent = Math.round(foodTotals.p) || "0";
  $("uiCarbs").textContent = Math.round(foodTotals.c) || "0";
  $("uiFat").textContent = Math.round(foodTotals.f) || "0";

  const calGoal = n0(d.settings.cals) || 2100;
  const proGoal = n0(d.settings.protein) || 190;

  $("uiCalsHint").textContent = `${Math.max(0, Math.round(calGoal - foodTotals.cals))} left · goal ${calGoal}`;
  $("uiProteinHint").textContent = `${Math.max(0, Math.round(proGoal - foodTotals.p))} left · goal ${proGoal}`;

  const barC = $("barCals"); if (barC) barC.style.width = `${Math.min(100, Math.round((foodTotals.cals / Math.max(1, calGoal))*100))}%`;
  const barP = $("barProtein"); if (barP) barP.style.width = `${Math.min(100, Math.round((foodTotals.p / Math.max(1, proGoal))*100))}%`;

  $("uiFoodSub").textContent = foodItems.length ? `${foodItems.length} items logged` : "Not logged";
  $("uiFoodMark").textContent = foodItems.length ? "✓" : "—";

  const w = d.workouts[iso] && !d.workouts[iso].deletedAt ? d.workouts[iso] : null;
  $("uiWorkoutSub").textContent = w ? (w.completed ? "Completed" : "Planned / in progress") : "Not logged";
  $("uiWorkoutMark").textContent = w && w.completed ? "✓" : (w ? "•" : "—");

  $("uiWeighInMark").textContent = dayHasWeigh(d, iso) ? "✓" : "—";
  $("uiWeighInSub").textContent = dayHasWeigh(d, iso) ? "Logged" : "Weekly check";

  const closed = isClosed(d, iso);
  const closable = canCloseDay(d, iso);

  $("btnCloseDay").disabled = closed || !closable;
  $("btnUndoCloseDay").disabled = !closed;

  $("uiStatusPill").textContent = closed ? "Closed" : "In Progress";
  $("uiStatusLine").textContent = closed ? "Status: Closed" : "Status: In Progress";
  $("uiCloseHint").textContent = closed
    ? "Day is closed. You can unclose it if you did it by mistake."
    : (closable ? "Ready. Close the day when you're done." : "Log food OR a workout OR a weigh-in to enable Close Today.");

  const pct = computeMomentum(d, iso);
  const ringPct = $("uiRingPct"); if (ringPct) ringPct.textContent = `${pct}%`;
  const ring = $("uiRing");
  if (ring){
    const c = 302;
    ring.style.strokeDasharray = String(c);
    ring.style.strokeDashoffset = String(c - (pct/100)*c);
  }

  const ws = startOfWeekISO(iso);
  const days = weekDates(ws);
  const closedDays = days.filter(x => isClosed(d, x)).length;
  const workouts = days.filter(x => d.workouts[x] && !d.workouts[x].deletedAt && d.workouts[x].completed).length;

  const totals = days.map(x => totalsForFoods((d.foodLog[x]||[]).filter(a=>!a.deletedAt)));
  const avgCals = Math.round(totals.reduce((s,t)=>s+t.cals,0) / Math.max(1, totals.filter(t=>t.cals>0).length || 1));
  const avgProtein = Math.round(totals.reduce((s,t)=>s+t.p,0) / Math.max(1, totals.filter(t=>t.p>0).length || 1));

  $("uiClosedDays").textContent = String(closedDays);
  $("uiWorkoutsWeek").textContent = String(workouts);
  $("uiAvgCals").textContent = avgCals ? String(avgCals) : "—";
  $("uiAvgProtein").textContent = avgProtein ? String(avgProtein) : "—";
  $("uiStreak").textContent = String(computeStreak(d));
}

function computeStreak(d){
  let iso = todayISO();
  let count = 0;
  for (let i=0;i<365;i++){
    if (isClosed(d, iso)){ count++; iso = addDaysISO(iso, -1); }
    else break;
  }
  return count;
}

/* Stats (Settings + PRs + weigh-ins) */
function renderStats(d){
  const setCals = $("setCals"); if (setCals) setCals.value = d.settings.cals ?? 2100;
  const setProtein = $("setProtein"); if (setProtein) setProtein.value = d.settings.protein ?? 190;

  const prList = $("prList");
  if (prList){
    prList.innerHTML = "";
    const keys = Object.keys(d.prs || {}).sort((a,b)=>a.localeCompare(b));
    if (!keys.length){
      const empty = document.createElement("div");
      empty.className="subtle";
      empty.textContent="No PRs yet. Save workouts with weights.";
      prList.appendChild(empty);
    } else {
      keys.forEach(k=>{
        const pr = d.prs[k];
        const it = document.createElement("div");
        it.className="item";
        it.innerHTML = `
          <div class="itemLeft">
            <div class="itemTitle">${esc(k)}</div>
            <div class="itemSub">${pr.bestWeight} lb × ${pr.bestReps} reps · ${pr.date || ""}</div>
          </div>
        `;
        prList.appendChild(it);
      });
    }
  }

  const wl = $("weighList");
  if (wl){
    wl.innerHTML = "";
    const wItems = (d.weighIns || []).slice().sort((a,b)=>b.date.localeCompare(a.date));
    if (!wItems.length){
      const empty = document.createElement("div");
      empty.className="subtle";
      empty.textContent="No weigh-ins yet.";
      wl.appendChild(empty);
    } else {
      wItems.forEach(x=>{
        const it = document.createElement("div");
        it.className="item";
        it.innerHTML = `
          <div class="itemLeft">
            <div class="itemTitle">${x.date}</div>
            <div class="itemSub">${Number(x.lbs).toFixed(1)} lb</div>
          </div>
          <div class="itemRight">
            <button class="btn danger ghost" data-del>Delete</button>
          </div>
        `;
        it.querySelector("[data-del]").onclick = ()=>{
          const d2 = load();
          d2.weighIns = d2.weighIns.filter(w=>w.id!==x.id);
          save(d2);
          render();
          toast("Deleted");
        };
        wl.appendChild(it);
      });
    }
  }
}

/* -------------------- BOOT -------------------- */

function hideLaunchOverlay(){
  const o = $("launchOverlay");
  if (!o) return;
  o.classList.add("hide");
  setTimeout(()=> o.remove(), 550);
}

function logWeighIn(){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <label class="field">
      <span>Weight (lb)</span>
      <input id="wLbs" type="number" inputmode="decimal" step="0.1" placeholder="195.0" />
    </label>
    <div class="subtle">Logged to selected day.</div>
  `;
  openModal("Log weigh-in", wrap, [
    { label:"Cancel", kind:"ghost", onClick: closeModal },
    { label:"Save", kind:"primary", onClick: ()=>{
      const lbs = n0(wrap.querySelector("#wLbs").value);
      if (!lbs){ toast("Enter weight"); return; }
      const d = load();
      const iso = selectedDate();
      d.weighIns.unshift({ id: uid("w"), date: iso, lbs });
      save(d);
      closeModal();
      render();
      toast("Weigh-in saved");
    }}
  ]);
}

function boot(){
  document.querySelectorAll(".navItem").forEach(b=>{
    b.addEventListener("click", ()=> showScreen(b.dataset.nav));
  });

  $("btnPrevDay")?.addEventListener("click", ()=> setSelectedDate(addDaysISO(selectedDate(), -1)));
  $("btnNextDay")?.addEventListener("click", ()=> setSelectedDate(addDaysISO(selectedDate(), 1)));
  $("btnPickDay")?.addEventListener("click", ()=>{
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <label class="field">
        <span>Select date</span>
        <input id="pickDate" type="date" value="${selectedDate()}" />
      </label>
    `;
    openModal("Pick a day", wrap, [
      { label:"Close", kind:"ghost", onClick: closeModal },
      { label:"Go", kind:"primary", onClick: ()=>{
        const val = wrap.querySelector("#pickDate").value || todayISO();
        closeModal();
        setSelectedDate(val);
      }}
    ]);
  });

  $("btnGoFood")?.addEventListener("click", ()=> showScreen("food"));
  $("btnGoWorkouts")?.addEventListener("click", ()=> showScreen("workouts"));

  $("btnCloseDay")?.addEventListener("click", closeDay);
  $("btnUndoCloseDay")?.addEventListener("click", ()=> uncloseDay(false));

  $("btnWeighIn")?.addEventListener("click", logWeighIn);

  $("btnSaveSettings")?.addEventListener("click", ()=>{
    const d = load();
    d.settings.cals = n0($("setCals")?.value) || 2100;
    d.settings.protein = n0($("setProtein")?.value) || 190;
    save(d);
    render();
    toast("Settings saved");
  });

  $("btnReset")?.addEventListener("click", ()=>{
    localStorage.removeItem(STORE_KEY);
    toast("Reset complete");
    render();
  });

  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("service-worker.js?v=2026.03.01").catch(()=>{});
  }

  const d = load();
  $("uiDateLabel").textContent = formatNiceDate(d.selectedDate || todayISO());

  window.addEventListener("load", ()=> setTimeout(hideLaunchOverlay, 550));
  render();
}

boot();