// Bundled with the shared normalizer by scripts/build-extension.mjs.
(() => {
  if (location.origin !== SCHOOL_ORIGIN) return;
  const key = Symbol.for("kcu.schedule.snapshot.v1");
  let sequence = 0;
  const original = window.fetch;
  window.fetch = function (...args) {
    const result = Reflect.apply(original, this, args);
    let url;
    try {
      url = new URL(
        typeof args[0] === "string" || args[0] instanceof URL
          ? args[0]
          : args[0].url,
        location.href,
      );
    } catch {
      return result;
    }
    if (
      url.origin !== SCHOOL_ORIGIN ||
      !["/api/widgets/todoList", "/api/widgets/todoList/reload"].includes(
        url.pathname,
      )
    )
      return result;
    const request = ++sequence;
    // Invalidate an older account/session snapshot as soon as a new request starts.
    window[key] = null;
    result
      .then(async (response) => {
        if (
          !response.ok ||
          response.redirected ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          return;
        try {
          const raw = await response.clone().json();
          const snapshot = normalizePortal(raw);
          if (request === sequence) window[key] = snapshot;
        } catch {
          /* Unsupported responses never replace the user's saved calendar. */
        }
      })
      .catch(() => {});
    return result;
  };
})();
