/* Pure logic: dates, periods, expected counts, scores and grades.
   Works in the browser (global `Scoring`) and in Node (module.exports). */
const Scoring = (() => {
  const GRADES = ["F", "E", "D", "C", "B", "A", "S"];
  const THRESHOLDS = [ ["S", 95], ["A", 85], ["B", 70], ["C", 55], ["D", 40], ["E", 25], ["F", 0] ];

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const isLeap = (y) => new Date(y, 1, 29).getMonth() === 1;
  const dayOfYear = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1;
  const diffDays = (a, b) => Math.round((b - a) / 864e5) + 1; // inclusive

  // Monday-based week
  const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const weekRange = (d) => { const s = weekStart(d); return [s, addDays(s, 6)]; };
  const monthRange = (d) => [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
  const yearRange = (d) => [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31)];

  // ISO week number (for labels)
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { week: Math.ceil(((t - y0) / 864e5 + 1) / 7), year: t.getUTCFullYear() };
  }

  const gradeFor = (pct) => THRESHOLDS.find(([, min]) => pct >= min)[0];

  /** Clip [start,end] to the days the habit has existed and that are not in the future. */
  function activeRange(habit, start, end, today) {
    const created = habit.created ? parse(habit.created) : start;
    const s = created > start ? created : start;
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());   // ignore the time of day
    const e = end > day ? day : end;
    return s > e ? null : [s, e];
  }

  /** Expected number of completions for a habit over [s,e] (already clipped). */
  function expected(habit, s, e) {
    const n = diffDays(s, e);
    if (habit.freq === "day") return habit.target * n;
    if (habit.freq === "week") return habit.target * (n / 7);
    // month: pro-rate month by month so a full month == target exactly
    let total = 0;
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      total += habit.target / daysInMonth(d.getFullYear(), d.getMonth());
    }
    return total;
  }

  /** Completions actually logged over [s,e]. Daily habits cap at target per day. */
  function done(habit, log, s, e) {
    let total = 0;
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      const c = (log[ymd(d)] || {})[habit.id] || 0;
      total += habit.freq === "day" ? Math.min(c, habit.target) : c;
    }
    return total;
  }

  /**
   * Build a report for one period.
   * kind: "week" | "month" | "year". Weekly reports skip monthly habits
   * (a twice-a-month habit can't be judged fairly inside a single week).
   */
  function buildReport(habits, log, kind, start, end, today) {
    const rows = [];
    for (const h of habits) {
      if (kind === "week" && h.freq === "month") {
        rows.push({ habit: h, skipped: true });
        continue;
      }
      const r = activeRange(h, start, end, today);
      if (!r) { rows.push({ habit: h, skipped: true }); continue; }
      const exp = expected(h, r[0], r[1]);
      const dn = done(h, log, r[0], r[1]);
      const pct = exp > 0 ? Math.min(100, (dn / exp) * 100) : 100;
      rows.push({ habit: h, expected: exp, done: dn, pct, grade: gradeFor(pct) });
    }
    const scored = rows.filter((r) => !r.skipped);
    const avg = scored.length ? scored.reduce((a, r) => a + r.pct, 0) / scored.length : null;
    return { kind, start, end, rows, overall: avg === null ? null : { pct: avg, grade: gradeFor(avg) } };
  }

  /** How much of one day's goals were hit. Daily habits: done / target. Weekly and monthly
   *  habits count (as done) on the days they are checked and never count against the other days.
   *  score is null when nothing applies to that day. */
  function dayHeat(habits, log, key) {
    const rec = log[key] || {};
    let due = 0, done = 0;
    for (const h of habits) {
      if (h.created && h.created > key) continue;
      const c = rec[h.id] || 0;
      if (h.freq === "day") { due += h.target; done += Math.min(c, h.target); }
      else if (c > 0) { due += c; done += c; }
    }
    return { due, done, score: due > 0 ? done / due : null };
  }

  /** Streak of consecutive met periods (days for daily, weeks for weekly, months for monthly habits).
   *  The current, still-open period never breaks a streak: it only adds to it once it is met. */
  function streak(habit, log, today) {
    const created = habit.created ? parse(habit.created) : today;
    const unit = habit.freq === "day" ? "day" : habit.freq === "week" ? "week" : "month";
    const periods = [];
    if (unit === "day") for (let d = created; d <= today; d = addDays(d, 1)) periods.push([d, d]);
    else if (unit === "week") for (let d = weekStart(created); d <= today; d = addDays(d, 7)) periods.push(weekRange(d));
    else for (let d = new Date(created.getFullYear(), created.getMonth(), 1); d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) periods.push(monthRange(d));
    const met = periods.map(([s, e]) => {
      let n = 0;
      for (let d = new Date(s); d <= e && d <= today; d = addDays(d, 1)) n += (log[ymd(d)] || {})[habit.id] || 0;
      return n >= habit.target;
    });
    let best = 0, run = 0;
    for (const m of met) { run = m ? run + 1 : 0; best = Math.max(best, run); }
    let cur = 0, i = met.length - 1;
    if (i >= 0 && !met[i]) i--;                      // current period still open
    for (; i >= 0 && met[i]; i--) cur++;
    return { cur, best, unit };
  }

  /** Periods that have at least started, newest first. `from` = first day of data. */
  function listPeriods(kind, from, today) {
    const out = [];
    if (kind === "year") {
      for (let y = today.getFullYear(); y >= from.getFullYear(); y--) out.push(yearRange(new Date(y, 0, 1)));
    } else if (kind === "month") {
      let d = new Date(today.getFullYear(), today.getMonth(), 1);
      const stop = new Date(from.getFullYear(), from.getMonth(), 1);
      while (d >= stop) { out.push(monthRange(d)); d = new Date(d.getFullYear(), d.getMonth() - 1, 1); }
    } else {
      let d = weekStart(today);
      const stop = weekStart(from);
      while (d >= stop) { out.push(weekRange(d)); d = addDays(d, -7); }
    }
    return out;
  }

  const api = { GRADES, pad, ymd, parse, addDays, daysInMonth, isLeap, dayOfYear, diffDays, weekStart, weekRange,
    monthRange, yearRange, isoWeek, gradeFor, activeRange, expected, done, buildReport, listPeriods, streak, dayHeat };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
