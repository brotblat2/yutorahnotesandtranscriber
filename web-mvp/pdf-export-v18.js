(() => {
  const PAGE_WIDTH = 816;
  const PAGE_HEIGHT = 1056;
  const PAGE_MARGIN = 54;
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
  const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2;
  const PAGE_RENDER_SCALE = 1.35;
  const MAX_SOURCE_HEIGHT = 16000;
  const BREAK_BACKTRACK = 24;
  const RTL_THRESHOLD = 0.70;

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

  function documentDirection(value = "") {
    const text = String(value);
    const hebrew = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const letters = hebrew + latin;
    if (!letters) return "ltr";
    return hebrew / letters >= RTL_THRESHOLD ? "rtl" : "ltr";
  }

  function exportCss() {
    return `
      * { box-sizing: border-box; }
      .pdf-v18-content {
        width: ${CONTENT_WIDTH}px;
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #202124;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, Arial, David, sans-serif;
        font-size: 14.67px;
        line-height: 1.8;
      }
      .pdf-v18-content .pdf-title {
        margin: 0 0 7px;
        color: #202124;
        font-size: 29px;
        line-height: 1.2;
        font-weight: 700;
      }
      .pdf-v18-content .pdf-meta {
        margin: 0 0 24px;
        color: #5f6368;
        font-size: 14px;
      }
      .pdf-v18-content h1,
      .pdf-v18-content h2 {
        margin: 25px 0 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid #4285f4;
        color: #202124;
        font-size: 22px;
        line-height: 1.3;
      }
      .pdf-v18-content h3 {
        margin: 20px 0 8px;
        color: #202124;
        font-size: 18px;
        line-height: 1.35;
      }
      .pdf-v18-content h4 {
        margin: 17px 0 7px;
        color: #202124;
        font-size: 16px;
      }
      .pdf-v18-content p { margin: 0 0 12px; }
      .pdf-v18-content ul,
      .pdf-v18-content ol {
        margin: 7px 0 13px;
        padding-inline-start: 25px;
      }
      .pdf-v18-content ul ul,
      .pdf-v18-content ol ol,
      .pdf-v18-content ul ol,
      .pdf-v18-content ol ul { margin: 5px 0 0; }
      .pdf-v18-content li { margin: 5px 0; }
      .pdf-v18-content blockquote {
        margin: 15px 0;
        padding: 8px 14px;
        border-inline-start: 4px solid #4285f4;
        background: #f8f9fa;
        color: #3c4043;
        font-style: italic;
      }
      .pdf-v18-content strong { color: #4285f4; font-weight: 700; }
      .pdf-v18-content em { font-style: italic; }
      .pdf-v18-content[dir="ltr"],
      .pdf-v18-content[dir="ltr"] h1,
      .pdf-v18-content[dir="ltr"] h2,
      .pdf-v18-content[dir="ltr"] h3,
      .pdf-v18-content[dir="ltr"] h4,
      .pdf-v18-content[dir="ltr"] p,
      .pdf-v18-content[dir="ltr"] li,
      .pdf-v18-content[dir="ltr"] blockquote {
        direction: ltr;
        text-align: left;
      }
      .pdf-v18-content[dir="rtl"],
      .pdf-v18-content[dir="rtl"] h1,
      .pdf-v18-content[dir="rtl"] h2,
      .pdf-v18-content[dir="rtl"] h3,
      .pdf-v18-content[dir="rtl"] h4,
      .pdf-v18-content[dir="rtl"] p,
      .pdf-v18-content[dir="rtl"] li,
      .pdf-v18-content[dir="rtl"] blockquote {
        direction: rtl;
        text-align: right;
      }
    `;
  }

  function ensureStyles() {
    if (document.getElementById("pdf-v18-styles")) return;
    const style = document.createElement("style");
    style.id = "pdf-v18-styles";
    style.textContent = exportCss();
    document.head.appendChild(style);
  }

  function buildDocument(note) {
    ensureStyles();
    const root = document.createElement("section");
    root.className = "pdf-v18-content";
    root.style.cssText = [
      "position:absolute",
      "left:-100000px",
      "top:0",
      `width:${CONTENT_WIDTH}px`,
      "height:auto",
      "min-height:0",
      "max-height:none",
      "overflow:visible",
      "margin:0",
      "padding:0",
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

    const direction = documentDirection(note.markdown || root.textContent || "");
    const alignment = direction === "rtl" ? "right" : "left";
    root.dir = direction;
    root.style.direction = direction;
    root.style.textAlign = alignment;
    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, ul, ol").forEach(element => {
      element.dir = direction;
      element.style.direction = direction;
      element.style.textAlign = alignment;
    });

    document.body.appendChild(root);
    return root;
  }

  function svgForDocument(root, height) {
    const clone = root.cloneNode(true);
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${CONTENT_WIDTH}" height="${height}" viewBox="0 0 ${CONTENT_WIDTH} ${height}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <foreignObject x="0" y="0" width="${CONTENT_WIDTH}" height="${height}">
          <div xmlns="http://www.w3.org/1999/xhtml"><style>${exportCss()}</style>${clone.outerHTML}</div>
        </foreignObject>
      </svg>`;
  }

  async function loadRenderedImage(root, rawHeight) {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The browser could not render the PDF document."));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgForDocument(root, rawHeight))}`;
    await loaded;
    return image;
  }

  function rowHasInk(data, row, width) {
    const rowOffset = row * width * 4;
    let dark = 0;
    for (let x = 0; x < width; x += 4) {
      const index = rowOffset + x * 4;
      if (data[index] < 248 || data[index + 1] < 248 || data[index + 2] < 248) {
        dark += 1;
        if (dark >= 2) return true;
      }
    }
    return false;
  }

  function findLastInkRow(context, width, height) {
    const chunkSize = 64;
    for (let chunkBottom = height; chunkBottom > 0; chunkBottom -= chunkSize) {
      const chunkTop = Math.max(0, chunkBottom - chunkSize);
      const chunkHeight = chunkBottom - chunkTop;
      const data = context.getImageData(0, chunkTop, width, chunkHeight).data;
      for (let row = chunkHeight - 1; row >= 0; row--) {
        if (rowHasInk(data, row, width)) return chunkTop + row + 1;
      }
    }
    return 1;
  }

  function isBlankBand(context, y, width) {
    const top = Math.max(0, y - 1);
    const height = Math.min(3, context.canvas.height - top);
    if (height <= 0) return false;
    const data = context.getImageData(0, top, width, height).data;
    let dark = 0;
    for (let index = 0; index < data.length; index += 4 * 4) {
      if (data[index] < 248 || data[index + 1] < 248 || data[index + 2] < 248) {
        dark += 1;
        if (dark >= 3) return false;
      }
    }
    return true;
  }

  function makeSlices(context, actualHeight) {
    const slices = [];
    let start = 0;
    while (start < actualHeight - 1) {
      const physicalEnd = Math.min(actualHeight, start + CONTENT_HEIGHT);
      if (physicalEnd >= actualHeight) {
        slices.push({ start, end: actualHeight });
        break;
      }

      let end = physicalEnd;
      for (let candidate = physicalEnd; candidate >= physicalEnd - BREAK_BACKTRACK; candidate--) {
        if (candidate > start + 80 && isBlankBand(context, candidate, CONTENT_WIDTH)) {
          end = candidate;
          break;
        }
      }
      if (end <= start) end = physicalEnd;
      slices.push({ start, end });
      start = end;
    }
    return slices;
  }

  async function renderSource(root) {
    const measured = Math.max(
      1,
      Math.ceil(root.getBoundingClientRect().height),
      Math.ceil(root.scrollHeight)
    );
    if (measured > MAX_SOURCE_HEIGHT) {
      throw new Error("This document is too long to export on this device.");
    }

    const image = await loadRenderedImage(root, measured);
    const canvas = document.createElement("canvas");
    canvas.width = CONTENT_WIDTH;
    canvas.height = measured;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, CONTENT_WIDTH, measured);

    const lastInk = findLastInkRow(context, canvas.width, canvas.height);
    const actualHeight = Math.min(measured, Math.max(1, lastInk + 18));
    return { canvas, context, actualHeight };
  }

  async function sliceToJpeg(sourceCanvas, slice) {
    const sliceHeight = Math.max(1, slice.end - slice.start);
    const scale = PAGE_RENDER_SCALE;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_WIDTH * scale);
    canvas.height = Math.round(PAGE_HEIGHT * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      sourceCanvas,
      0,
      slice.start,
      CONTENT_WIDTH,
      sliceHeight,
      Math.round(PAGE_MARGIN * scale),
      Math.round(PAGE_MARGIN * scale),
      Math.round(CONTENT_WIDTH * scale),
      Math.round(sliceHeight * scale)
    );

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode the PDF page.")), "image/jpeg", 0.94);
    });
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
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
    const beginObject = number => { offsets[number] = length; appendText(`${number} 0 obj\n`); };
    const endObject = () => appendText("endobj\n");

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

  async function downloadPdf(note, onProgress) {
    if (document.fonts?.ready) await document.fonts.ready;
    const root = buildDocument(note);
    try {
      const source = await renderSource(root);
      const slices = makeSlices(source.context, source.actualHeight);
      const pages = [];
      for (let index = 0; index < slices.length; index++) {
        onProgress?.(index + 1, slices.length);
        pages.push(await sliceToJpeg(source.canvas, slices[index]));
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
      await downloadPdf(note, (current, total) => {
        button.textContent = total > 1 ? `PDF ${current}/${total}` : "Preparing…";
      });
      window.showToast?.("PDF downloaded");
    } catch (error) {
      console.error("PDF v18 export failed:", error);
      window.showToast?.(error.message || "PDF export failed");
      if (!window.showToast) alert(error.message || "PDF export failed");
    } finally {
      button.disabled = false;
      button.textContent = "PDF";
    }
  }, true);
})();
