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

const progress = makePager({
  tabs: "out-tabs", name: "pg-name", range: "pg-range", prev: "pg-prev", next: "pg-next",
  pane: "chart-pane", slide: "chart-slide",
  habits: () => state.habits,
  first: firstDataDay,
  onDraw: ({ kind, s }) => { $("btn-export-one").textContent = `Export ${periodLabel(kind, s)} to Excel`; },
  slideHtml: ({ kind, s, e, today, rep }) => {
    const ov = rep.overall, nScored = rep.rows.filter((r) => !r.skipped).length;
    return `<div class="sum"><div class="grade big g-${ov ? ov.grade : "none"}">${ov ? ov.grade : "–"}</div>
       <div><b>${ov ? Math.round(ov.pct) + "% consistency" : "Nothing to score yet"}</b>
       <span>${ov ? `across ${nScored} habit${nScored === 1 ? "" : "s"}` : "Check some habits first"}</span></div></div>
     <h4>By habit</h4>${habitBars(rep)}${timeChart(kind, s, e, today, state.habits)}`;
  },
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
