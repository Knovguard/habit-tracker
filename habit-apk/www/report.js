/* Builds one printable report sheet (week / month / year) inside an ExcelJS workbook. */
const ReportSheet = (() => {
  const S = typeof Scoring !== "undefined" ? Scoring : require("./scoring.js");

  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const GRADE_FILL = { S: "FFFFE066", A: "FF8FE3A8", B: "FFC4EA8A", C: "FFFFE08A", D: "FFFFC38A", E: "FFFFA58A", F: "FFFF8A8A" };
  const FREQ_SOFT = { day: "FFD4F5E0", week: "FFFFF1B8", month: "FFFFD0D0" };
  const FREQ_HARD = { day: "FF4FD18B", week: "FFFFC83D", month: "FFFF6B6B" };
  const FREQ_WORD = { day: "Daily", week: "Weekly", month: "Monthly" };
  const NAVY = "FF1F2937", PALE = "FFF3F4F6", MID = "FF9CA3AF", INK = "FF111827", WHITE = "FFFFFFFF";

  const LAYOUT = {
    week:  { n: 7,  w: 11,  spans: [1, 1, 1, 1, 1, 1] },
    month: { n: 31, w: 4.4, spans: [3, 3, 2, 3, 3, 2] },
    year:  { n: 12, w: 8.5, spans: [2, 2, 1, 1, 2, 1] },
  };

  const dShort = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;
  const dFull = (d) => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;

  function label(kind, s) {
    if (kind === "year") return String(s.getFullYear());
    if (kind === "month") return `${MONTH[s.getMonth()]} ${s.getFullYear()}`;
    const w = S.isoWeek(s);
    return `Week ${w.week}, ${w.year}`;
  }
  function sheetName(kind, s) {
    if (kind === "year") return `Year ${s.getFullYear()}`;
    if (kind === "month") return `${MON[s.getMonth()]} ${s.getFullYear()}`;
    const w = S.isoWeek(s);
    return `W${String(w.week).padStart(2, "0")} ${w.year}`;
  }
  function rangeText(kind, s, e) {
    return kind === "year" ? `1 Jan to 31 Dec ${s.getFullYear()}` : `${dShort(s)} to ${dFull(e)}`;
  }

  const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const thin = { style: "thin", color: { argb: "FF9CA3AF" } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

  /** Write a value into [row, col..col+span-1], merged, styled. */
  function put(ws, row, col, span, value, o = {}) {
    if (span > 1) ws.mergeCells(row, col, row, col + span - 1);
    const c = ws.getCell(row, col);
    c.value = value;
    c.font = { name: "Calibri", size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || INK } };
    c.alignment = { vertical: "middle", horizontal: o.align || "center", wrapText: !!o.wrap, indent: o.indent || 0 };
    if (o.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    if (o.border !== false) for (let k = col; k < col + span; k++) ws.getCell(row, k).border = BORDER;
    if (o.border !== false && span > 1) for (let k = col; k < col + span; k++) {
      if (o.fill) ws.getCell(row, k).fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    }
    return c;
  }

  /** Habit name for the first column; habits with an end date say when they run until. */
  const habitLabel = (h) => `${h.icon}  ${h.name}` + (h.deadline ? `  (until ${S.parse(h.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : "");

  /** Add a report worksheet. opts: { indexSheet?: string } adds a "back to index" link. */
  function addSheet(wb, habits, log, kind, start, end, today, opts = {}) {
    const L = LAYOUT[kind];
    const lastCol = 2 + L.n;                       // A + grid + Total
    const ws = wb.addWorksheet(sheetName(kind, start), {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: kind === "year" ? "FF3B82F6" : kind === "month" ? "FF8B5CF6" : "FF14B8A6" } },
    });
    ws.getColumn(1).width = 38;
    for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = c === lastCol ? Math.max(L.w, 8) : L.w;

    const upTo = S.addDays(today, -1);               // today is still being logged, so scores stop at yesterday
    const rep = S.buildReport(habits, log, kind, start, end, upTo);
    const inProgress = end > upTo;

    /* ---- title ---- */
    ws.getRow(1).height = 38;
    put(ws, 1, 1, lastCol, `HABIT PROGRESS  ·  ${label(kind, start).toUpperCase()}`,
      { size: 20, bold: true, color: WHITE, fill: NAVY, border: false });
    ws.getRow(2).height = 22;
    const sub = `${rangeText(kind, start, end)}   |   Generated ${dFull(today)}` +
      (inProgress ? "   |   In progress, scored up to yesterday (today counts once it is over)" : "");
    put(ws, 2, 1, lastCol, sub, { size: 11, color: "FF374151", fill: PALE, border: false });

    if (opts.indexSheet) {
      const c = ws.getCell(3, lastCol);
      ws.mergeCells(3, Math.max(1, lastCol - 5), 3, lastCol);
      const b = ws.getCell(3, Math.max(1, lastCol - 5));
      b.value = { text: "← Back to Output Progress", hyperlink: `#'${opts.indexSheet}'!A1` };
      b.font = { name: "Calibri", size: 10, underline: true, color: { argb: "FF2563EB" } };
      b.alignment = { horizontal: "right" };
    }

    /* ---- overall grade ---- */
    ws.getRow(4).height = 26; ws.getRow(5).height = 26;
    ws.mergeCells(4, 1, 5, 1);
    put(ws, 4, 1, 1, "OVERALL CONSISTENCY", { bold: true, size: 12, fill: PALE, border: false });
    ws.getCell(5, 1).border = {};
    const ov = rep.overall;
    ws.mergeCells(4, 2, 5, 3);
    put(ws, 4, 2, 1, ov ? ov.grade : "–", { bold: true, size: 30, fill: ov ? GRADE_FILL[ov.grade] : PALE, border: false });
    const nScored = rep.rows.filter((r) => !r.skipped).length;
    ws.mergeCells(4, 4, 5, Math.min(lastCol, 4 + 5));
    put(ws, 4, 4, 1, ov ? `${Math.round(ov.pct)}% across ${nScored} habit${nScored === 1 ? "" : "s"}` : "No scored habits yet",
      { size: 13, bold: true, align: "left", indent: 1, border: false });

    /* ---- summary table ---- */
    let r = 7;
    ws.getRow(r).height = 24;
    const heads = ["Habit", "Frequency", "Goal", "Done", "Expected", "Consistency", "Grade"];
    put(ws, r, 1, 1, heads[0], { bold: true, color: WHITE, fill: NAVY });
    let col = 2;
    L.spans.forEach((sp, i) => { put(ws, r, col, sp, heads[i + 1], { bold: true, color: WHITE, fill: NAVY, size: sp === 1 && L.w < 6 ? 9 : 11 }); col += sp; });

    for (const row of rep.rows) {
      r++; ws.getRow(r).height = 22;
      const h = row.habit;
      put(ws, r, 1, 1, habitLabel(h), { align: "left", indent: 1, bold: true, fill: FREQ_SOFT[h.freq] });
      const per = h.freq === "day" ? "day" : h.freq === "week" ? "week" : "month";
      const vals = row.skipped
        ? [FREQ_WORD[h.freq], `${h.target}× / ${per}`, "–", "–", row.habit.freq === "month" ? "monthly" : "not active", "–"]
        : [FREQ_WORD[h.freq], `${h.target}× / ${per}`, row.done, Math.round(row.expected * 10) / 10, `${Math.round(row.pct)}%`, row.grade];
      col = 2;
      L.spans.forEach((sp, i) => {
        const isGrade = i === 5 && !row.skipped;
        put(ws, r, col, sp, vals[i], {
          fill: isGrade ? GRADE_FILL[row.grade] : i === 0 ? FREQ_HARD[h.freq] : undefined,
          bold: isGrade || i === 0, size: isGrade ? 13 : (sp === 1 && L.w < 6 ? 9 : 11),
          color: row.skipped ? "FF6B7280" : INK, italic: !!row.skipped,
        });
        col += sp;
      });
    }

    /* ---- grid ---- */
    r += 2;
    const gridTitle = kind === "year" ? "MONTH-BY-MONTH CONSISTENCY" : "DAILY CHECK-INS";
    put(ws, r, 1, lastCol, gridTitle, { bold: true, size: 12, align: "left", indent: 1, fill: PALE, border: false });
    r++; ws.getRow(r).height = kind === "week" ? 32 : 22;
    put(ws, r, 1, 1, "Habit", { bold: true, color: WHITE, fill: NAVY });

    const days = [];
    if (kind !== "year") for (let d = new Date(start); d <= end; d = S.addDays(d, 1)) days.push(new Date(d));
    for (let i = 0; i < L.n; i++) {
      let txt = "";
      if (kind === "week") txt = `${DOW[i]}\n${days[i].getDate()}`;
      else if (kind === "month") txt = i < days.length ? String(i + 1) : "";
      else txt = MON[i];
      put(ws, r, 2 + i, 1, txt, { bold: true, color: WHITE, fill: i < days.length || kind === "year" ? NAVY : MID, wrap: true, size: kind === "month" ? 9 : 11 });
    }
    put(ws, r, lastCol, 1, kind === "year" ? "Year" : "Total", { bold: true, color: WHITE, fill: NAVY });

    for (const h of habits) {
      r++; ws.getRow(r).height = 22;
      put(ws, r, 1, 1, habitLabel(h), { align: "left", indent: 1, bold: true, fill: FREQ_SOFT[h.freq] });
      if (kind === "year") {
        for (let m = 0; m < 12; m++) {
          const [ms, me] = S.monthRange(new Date(start.getFullYear(), m, 1));
          const row = S.buildReport([h], log, "month", ms, me, upTo).rows[0];
          if (row.skipped) put(ws, r, 2 + m, 1, "–", { fill: PALE, color: MID });
          else put(ws, r, 2 + m, 1, `${row.grade} ${Math.round(row.pct)}%`, { fill: GRADE_FILL[row.grade], size: 10, bold: true });
        }
        const yr = rep.rows.find((x) => x.habit.id === h.id);
        if (yr && !yr.skipped) put(ws, r, lastCol, 1, `${yr.grade} ${Math.round(yr.pct)}%`, { fill: GRADE_FILL[yr.grade], bold: true, size: 10 });
        else put(ws, r, lastCol, 1, "–", { fill: PALE, color: MID });
      } else {
        let total = 0;
        for (let i = 0; i < L.n; i++) {
          if (i >= days.length) { put(ws, r, 2 + i, 1, "", { fill: MID }); continue; }
          const d = days[i], k = S.ymd(d), c = (log[k] || {})[h.id] || 0;
          total += c;
          const before = h.created && k < h.created, future = d > upTo || (h.deadline && k > h.deadline);
          if (c > 0) put(ws, r, 2 + i, 1, c > 1 ? c : "✓", { fill: FREQ_HARD[h.freq], bold: true });
          else put(ws, r, 2 + i, 1, "", { fill: before || future ? "FFE5E7EB" : undefined });
        }
        put(ws, r, lastCol, 1, total, { bold: true, fill: PALE });
      }
    }

    /* ---- key + notes ---- */
    r += 2;
    put(ws, r, 1, 1, "GRADING KEY", { bold: true, align: "left", indent: 1, border: false, fill: PALE });
    const key = [["S", "95%+"], ["A", "85%+"], ["B", "70%+"], ["C", "55%+"], ["D", "40%+"], ["E", "25%+"], ["F", "<25%"]];
    let kc = 2;
    const kspan = kind === "month" ? 3 : kind === "year" ? 1 : 1;
    for (const [g, t] of key) { put(ws, r, kc, kspan, `${g}  ${t}`, { fill: GRADE_FILL[g], bold: true, size: 10 }); kc += kspan; }
    r += 1;
    put(ws, r, 1, lastCol, "Colour code: green = daily habit, yellow = weekly habit, red = monthly habit. Score = completions ÷ expected completions.",
      { italic: true, size: 9, align: "left", indent: 1, color: "FF6B7280", border: false });

    r += 2;
    put(ws, r, 1, lastCol, "NOTES / REFLECTIONS", { bold: true, align: "left", indent: 1, fill: PALE });
    for (let i = 0; i < 4; i++) { r++; ws.getRow(r).height = 24; put(ws, r, 1, lastCol, "", {}); }

    /* ---- print setup ---- */
    ws.pageSetup = {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    };
    ws.headerFooter.oddFooter = `&LHabit Tracker&C${label(kind, start)}&RPrinted &D`;
    ws.pageSetup.printArea = `A1:${colLetter(lastCol)}${r}`;
    return { ws, report: rep };
  }

  const api = { addSheet, label, sheetName, rangeText, GRADE_FILL };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
