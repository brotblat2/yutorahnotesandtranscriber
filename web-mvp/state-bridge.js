(() => {
  if (typeof state !== "undefined") window.state = state;
  if (typeof renderMarkdown === "function") window.renderMarkdown = renderMarkdown;
  if (typeof render === "function") window.renderShiurNotesApp = render;
  if (typeof showToast === "function") window.showToast = showToast;
})();
