(() => {
  const PDF_LIBRARY_URLS = [
    "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js"
  ];

  let pdfLibraryPromise = null;

  function safeFilename(value, fallback = "shiur-notes") {
    return String(value || fallback)
      .normalize("NFKD")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || fallback;
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isHebrewMajority(text = "") {
    const hebrew = (String(text).match(/[\u0590-\u05FF]/g) || []).length;
    const latin = (String(text).match(/[A-Za-z]/g) || []).length;
    return hebrew > latin;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pdf-library="${url}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.pdfLibrary = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load PDF library from ${url}`));
      document.head.appendChild(script);
    });
  }

  async function loadPdfLibrary() {
    if (window.html2pdf) return window.html2pdf;
    if (pdfLibraryPromise) return pdfLibraryPromise;

    pdfLibraryPromise = (async () => {
      let lastError = null;
      for (const url of PDF_LIBRARY_URLS) {
        try {
          await loadScript(url);
          if (window.html2pdf) return window.html2pdf;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("The PDF exporter could not load.");
    })();

    try {
      return await pdfLibraryPromise;
    } catch (error) {
      pdfLibraryPromise = null;
      throw error;
    }
  }

  function renderNoteContent(markdown = "") {
    if (typeof window.renderMarkdown === "function") {
      return window.renderMarkdown(markdown);
    }
    return `<p>${escapeHtml(markdown).replace(/\n/g, "<br>")}</p>`;
  }

  function applyTextDirection(root, overallText) {
    const documentRtl = isHebrewMajority(overallText);
    root.dir = documentRtl ? "rtl" : "ltr";
    root.style.direction = documentRtl ? "rtl" : "ltr";

    root.querySelectorAll("h1, h2, h3, h4, p, li, blockquote").forEach(element => {
      const rtl = isHebrewMajority(element.textContent || "");
      element.dir = rtl ? "rtl" : "ltr";
      element.style.direction = rtl ? "rtl" : "ltr";
      element.style.textAlign = rtl ? "right" : "left";
    });
  }

  function createPdfDocument(note) {
    const wrapper = document.createElement("section");
    wrapper.className = "direct-pdf-document";
    wrapper.style.cssText = [
      "position:fixed",
      "left:-100000px",
      "top:0",
      "width:690px",
      "background:#fff",
      "color:#202124",
      "font-family:Arial,David,sans-serif",
      "font-size:16px",
      "line-height:1.6",
      "padding:0",
      "box-sizing:border-box"
    ].join(";");

    const title = note.title || "Shiur Notes";
    const metadata = [note.speaker, note.type ? String(note.type).replace(/_/g, " ") : ""]
      .filter(Boolean)
      .join(" · ");

    wrapper.innerHTML = `
      <style>
        .direct-pdf-document * { box-sizing: border-box; }
        .direct-pdf-document .pdf-title {
          margin: 0 0 7px;
          font-size: 29px;
          line-height: 1.2;
          font-weight: 700;
          color: #202124;
          page-break-after: avoid;
          break-after: avoid-page;
        }
        .direct-pdf-document .pdf-meta {
          margin: 0 0 24px;
          color: #5f6368;
          font-size: 14px;
          page-break-after: avoid;
          break-after: avoid-page;
        }
        .direct-pdf-document h1,
        .direct-pdf-document h2 {
          margin: 25px 0 10px;
          padding-bottom: 6px;
          border-bottom: 2px solid #4285f4;
          color: #202124;
          font-size: 22px;
          line-height: 1.3;
          page-break-after: avoid;
          break-after: avoid-page;
        }
        .direct-pdf-document h3 {
          margin: 20px 0 8px;
          color: #202124;
          font-size: 18px;
          line-height: 1.35;
          page-break-after: avoid;
          break-after: avoid-page;
        }
        .direct-pdf-document h4 {
          margin: 17px 0 7px;
          font-size: 16px;
          page-break-after: avoid;
          break-after: avoid-page;
        }
        .direct-pdf-document p {
          margin: 0 0 12px;
          orphans: 3;
          widows: 3;
        }
        .direct-pdf-document ul,
        .direct-pdf-document ol {
          margin: 7px 0 13px;
          padding-inline-start: 25px;
        }
        .direct-pdf-document ul ul,
        .direct-pdf-document ol ol,
        .direct-pdf-document ul ol,
        .direct-pdf-document ol ul {
          margin: 5px 0 0;
        }
        .direct-pdf-document li {
          margin: 5px 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .direct-pdf-document blockquote {
          margin: 15px 0;
          padding: 8px 14px;
          border-inline-start: 4px solid #4285f4;
          background: #f8f9fa;
          color: #3c4043;
          font-style: italic;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .direct-pdf-document strong { color: #3367d6; font-weight: 700; }
        .direct-pdf-document em { font-style: italic; }
        .direct-pdf-document [dir="rtl"] { text-align: right; }
      </style>
      <h1 class="pdf-title">${escapeHtml(title)}</h1>
      ${metadata ? `<div class="pdf-meta">${escapeHtml(metadata)}</div>` : ""}
      <div class="pdf-body">${renderNoteContent(note.markdown || "")}</div>
    `;

    applyTextDirection(wrapper, `${title}\n${metadata}\n${note.markdown || ""}`);
    document.body.appendChild(wrapper);
    return wrapper;
  }

  async function downloadPdf(note) {
    const html2pdf = await loadPdfLibrary();
    const wrapper = createPdfDocument(note);
    const filename = `${safeFilename(`${note.title || "Shiur Notes"}-${note.type || "notes"}`)}.pdf`;

    try {
      await html2pdf().set({
        margin: [12.7, 12.7, 15, 12.7],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          letterRendering: true,
          logging: false,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: {
          unit: "mm",
          format: "letter",
          orientation: "portrait",
          compress: true
        },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: ["h1", "h2", "h3", "h4", "li", "blockquote"]
        }
      }).from(wrapper).save();
    } finally {
      wrapper.remove();
    }
  }

  function installDirectPdfHandler() {
    const button = document.getElementById("downloadPdf");
    if (!button || button.dataset.directPdfReady === "true") return;

    const note = window.state?.notes?.find(item => item.id === window.state.currentNoteId);
    if (!note) return;

    button.dataset.directPdfReady = "true";
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        await downloadPdf(note);
        if (typeof window.showToast === "function") window.showToast("PDF downloaded");
      } catch (error) {
        console.error("Direct PDF export failed:", error);
        if (typeof window.showToast === "function") {
          window.showToast(error.message || "PDF export failed");
        } else {
          alert(error.message || "PDF export failed");
        }
      } finally {
        button.disabled = false;
        button.textContent = "PDF";
      }
    };
  }

  const observer = new MutationObserver(installDirectPdfHandler);
  observer.observe(document.body, { childList: true, subtree: true });
  installDirectPdfHandler();
})();
