(() => {
  const PAGE_WIDTH = 816;
  const PAGE_HEIGHT = 1056;
  const PAGE_PADDING = 54;
  const RENDER_SCALE = 1.6;
  const HEADING_PREVIEW_CHARS = 150;

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
      html, body { margin: 0; padding: 0; background: #ffffff; }
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
      .pdf-page li.pdf-list-continuation { list-style-type: none; }
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

  function ensureMeasurementStyles() {
    if (document.getElementById("local-pdf-export-styles")) return;
    const style = document.createElement("style");
    style.id = "local-pdf-export-styles";
    style.textContent = exportCss();
    document.head.appendChild(style);
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
      "background:#ffffff",
      "color:#202124",
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

  function isHeading(block) {
    return /^H[1-4]$/.test(block?.tagName || "");
  }

  function splitContainer(block) {
    if (!block) return null;
    if (block.tagName === "UL" || block.tagName === "OL") return block.firstElementChild;
    if (block.tagName === "P" || block.tagName === "BLOCKQUOTE") return block;
    return null;
  }

  function textNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function locateTextOffset(root, requestedOffset) {
    const nodes = textNodes(root);
    if (!nodes.length) return null;
    let remaining = Math.max(0, requestedOffset);
    for (const node of nodes) {
      const length = node.nodeValue?.length || 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.nodeValue?.length || 0 };
  }

  function cloneTextChunk(block, start, end, continuation = false) {
    const sourceContainer = splitContainer(block);
    if (!sourceContainer) return block.cloneNode(true);
    const startPoint = locateTextOffset(sourceContainer, start);
    const endPoint = locateTextOffset(sourceContainer, end);
    if (!startPoint || !endPoint) return block.cloneNode(true);

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    const fragment = range.cloneContents();

    if (block.tagName === "UL" || block.tagName === "OL") {
      const list = block.cloneNode(false);
      const item = sourceContainer.cloneNode(false);
      if (continuation) item.classList.add("pdf-list-continuation");
      item.appendChild(fragment);
      list.appendChild(item);
      return list;
    }

    const clone = block.cloneNode(false);
    clone.appendChild(fragment);
    return clone;
  }

  function breakPositions(text, start, end = text.length) {
    const positions = [];
    for (let index = start + 1; index <= end; index++) {
      if (index === end || /[\s,.;:!?\-–—)]/.test(text[index - 1] || "")) positions.push(index);
    }
    return positions;
  }

  function fits(page, node) {
    page.appendChild(node);
    const result = page.scrollHeight <= PAGE_HEIGHT;
    page.removeChild(node);
    return result;
  }

  function previewBlock(block, maxChars = HEADING_PREVIEW_CHARS) {
    const container = splitContainer(block);
    if (!container) return block.cloneNode(true);
    const text = container.textContent || "";
    if (text.length <= maxChars) return block.cloneNode(true);
    const candidates = breakPositions(text, 0, Math.min(text.length, maxChars));
    const end = candidates.length ? candidates[candidates.length - 1] : Math.min(text.length, maxChars);
    return cloneTextChunk(block, 0, end, false);
  }

  function paginate(note) {
    const pages = [];
    const blocks = contentBlocks(note);
    let page = makePage();

    const finalize = () => {
      if (!page || !page.children.length) return;
      applyDirections(page);
      pages.push(page);
      page = makePage();
    };

    const addSplitBlock = block => {
      const container = splitContainer(block);
      if (!container) {
        if (page.children.length) finalize();
        page.appendChild(block);
        return;
      }

      const text = container.textContent || "";
      let start = 0;
      let continuation = false;

      while (start < text.length) {
        while (start < text.length && /\s/.test(text[start])) start++;
        if (start >= text.length) break;

        const fullChunk = cloneTextChunk(block, start, text.length, continuation);
        if (fits(page, fullChunk)) {
          page.appendChild(fullChunk);
          start = text.length;
          break;
        }

        const candidates = breakPositions(text, start);
        let low = 0;
        let high = candidates.length - 1;
        let best = -1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const end = candidates[middle];
          const candidate = cloneTextChunk(block, start, end, continuation);
          if (fits(page, candidate)) {
            best = end;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }

        if (best <= start) {
          if (page.children.length) {
            finalize();
            continue;
          }

          let fallbackEnd = Math.min(text.length, start + 1);
          while (fallbackEnd < text.length) {
            const candidate = cloneTextChunk(block, start, fallbackEnd + 1, continuation);
            if (!fits(page, candidate)) break;
            fallbackEnd++;
          }
          best = Math.max(start + 1, fallbackEnd);
        }

        page.appendChild(cloneTextChunk(block, start, best, continuation));
        start = best;
        continuation = true;
        if (start < text.length) finalize();
      }
    };

    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];

      if (isHeading(block) && page.children.length && blocks[index + 1]) {
        const headingProbe = block.cloneNode(true);
        const contentProbe = previewBlock(blocks[index + 1]);
        page.appendChild(headingProbe);
        page.appendChild(contentProbe);
        const keepTogetherFits = page.scrollHeight <= PAGE_HEIGHT;
        headingProbe.remove();
        contentProbe.remove();
        if (!keepTogetherFits) finalize();
      }

      page.appendChild(block);
      if (page.scrollHeight <= PAGE_HEIGHT) continue;
      page.removeChild(block);

      if (splitContainer(block)) {
        addSplitBlock(block);
      } else {
        if (page.children.length) finalize();
        page.appendChild(block);
      }
    }

    if (page.children.length) {
      applyDirections(page);
      pages.push(page);
    } else {
      page.remove();
    }
    return pages;
  }

  function svgForPage(page) {
    const clone = page.cloneNode(true);
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const markup = clone.outerHTML;
    return `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
        <rect x="0" y="0" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/>
        <foreignObject x="0" y="0" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;background:#ffffff;"><style>${exportCss()}</style>${markup}</div>
        </foreignObject>
      </svg>`;
  }

  async function pageToJpeg(page) {
    const svg = svgForPage(page);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(RENDER_SCALE, RENDER_SCALE);
    context.drawImage(image, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.restore();

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
    ensureMeasurementStyles();
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
