/* Calls Android plugins from plain JavaScript (no bundler). Uses the bridge that Capacitor
   injects into the page: Capacitor.nativePromise(plugin, method, options). */
const Native = (() => {
  const cap = () => (typeof window !== "undefined" ? window.Capacitor : null);
  const isNative = () => { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); };
  function call(plugin, method, options) {
    const c = cap();
    if (!c) return Promise.reject(new Error("not running in the app"));
    const p = c.Plugins && c.Plugins[plugin];
    if (p && typeof p[method] === "function") return p[method](options || {});
    if (typeof c.nativePromise === "function") return c.nativePromise(plugin, method, options || {});
    return Promise.reject(new Error("native bridge unavailable"));
  }
  const api = { isNative, call };
  if (typeof module !== "undefined") module.exports = api;
  return api;
})();
