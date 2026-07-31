// Utility functions for YUTorah Notes Extension

/**
 * Detect if majority of text is Hebrew
 * @param {string} text - The text to analyze
 * @returns {boolean} - True if Hebrew characters are majority
 */
function isMajorityHebrew(text) {
    // Count Hebrew characters (Unicode range U+0590 to U+05FF)
    const hebrewCharCount = (text.match(/[\u0590-\u05FF]/g) || []).length;

    // Count English/Latin characters
    const englishCharCount = (text.match(/[a-zA-Z]/g) || []).length;

    // Total relevant characters
    const totalRelevantChars = hebrewCharCount + englishCharCount;

    // If no relevant characters, default to false (LTR)
    if (totalRelevantChars === 0) return false;

    // Return true if more than 50% is Hebrew
    return hebrewCharCount / totalRelevantChars > 0.5;
}

function getHebrewRatio(text) {
    let value = stripHtml(text || '');
    if (typeof document !== 'undefined') {
        const template = document.createElement('template');
        template.innerHTML = String(text || '');
        value = template.content.textContent || value;
    }
    const hebrewCharCount = (value.match(/[\u0590-\u05FF]/g) || []).length;
    const englishCharCount = (value.match(/[a-zA-Z]/g) || []).length;
    const totalRelevantChars = hebrewCharCount + englishCharCount;
    return totalRelevantChars === 0 ? 0 : hebrewCharCount / totalRelevantChars;
}

/**
 * Return direction attributes for text based on its Hebrew/Latin balance.
 * If overallText is provided and is not Hebrew-majority, force LTR so a mostly
 * English note does not flip isolated Hebrew-heavy lines.
 * @param {string} text - The text to analyze
 * @param {string} [overallText] - Optional full document/container text
 * @returns {string} - HTML attributes for text direction
 */
function getTextDirectionAttrs(text, overallText) {
    const canUseRtl = overallText === undefined || isMajorityHebrew(stripHtml(overallText));
    return canUseRtl && isMajorityHebrew(stripHtml(text)) ? 'dir="rtl" style="text-align: right;"' : 'dir="ltr" style="text-align: left;"';
}

/**
 * Remove HTML tags before checking text direction.
 * @param {string} html - HTML or plain text
 * @returns {string}
 */
function stripHtml(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ');
}

/**
 * Apply direction to common block elements according to each block's text.
 * This lets mixed English/Hebrew notes keep each paragraph readable.
 * @param {string} html - Rendered note HTML
 * @param {string} [overallText] - Optional full document/container text
 * @returns {string}
 */
function applyDirectionalFormattingToHtml(html, overallText) {
    const directionContext = overallText === undefined ? stripHtml(html) : overallText;

    // A DOM pass keeps nested lists valid. The previous regular-expression
    // approach matched the first closing </li> inside a nested list, which
    // left the remaining list items without their direction attributes.
    if (typeof document !== 'undefined') {
        const template = document.createElement('template');
        template.innerHTML = String(html || '');
        template.content.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, ul').forEach(element => {
            const attrs = getTextDirectionAttrs(element.textContent || '', directionContext);
            const isRtl = attrs.includes('dir="rtl"');
            element.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
            element.style.textAlign = isRtl ? 'right' : 'left';
        });
        return template.innerHTML;
    }

    return String(html || '').replace(
        /<(p|li|blockquote|h[1-6])>([\s\S]*?)<\/\1>/gi,
        (match, tag, content) => `<${tag} ${getTextDirectionAttrs(content, directionContext)}>${content}</${tag}>`
    );
}

/**
 * Render the small Markdown subset used by notes into valid, print-ready HTML.
 * In particular, indentation is preserved as nested lists instead of turning
 * nested bullets into literal hyphens inside an outer list item.
 */
