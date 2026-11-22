/* State + Today screen */
const S = Scoring;
const FREQ = {
  day:   { color: "#4ee38f", label: "day",   word: "Daily",   hint: "Green: something you do one or more times every day." },
  week:  { color: "#ffc94a", label: "week",  word: "Weekly",  hint: "Yellow: something you do several times a week, like working out." },
  month: { color: "#ff6370", label: "month", word: "Monthly", hint: "Red: something you do a few times a month, like a long stretching session." },
};
const LIMITS = { day: [1, 10], week: [1, 6], month: [1, 15] };
const ICONS = ["📚","💪","🧘","🪥","🏃","💧","🥗","😴","🧹","💊","✍️","🎸","🧠","🚶","🧴","🌅","💻","🎯","🙏","☕","🛏️"];

const KEY = "habit-tracker.v1";
const state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.habits)) return { habits: s.habits, log: s.log || {}, archive: Array.isArray(s.archive) ? s.archive : [] };
  } catch (e) {}
  const t = S.ymd(new Date());
  return {
    habits: [
      { id: uid(), name: "Brushing teeth", icon: "🪥", freq: "day",   target: 2, created: t },
      { id: uid(), name: "Studying",       icon: "📚", freq: "day",   target: 1, created: t },
      { id: uid(), name: "Working out",    icon: "💪", freq: "week",  target: 3, created: t },
      { id: uid(), name: "Big stretching", icon: "🧘", freq: "month", target: 2, created: t },
    ],
    log: {},
    archive: [],        // habits whose end date has passed: hidden from the app, still included in Excel reports
  };
}
/* ---------- habits with an end date ---------- */
const DAY_MS = 864e5;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole days from today to the habit's last day (0 = today is the last day). */
function daysLeft(h, now) { return Math.round((S.parse(h.deadline) - midnight(now)) / DAY_MS); }
function leftText(n) {
  if (n <= 0) return "Last day";
  if (n === 1) return "1 day left";
  if (n >= 28 && n % 7 === 0) return `${n / 7} weeks left`;
  return `${n} days left`;
}
/** Fraction of the countdown still to go (1 = just started, 0 = last day). */
function leftShare(h, now) {
  const start = S.parse(h.dlStart || h.created || S.ymd(now));
  const span = Math.round((S.parse(h.deadline) - start) / DAY_MS);
  return span <= 0 ? 0 : Math.max(0, Math.min(1, daysLeft(h, now) / span));
}
/** Habits whose last day was yesterday or earlier leave the app. Their check-ins are kept and the habit is
 *  archived, so Excel reports for the periods it was tracked still include it. */
