/* Habit reminders. Uses Android local notifications when running inside the app;
   does nothing in a normal browser. */
const Notify = (() => {
  const N = typeof Native !== "undefined" ? Native : require("./native.js");
  const isNative = () => N.isNative();
  const LN = (method, options) => N.call("LocalNotifications", method, options);

  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 200000; };
  const notifId = (habitId, i) => hash(habitId) * 10 + i;       // stays under the 32-bit limit, up to 10 per habit

  /** Evenly spread default times between 09:00 and 21:00. */
  function defaultTimes(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = n === 1 ? 9 : 9 + Math.round((i * 12) / (n - 1));
      out.push(String(h).padStart(2, "0") + ":00");
    }
    return out;
  }

  function body(h) {
    if (h.freq === "day") return h.target > 1 ? `Time for your habit (${h.target}× today).` : "Time for your habit today.";
    if (h.freq === "week") return `Keep going: ${h.target}× this week.`;
    return `Keep going: ${h.target}× this month.`;
  }

  /** Build the list of notifications for the habits (pure, testable). */
  function build(habits) {
    const list = [];
    for (const h of habits) {
      if (!h.notify || !h.notify.on || !Array.isArray(h.notify.times)) continue;
      h.notify.times.slice(0, 10).forEach((t, i) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
        if (!m) return;
        list.push({
          id: notifId(h.id, i),
          title: `${h.icon} ${h.name}`,
          body: body(h),
          schedule: { on: { hour: +m[1], minute: +m[2] }, allowWhileIdle: true },
          smallIcon: "ic_stat_moon",
        });
      });
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

  const api = { isNative, defaultTimes, build, ask, sync, notifId };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
