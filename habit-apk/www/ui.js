/* Editor sheet, Output Progress screen, navigation */

/* ---------- add / edit habit ---------- */
let editing = null;           // habit being edited, or null when adding
const form = { icon: ICONS[0], freq: "day", target: 1 };

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
function syncForm() {
  const [lo, hi] = LIMITS[form.freq];
  form.target = Math.max(lo, Math.min(hi, form.target));
  $("f-target").textContent = form.target;
  $("f-period").textContent = FREQ[form.freq].label;
  $("f-hint").textContent = FREQ[form.freq].hint;
  document.querySelectorAll("#f-freq button").forEach((b) => b.classList.toggle("on", b.dataset.freq === form.freq));
}
function openEditor(habit) {
  editing = habit || null;
  $("sheet-title").textContent = habit ? "Edit habit" : "New habit";
  $("f-name").value = habit ? habit.name : "";
  form.icon = habit ? habit.icon : ICONS[0];
  form.freq = habit ? habit.freq : "day";
  form.target = habit ? habit.target : 1;
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
$("f-cancel").onclick = closeEditor;
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeEditor(); });
$("fab").onclick = () => { showScreen("today"); openEditor(null); };

$("f-save").onclick = () => {
  const name = $("f-name").value.trim();
  if (!name) { toast("Give your habit a name"); $("f-name").focus(); return; }
  if (editing) {
    Object.assign(editing, { name, icon: form.icon, freq: form.freq, target: form.target });
  } else {
    state.habits.push({ id: uid(), name, icon: form.icon, freq: form.freq, target: form.target, created: S.ymd(new Date()) });
  }
  save(); closeEditor(); render();
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
  save(); closeEditor(); render();
};

/* ---------- output progress ---------- */
let outTab = "weeks";
const KIND = { weeks: "week", months: "month", years: "year" };

function firstDataDay() {
  let first = null;
  for (const h of state.habits) { const d = S.parse(h.created); if (!first || d < first) first = d; }
  for (const k of Object.keys(state.log)) { const d = S.parse(k); if (!first || d < first) first = d; }
  return first || new Date();
}
function periodLabel(kind, s, e) {
  const o = { day: "numeric", month: "short" };
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

function renderOutput() {
  const list = $("out-list");
  if (!list) return;
  const today = new Date(), kind = KIND[outTab];
  document.querySelectorAll("#out-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === outTab));
  list.innerHTML = "";
  for (const [s, e] of S.listPeriods(kind, firstDataDay(), today)) {
    const rep = S.buildReport(state.habits, state.log, kind, s, e, today);
    const g = rep.overall ? rep.overall.grade : null;
    const b = document.createElement("button");
    b.className = "out-item";
    b.innerHTML = `<span class="lbl"><b></b><span></span></span><span class="grade g-${g || "none"}">${g || "–"}</span>`;
    b.querySelector("b").textContent = periodLabel(kind, s, e);
    b.querySelector("span span").textContent =
      periodSub(kind, s, e) + (rep.overall ? `  ·  ${Math.round(rep.overall.pct)}%` : "");
    b.onclick = () => exportPeriod(kind, s, e);
    list.appendChild(b);
  }
}
document.querySelectorAll("#out-tabs button").forEach((b) => {
  b.onclick = () => { outTab = b.dataset.tab; renderOutput(); };
});

async function exportPeriod(kind, s, e) {
  if (!state.habits.length) { toast("Add a habit first"); return; }
  try {
    toast("Building spreadsheet…");
    await Report.exportOne(kind, s, e, state.habits, state.log, new Date());
    toast("Report ready");
  } catch (err) { console.error(err); toast("Export failed"); }
}
$("btn-export-all").onclick = async () => {
  if (!state.habits.length) { toast("Add a habit first"); return; }
  try {
    toast("Building workbook…");
    await Report.exportAll(state.habits, state.log, new Date(), firstDataDay());
    toast("Report ready");
  } catch (err) { console.error(err); toast("Export failed"); }
};

/* ---------- navigation ---------- */
function showScreen(name) {
  $("screen-today").classList.toggle("active", name === "today");
  $("screen-output").classList.toggle("active", name === "output");
  $("nav-today").classList.toggle("on", name === "today");
  $("nav-output").classList.toggle("on", name === "output");
  if (name === "output") renderOutput();
}
$("nav-today").onclick = () => showScreen("today");
$("nav-output").onclick = () => showScreen("output");

render();
