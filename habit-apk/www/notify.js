/* Habit reminders. Uses Android local notifications when running inside the app;
   does nothing in a normal browser.

   A habit's reminders depend on how often the habit repeats:
     daily   -> notify.times  = ["09:00", ...]                    every day at those times
     weekly  -> notify.items  = [{wd, time}, ...]                 e.g. every Monday at 10:00
     monthly -> notify.items  = [{nth, wd, time}, ...]            e.g. the 2nd Monday at 10:00
   wd: 0 = Sunday ... 6 = Saturday.  nth: 1-4, or 5 = the last one of the month. */
const Notify = (() => {
  const N = typeof Native !== "undefined" ? Native : require("./native.js");
  const isNative = () => N.isNative();
  const LN = (method, options) => N.call("LocalNotifications", method, options);

  const WD_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const NTH_NAMES = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "Last" };
  const MAX = { day: 6, week: 7, month: 6 };
  const MONTHS_AHEAD = 12;

  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 200000; };
  // habit x reminder (up to 10) x month (up to 12): stays under the 32-bit limit
  const notifId = (habitId, i, m = 0) => (hash(habitId) * 10 + i) * 128 + m;      // m < 128

  /** Evenly spread default times between 09:00 and 21:00. */
  function defaultTimes(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = n === 1 ? 9 : 9 + Math.round((i * 12) / (n - 1));
      out.push(String(h).padStart(2, "0") + ":00");
    }
    return out;
  }

  /** Sensible starting reminders for a weekly / monthly habit. */
  function defaultItems(freq, n) {
    const WEEK = [1, 4, 2, 5, 3, 6, 0];          // Mon, Thu, Tue, Fri, Wed, Sat, Sun
    const NTH = [2, 4, 1, 3, 5, 2];
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(freq === "month"
        ? { nth: NTH[i % NTH.length], wd: 1, time: "10:00" }
        : { wd: WEEK[i % WEEK.length], time: "10:00" });
    }
    return out;
  }

  const validTime = (t) => /^(\d{1,2}):(\d{2})$/.test(t || "") && +t.split(":")[0] < 24 && +t.split(":")[1] < 60;

  /** Clean up a list of weekly/monthly reminders (also used when restoring a backup). */
  function cleanItems(items, freq) {
    if (!Array.isArray(items)) return [];
    return items
      .filter((x) => x && Number.isInteger(x.wd) && x.wd >= 0 && x.wd <= 6 && validTime(x.time))
      .map((x) => {
        const o = { wd: x.wd, time: x.time.padStart(5, "0") };
        if (freq === "month") o.nth = Number.isInteger(x.nth) && x.nth >= 1 && x.nth <= 5 ? x.nth : 1;
        return o;
      })
      .slice(0, MAX[freq] || 6);
  }

  /** Number of reminders a habit will actually send. */
  function count(h) {
    if (!h.notify || !h.notify.on) return 0;
    return h.freq === "day" ? (h.notify.times || []).length : (h.notify.items || []).length;
  }

  /** Human-readable description of one reminder. */
  function describe(freq, x) {
    if (freq === "month") return `${NTH_NAMES[x.nth]} ${WD_NAMES[x.wd]} of the month at ${x.time}`;
    if (freq === "week") return `Every ${WD_NAMES[x.wd]} at ${x.time}`;
    return `Every day at ${x}`;
  }

  /** The date of the nth (1-4, 5 = last) weekday `wd` in a month. */
  function nthWeekday(year, month, wd, nth) {
    if (nth === 5) {
      const last = new Date(year, month + 1, 0);
      return new Date(year, month, last.getDate() - ((last.getDay() - wd + 7) % 7));
    }
    const first = new Date(year, month, 1);
    return new Date(year, month, 1 + ((wd - first.getDay() + 7) % 7) + (nth - 1) * 7);
  }

  function body(h) {
    if (h.freq === "day") return h.target > 1 ? `Time for your habit (${h.target}× today).` : "Time for your habit today.";
    if (h.freq === "week") return `Keep going: ${h.target}× this week.`;
    return `Keep going: ${h.target}× this month.`;
  }

  /** Habits with an end date get explicit one-off reminders up to (and including) that day,
   *  so nothing keeps firing after they expire even if the app isn't opened. */
  function buildUntilDeadline(h, common, now) {
    const out = [];
    const [y, m, d] = h.deadline.split("-").map(Number);
    const last = new Date(y, m - 1, d, 23, 59, 59);
    const at = (day, t) => { const [hh, mm] = t.split(":").map(Number); const x = new Date(day); x.setHours(hh, mm, 0, 0); return x; };
    const push = (i, k, when) => { if (when > now && k < 128) out.push({ ...common, id: notifId(h.id, i, k), schedule: { at: when.toISOString(), allowWhileIdle: true } }); };
    const items = h.freq === "day" ? [] : cleanItems(h.notify.items, h.freq);
    const times = h.freq === "day" ? (h.notify.times || []).slice(0, 10).filter(validTime).map((t) => t.padStart(5, "0")) : [];
    const counters = {};
    const days = Math.min(120, Math.floor((last - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5) + 1);
    for (let n = 0; n < days; n++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
      if (h.freq === "day") {
        times.forEach((t, i) => push(i, n, at(day, t)));
      } else {
        items.forEach((x, i) => {
          const hit = h.freq === "week" ? day.getDay() === x.wd : nthWeekday(day.getFullYear(), day.getMonth(), x.wd, x.nth).getDate() === day.getDate() && day.getDay() === x.wd;
          if (hit) { counters[i] = (counters[i] || 0) + 1; push(i, counters[i] - 1, at(day, x.time)); }
        });
      }
    }
    return out;
  }

  /** Build the list of notifications for the habits (pure, testable). */
  function build(habits, now = new Date()) {
    const list = [];
    for (const h of habits) {
      if (!h.notify || !h.notify.on) continue;
      const title = `${h.icon} ${h.name}`;
      const common = { title, body: body(h), smallIcon: "ic_stat_moon" };

      if (h.deadline && /^\d{4}-\d{2}-\d{2}$/.test(h.deadline)) {
        list.push(...buildUntilDeadline(h, common, now));
      } else if (h.freq === "day") {
        (Array.isArray(h.notify.times) ? h.notify.times : []).slice(0, 10).forEach((t, i) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
          if (!m) return;
          list.push({ ...common, id: notifId(h.id, i), schedule: { on: { hour: +m[1], minute: +m[2] }, allowWhileIdle: true } });
        });
      } else if (h.freq === "week") {
        cleanItems(h.notify.items, "week").forEach((x, i) => {
          const [hh, mm] = x.time.split(":").map(Number);
          // Capacitor weekdays run 1 (Sunday) to 7 (Saturday) and repeat every week
          list.push({ ...common, id: notifId(h.id, i), schedule: { on: { weekday: x.wd + 1, hour: hh, minute: mm }, allowWhileIdle: true } });
        });
      } else {
        // "2nd Monday of the month" can't repeat on its own, so schedule the next dates
        // explicitly. The app tops this up every time it opens.
        cleanItems(h.notify.items, "month").forEach((x, i) => {
          const [hh, mm] = x.time.split(":").map(Number);
          for (let k = 0; k < MONTHS_AHEAD + 1; k++) {
            const d = nthWeekday(now.getFullYear(), now.getMonth() + k, x.wd, x.nth);
            d.setHours(hh, mm, 0, 0);
            if (d <= now) continue;
            list.push({ ...common, id: notifId(h.id, i, k), schedule: { at: d.toISOString(), allowWhileIdle: true } });
          }
        });
      }
    }
    return list;
  }

  async function ask() {
    if (!isNative()) return true;
    try {
      let p = await LN("checkPermissions");
      if (p.display !== "granted") p = await LN("requestPermissions");
      return p.display === "granted";
    } catch (e) { return false; }
  }

  /** Replace every scheduled reminder with the current habit settings. */
  async function sync(habits) {
    if (!isNative()) return;
    try {
      const pending = await LN("getPending");
      if (pending.notifications && pending.notifications.length) {
        await LN("cancel", { notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
      const list = build(habits);
      if (!list.length) return;
      const p = await LN("checkPermissions");
      if (p.display !== "granted") return;
      await LN("schedule", { notifications: list });
    } catch (e) { console.error("reminder sync failed", e); }
  }

  const api = {
    isNative, defaultTimes, defaultItems, cleanItems, count, describe, nthWeekday, build, ask, sync, notifId,
    WD_NAMES, NTH_NAMES, MAX,
  };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
