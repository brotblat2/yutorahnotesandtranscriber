(() => {
  const DOCUMENT_WIDTH = 816;
  const DOCUMENT_MARGIN = 54;
  const CONTENT_WIDTH = DOCUMENT_WIDTH - DOCUMENT_MARGIN * 2;
  const TARGET_SCALE = 1.45;
  const MAX_CANVAS_DIMENSION = 16000;
  const MAX_CANVAS_AREA = 16000000;
  const RTL_DOCUMENT_THRESHOLD = 0.70;

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
    return hebrew / letters >= RTL_DOCUMENT_THRESHOLD ? "rtl" : "ltr";
  }

  function exportCss() {
    return `
      * { box-sizing: border-box; }
      .single-pdf-content {
        width: ${CONTENT_WIDTH}px;
        margin: 0;
        background: #ffffff;
        color: #202124;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, Arial, David, sans-serif;
        font-size: 14.67px;
        line-height: 1.8;
      }
      .single-pdf-content .pdf-title {
        margin: 0 0 7px;
        color: #202124;
        font-size: 29px;
        line-height: 1.2;
        font-weight: 700;
      }
      .single-pdf-content .pdf-meta {
        margin: 0 0 24px;
        color: #5f6368;
        font-size: 14px;
      }
      .single-pdf-content h1,
      .single-pdf-content h2 {
        margin: 25px 0 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid #4285f4;
        color: #202124;
        font-size: 22px;
        line-height: 1.3;
      }
      .single-pdf-content h3 {
        margin: 20px 0 8px;
        color: #202124;
        font-size: 18px;
        line-height: 1.35;
      }
      .single-pdf-content h4 {
        margin: 17px 0 7px;
        color: #202124;
        font-size: 16px;
      }
      .single-pdf-content p { margin: 0 0 12px; }
      .single-pdf-content ul,
      .single-pdf-content ol {
        margin: 7px 0 13px;
        padding-inline-start: 25px;
      }
      .single-pdf-content ul ul,
      .single-pdf-content ol ol,
      .single-pdf-content ul ol,
      .single-pdf-content ol ul { margin: 5px 0 0; }
      .single-pdf-content li { margin: 5px 0; }
      .single-pdf-content blockquote {
        margin: 15px 0;
        padding: 8px 14px;
        border-inline-start: 4px solid #4285f4;
        background: #f8f9fa;
        color: #3c4043;
        font-style: italic;
      }
      .single-pdf-content strong { color: #4285f4; font-weight: 700; }
      .single-pdf-content em { font-style: italic; }
      .single-pdf-content[dir="ltr"],
      .single-pdf-content[dir="ltr"] h1,
      .single-pdf-content[dir="ltr"] h2,
      .single-pdf-content[dir="ltr"] h3,
      .single-pdf-content[dir="ltr"] h4,
      .single-pdf-content[dir="ltr"] p,
      .single-pdf-content[dir="ltr"] li,
      .single-pdf-content[dir="ltr"] blockquote {
        direction: ltr;
        text-align: left;
      }
      .single-pdf-content[dir="rtl"],
      .single-pdf-content[dir="rtl"] h1,
      .single-pdf-content[dir="rtl"] h2,
      .single-pdf-content[dir="rtl"] h3,
      .single-pdf-content[dir="rtl"] h4,
      .single-pdf-content[dir="rtl"] p,
      .single-pdf-content[dir="rtl"] li,
      .single-pdf-content[dir="rtl"] blockquote {
        direction: rtl;
        text-align: right;
      }
    `;
  }

  function ensureStyles() {
    if (document.getElementById("single-page-pdf-styles")) return;
    const style = document.createElement("style");
    style.id = "single-page-pdf-styles";
    style.textContent = exportCss();
    document.head.appendChild(style);
  }

  function applyDocumentDirection(root, note) {
    const sourceText = note?.markdown || root.textContent || "";
    const direction = documentDirection(sourceText);
    const alignment = direction === "rtl" ? "right" : "left";

    root.dir = direction;
    root.style.direction = direction;
    root.style.textAlign = alignment;

    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, ul, ol").forEach(element => {
      element.dir = direction;
      element.style.direction = direction;
      element.style.textAlign = alignment;
    });
  }

  function buildDocument(note) {
    ensureStyles();
    const root = document.createElement("section");
    root.className = "single-pdf-content";
    root.style.cssText = [
      "position:absolute",
      "left:-100000px",
      "top:0",
      `width:${CONTENT_WIDTH}px`,
      "margin:0",
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

    applyDocumentDirection(root, note);
    document.body.appendChild(root);
    return root;
  }

  function svgForDocument(root, contentHeight) {
    const clone = root.cloneNode(true);
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${CONTENT_WIDTH}" height="${contentHeight}" viewBox="0 0 ${CONTENT_WIDTH} ${contentHeight}">
        <foreignObject x="0" y="0" width="${CONTENT_WIDTH}" height="${contentHeight}">
          <div xmlns="http://www.w3.org/1999/xhtml"><style>${exportCss()}</style>${clone.outerHTML}</div>
        </foreignObject>
      </svg>`;
  }

  async function renderDocumentImage(root, contentHeight) {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The browser could not render the PDF document."));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgForDocument(root, contentHeight))}`;
    await loaded;
    return image;
  }

  function chooseCanvasScale(documentHeight) {
    const dimensionScale = MAX_CANVAS_DIMENSION / Math.max(DOCUMENT_WIDTH, documentHeight);
    const areaScale = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, DOCUMENT_WIDTH * documentHeight));
    return Math.max(0.5, Math.min(TARGET_SCALE, dimensionScale, areaScale));
  }

  async function renderSingleSheet(root) {
    const contentHeight = Math.max(1, Math.ceil(root.scrollHeight));
    const documentHeight = contentHeight + DOCUMENT_MARGIN * 2;
    const scale = chooseCanvasScale(documentHeight);
    const image = await renderDocumentImage(root, contentHeight);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(DOCUMENT_WIDTH * scale));
    canvas.height = Math.max(1, Math.round(documentHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, DOCUMENT_MARGIN, DOCUMENT_MARGIN, CONTENT_WIDTH, contentHeight);

    const jpegBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode the PDF document.")), "image/jpeg", 0.94);
    });

    return {
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height
    };
  }

  function buildSinglePagePdf(image) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const pageWidth = 612;
    const pageHeight = pageWidth * image.height / image.width;

    const appendBytes = bytes => { chunks.push(bytes); length += bytes.length; };
    const appendText = text => appendBytes(encoder.encode(text));
    const beginObject = number => { offsets[number] = length; appendText(`${number} 0 obj\n`); };
    const endObject = () => appendText("endobj\n");

    appendBytes(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));

    beginObject(1);
    appendText("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObject();

    beginObject(2);
    appendText("<< /Type /Pages /Count 1 /Kids [3 0 R] >>\n");
    endObject();

    beginObject(3);
    appendText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\n`);
    endObject();

    beginObject(4);
    appendText(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    appendBytes(image.bytes);
    appendText("\nendstream\n");
    endObject();

    const stream = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im1 Do\nQ\n`;
    const streamBytes = encoder.encode(stream);
    beginObject(5);
    appendText(`<< /Length ${streamBytes.length} >>\nstream\n`);
    appendBytes(streamBytes);
    appendText("endstream\n");
    endObject();

    const xrefOffset = length;
    appendText("xref\n0 6\n");
    appendText("0000000000 65535 f \n");
    for (let number = 1; number <= 5; number++) {
      appendText(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

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

  async function downloadSinglePagePdf(note) {
    if (document.fonts?.ready) await document.fonts.ready;
    const root = buildDocument(note);
    try {
      const image = await renderSingleSheet(root);
      const pdf = buildSinglePagePdf(image);
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
      await downloadSinglePagePdf(note);
      window.showToast?.("PDF downloaded");
    } catch (error) {
      console.error("Single-page PDF export failed:", error);
      window.showToast?.(error.message || "PDF export failed");
      if (!window.showToast) alert(error.message || "PDF export failed");
    } finally {
      button.disabled = false;
      button.textContent = "PDF";
    }
  }, true);
})();
