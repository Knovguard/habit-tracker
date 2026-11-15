/* Editor sheet, swipeable period pager, Progress + habit detail screens, navigation */

const KIND = { weeks: "week", months: "month", years: "year" };
const GCOL = { S: "#ffd700", A: "#3ddc84", B: "#8ae04a", C: "#ffc83d", D: "#ff9a3d", E: "#ff6a4d", F: "#ff4d4d" };
const MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW3 = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* =====================================================================
   Add / edit habit
   ===================================================================== */
let editing = null;           // habit being edited, or null when adding
const form = { icon: ICONS[0], freq: "day", target: 1, notify: false, times: ["09:00"] };

function buildIconGrid() {
  const g = $("f-icons");
  g.innerHTML = "";
  for (const ic of ICONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ic;
    b.className = ic === form.icon ? "on" : "";
    b.onclick = () => { form.icon = ic; buildIconGrid(); };
    g.appendChild(b);
  }
}
function buildTimes() {
  const box = $("f-times");
  box.innerHTML = "";
  form.times.forEach((t, i) => {
    const l = document.createElement("label");
    l.innerHTML = `<span>Reminder ${i + 1}</span><input type="time" value="${t}">`;
    l.querySelector("input").oninput = (e) => { if (e.target.value) form.times[i] = e.target.value; };
    box.appendChild(l);
  });
}
function syncForm() {
  const [lo, hi] = LIMITS[form.freq];
  form.target = Math.max(lo, Math.min(hi, form.target));
  $("f-target").textContent = form.target;
  $("f-period").textContent = FREQ[form.freq].label;
  $("f-hint").textContent = FREQ[form.freq].hint;
  document.querySelectorAll("#f-freq button").forEach((b) => b.classList.toggle("on", b.dataset.freq === form.freq));
  $("f-notify").checked = form.notify;
  $("f-notif-box").hidden = !form.notify;
  $("n-count").textContent = form.times.length;
  buildTimes();
}
function openEditor(habit) {
  editing = habit || null;
  $("sheet-title").textContent = habit ? "Edit habit" : "New habit";
  $("f-name").value = habit ? habit.name : "";
  form.icon = habit ? habit.icon : ICONS[0];
  form.freq = habit ? habit.freq : "day";
  form.target = habit ? habit.target : 1;
  const n = habit && habit.notify;
  form.notify = !!(n && n.on);
  form.times = n && n.times && n.times.length ? n.times.slice(0, 6) : Notify.defaultTimes(1);
  $("f-delete").hidden = !habit;
  buildIconGrid();
  syncForm();
  $("sheet").hidden = false;
  if (!habit) setTimeout(() => $("f-name").focus(), 50);
}
function closeEditor() { $("sheet").hidden = true; editing = null; }

document.querySelectorAll("#f-freq button").forEach((b) => {
  b.onclick = () => { form.freq = b.dataset.freq; syncForm(); };
});
$("f-minus").onclick = () => { form.target--; syncForm(); };
$("f-plus").onclick = () => { form.target++; syncForm(); };

$("f-notify").onchange = async (e) => {
  if (e.target.checked) {
    const ok = await Notify.ask();
    if (!ok) { e.target.checked = false; toast("Allow notifications for this app in Android settings"); return; }
    form.notify = true;
    if (!form.times.length) form.times = Notify.defaultTimes(1);
  } else form.notify = false;
  syncForm();
};
function setCount(n) {
  n = Math.max(1, Math.min(6, n));
  const old = form.times.length;
  if (n === old) return;
  const untouched = JSON.stringify(form.times) === JSON.stringify(Notify.defaultTimes(old));
  if (untouched) form.times = Notify.defaultTimes(n);
  else if (n < old) form.times = form.times.slice(0, n);
  else {
    const spare = Notify.defaultTimes(n).find((t) => !form.times.includes(t));
    form.times.push(spare || "12:00");
  }
  syncForm();
}
$("n-minus").onclick = () => setCount(form.times.length - 1);
$("n-plus").onclick = () => setCount(form.times.length + 1);

