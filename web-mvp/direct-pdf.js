(() => {
  const PAGE_WIDTH = 816;
  const PAGE_HEIGHT = 1056;
  const PAGE_PADDING = 54;
  const RENDER_SCALE = 1.6;

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

  function applyDirections(root) {
    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach(element => {
      const rtl = isRtlText(element.textContent || "");
      element.dir = rtl ? "rtl" : "ltr";
      element.style.direction = rtl ? "rtl" : "ltr";
      element.style.textAlign = rtl ? "right" : "left";
    });
  }

  function exportCss() {
    return `
      * { box-sizing: border-box; }
      .pdf-page {
        width: ${PAGE_WIDTH}px;
        height: ${PAGE_HEIGHT}px;
        overflow: hidden;
        background: #ffffff;
        color: #202124;
        padding: ${PAGE_PADDING}px;
        font-family: Arial, David, sans-serif;
        font-size: 16px;
        line-height: 1.58;
      }
      .pdf-title {
        margin: 0 0 7px;
        color: #202124;
        font-size: 29px;
        line-height: 1.2;
        font-weight: 700;
      }
      .pdf-meta {
        margin: 0 0 24px;
        color: #5f6368;
        font-size: 14px;
      }
      .pdf-page h1,
      .pdf-page h2 {
        margin: 25px 0 10px;
        padding-bottom: 6px;
        border-bottom: 2px solid #4285f4;
        color: #202124;
        font-size: 22px;
        line-height: 1.3;
      }
      .pdf-page h3 {
        margin: 20px 0 8px;
        color: #202124;
        font-size: 18px;
        line-height: 1.35;
      }
      .pdf-page h4 {
        margin: 17px 0 7px;
        color: #202124;
        font-size: 16px;
      }
      .pdf-page p { margin: 0 0 12px; }
      .pdf-page ul,
      .pdf-page ol {
        margin: 7px 0 13px;
        padding-inline-start: 25px;
      }
      .pdf-page ul ul,
      .pdf-page ol ol,
      .pdf-page ul ol,
      .pdf-page ol ul { margin: 5px 0 0; }
      .pdf-page li { margin: 5px 0; }
      .pdf-page blockquote {
        margin: 15px 0;
        padding: 8px 14px;
        border-inline-start: 4px solid #4285f4;
        background: #f8f9fa;
        color: #3c4043;
        font-style: italic;
      }
      .pdf-page strong { color: #3367d6; font-weight: 700; }
      .pdf-page em { font-style: italic; }
      .pdf-page [dir="rtl"] { text-align: right; }
    `;
  }

  function makePage() {
    const page = document.createElement("section");
    page.className = "pdf-page";
    page.style.cssText = [
      "position:absolute",
      "left:-100000px",
      "top:0",
      `width:${PAGE_WIDTH}px`,
      `height:${PAGE_HEIGHT}px`,
      "overflow:hidden",
      "background:#fff",
      "z-index:-1"
    ].join(";");
    document.body.appendChild(page);
    return page;
  }

  function cloneListItem(item, tagName) {
    const list = document.createElement(tagName.toLowerCase());
    list.appendChild(item.cloneNode(true));
    return list;
  }

  function contentBlocks(note) {
    const blocks = [];
    const title = document.createElement("h1");
    title.className = "pdf-title";
    title.textContent = note.title || "Shiur Notes";
    blocks.push(title);

    const metadata = [note.speaker, note.type ? String(note.type).replace(/_/g, " ") : ""]
      .filter(Boolean)
      .join(" · ");
    if (metadata) {
      const meta = document.createElement("div");
      meta.className = "pdf-meta";
      meta.textContent = metadata;
      blocks.push(meta);
    }

    const visibleDocument = document.querySelector(".document");
    const source = document.createElement("div");
    if (visibleDocument) source.innerHTML = visibleDocument.innerHTML;
    else if (typeof window.renderMarkdown === "function") source.innerHTML = window.renderMarkdown(note.markdown || "");
    else {
      const paragraph = document.createElement("p");
      paragraph.textContent = note.markdown || "";
      source.appendChild(paragraph);
    }

    Array.from(source.children).forEach(child => {
      if (child.tagName === "UL" || child.tagName === "OL") {
        Array.from(child.children)
          .filter(item => item.tagName === "LI")
          .forEach(item => blocks.push(cloneListItem(item, child.tagName)));
      } else {
        blocks.push(child.cloneNode(true));
      }
    });
    return blocks;
  }

  function paginate(note) {
    const pages = [];
    let page = makePage();
    const blocks = contentBlocks(note);

    const finalize = () => {
      applyDirections(page);
      pages.push(page);
      page = null;
    };

    blocks.forEach((block, index) => {
      page.appendChild(block);
      if (page.scrollHeight <= PAGE_HEIGHT) return;

      page.removeChild(block);
      if (page.children.length) finalize();
      page = makePage();
      page.appendChild(block);

      if (page.scrollHeight > PAGE_HEIGHT && (block.tagName === "P" || block.tagName === "BLOCKQUOTE")) {
        const text = block.textContent || "";
        const words = text.split(/\s+/).filter(Boolean);
        page.removeChild(block);
        let chunk = document.createElement(block.tagName.toLowerCase());
        if (block.tagName === "BLOCKQUOTE") chunk.className = block.className;
        page.appendChild(chunk);
        for (const word of words) {
          const previous = chunk.textContent;
          chunk.textContent = previous ? `${previous} ${word}` : word;
          if (page.scrollHeight > PAGE_HEIGHT) {
            chunk.textContent = previous;
            finalize();
            page = makePage();
            chunk = document.createElement(block.tagName.toLowerCase());
            if (block.tagName === "BLOCKQUOTE") chunk.className = block.className;
            chunk.textContent = word;
            page.appendChild(chunk);
          }
        }
      }

      if (index === blocks.length - 1 && page && page.children.length) finalize();
    });

    if (page && page.children.length) finalize();
    else if (page) page.remove();
    return pages;
  }

  function svgForPage(page) {
    const clone = page.cloneNode(true);
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const markup = clone.outerHTML;
    return `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
        <foreignObject x="0" y="0" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">
          <div xmlns="http://www.w3.org/1999/xhtml"><style>${exportCss()}</style>${markup}</div>
        </foreignObject>
      </svg>`;
  }

  async function pageToJpeg(page) {
    const svg = svgForPage(page);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "async";
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The browser could not render the PDF page."));
      });
      image.src = url;
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(PAGE_WIDTH * RENDER_SCALE);
      canvas.height = Math.round(PAGE_HEIGHT * RENDER_SCALE);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(RENDER_SCALE, RENDER_SCALE);
      context.drawImage(image, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);

      const jpegBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode the PDF page.")), "image/jpeg", 0.94);
      });
      return {
        bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function buildPdf(images) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;

    const appendBytes = bytes => {
      chunks.push(bytes);
      length += bytes.length;
    };
    const appendText = text => appendBytes(encoder.encode(text));

    appendBytes(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]));

    const pageObjectNumbers = [];
    const imageObjectNumbers = [];
    const contentObjectNumbers = [];
    let nextObject = 3;
    images.forEach(() => {
      pageObjectNumbers.push(nextObject++);
      imageObjectNumbers.push(nextObject++);
      contentObjectNumbers.push(nextObject++);
    });
    const objectCount = nextObject - 1;

    const beginObject = number => {
      offsets[number] = length;
      appendText(`${number} 0 obj\n`);
    };
    const endObject = () => appendText("endobj\n");

    beginObject(1);
    appendText("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObject();

    beginObject(2);
    appendText(`<< /Type /Pages /Count ${images.length} /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] >>\n`);
    endObject();

    images.forEach((image, index) => {
      const pageNumber = pageObjectNumbers[index];
      const imageNumber = imageObjectNumbers[index];
      const contentNumber = contentObjectNumbers[index];
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
    const pages = paginate(note);
    if (!pages.length) throw new Error("There is no content to export.");

    try {
      const images = [];
      for (let index = 0; index < pages.length; index++) {
        onProgress?.(index + 1, pages.length);
        images.push(await pageToJpeg(pages[index]));
      }
      const pdf = buildPdf(images);
      triggerDownload(pdf, `${safeFilename(`${note.title || "Shiur Notes"}-${note.type || "notes"}`)}.pdf`);
    } finally {
      pages.forEach(page => page.remove());
    }
  }

  function installHandler() {
    const button = document.getElementById("downloadPdf");
    if (!button || button.dataset.localPdfReady === "true") return;
    const note = currentNote();
    if (!note) return;

    button.dataset.localPdfReady = "true";
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        await downloadPdf(note, (current, total) => {
          button.textContent = total > 1 ? `PDF ${current}/${total}` : "Preparing…";
        });
        window.showToast?.("PDF downloaded");
      } catch (error) {
        console.error("PDF export failed:", error);
        window.showToast?.(error.message || "PDF export failed");
        if (!window.showToast) alert(error.message || "PDF export failed");
      } finally {
        button.disabled = false;
        button.textContent = "PDF";
      }
    };
  }

  const observer = new MutationObserver(installHandler);
  observer.observe(document.body, { childList: true, subtree: true });
  installHandler();
})();
