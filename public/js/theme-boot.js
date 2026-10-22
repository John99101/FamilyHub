// Runs before the page is drawn, so the chosen light or dark look never flickers.
(function () {
  var theme = 'auto';
  try { theme = localStorage.getItem('familyhub-theme') || 'auto'; } catch (e) { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') theme = 'auto';
  document.documentElement.setAttribute('data-theme', theme);
})();