$("f-cancel").onclick = closeEditor;
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeEditor(); });
$("fab").onclick = () => { showScreen("today"); openEditor(null); };

$("f-save").onclick = () => {
  const name = $("f-name").value.trim();
  if (!name) { toast("Give your habit a name"); $("f-name").focus(); return; }
  const notify = { on: form.notify, times: form.times.slice() };
  if (editing) {
    Object.assign(editing, { name, icon: form.icon, freq: form.freq, target: form.target, notify });
  } else {
    state.habits.push({ id: uid(), name, icon: form.icon, freq: form.freq, target: form.target, notify, created: S.ymd(new Date()) });
  }
  save(); closeEditor(); render(); Notify.sync(state.habits);
};
$("f-delete").onclick = () => {
  if (!editing) return;
  if (!confirm(`Delete "${editing.name}"? Its past check-ins will be removed too.`)) return;
  const id = editing.id;
  state.habits = state.habits.filter((h) => h.id !== id);
  for (const k of Object.keys(state.log)) {
    delete state.log[k][id];
    if (!Object.keys(state.log[k]).length) delete state.log[k];
  }
  save(); closeEditor();
  if (detailHabit && detailHabit.id === id) { detailHabit = null; showScreen("today"); }
  render(); Notify.sync(state.habits);
};

/* =====================================================================
   Shared helpers for the graphs
   ===================================================================== */
function firstDataDay() {
  let first = null;
  for (const h of state.habits) { const d = S.parse(h.created); if (!first || d < first) first = d; }
  for (const k of Object.keys(state.log)) { const d = S.parse(k); if (!first || d < first) first = d; }
  return first || new Date();
}
function periodLabel(kind, s) {
  if (kind === "year") return String(s.getFullYear());
  if (kind === "month") return s.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const w = S.isoWeek(s);
  return `Week ${w.week}, ${w.year}`;
}
function periodSub(kind, s, e) {
  const o = { day: "numeric", month: "short" };
  if (kind === "year") return "Jan 1 to Dec 31";
  return `${s.toLocaleDateString(undefined, o)} to ${e.toLocaleDateString(undefined, o)}`;
}