function renderMarkdownToHtml(markdown, headingOffset = 0) {
    const source = String(markdown || '').replace(/\r\n?/g, '\n');
    const escapeHtml = value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatInline = value => escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    const output = [];
    const paragraphLines = [];
    const quoteLines = [];
    const listStack = [];
    const closeParagraph = () => {
        if (paragraphLines.length) {
            output.push(`<p>${formatInline(paragraphLines.join(' '))}</p>`);
            paragraphLines.length = 0;
        }
    };
    const closeQuote = () => {
        if (quoteLines.length) {
            output.push(`<blockquote>${formatInline(quoteLines.join(' '))}</blockquote>`);
            quoteLines.length = 0;
        }
    };
    const closeListsThrough = level => {
        while (listStack.length - 1 >= level) {
            output.push('</li></ul>');
            listStack.pop();
        }
    };
    const closeAllLists = () => closeListsThrough(0);

    source.split('\n').forEach(line => {
        const heading = line.match(/^\s*(#{1,4})\s+(.+?)\s*$/);
        const bullet = line.match(/^(\s*)[-*+]\s+(.+?)\s*$/);
        const quote = line.match(/^\s*>\s?(.*)$/);

        if (heading) {
            closeParagraph();
            closeQuote();
            closeAllLists();
            const level = Math.min(4, heading[1].length + headingOffset);
            output.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
            return;
        }

        if (bullet) {
            closeParagraph();
            closeQuote();
            const indent = bullet[1].replace(/\t/g, '  ').length;
            const level = Math.floor(indent / 2);

            while (listStack.length - 1 > level) closeListsThrough(listStack.length - 1);
            if (listStack.length - 1 === level) {
                if (listStack.length) output.push('</li>');
            } else {
                while (listStack.length - 1 < level) {
                    output.push('<ul>');
                    listStack.push(true);
                }
            }
            output.push(`<li>${formatInline(bullet[2])}`);
            return;
        }

        if (quote) {
            closeParagraph();
            closeAllLists();
            quoteLines.push(quote[1].trim());
            return;
        }

        if (!line.trim()) {
            closeParagraph();
            closeQuote();
            // Blank lines are allowed between list items and should not split
            // one list into separate blocks with large print margins.
            return;
        }

        closeQuote();
        closeAllLists();
        paragraphLines.push(line.trim());
    });

    closeParagraph();
    closeQuote();
    closeAllLists();
    return applyDirectionalFormattingToHtml(output.join('\n'), source);
}

/**
 * Apply direction to a rendered container and its block children.
 * @param {HTMLElement} element - Container with rendered note content
 * @param {string} content - Original note content
 */
function applyDirectionToElement(element, content) {
    const isRtl = isMajorityHebrew(content);
    element.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    element.style.direction = isRtl ? 'rtl' : 'ltr';
    element.style.textAlign = isRtl ? 'right' : 'left';

    element.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, ul').forEach(child => {
        const childIsRtl = isRtl && isMajorityHebrew(child.textContent || '');
        child.setAttribute('dir', childIsRtl ? 'rtl' : 'ltr');
        child.style.textAlign = childIsRtl ? 'right' : 'left';
    });
}

/**
 * Create the common, print-friendly document shell used for DOCX and PDF
 * exports. Keeping this in one place prevents their direction and styling
 * from drifting apart.
 */
