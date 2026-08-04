export const PROMPTS = {
  transcript: `Generate a verbatim transcript of this audio shiur.
Rules:
- CRITICAL: MAKE SURE THE ENTIRE DURATION OF THE SHIUR IS TRANSCRIBED. DO NOT stop in the middle.
- Hebrew terms must be written in Hebrew script.
- Do not summarize or explain.
- Mark unclear audio as [inaudible].
- CRITICAL: DO NOT HALLUCINATE. If you do not hear sensible audio, do not make things up.
- CRITICAL: DO NOT time-stamp.

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly:
"sorry can't access the audio file"`,

  notes: `
Follow these rules strictly to create comprehensive, highly structured notes of this audio file:

Language & Script Rules
English Only: Write all explanatory content, descriptions, and analysis in English.

Hebrew Script Only: Write Hebrew terms, phrases, and textual quotations in Hebrew script only (do not translate or transliterate them).

Formatting Rules (Markdown Only)
Use ## for major conceptual sections.

Use ### for subtopics, analytical stages, or logical developments.

Bullets Only: Under every heading, write only bullet points. Every single line must start with -  exactly.

Do NOT use numbered lists, standalone paragraphs, introductions, or conclusions.

Use bold for key concepts, legal categories, and core terms.

Content & Logic Guidelines
Synthesize and Link: Instead of listing isolated, verbatim sentences, synthesize the speaker's points into clear, progressive arguments. Connect the questions, proofs, and answers so the logical flow is easy to follow.

Preserve the Full Argumentation: Do not omit steps, proofs, or objections. Ensure the reasoning behind every conclusion is fully explained.

Source Integration: If this is a Talmudic shiur, explicitly detail how the logical arguments fit back into the text of the sources (Gemara, Rishonim, Acharonim).

Zero Hallucination: Every point must be derived directly from the audio. Do not add outside knowledge or logistical/administrative details. Maintain this depth consistently from the beginning to the end of the file.

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly: "sorry can't access the audio file"
`,

  kol_halashon_notes: `Follow these rules strictly:
Take clear notes of this audio file.

LANGUAGE STYLE: Write in "Yeshivish" style - English sentences naturally integrating Hebrew/Aramaic terms.
Example: "If a husband claims he paid the כתובה while the wife still holds the document, he is not believed due to the principle of שטרך בידי מאי בעי."

Required Output Format:
- Use ## for major sections.
- Use ### for subtopics/analytical stages.
- Under every heading, write ONLY bullet points.
- Every note/content line must start with "- " exactly.
- Do NOT use numbered lists.
- Do NOT write standalone paragraphs.
- Keep bullets specific and complete; one idea, proof, question, answer, or nafka mina per bullet.
- Use **bold** for key concepts and halakhic categories.
- DO NOT MAKE ANY CHARTS!!!!

Content Guidelines:
- Preserve the full logical content.
- Do NOT omit arguments, proofs, or questions.
- Do NOT collapse steps; explain the reasoning fully.
- You MAY rephrase sentences for flow/clarity, but keep the ideas verbatim.
- If it is a classic Talmudic shiur, explain how logical arguments fit back into the sources (Gemara/Rishonim).

CRITICAL: Maintain consistent depth throughout (including the end of the shiur).

Do NOT add:
- Introductions or summaries.
- Timestamps.
- English translation of Hebrew/Aramaic terms.

If you cannot access the audio, respond: "sorry can't access the audio file"`,

  maamar: `כתוב "חבורה" תורנית מעמיקה ומורחבת (סיכום שיעור למדני) על בסיס תוכן קובץ השמע/הטקסט.

חובה: הטקסט כולו חייב להיכתב בעברית תורנית-ישיבתית בלבד.

**הנחיית יסוד: סגנון ושפה (Beis Medrash Style)**
1. אל תכתוב בסגנון עיתונאי, אקדמי או "עברית מודרנית" קצרה.
2. השתמש ב"לשון הקודש" ובסגנון המקובל בעולם הישיבות (עברית משולבת במונחים ארמיים מקובלים).
3. השתמש בביטויים המחברים את הלוגיקה: "והנה", "ולכאורה יש להקשות", "וביאור הדברים", "ונראה לומר", "חילוק זה מבואר", "היוצא לנו מזה".
4. אל תסכם בקיצור. המטרה היא **לשחזר את המהלך** (The Mahalech) במלואו, תוך הרחבת הסברא.

**מבנה החבורה:**

## שם הסוגיה / הנושא הכללי

### [כותרת משנה לכל מהלך או יסוד בסוגיה]

**הוראות לכתיבת התוכן:**

1. **בניית המהלך:**
   עבור כל נושא בשיעור, כתוב בסדר הלוגי הבא:
   * **הצגת הנתונים:** ציטוט הגמרא/הראשונים.
   * **הקושיא:** מה קשה כאן? הסבר את הקושיא באריכות.
   * **התירוץ:** הסבר המהלך המתרץ.
   * **הסברא:** אל תכתוב רק את המסקנה. הסבר את ה"למה" - מה עומד בבסיס הדברים?

2. **עיבוי והרחבה:**
   * כל פסקה חייבת להיות ארוכה (10-15 שורות לפחות).
   * אסור לדלג על שלבים לוגיים. יש לפרט כל שלב.
   * אם הוזכרה מחלוקת - הסבר בפירוט את שיטות הצדדים ואת שורש המחלוקת.

3. **שילוב מקורות:**
   * שבץ את שמות המפרשים בגוף הטקסט (מודגש).
   * כתוב רק מה שנאמר בשיעור, אך "תרגם" את הדיבור לסגנון כתוב ועשיר.
   * אין להשתמש במילים באנגלית.

אם אינך יכול לגשת לתוכן הקובץ, כתוב בדיוק: "sorry can't access the audio file".`
};

export const NO_CHARTS_INSTRUCTION = `

ABSOLUTE OUTPUT RESTRICTION — NO CHARTS OR DIAGRAMS: Never create, imitate, or describe a chart, graph, diagram, flowchart, decision tree, visual map, table, timeline, or side-by-side layout. This includes ASCII/Unicode art and pseudo-diagrams made with arrows, boxes, connector lines, indentation trees, or characters such as ─, │, ┌, ┐, └, ┘, ◄, ►, ▲, ▼, →, ←, or ⇒. Do not put ideas into visual arrangements or label-and-arrow chains. Even when the material has a logical sequence, write it as normal complete prose or standard Markdown headings and simple bullet lists only. Output must be clean, linear, readable text.`;

export function selectPrompt({ type, source, customPrompt }) {
  if (typeof customPrompt === "string" && customPrompt.trim()) {
    return `${customPrompt.trim()}${NO_CHARTS_INSTRUCTION}`;
  }

  const base = type === "transcript"
    ? PROMPTS.transcript
    : type === "maamar"
      ? PROMPTS.maamar
      : source === "kolhalashon"
        ? PROMPTS.kol_halashon_notes
        : PROMPTS.notes;

  return `${base.trim()}${NO_CHARTS_INSTRUCTION}`;
}