/** Bar chart. Week/month: check-ins per day. Year: consistency per month. */
function timeChart(kind, s, e, today, habits) {
  const bars = [];
  let title;
  if (kind === "year") {
    title = "Consistency per month";
    for (let m = 0; m < 12; m++) {
      const ms = new Date(s.getFullYear(), m, 1), me = S.monthRange(ms)[1];
      if (ms > today) { bars.push({ label: MON3[m][0], future: true }); continue; }
      const ov = S.buildReport(habits, state.log, "month", ms, me, today).overall;
      bars.push({ label: MON3[m][0], v: ov ? ov.pct : 0, color: ov ? GCOL[ov.grade] : "#39424f", txt: ov ? String(Math.round(ov.pct)) : "" });
    }
  } else {
    title = "Check-ins per day";
    for (let d = new Date(s); d <= e; d = S.addDays(d, 1)) {
      const dd = new Date(d), day = state.log[S.ymd(dd)] || {};
      const v = habits.reduce((a, h) => a + (day[h.id] || 0), 0);
      const label = kind === "week" ? DOW3[(dd.getDay() + 6) % 7]
        : (dd.getDate() === 1 || dd.getDate() % 5 === 0) ? String(dd.getDate()) : "";
      const weekend = (dd.getDay() + 6) % 7 >= 5;
      bars.push({ label, v, future: dd > today, color: weekend ? "#5aa9ff" : "#3ddc84", txt: kind === "week" && v ? String(v) : "" });
    }
  }
  const W = 320, H = 150, top = 16, bot = 20, side = 6, n = bars.length;
  const max = kind === "year" ? 100 : Math.max(1, ...bars.map((b) => b.v || 0));
  const bw = (W - side * 2) / n, gap = Math.min(6, bw * 0.25), ch = H - top - bot;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">`;
  svg += `<line x1="${side}" y1="${H - bot}" x2="${W - side}" y2="${H - bot}" stroke="#2b3340"/>`;
  bars.forEach((b, i) => {
    const x = side + i * bw + gap / 2, w = bw - gap, cx = x + w / 2;
    if (b.future) svg += `<rect x="${x}" y="${H - bot - 2}" width="${w}" height="2" fill="#2b3340"/>`;
    else {
      const h = Math.max(b.v ? (b.v / max) * ch : 0, b.v ? 2 : 1.5), y = H - bot - h;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${b.v ? b.color : "#2b3340"}"/>`;
      if (b.txt) svg += `<text x="${cx}" y="${y - 3}" text-anchor="middle">${b.txt}</text>`;
    }
    if (b.label) svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${b.label}</text>`;
  });
  const note = kind === "year" ? "" : `<div class="noteline" style="padding:4px 0 0">Blue bars are weekends</div>`;
  return `<h4>${title}</h4>${svg}</svg>${note}`;
}

/* =====================================================================
   Swipeable period pager (used by Progress and by the habit screen)
   ===================================================================== */
function makePager(cfg) {
  let tab = "weeks", idx = 0;
  const el = (id) => document.getElementById(id);
  const periods = () => S.listPeriods(KIND[tab], cfg.first(), new Date());

  function draw(anim) {
    const slide = el(cfg.slide);
    const list = periods();
    if (!list.length) { slide.innerHTML = ""; return; }
    idx = Math.max(0, Math.min(idx, list.length - 1));
    const kind = KIND[tab], today = new Date(), [s, e] = list[idx];
    const rep = S.buildReport(cfg.habits(), state.log, kind, s, e, today);

    document.querySelectorAll(`#${cfg.tabs} button`).forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    el(cfg.name).textContent = periodLabel(kind, s) + (idx === 0 ? "  (current)" : "");
    el(cfg.range).textContent = periodSub(kind, s, e);
    el(cfg.prev).disabled = idx >= list.length - 1;
    el(cfg.next).disabled = idx <= 0;
    if (cfg.onDraw) cfg.onDraw({ kind, s, e });

    slide.innerHTML = cfg.slideHtml({ kind, s, e, today, rep });
    slide.classList.remove("enter-l", "enter-r");
    if (anim) { void slide.offsetWidth; slide.classList.add("enter-" + anim); }
  }
  function step(dir) {          // +1 = older period, -1 = newer
    const n = idx + dir;
    if (n < 0 || n >= periods().length) return;
    idx = n;
    draw(dir > 0 ? "l" : "r");
  }
  document.querySelectorAll(`#${cfg.tabs} button`).forEach((b) => {
    b.onclick = () => { tab = b.dataset.tab; idx = 0; draw(); };
  });
  el(cfg.prev).onclick = () => step(+1);
  el(cfg.next).onclick = () => step(-1);

  const pane = el(cfg.pane), slide = el(cfg.slide);
  let x0 = 0, dx = 0, on = false;
  pane.addEventListener("pointerdown", (ev) => { on = true; x0 = ev.clientX; dx = 0; slide.style.transition = "none"; });
  pane.addEventListener("pointermove", (ev) => {
    if (!on) return;
    dx = ev.clientX - x0;
    slide.style.transform = `translateX(${dx * 0.5}px)`;
  });
  const end = () => {
    if (!on) return;
    on = false;
    slide.style.transition = "transform .18s";
    slide.style.transform = "";
    if (Math.abs(dx) > 55) step(dx > 0 ? +1 : -1);
    dx = 0;
  };
  pane.addEventListener("pointerup", end);
  pane.addEventListener("pointercancel", end);
  pane.addEventListener("pointerleave", end);

  return {
    draw,
    reset() { tab = "weeks"; idx = 0; },
    current() { const l = periods(); const i = Math.min(idx, l.length - 1); return { kind: KIND[tab], s: l[i][0], e: l[i][1] }; },
  };
}

/* =====================================================================
   Progress screen (all habits)
   ===================================================================== */
function habitBars(rep) {
  if (!rep.rows.length) return `<div class="noteline">No habits yet.</div>`;
  return rep.rows.map((r) => {
    const h = r.habit, f = FREQ[h.freq];
    if (r.skipped) {
      const why = h.freq === "month" && rep.kind === "week" ? "scored in month and year" : "not active yet";
      return `<div class="hb skip"><div class="hn">${esc(h.icon)} ${esc(h.name)}</div><div class="hr">${why}</div><div class="ht"></div></div>`;
    }
    const pct = Math.round(r.pct);
    return `<div class="hb"><div class="hn">${esc(h.icon)} ${esc(h.name)}</div>
      <div class="hr"><span>${r.done}/${Math.round(r.expected * 10) / 10}  ·  ${pct}%</span><span class="grade sm g-${r.grade}">${r.grade}</span></div>
      <div class="ht"><div class="hf" style="width:${Math.max(pct, 2)}%;background:${f.color}"></div></div></div>`;
  }).join("");
}

/* ---------- heat map (month = calendar, year = weeks grid like Anki) ---------- */
const HEAT = ["#2f3747", "#1b4d33", "#247a4c", "#36b06b", "#86ffbb"];   // missed, low, mid, high, perfect
const HEAT_NONE = "#1a202a", HEAT_FUTURE = "#151a22";
function heatLevel(score) {
  if (score == null) return -1;
  if (score <= 0) return 0;
  if (score <= 1 / 3) return 1;
  if (score <= 2 / 3) return 2;
  if (score < 1) return 3;
  return 4;
}
function describeDay(key) {
  const d = S.parse(key);
  const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (key > S.ymd(new Date())) return `${label}: not yet`;
  const h = S.dayHeat(state.habits, state.log, key);
  if (h.score == null) return `${label}: no goals tracked`;
  return `${label}: ${h.done} of ${h.due} goals (${Math.round(h.score * 100)}%)`;
}

function heatGrid(s, e, today, todayKey) {
  const lead = (s.getDay() + 6) % 7;                    // Monday-first; a week starts at 0
  let html = `<div class="hm-month">` + DOW3.map((d) => `<div class="hm-dow">${d[0]}</div>`).join("");
  html += "<div></div>".repeat(lead);
  for (let d = new Date(s); d <= e; d = S.addDays(d, 1)) {
    const key = S.ymd(d);
    let cls;
    if (key > todayKey) cls = "hc f";
    else { const l = heatLevel(S.dayHeat(state.habits, state.log, key).score); cls = l < 0 ? "hc n" : `hc l${l}`; }
    if (key === todayKey) cls += " today";
    html += `<div class="${cls}" data-d="${key}">${d.getDate()}</div>`;
  }
  return html + "</div>";
}

function heatYear(s, today, todayKey) {
  const y = s.getFullYear(), jan1 = new Date(y, 0, 1);
  const lead = (jan1.getDay() + 6) % 7, total = S.isLeap(y) ? 366 : 365;
  const cols = Math.ceil((lead + total) / 7);
  const W = 330, left = 12, top = 14, step = (W - left) / cols, cell = step - 1.3, H = top + 7 * step + 2;
  let svg = `<svg class="hm-year" viewBox="0 0 ${W} ${H}" role="img" aria-label="Year heat map">`;
  ["M", "W", "F"].forEach((t, i) => { svg += `<text x="0" y="${top + (i * 2) * step + cell * 0.8}" font-size="7" fill="#8b95a5">${t}</text>`; });
  for (let m = 0; m < 12; m++) {
    const c = Math.floor((lead + S.dayOfYear(new Date(y, m, 1)) - 1) / 7);
    svg += `<text x="${left + c * step}" y="9" font-size="8" fill="#8b95a5">${MON3[m]}</text>`;
  }
  for (let i = 0; i < total; i++) {
    const date = S.addDays(jan1, i), key = S.ymd(date);
    const c = Math.floor((lead + i) / 7), r = (date.getDay() + 6) % 7;
    let fill;
    if (key > todayKey) fill = HEAT_FUTURE;
    else { const l = heatLevel(S.dayHeat(state.habits, state.log, key).score); fill = l < 0 ? HEAT_NONE : HEAT[l]; }
    svg += `<rect x="${(left + c * step).toFixed(2)}" y="${(top + r * step).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="1.2" fill="${fill}" data-d="${key}"${key === todayKey ? ' class="today"' : ""}/>`;
  }
  return svg + "</svg>";
}

function heatmapHtml(kind, s, e, today) {
  const todayKey = S.ymd(today);
  let tracked = 0, perfect = 0, sum = 0;
  for (let d = new Date(s); d <= e && S.ymd(d) <= todayKey; d = S.addDays(d, 1)) {
    const h = S.dayHeat(state.habits, state.log, S.ymd(d));
    if (h.score == null) continue;
    tracked++; sum += h.score; if (h.score === 1) perfect++;
  }
  const line = tracked
    ? `${tracked} day${tracked === 1 ? "" : "s"} tracked  ·  ${perfect} perfect  ·  average ${Math.round((sum / tracked) * 100)}%`
    : "Nothing tracked in this period yet.";
  const legend = `<div class="hm-legend">Less ${HEAT.map((c) => `<i style="background:${c}"></i>`).join("")} More</div>`;
  return `<h4>Heat map</h4>${kind === "year" ? heatYear(s, today, todayKey) : heatGrid(s, e, today, todayKey)}
    ${legend}<div id="hm-readout" class="hm-readout">Tap a day for details</div>
    <div class="hm-line">${line}</div>
    <div class="hm-note">Shade = share of that day's goals you hit. Weekly and monthly sessions count when you do them and never count against the other days.</div>`;
}

$("chart-pane").addEventListener("click", (ev) => {
  const t = ev.target.closest && ev.target.closest("[data-d]");
  if (!t) return;
  document.querySelectorAll("#chart-slide .sel").forEach((x) => x.classList.remove("sel"));
  t.classList.add("sel");
  const r = $("hm-readout");
  if (r) r.textContent = describeDay(t.dataset.d);
});

let progressView = "graphs";     // never saved: the app always opens on the graphs

const progress = makePager({
  tabs: "out-tabs", name: "pg-name", range: "pg-range", prev: "pg-prev", next: "pg-next",
  pane: "chart-pane", slide: "chart-slide",
  habits: () => state.habits,
  first: firstDataDay,
  onDraw: ({ kind, s }) => {
    $("btn-export-one").textContent = `Export ${periodLabel(kind, s)} to Excel`;
    document.querySelectorAll("#view-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === progressView));
  },
  slideHtml: ({ kind, s, e, today, rep }) => {
    const ov = rep.overall, nScored = rep.rows.filter((r) => !r.skipped).length;
    const head = `<div class="sum"><div class="grade big g-${ov ? ov.grade : "none"}">${ov ? ov.grade : "–"}</div>
       <div><b>${ov ? Math.round(ov.pct) + "% consistency" : "Nothing to score yet"}</b>
       <span>${ov ? `across ${nScored} habit${nScored === 1 ? "" : "s"}` : "Check some habits first"}</span></div></div>`;
    if (progressView === "heat") return head + heatmapHtml(kind, s, e, today);
    return head + `<h4>By habit</h4>${habitBars(rep)}${timeChart(kind, s, e, today, state.habits)}`;
  },
});
document.querySelectorAll("#view-tabs button").forEach((b) => {
  b.onclick = () => { progressView = b.dataset.view; progress.draw(); };
});
function renderOutput(anim) { progress.draw(anim); }

async function exportPeriod(kind, s, e) {
  if (!state.habits.length) { toast("Add a habit first"); return; }
  try {
    toast("Building spreadsheet…");
    await Report.exportOne(kind, s, e, state.habits, state.log, new Date());
    toast("Report ready");
  } catch (err) { console.error(err); toast("Export failed"); }
}
$("btn-export-one").onclick = () => { const c = progress.current(); exportPeriod(c.kind, c.s, c.e); };
$("btn-export-all").onclick = async () => {
  if (!state.habits.length) { toast("Add a habit first"); return; }
  try {
    toast("Building workbook…");
    await Report.exportAll(state.habits, state.log, new Date(), firstDataDay());
    toast("Report ready");
  } catch (err) { console.error(err); toast("Export failed"); }
};

/* =====================================================================
   Habit screen (graphs for one habit)
   ===================================================================== */
let detailHabit = null;

const detail = makePager({
  tabs: "d-tabs", name: "d-pname", range: "d-prange", prev: "d-prev", next: "d-next",
  pane: "d-pane", slide: "d-slide",
  habits: () => [detailHabit],
  first: () => S.parse(detailHabit.created),
  slideHtml: ({ kind, s, e, today, rep }) => {
    const h = detailHabit, row = rep.rows[0];
    const st = S.streak(h, state.log, today);
    const total = Object.values(state.log).reduce((a, d) => a + (d[h.id] || 0), 0);
    let sum;
    if (row.skipped) {
      const why = h.freq === "month" && kind === "week" ? "Monthly habits are scored in the Month and Year views." : "Not active in this period.";
      sum = `<div class="sum"><div class="grade big g-none">–</div><div><b>Not scored here</b><span>${why}</span></div></div>`;
    } else {
      sum = `<div class="sum"><div class="grade big g-${row.grade}">${row.grade}</div>
        <div><b>${Math.round(row.pct)}% consistency</b><span>${row.done} of ${Math.round(row.expected * 10) / 10} expected</span></div></div>`;
    }
    const stats = `<div class="stats">
      <div><b>${st.cur}</b><span>${st.unit}${st.cur === 1 ? "" : "s"} streak</span></div>
      <div><b>${st.best}</b><span>best (${st.unit}s)</span></div>
      <div><b>${total}</b><span>check-ins</span></div></div>`;
    return sum + stats + timeChart(kind, s, e, today, [h]);
  },
});

function renderDetail() {
  if (!detailHabit || !$("screen-detail").classList.contains("active")) return;
  if (!state.habits.includes(detailHabit)) return;
  const h = detailHabit, f = FREQ[h.freq];
  $("d-badge").textContent = h.icon;
  $("d-badge").style.setProperty("--c", f.color);
  $("d-name").textContent = h.name;
  $("d-sub").textContent = `${h.target}× per ${f.label}` + (h.notify && h.notify.on ? `  ·  ${h.notify.times.length} reminder${h.notify.times.length === 1 ? "" : "s"}` : "");
  detail.draw();
}
function openDetail(h) {
  detailHabit = h;
  detail.reset();
  showScreen("detail");
  renderDetail();
}
$("d-back").onclick = () => showScreen("today");
$("d-edit").onclick = () => { if (detailHabit) openEditor(detailHabit); };

/* =====================================================================
   Eject (save everything to a file) and Insert (restore from that file)
   ===================================================================== */
const BACKUP_APP = "habit-tracker";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function backupJson() {
  return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), habits: state.habits, log: state.log }, null, 1);
}
function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function eject() {
  const name = `Habit Tracker backup ${S.ymd(new Date())}.json`;
  const json = backupJson();
  if (Native.isNative()) {
    // Android: write the file, then open the share sheet so it can be saved outside the app (Files, Drive...)
    const saved = await Native.call("Filesystem", "writeFile", { path: name, data: textToBase64(json), directory: "CACHE" });
    await Native.call("Share", "share", { title: name, url: saved.uri, dialogTitle: "Save your backup somewhere safe" });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Validate and clean a backup file's text. Throws an Error with a readable message. */
function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error("That file is not a Habit Tracker backup."); }
  if (!d || d.app !== BACKUP_APP || !Array.isArray(d.habits) || !d.log || typeof d.log !== "object") {
    throw new Error("That file is not a Habit Tracker backup.");
  }
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const habits = d.habits
    .filter((h) => h && typeof h.id === "string" && h.id && typeof h.name === "string" && h.name.trim() && FREQ[h.freq])
    .map((h) => {
      const times = h.notify && Array.isArray(h.notify.times) ? h.notify.times.filter((t) => /^\d{1,2}:\d{2}$/.test(t)).slice(0, 6) : [];
      return {
        id: h.id,
        name: h.name.trim().slice(0, 30),
        icon: typeof h.icon === "string" && h.icon ? h.icon : ICONS[0],
        freq: h.freq,
        target: clamp(Math.round(Number(h.target)) || 1, LIMITS[h.freq][0], LIMITS[h.freq][1]),
        created: DATE_RE.test(h.created) ? h.created : S.ymd(new Date()),
        notify: { on: !!(h.notify && h.notify.on) && times.length > 0, times: times.length ? times : Notify.defaultTimes(1) },
      };
    });
  const ids = new Set(habits.map((h) => h.id));
  const log = {};
  let checkins = 0;
  for (const [day, rec] of Object.entries(d.log)) {
    if (!DATE_RE.test(day) || !rec || typeof rec !== "object") continue;
    const out = {};
    for (const [id, n] of Object.entries(rec)) {
      const v = Math.round(Number(n));
      if (ids.has(id) && v > 0) { out[id] = Math.min(v, 50); checkins += out[id]; }
    }
    if (Object.keys(out).length) log[day] = out;
  }
  return { habits, log, checkins, exportedAt: typeof d.exportedAt === "string" ? d.exportedAt.slice(0, 10) : null };
}

