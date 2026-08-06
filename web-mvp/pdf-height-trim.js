(() => {
  const originalAppendChild = Node.prototype.appendChild;

  function trimPdfRenderRoot(root) {
    if (!(root instanceof HTMLElement) || !root.classList.contains("letter-pdf-content")) return;

    const rootRect = root.getBoundingClientRect();
    let contentBottom = 0;

    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, .pdf-meta").forEach(element => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const marginBottom = Number.parseFloat(style.marginBottom) || 0;
      contentBottom = Math.max(contentBottom, rect.bottom - rootRect.top + marginBottom);
    });

    if (contentBottom <= 0) return;
    const croppedHeight = Math.ceil(contentBottom + 2);
    root.style.height = `${croppedHeight}px`;
    root.style.minHeight = "0";
    root.style.maxHeight = `${croppedHeight}px`;
    root.style.overflow = "hidden";
  }

  Node.prototype.appendChild = function appendChildWithPdfCrop(node) {
    const result = originalAppendChild.call(this, node);
    trimPdfRenderRoot(node);
    return result;
  };
})();