function createExportHtmlDocument(bodyHtml, overallText) {
    const documentDirection = isMajorityHebrew(overallText || '') ? 'rtl' : 'ltr';
    return `<!DOCTYPE html>
<html dir="${documentDirection}">
<head>
    <meta charset="UTF-8">
    <title>YUTorah Notes</title>
    <style>
        @page { margin: 1in; }
        body { font-family: Calibri, Arial, David, sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 0; direction: ${documentDirection}; text-align: ${documentDirection === 'rtl' ? 'right' : 'left'}; }
        h1 { font-size: 20pt; font-weight: bold; margin: 24pt 0 12pt; page-break-after: avoid; color: #1a1a1a; }
        h2 { font-size: 16pt; font-weight: bold; margin: 18pt 0 10pt; page-break-after: avoid; }
        h3 { font-size: 14pt; font-weight: bold; margin: 14pt 0 8pt; page-break-after: avoid; }
        h4 { font-size: 12pt; font-weight: bold; margin: 12pt 0 6pt; page-break-after: avoid; }
        p { margin: 0 0 10pt; text-align: justify; }
        ul { margin: 6pt 0 10pt; padding-inline-start: 22pt; }
        ul ul { margin: 4pt 0 0; }
        li { margin: 0 0 5pt; line-height: 1.5; break-inside: avoid; }
        strong { font-weight: bold; } em { font-style: italic; }
        blockquote { margin: 12pt 0 12pt 24pt; padding-left: 12pt; border-left: 4pt solid #cccccc; font-style: italic; color: #333333; }
        hr { border: none; border-top: 2pt solid #cccccc; margin: 24pt 0; }
        [dir="rtl"] { direction: rtl; text-align: right; }
        ul[dir="rtl"] { padding-left: 0; padding-right: 22pt; }
        blockquote[dir="rtl"] { margin: 12pt 24pt 12pt 0; padding-left: 0; padding-right: 12pt; border-left: none; border-right: 4pt solid #cccccc; }
    </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function escapeXml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlTextRun(text, formatting = {}) {
    if (!text) return '';
    const properties = `${formatting.bold || formatting.header ? '<w:b/>' : ''}${formatting.italic ? '<w:i/>' : ''}${formatting.rtl ? '<w:rtl/>' : ''}${formatting.headerSize ? `<w:sz w:val="${formatting.headerSize}"/><w:szCs w:val="${formatting.headerSize}"/>` : ''}<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="David"/><w:lang w:bidi="he-IL"/>`;
    return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function getDocxRuns(node, formatting = {}) {
    if (node.nodeType === Node.TEXT_NODE) return xmlTextRun(node.nodeValue, formatting);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    // Nested lists are emitted as their own DOCX paragraphs by htmlToDocxBody.
    // Skipping them here keeps their text out of the parent list item.
    if (node.tagName === 'UL' || node.tagName === 'OL') return '';
    const nextFormatting = {
        ...formatting,
        bold: formatting.bold || node.tagName === 'STRONG' || node.tagName === 'B',
        italic: formatting.italic || node.tagName === 'EM' || node.tagName === 'I'
    };
    return Array.from(node.childNodes).map(child => getDocxRuns(child, nextFormatting)).join('');
}

function docxParagraph(node, options = {}) {
    const text = node.textContent || '';
    const isRtl = node.getAttribute && node.getAttribute('dir') === 'rtl'
        || (options.documentIsRtl && isMajorityHebrew(text));
    const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
    const alignment = isRtl ? '<w:jc w:val="right"/><w:bidi/>' : `<w:jc w:val="${options.style ? 'left' : 'both'}"/>`;
    const spacing = options.style
        ? '<w:spacing w:before="240" w:after="120"/><w:keepNext/>'
        : `<w:spacing w:after="${options.list ? '100' : '200'}"/>`;
    const indentation = options.list
        ? `<w:ind w:${isRtl ? 'right' : 'left'}="${360 + (options.listLevel || 0) * 360}"/>`
        : '';
    const bullet = options.list ? xmlTextRun('• ', { bold: false, italic: false, rtl: isRtl }) : '';
    const headerSize = { H1: 40, H2: 32, H3: 28, H4: 24 }[options.style] || null;
    const runs = Array.from(node.childNodes).map(child => getDocxRuns(child, { rtl: isRtl, header: Boolean(options.style), headerSize })).join('');
    return `<w:p><w:pPr>${style}${alignment}${spacing}${indentation}</w:pPr>${bullet}${runs || '<w:r><w:t></w:t></w:r>'}</w:p>`;
}

function htmlToDocxBody(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const blocks = [];
    const documentIsRtl = getHebrewRatio(template.content.textContent || '') > 0.8;
    let paragraphParts = [];

    const flushParagraph = () => {
        if (!paragraphParts.length) return;
        const paragraph = document.createElement('p');
        paragraphParts.forEach(part => {
            Array.from(part.childNodes).forEach(child => paragraph.appendChild(child.cloneNode(true)));
        });
        blocks.push(docxParagraph(paragraph, { documentIsRtl }));
        paragraphParts = [];
    };
    const appendListItems = (list, level = 0) => {
        Array.from(list.children).filter(child => child.tagName === 'LI').forEach(item => {
            blocks.push(docxParagraph(item, { list: true, listLevel: level, documentIsRtl }));
            Array.from(item.children)
                .filter(child => child.tagName === 'UL' || child.tagName === 'OL')
                .forEach(nestedList => appendListItems(nestedList, level + 1));
        });
    };

    Array.from(template.content.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim()) return;
        if (node.nodeType === Node.TEXT_NODE) {
            flushParagraph();
            const paragraph = document.createElement('p');
            paragraph.textContent = node.nodeValue;
            blocks.push(docxParagraph(paragraph, { documentIsRtl }));
            return;
        }
        const tag = node.tagName;
        if (tag === 'P') {
            // The shared renderer already emits one valid paragraph per
            // Markdown block, so retain those boundaries in the DOCX.
            flushParagraph();
            blocks.push(docxParagraph(node, { documentIsRtl }));
            return;
        }
        flushParagraph();
        if (/^H[1-4]$/.test(tag)) {
            blocks.push(docxParagraph(node, { style: tag, documentIsRtl }));
        } else if (tag === 'UL' || tag === 'OL') {
            appendListItems(node);
        } else if (tag === 'HR') {
            blocks.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        } else {
            blocks.push(docxParagraph(node, { documentIsRtl }));
        }
    });
    flushParagraph();
    return blocks.join('');
}

function zipStoredFiles(files) {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256).map((_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
        return value >>> 0;
    });
    const crc32 = bytes => {
        let value = 0xffffffff;
        bytes.forEach(byte => { value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff]; });
        return (value ^ 0xffffffff) >>> 0;
    };
    const chunks = [];
    const centralDirectory = [];
    let offset = 0;
    const writeUint16 = (view, position, value) => view.setUint16(position, value, true);
    const writeUint32 = (view, position, value) => view.setUint32(position, value, true);

    files.forEach(file => {
        const name = encoder.encode(file.name);
        const content = encoder.encode(file.content);
        const crc = crc32(content);
        const local = new Uint8Array(30 + name.length + content.length);
        const localView = new DataView(local.buffer);
        writeUint32(localView, 0, 0x04034b50); writeUint16(localView, 4, 20); writeUint16(localView, 6, 0x0800);
        writeUint16(localView, 8, 0); writeUint32(localView, 14, crc); writeUint32(localView, 18, content.length); writeUint32(localView, 22, content.length);
        writeUint16(localView, 26, name.length); writeUint16(localView, 28, 0);
        local.set(name, 30); local.set(content, 30 + name.length);
        chunks.push(local);

        const central = new Uint8Array(46 + name.length);
        const centralView = new DataView(central.buffer);
        writeUint32(centralView, 0, 0x02014b50); writeUint16(centralView, 4, 20); writeUint16(centralView, 6, 20); writeUint16(centralView, 8, 0x0800);
        writeUint16(centralView, 10, 0); writeUint32(centralView, 16, crc); writeUint32(centralView, 20, content.length); writeUint32(centralView, 24, content.length);
        writeUint16(centralView, 28, name.length); writeUint16(centralView, 30, 0); writeUint16(centralView, 32, 0); writeUint16(centralView, 34, 0); writeUint16(centralView, 36, 0); writeUint32(centralView, 38, 0); writeUint32(centralView, 42, offset);
        central.set(name, 46); centralDirectory.push(central);
        offset += local.length;
    });
    const centralSize = centralDirectory.reduce((size, entry) => size + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 0x06054b50); writeUint16(endView, 8, files.length); writeUint16(endView, 10, files.length); writeUint32(endView, 12, centralSize); writeUint32(endView, 16, offset);
    return new Blob([...chunks, ...centralDirectory, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function createDocxBlob(html, title, overallText = html) {
    const body = htmlToDocxBody(html);
    const safeTitle = escapeXml(title || 'YUTorah Notes');
    const documentIsRtl = getHebrewRatio(overallText) >= 0.8;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr>${documentIsRtl ? '<w:bidi/>' : ''}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
    const defaultParagraphDirection = documentIsRtl ? '<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>' : '';
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>${defaultParagraphDirection}<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="David"/></w:rPr></w:rPrDefault></w:docDefaults>${[['H1', 'Title', '40'], ['H2', 'Heading 1', '32'], ['H3', 'Heading 2', '28'], ['H4', 'Heading 3', '24']].map(([id, name, size]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`).join('')}</w:styles>`;
    return zipStoredFiles([
        { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
        { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
        { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: 'word/document.xml', content: documentXml },
        { name: 'word/styles.xml', content: stylesXml },
        { name: 'docProps/core.xml', content: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${safeTitle}</dc:title><dc:creator>Shiur AI Assistant</dc:creator></cp:coreProperties>` }
    ]);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportAsDocx(html, title, filename, overallText = html) {
    triggerDownload(createDocxBlob(html, title, overallText), `${filename}.docx`);
}

function exportAsPdf(html, overallText, title, targetWindow = null) {
    const printWindow = targetWindow || window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow pop-ups to save this document as a PDF.');
        return;
    }
    printWindow.document.open();
    printWindow.document.write(createExportHtmlDocument(html, overallText));
    printWindow.document.title = title || 'YUTorah Notes';
    printWindow.document.close();
    let hasPrinted = false;
    const printPage = () => {
        if (hasPrinted) return;
        hasPrinted = true;
        printWindow.focus();
        printWindow.print();
    };
    printWindow.onload = () => setTimeout(printPage, 150);
    setTimeout(printPage, 500);
}
