(() => {
  const originalRenderReader = window.renderReader;

  function safeFilename(value, fallback = "shiur-notes") {
    return String(value || fallback)
      .normalize("NFKD")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || fallback;
  }

  function xmlEscape(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function markdownBlocks(markdown = "") {
    const blocks = [];
    for (const raw of markdown.replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      if (!line.trim()) continue;
      if (/^###\s+/.test(line)) blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
      else if (/^##\s+/.test(line)) blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") });
      else if (/^#\s+/.test(line)) blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") });
      else if (/^-\s+/.test(line)) blocks.push({ type: "bullet", text: line.replace(/^-\s+/, "") });
      else if (/^>\s?/.test(line)) blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
      else blocks.push({ type: "p", text: line });
    }
    return blocks;
  }

  function stripMarkdown(value = "") {
    return value
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }

  function paragraphXml(block) {
    const text = xmlEscape(stripMarkdown(block.text));
    const rtl = /[\u0590-\u05FF]/.test(block.text);
    const pStyle = block.type === "h1" ? "Heading1" : block.type === "h2" ? "Heading2" : block.type === "h3" ? "Heading3" : "Normal";
    const bullet = block.type === "bullet" ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "";
    const quote = block.type === "quote" ? '<w:ind w:left="720"/><w:color w:val="5F6368"/>' : "";
    const bidi = rtl ? '<w:bidi/>' : "";
    return `<w:p><w:pPr><w:pStyle w:val="${pStyle}"/>${bullet}${quote}${bidi}</w:pPr><w:r><w:rPr>${rtl ? '<w:rtl/>' : ""}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  }

  async function downloadDocx(note) {
    if (!window.JSZip) throw new Error("DOCX exporter did not load. Refresh and try again.");
    const zip = new JSZip();
    const title = note.title || "Shiur Notes";
    const body = markdownBlocks(note.markdown).map(paragraphXml).join("");
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>${note.speaker ? `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>${xmlEscape(note.speaker)}</w:t></w:r></w:p>` : ""}${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="202124"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="4285F4"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="202124"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="202124"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`;
    const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
    zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.folder("word").file("document.xml", documentXml);
    zip.folder("word").file("styles.xml", stylesXml);
    zip.folder("word").file("numbering.xml", numberingXml);
    zip.folder("word").folder("_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    saveBlob(blob, `${safeFilename(title)}.docx`);
  }

  async function downloadPdf(note) {
    if (!window.html2pdf) throw new Error("PDF exporter did not load. Refresh and try again.");
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-export-document";
    wrapper.dir = /[\u0590-\u05FF]/.test(note.markdown) ? "auto" : "ltr";
    wrapper.innerHTML = `<style>.pdf-export-document{font-family:Arial,sans-serif;color:#202124;padding:24px;line-height:1.65}.pdf-export-document h1{font-size:25px;margin:0 0 8px}.pdf-export-document .meta{color:#5f6368;margin-bottom:22px}.pdf-export-document h2{font-size:20px;color:#202124;border-bottom:2px solid #4285f4;padding-bottom:5px;margin-top:24px}.pdf-export-document h3{font-size:16px;margin-top:18px}.pdf-export-document li{margin:6px 0}.pdf-export-document strong{color:#3367d6}</style><h1>${xmlEscape(note.title || "Shiur Notes")}</h1><div class="meta">${xmlEscape(note.speaker || note.source || "")}</div>${window.renderMarkdown(note.markdown)}`;
    await html2pdf().set({
      margin: [12, 12, 14, 12],
      filename: `${safeFilename(note.title)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["li", "h2", "h3"] }
    }).from(wrapper).save();
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.renderReader = function renderReaderWithExports() {
    originalRenderReader();
    const note = state.notes.find(item => item.id === state.currentNoteId);
    const actions = document.querySelector(".reader-actions");
    if (!note || !actions) return;
    const pdf = document.createElement("button");
    pdf.textContent = "PDF";
    pdf.id = "downloadPdf";
    const docx = document.createElement("button");
    docx.textContent = "DOCX";
    docx.id = "downloadDocx";
    actions.insertBefore(pdf, actions.querySelector("#delete"));
    actions.insertBefore(docx, actions.querySelector("#delete"));
    pdf.onclick = async () => {
      pdf.disabled = true;
      pdf.textContent = "Preparing…";
      try { await downloadPdf(note); showToast("PDF downloaded"); }
      catch (error) { console.error(error); showToast(error.message || "PDF export failed"); }
      finally { pdf.disabled = false; pdf.textContent = "PDF"; }
    };
    docx.onclick = async () => {
      docx.disabled = true;
      docx.textContent = "Preparing…";
      try { await downloadDocx(note); showToast("DOCX downloaded"); }
      catch (error) { console.error(error); showToast(error.message || "DOCX export failed"); }
      finally { docx.disabled = false; docx.textContent = "DOCX"; }
    };
  };
})();