function purgeExpired(now) {
  const t = S.ymd(now);
  const gone = state.habits.filter((h) => h.deadline && h.deadline < t);
  if (!gone.length) return [];
  const ids = new Set(gone.map((h) => h.id));
  state.habits = state.habits.filter((h) => !ids.has(h.id));
  state.archive = (state.archive || []).concat(gone);
  save();
  return gone;
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------- periods & counts ---------- */
function periodRange(h, today) {
  if (h.freq === "day") return [today, today];
  return h.freq === "week" ? S.weekRange(today) : S.monthRange(today);
}
function countIn(h, s, e) {
  let n = 0;
  for (let d = new Date(s); d <= e; d = S.addDays(d, 1)) n += (state.log[S.ymd(d)] || {})[h.id] || 0;
  return n;
}
function adjust(h, delta, today) {
  const [s, e] = periodRange(h, today);
  const set = (key, v) => {
    const day = (state.log[key] = state.log[key] || {});
    if (v <= 0) delete day[h.id]; else day[h.id] = v;
    if (!Object.keys(day).length) delete state.log[key];
  };
  const tk = S.ymd(today);
  if (delta > 0) {
    if (h.created && h.created > tk) h.created = tk;     // checked off for a day before it was added
    set(tk, ((state.log[tk] || {})[h.id] || 0) + 1);
  } else {
    // remove the most recent check inside the current period
    for (let d = new Date(e > today ? today : e); d >= s; d = S.addDays(d, -1)) {
      const k = S.ymd(d), c = (state.log[k] || {})[h.id] || 0;
      if (c > 0) { set(k, c - 1); break; }
    }
  }
  save();
}

/* ---------- year map ---------- */
function dayScore(dateStr, today) {
  const daily = state.habits.filter((h) => h.freq === "day" && h.created <= dateStr);
  if (!daily.length) return 0;
  let got = 0, want = 0;
  for (const h of daily) {
    got += Math.min(h.target, (state.log[dateStr] || {})[h.id] || 0);
    want += h.target;
  }
  return got / want;
}
function renderYearMap(today, ghostKey) {
  const y = today.getFullYear(), todayStr = S.ymd(today);
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let html = "";
  for (let m = 0; m < 12; m++) {
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;      // Monday-first
    const n = S.daysInMonth(y, m);
    const cur = m === today.getMonth() ? " cur" : "";
    html += `<div class="mo${cur}"><div class="mn">${names[m]}</div><div class="md">`;
    html += "<i class='x'></i>".repeat(lead);
    for (let d = 1; d <= n; d++) {
      const date = new Date(y, m, d), k = S.ymd(date);
      const weekend = (date.getDay() + 6) % 7 >= 5;          // Saturday, Sunday
      let cls = weekend ? "we" : "";
      if (k === todayStr) cls += " today";
      else if (date < today) { const r = dayScore(k, today); cls += r >= 0.99 ? " p3" : r >= 0.5 ? " p2" : r > 0 ? " p1" : ""; }
      if (ghostKey && k === ghostKey) cls += " gday";
      html += `<i class="${cls.trim()}" title="${k}"></i>`;
    }
    html += "</div></div>";
  }
  $("yearmap").innerHTML = html;
}
function renderDate(today) {
  $("date-weekday").textContent = today.toLocaleDateString(undefined, { weekday: "long" });
  $("date-day").textContent = today.getDate();
  $("date-month").textContent = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("date-doy").textContent = `day ${S.dayOfYear(today)} of ${S.isLeap(today.getFullYear()) ? 366 : 365}`;
}

/* ---------- habit list ---------- */
function renderHabits(today) {
  const list = $("habit-list");
  list.innerHTML = "";
  $("empty-hint").hidden = state.habits.length > 0;
  for (const h of state.habits) {
    const f = FREQ[h.freq], [s, e] = periodRange(h, today);
    const count = countIn(h, s, e > today ? today : e);    // "as of" the day being shown
    const row = document.createElement("div");
    const left = h.deadline ? daysLeft(h, new Date()) : null;
    row.className = "habit" + (h.deadline ? " limited" : "") + (left !== null && left <= 0 ? " lastday" : "");
    row.style.setProperty("--c", f.color);

    const main = document.createElement("button");
    main.className = "main";
    main.innerHTML = `<span class="badge">${h.icon}</span>
      <span class="info"><div class="name"></div>
      <div class="sub">${Math.min(count, h.target)}/${h.target} ${h.freq === "day" ? "today" : "this " + f.label}</div>
      ${left === null ? "" : `<div class="cd${left <= 0 ? " last" : ""}">${leftText(left)}</div>`}</span>`;
    main.querySelector(".name").textContent = h.name;
    main.onclick = () => { if (suppressClick) { suppressClick = false; return; } openDetail(h); };
    main.addEventListener("pointerdown", (ev) => startPress(ev, row, state.habits.indexOf(h)));
    row.addEventListener("contextmenu", (ev) => ev.preventDefault());
    row.appendChild(main);

    const checks = document.createElement("div");
    checks.className = "checks";
    for (let i = 0; i < h.target; i++) {
      const c = document.createElement("button");
      c.className = "check" + (i < count ? " on" : "");
      c.setAttribute("aria-label", `${h.name} check ${i + 1}`);
      c.onclick = () => { adjust(h, i < count ? -1 : 1, today); render(); };
      checks.appendChild(c);
    }
    row.appendChild(checks);
    list.appendChild(row);
  }
}

/* ---------- long press + drag to reorder ---------- */
let suppressClick = false;
function startPress(ev, row, index) {
  if (ev.button > 0) return;
  const list = $("habit-list");
  const rows = [...list.children].filter((el) => el.classList.contains("habit"));
  if (rows.length < 2) return;                       // nothing to reorder
  const x0 = ev.clientX, y0 = ev.clientY;
  let active = false, timer = null, rects = [], step = 0, target = index;

  const blockScroll = (e) => { if (active && e.cancelable) e.preventDefault(); };
  const activate = () => {
    active = true; suppressClick = true;
    if (navigator.vibrate) navigator.vibrate(25);
    rects = rows.map((r) => r.getBoundingClientRect());
    step = Math.abs(rects[1].top - rects[0].top);
    row.classList.add("drag");
    list.classList.add("dragging");
  };
  const drag = (dy) => {
    row.style.transform = `translateY(${dy}px) scale(1.02)`;
    const center = rects[index].top + rects[index].height / 2 + dy;
    let best = Infinity;
    rects.forEach((r, i) => {
      const d = Math.abs(center - (r.top + r.height / 2));
      if (d < best) { best = d; target = i; }
    });
    rows.forEach((r, j) => {
      if (j === index) return;
      let shift = 0;
      if (index < target && j > index && j <= target) shift = -step;
      if (index > target && j < index && j >= target) shift = step;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };
  const onMove = (e) => {
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!active) { if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cleanup(false); return; }
    drag(dy);
  };
  const cleanup = (commit) => {
    clearTimeout(timer);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("touchmove", blockScroll);
    if (!active) return;
    active = false;
    setTimeout(() => (suppressClick = false), 400);
    row.classList.remove("drag");
    list.classList.remove("dragging");
    rows.forEach((r) => (r.style.transform = ""));
    if (commit && target !== index) {
      const [moved] = state.habits.splice(index, 1);
      state.habits.splice(target, 0, moved);
      save();
    }
    render();
  };
  const onUp = () => cleanup(true);
  const onCancel = () => cleanup(false);

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
  document.addEventListener("touchmove", blockScroll, { passive: false });
  timer = setTimeout(activate, 450);
}

/* ---------- yesterday ("ghost") mode: look at and fix yesterday's check-ins ---------- */
let ghost = false;                                   // never saved: the app always opens on today
function renderGhost(now, day) {
  const on = ghost && $("screen-today").classList.contains("active");
  document.body.classList.toggle("ghost", on);
  $("ghost-btn").setAttribute("aria-pressed", String(ghost));
  $("ghost-btn").setAttribute("aria-label", ghost ? "Back to today" : "See yesterday");
  $("ghost-banner").hidden = !ghost;
  if (ghost) $("ghost-date").textContent = day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
function setGhost(v) { ghost = v; window.scrollTo(0, 0); render(); }
$("ghost-btn").onclick = () => setGhost(!ghost);
$("ghost-back").onclick = () => setGhost(false);

function render() {
  const now = new Date();
  const gone = purgeExpired(now);
  if (gone.length) {
    toast(gone.length === 1 ? `"${gone[0].name}" has ended. It stays in your Excel reports.` : `${gone.length} habits have ended. They stay in your Excel reports.`);
    Notify.sync(state.habits);
    if (typeof detailHabit !== "undefined" && detailHabit && !state.habits.includes(detailHabit)) { detailHabit = null; showScreen("today"); }
  }
  const today = ghost ? S.addDays(now, -1) : now;     // the day the Today screen is showing
  renderDate(today);
  renderYearMap(now, ghost ? S.ymd(today) : null);
  renderHabits(today);
  renderGhost(now, today);
  if (typeof renderOutput === "function") renderOutput();
  if (typeof renderDetail === "function") renderDetail();
}

// the app can stay open past midnight: notice the new day and refresh (this also removes expired habits)
let lastDay = S.ymd(new Date());
setInterval(() => { const d = S.ymd(new Date()); if (d !== lastDay) { lastDay = d; render(); } }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
