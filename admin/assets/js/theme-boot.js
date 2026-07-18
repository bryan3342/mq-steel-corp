// Pre-paint theme bootstrap. Loaded render-blocking in <head> BEFORE the stylesheet so
// the correct theme is set on <html> before first paint (no flash of the wrong theme).
// Must be a same-origin file: the admin CSP has no 'unsafe-inline'/nonce on script-src,
// so an inline <script> would be blocked. app.js owns the toggle; this only sets the
// initial attribute. Keep in sync with THEME_KEY in app.js ('mq_admin_theme').
(function () {
  // Default to light; use the saved theme only if the owner switched to dark.
  try {
    var t = localStorage.getItem('mq_admin_theme');
    document.documentElement.dataset.theme = (t === 'dark') ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
