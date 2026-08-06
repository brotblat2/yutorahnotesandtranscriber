(() => {
  const PAGE_WIDTH = 816;
  const PAGE_HEIGHT = 1056;
  const PAGE_MARGIN = 54;
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
  const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2;
  const RENDER_SCALE = 1.45;

  function safeFilename(value, fallback = "shiur-notes") {
    return String(value || fallback)
      .normalize("NFKD")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || fallback;
  }

  function currentNote() {
    const appState = window.state;
    if (!appState || !Array.isArray(appState.notes)) return null;
    return appState.notes.find(item => item.id === appState.currentNoteId) || null;
  }

  function isRtlText(value = "") {
    const text = String(value);
    const hebrew = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return hebrew > latin;
  }

  function exportCss() {
    return `
      * { box-sizing: border-box; }
      .continuous-pdf-content {
        width: ${CONTENT_WIDTH}px;
        background: #ffffff;
        color: #202124;
        font-family: Arial, David, sans-serif;
        font-size: 16px;
        line-height: 1.58;
      }
      .continuous-pdf-content .pdf-title {
        margin: 0 0 7px;
        color: #202124;
        font-size: 29px;
        line-height: 1.2;
        font-weight: 700;
      }
      .continuous-pdf-content .pdf-meta {
        margin: 0 0 24px;
        color: #5f6368;
        font-size: 14px;
      }
      .continuous-pdf-content h1,
      .continuous-pdf-content h2 {
        margin: 25px 0 10px;
        padding-bottom: 6px;
        border-bottom: 2px solid #4285f4;
        color: #202124;
        font-size: 22px;
        line-height: 1.3;
      }
      .continuous-pdf-content h3 {
        margin: 20px 0 8px;
        color: #202124;
        font-size: 18px;
        line-height: 1.35;
      }
      .continuous-pdf-content h4 {
        margin: 17px 0 7px;
        color: #202124;
        font-size: 16px;
      }
      .continuous-pdf-content p { margin: 0 0 12px; }
      .continuous-pdf-content ul,
      .continuous-pdf-content ol {
        margin: 7px 0 13px;
        padding-inline-start: 25px;
      }
      .continuous-pdf-content ul ul,
      .continuous-pdf-content ol ol,
      .continuous-pdf-content ul ol,
      .continuous-pdf-content ol ul { margin: 5px 0 0; }
      .continuous-pdf-content li { margin: 5px 0; }
      .continuous-pdf-content blockquote {
        margin: 15px 0;
        padding: 8px 14px;
        border-inline-start: 4px solid #4285f4;
        background: #f8f9fa;
        color: #3c4043;
        font-style: italic;
      }
      .continuous-pdf-content strong { color: #3367d6; font-weight: 700; }
      .continuous-pdf-content em { font-style: italic; }
      .continuous-pdf-content [dir="rtl"] { text-align: right; }
    `;
  }

  function ensureMeasurementStyles() {
    let style = document.getElementById("continuous-pdf-export-styles");
    if (style) return;
    style = document.createElement("style");
    style.id = "continuous-pdf-export-styles";
    style.textContent = exportCss();
    document.head.appendChild(style);
  }

  function applyDirections(root) {
    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach(element => {
      const rtl = isRtlText(element.textContent || "");
      element.dir = rtl ? "rtl" : "ltr";
      element.style.direction = rtl ? "rtl" : "ltr";
      element.style.textAlign = rtl ? "right" : "left";
    });
  }

  function buildContinuousDocument(note) {
    ensureMeasurementStyles();
    const root = document.createElement("section");
    root.className = "continuous-pdf-content";
    root.style.cssText = [
      "position:absolute",
      "left:-100000px",
      "top:0",
      `width:${CONTENT_WIDTH}px`,
      "background:#ffffff",
      "color:#202124",
      "z-index:-1"
    ].join(";");

    const title = document.createElement("h1");
    title.className = "pdf-title";
    title.textContent = note.title || "Shiur Notes";
    root.appendChild(title);

    const metadata = [note.speaker, note.type ? String(note.type).replace(/_/g, " ") : ""]
      .filter(Boolean)
      .join(" · ");
    if (metadata) {
      const meta = document.createElement("div");
      meta.className = "pdf-meta";
      meta.textContent = metadata;
      root.appendChild(meta);
    }

    const visibleDocument = document.querySelector(".document");
    const body = document.createElement("div");
    if (visibleDocument) body.innerHTML = visibleDocument.innerHTML;
    else if (typeof window.renderMarkdown === "function") body.innerHTML = window.renderMarkdown(note.markdown || "");
    else body.textContent = note.markdown || "";
    while (body.firstChild) root.appendChild(body.firstChild);

    applyDirections(root);
    document.body.appendChild(root);
    return root;
  }

  function collectSafeCuts(root) {
    const rootRect = root.getBoundingClientRect();
    const cuts = new Set([0, Math.ceil(root.scrollHeight)]);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        const bottom = Math.ceil(rect.bottom - rootRect.top + 2);
        if (bottom > 0) cuts.add(bottom);
      }
    }

    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach(element => {
      const rect = element.getBoundingClientRect();
      cuts.add(Math.ceil(rect.bottom - rootRect.top + 2));
    });

    return [...cuts].filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  }

  function chooseSlices(totalHeight, safeCuts) {
    const slices = [];
    let start = 0;

    while (start < totalHeight - 1) {
      const target = Math.min(totalHeight, start + CONTENT_HEIGHT);
      if (target >= totalHeight) {
        slices.push({ start, end: totalHeight });
        break;
      }

      let end = start;
      for (const cut of safeCuts) {
        if (cut <= start + 40) continue;
        if (cut > target) break;
        end = cut;
      }

      // Never leave a large blank area simply to protect a block. If there is no
      // line boundary near the bottom, use the physical page limit.
      if (end < start + CONTENT_HEIGHT * 0.82) end = target;
      if (end <= start) end = Math.min(totalHeight, start + CONTENT_HEIGHT);

      slices.push({ start, end });
      start = end;
    }

    return slices;
  }

  function svgForDocument(root, height) {
    const clone = root.cloneNode(true);
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${CONTENT_WIDTH}" height="${height}" viewBox="0 0 ${CONTENT_WIDTH} ${height}">
        <foreignObject x="0" y="0" width="${CONTENT_WIDTH}" height="${height}">
          <div xmlns="http://www.w3.org/1999/xhtml"><style>${exportCss()}</style>${clone.outerHTML}</div>
        </foreignObject>
      </svg>`;
  }

  async function renderDocumentImage(root, height) {
    const svg = svgForDocument(root, height);
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The browser could not render the PDF document."));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    return image;
  }

  async function sliceToJpeg(image, slice) {
    const sliceHeight = Math.max(1, slice.end - slice.start);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_WIDTH * RENDER_SCALE);
    canvas.height = Math.round(PAGE_HEIGHT * RENDER_SCALE);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(RENDER_SCALE, RENDER_SCALE);
    context.drawImage(
      image,
      0,
      slice.start,
      CONTENT_WIDTH,
      sliceHeight,
      PAGE_MARGIN,
      PAGE_MARGIN,
      CONTENT_WIDTH,
      sliceHeight
    );

    const jpegBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode the PDF page.")), "image/jpeg", 0.94);
    });

    return {
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height
    };
  }

  function buildPdf(images) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;

    const appendBytes = bytes => { chunks.push(bytes); length += bytes.length; };
    const appendText = text => appendBytes(encoder.encode(text));

    appendBytes(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));

    const pageObjects = [];
    const imageObjects = [];
    const contentObjects = [];
    let nextObject = 3;
    images.forEach(() => {
      pageObjects.push(nextObject++);
      imageObjects.push(nextObject++);
      contentObjects.push(nextObject++);
    });
    const objectCount = nextObject - 1;

    const beginObject = number => { offsets[number] = length; appendText(`${number} 0 obj\n`); };
    const endObject = () => appendText("endobj\n");

    beginObject(1);
    appendText("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObject();

    beginObject(2);
    appendText(`<< /Type /Pages /Count ${images.length} /Kids [${pageObjects.map(number => `${number} 0 R`).join(" ")}] >>\n`);
    endObject();

    images.forEach((image, index) => {
      const pageNumber = pageObjects[index];
      const imageNumber = imageObjects[index];
      const contentNumber = contentObjects[index];
      const imageName = `Im${index + 1}`;

      beginObject(pageNumber);
      appendText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /${imageName} ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>\n`);
      endObject();

      beginObject(imageNumber);
      appendText(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
      appendBytes(image.bytes);
      appendText("\nendstream\n");
      endObject();

      const stream = `q\n612 0 0 792 0 0 cm\n/${imageName} Do\nQ\n`;
      const streamBytes = encoder.encode(stream);
      beginObject(contentNumber);
      appendText(`<< /Length ${streamBytes.length} >>\nstream\n`);
      appendBytes(streamBytes);
      appendText("endstream\n");
      endObject();
    });

    const xrefOffset = length;
    appendText(`xref\n0 ${objectCount + 1}\n`);
    appendText("0000000000 65535 f \n");
    for (let number = 1; number <= objectCount; number++) {
      appendText(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(chunks, { type: "application/pdf" });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function downloadContinuousPdf(note, onProgress) {
    if (document.fonts?.ready) await document.fonts.ready;
    const root = buildContinuousDocument(note);
    try {
      const totalHeight = Math.max(1, Math.ceil(root.scrollHeight));
      const safeCuts = collectSafeCuts(root);
      const slices = chooseSlices(totalHeight, safeCuts);
      const image = await renderDocumentImage(root, totalHeight);
      const pages = [];
      for (let index = 0; index < slices.length; index++) {
        onProgress?.(index + 1, slices.length);
        pages.push(await sliceToJpeg(image, slices[index]));
      }
      const pdf = buildPdf(pages);
      triggerDownload(pdf, `${safeFilename(`${note.title || "Shiur Notes"}-${note.type || "notes"}`)}.pdf`);
    } finally {
      root.remove();
    }
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest?.("#downloadPdf");
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const note = currentNote();
    if (!note || button.disabled) return;

    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      await downloadContinuousPdf(note, (current, total) => {
        button.textContent = total > 1 ? `PDF ${current}/${total}` : "Preparing…";
      });
      window.showToast?.("PDF downloaded");
    } catch (error) {
      console.error("Continuous PDF export failed:", error);
      window.showToast?.(error.message || "PDF export failed");
      if (!window.showToast) alert(error.message || "PDF export failed");
    } finally {
      button.disabled = false;
      button.textContent = "PDF";
    }
  }, true);
})();
