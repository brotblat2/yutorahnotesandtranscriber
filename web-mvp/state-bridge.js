(() => {
  if (typeof state !== "undefined") window.state = state;
  if (typeof renderMarkdown === "function") window.renderMarkdown = renderMarkdown;
  if (typeof showToast === "function") window.showToast = showToast;
})();
