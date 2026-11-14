/* State + Today screen */
const S = Scoring;
const FREQ = {
  day:   { color: "#3ddc84", label: "day",   word: "Daily",   hint: "Green: something you do one or more times every day." },
  week:  { color: "#ffc83d", label: "week",  word: "Weekly",  hint: "Yellow: something you do several times a week, like working out." },
  month: { color: "#ff5a5a", label: "month", word: "Monthly", hint: "Red: something you do a few times a month, like a long stretching session." },
};
const LIMITS = { day: [1, 10], week: [1, 6], month: [1, 15] };
const ICONS = ["📚","💪","🧘","🪥","🏃","💧","🥗","😴","🧹","💊","✍️","🎸","🧠","🚶","🧴","🌅","💻","🎯","🙏","☕","🛏️"];

const KEY = "habit-tracker.v1";
const state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.habits)) return { habits: s.habits, log: s.log || {} };
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
  };
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
function renderYearMap(today) {
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
      let cls = "";
      if (k === todayStr) cls = "today";
      else if (date < today) { const r = dayScore(k, today); cls = r >= 0.99 ? "p3" : r >= 0.5 ? "p2" : r > 0 ? "p1" : ""; }
      html += `<i class="${cls}" title="${k}"></i>`;
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
    const count = countIn(h, s, e);
    const row = document.createElement("div");
    row.className = "habit";
    row.style.setProperty("--c", f.color);

    const main = document.createElement("button");
    main.className = "main";
    main.innerHTML = `<span class="badge">${h.icon}</span>
      <span class="info"><div class="name"></div>
      <div class="sub">${Math.min(count, h.target)}/${h.target} ${h.freq === "day" ? "today" : "this " + f.label}</div></span>`;
    main.querySelector(".name").textContent = h.name;
    main.onclick = () => openEditor(h);
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

function render() {
  const today = new Date();
  renderDate(today);
  renderYearMap(today);
  renderHabits(today);
  if (typeof renderOutput === "function") renderOutput();
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
