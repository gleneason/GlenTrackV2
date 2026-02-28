/* Glen Track V2 — app.js (Style C wired) */

const state = {
  dayOffset: 0, // 0 = today
  modalOpen: false,
};

const goals = {
  calories: 2200,
  protein: 190,
};

function fmtDayLabel(offset) {
  if (offset === 0) return "Today";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function openModal() {
  state.modalOpen = true;
  render();
}

function closeModal() {
  state.modalOpen = false;
  render();
}

function shiftDay(delta) {
  state.dayOffset += delta;
  render();
}

function appTemplate() {
  const dayLabel = fmtDayLabel(state.dayOffset);

  // placeholder "logged" numbers for now
  const consumedCalories = 0;
  const consumedProtein = 0;
  const carbs = 0;
  const fat = 0;

  const canCloseToday = false;

  return `
    <div class="gt-shell">
      <div class="gt-top">
        <div class="gt-logoWrap">
          <img class="gt-logo" src="./icon-512.png" alt="Glen Track GT" />
        </div>

        <div class="gt-brand">
          <div class="gt-title">Glen Track</div>
          <div class="gt-subtitle">Clean execution. Close the day.</div>
        </div>

        <div class="gt-daynav">
          <button class="gt-pillBtn" type="button" aria-label="Previous day" id="prevDay">‹</button>
          <div class="gt-dayLabel" id="dayLabel">${dayLabel}</div>
          <button class="gt-pillBtn" type="button" aria-label="Next day" id="nextDay">›</button>
        </div>
      </div>

      <div class="gt-grid">
        <!-- Left column -->
        <div class="gt-card">
          <div class="gt-cardInner">
            <div class="gt-cardTitleRow">
              <div>
                <div class="gt-cardTitle">Today</div>
                <div class="gt-helpText" style="margin-top:6px">Status: <strong>In Progress</strong></div>
              </div>
              <div class="gt-statusPill">In Progress</div>
            </div>

            <div class="gt-metric">
              <div class="gt-metricLabel">Calories</div>
              <div class="gt-metricMain">
                <div class="gt-metricValue">${consumedCalories} / ${goals.calories}</div>
                <div class="gt-metricSub">goal</div>
              </div>
            </div>

            <div class="gt-metric">
              <div class="gt-metricLabel">Protein</div>
              <div class="gt-metricMain">
                <div class="gt-metricValue">${consumedProtein} / ${goals.protein}g</div>
                <div class="gt-metricSub">goal</div>
              </div>
            </div>

            <div class="gt-macroRow">
              <div class="gt-chip">
                <div class="gt-chipLabel">Carbs</div>
                <div class="gt-chipValue">${carbs}g</div>
              </div>
              <div class="gt-chip">
                <div class="gt-chipLabel">Fat</div>
                <div class="gt-chipValue">${fat}g</div>
              </div>
            </div>

            <div class="gt-actions">
              <div class="gt-tag"><strong>Food</strong> Not logged</div>
              <div class="gt-tag"><strong>Workout</strong> Not logged</div>
              <div class="gt-tag"><strong>Weekly weigh-in</strong> Weekly only</div>
            </div>

            <div class="gt-rowBtns">
              <button class="gt-btn" type="button" id="quickLogBtn">Quick Log</button>
              <button class="gt-btn gt-btnPrimary" type="button" id="closeTodayBtn" ${
                canCloseToday ? "" : "disabled"
              }>Close Today</button>
            </div>

            <div class="gt-helpText">Log food or a workout to enable Close Today.</div>
          </div>
        </div>

        <!-- Right column -->
        <div class="gt-card">
          <div class="gt-cardInner">
            <div class="gt-smallTitle">This Week</div>

            <div class="gt-kv">
              <div class="k">Momentum snapshot</div>
              <div class="v">0/7</div>
            </div>
            <div class="gt-kv">
              <div class="k">Closed days</div>
              <div class="v">0</div>
            </div>
            <div class="gt-kv">
              <div class="k">Workouts</div>
              <div class="v">—</div>
            </div>
            <div class="gt-kv">
              <div class="k">Avg calories</div>
              <div class="v">—</div>
            </div>
            <div class="gt-kv">
              <div class="k">Avg protein</div>
              <div class="v">—</div>
            </div>
            <div class="gt-kv">
              <div class="k">Streak</div>
              <div class="v">—</div>
            </div>

            <div class="gt-spacer"></div>
            <button class="gt-btn" type="button" id="openSettingsBtn">Settings</button>
          </div>
        </div>
      </div>
    </div>

    ${
      state.modalOpen
        ? `
      <div class="gt-modalBackdrop" id="modalBackdrop">
        <div class="gt-modal" role="dialog" aria-modal="true" aria-label="Quick Log">
          <div class="gt-modalHeader">
            <div class="gt-modalTitle">Quick Log</div>
            <button class="gt-iconBtn" type="button" id="modalCloseBtn" aria-label="Close">×</button>
          </div>
          <div class="gt-modalBody">
            This is placeholder content. Next step: we’ll add saved foods, workouts, and weight tracking here.
          </div>
        </div>
      </div>
    `
        : ""
    }
  `;
}

function bindEvents() {
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");
  const quickLogBtn = document.getElementById("quickLogBtn");
  const settingsBtn = document.getElementById("openSettingsBtn");

  if (prev) prev.onclick = () => shiftDay(-1);
  if (next) next.onclick = () => shiftDay(1);
  if (quickLogBtn) quickLogBtn.onclick = () => openModal();
  if (settingsBtn) settingsBtn.onclick = () => openModal();

  // Modal close wiring (X + tapping backdrop)
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const backdrop = document.getElementById("modalBackdrop");

  if (modalCloseBtn) modalCloseBtn.onclick = () => closeModal();
  if (backdrop) {
    backdrop.onclick = (e) => {
      if (e.target === backdrop) closeModal();
    };
  }
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = appTemplate();
  bindEvents();
}

render();
