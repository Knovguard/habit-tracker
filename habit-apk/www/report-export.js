/* Workbook builders + download. Global `Report` (browser) / module.exports (Node tests). */
const Report = (() => {
  const XL = typeof ExcelJS !== "undefined" ? ExcelJS : require("exceljs");
  const S = typeof Scoring !== "undefined" ? Scoring : require("./scoring.js");
  const RS = typeof ReportSheet !== "undefined" ? ReportSheet : require("./report.js");

  const INDEX = "Output Progress";
  const NAVY = "FF1F2937", PALE = "FFF3F4F6", WHITE = "FFFFFFFF";
  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const newBook = () => {
    const wb = new XL.Workbook();
    wb.creator = "Habit Tracker";
    wb.created = new Date();
    return wb;
  };
  const fileSafe = (s) => s.replace(/[\\/:*?"<>|,]/g, "").trim();

  /** One period, one sheet. */
  function makeOne(kind, start, end, habits, log, today) {
    const wb = newBook();
    RS.addSheet(wb, habits, log, kind, start, end, today);
    return wb;
  }

  /** Everything in one workbook, with a navigable "Output Progress" tab first. */
  function makeAll(habits, log, today, firstDay) {
    const wb = newBook();
    const idx = wb.addWorksheet(INDEX, {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: "FFF59E0B" } },
    });
    idx.getColumn(1).width = 26; idx.getColumn(2).width = 32; idx.getColumn(3).width = 14; idx.getColumn(4).width = 10;

    const sections = [
      ["YEARLY RESULTS", "year"],
      ["MONTHLY RESULTS", "month"],
      ["WEEKLY RESULTS", "week"],
    ];
    const built = [];
    for (const [title, kind] of sections) {
      const items = [];
      for (const [s, e] of S.listPeriods(kind, firstDay, today)) {
        const { report } = RS.addSheet(wb, habits, log, kind, s, e, today, { indexSheet: INDEX });
        items.push({ kind, s, e, report });
      }
      built.push({ title, kind, items });
    }

    // title
    idx.mergeCells("A1:D1");
    const t = idx.getCell("A1");
    t.value = "HABIT PROGRESS  ·  OUTPUT PROGRESS";
    t.font = { name: "Calibri", size: 20, bold: true, color: { argb: WHITE } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    t.alignment = { vertical: "middle", horizontal: "center" };
    idx.getRow(1).height = 38;
    idx.mergeCells("A2:D2");
    const st = idx.getCell("A2");
    st.value = "Click any period to open its report. Each report has a link back to this page.";
    st.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF374151" } };
    st.alignment = { horizontal: "center" };

    let r = 4;
    const thin = { style: "thin", color: { argb: "FF9CA3AF" } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    const cell = (row, col, value, o = {}) => {
      const c = idx.getCell(row, col);
      c.value = value;
      c.font = { name: "Calibri", size: o.size || 11, bold: !!o.bold, color: { argb: o.color || "FF111827" }, underline: !!o.link };
      c.alignment = { vertical: "middle", horizontal: o.align || "left", indent: o.align ? 0 : 1 };
      c.border = box;
      if (o.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    };

    for (const sec of built) {
      idx.mergeCells(r, 1, r, 4);
      const h = idx.getCell(r, 1);
      h.value = sec.title;
      h.font = { name: "Calibri", size: 12, bold: true };
      h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
      idx.getRow(r).height = 22;
      r++;
      ["Period", "Dates", "Consistency", "Grade"].forEach((x, i) =>
        cell(r, i + 1, x, { bold: true, color: WHITE, fill: NAVY, align: i < 2 ? "left" : "center" }));
      r++;
      for (const it of sec.items) {
        const name = RS.sheetName(it.kind, it.s);
        const ov = it.report.overall;
        idx.getRow(r).height = 20;
        cell(r, 1, { text: RS.label(it.kind, it.s), hyperlink: `#'${name}'!A1` }, { link: true, color: "FF2563EB" });
        cell(r, 2, RS.rangeText(it.kind, it.s, it.e));
        cell(r, 3, ov ? `${Math.round(ov.pct)}%` : "–", { align: "center" });
        cell(r, 4, ov ? ov.grade : "–", { align: "center", bold: true, size: 13, fill: ov ? RS.GRADE_FILL[ov.grade] : PALE });
        r++;
      }
      r++;
    }

    idx.pageSetup = {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    };
    idx.headerFooter.oddFooter = "&LHabit Tracker&CPage &P of &N&RPrinted &D";
    idx.views = [{ showGridLines: false, state: "frozen", ySplit: 2 }];
    return wb;
  }

  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function download(wb, filename) {
    const buf = await wb.xlsx.writeBuffer();

    // Inside the Android app: blob downloads don't work in a WebView, so write the file
    // and open the share sheet (save to Files/Drive, or open in Excel/Sheets).
    if (typeof Native !== "undefined" && Native.isNative()) {
      const saved = await Native.call("Filesystem", "writeFile", { path: filename, data: toBase64(buf), directory: "CACHE" });
      await Native.call("Share", "share", { title: filename, url: saved.uri, dialogTitle: "Save or open your report" });
      return;
    }

    const blob = new Blob([buf], { type: MIME });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const api = {
    makeOne, makeAll, INDEX,
    exportOne: (kind, s, e, habits, log, today) =>
      download(makeOne(kind, s, e, habits, log, today), `Habit Progress - ${fileSafe(RS.label(kind, s))}.xlsx`),
    exportAll: (habits, log, today, firstDay) =>
      download(makeAll(habits, log, today, firstDay), `Habit Progress - Output Progress ${today.getFullYear()}.xlsx`),
  };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