async function insertFile(file) {
  try {
    const b = parseBackup(await file.text());
    const when = b.exportedAt ? ` saved on ${b.exportedAt}` : "";
    if (!confirm(`Restore ${b.habits.length} habit${b.habits.length === 1 ? "" : "s"} and ${b.checkins} check-ins from this backup${when}?\n\nThis replaces what is in the app right now.`)) return;
    state.habits = b.habits;
    state.log = b.log;
    save();
    detailHabit = null;
    showScreen("today");
    render();
    Notify.sync(state.habits);
    toast("Backup restored");
  } catch (err) {
    console.error(err);
    toast(err && err.message ? err.message : "Could not read that file");
  }
}

$("btn-eject").onclick = async () => {
  try { await eject(); toast("Backup ready: save it somewhere safe"); }
  catch (err) { console.error(err); toast("Eject failed"); }
};
$("btn-insert").onclick = () => $("f-insert").click();
$("f-insert").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";                       // lets the same file be picked again later
  if (f) insertFile(f);
};

/* =====================================================================
   Navigation
   ===================================================================== */
function showScreen(name) {
  $("screen-today").classList.toggle("active", name === "today");
  $("screen-detail").classList.toggle("active", name === "detail");
  $("screen-output").classList.toggle("active", name === "output");
  $("nav-today").classList.toggle("on", name === "today" || name === "detail");
  $("nav-output").classList.toggle("on", name === "output");
  if (name === "output") renderOutput();
  window.scrollTo(0, 0);
}
$("nav-today").onclick = () => showScreen("today");
$("nav-output").onclick = () => showScreen("output");

render();
Notify.sync(state.habits);
