const STORAGE_KEY = "shiur-notes-web-v2";
const API_KEY_KEY = "shiur-notes-gemini-key";
const MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];

const PROMPTS = {
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

  notes: `Follow these rules strictly to create comprehensive, highly structured notes of this audio file:

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

If you cannot access the contents of the audio file or if it is silent/invalid, respond with exactly: "sorry can't access the audio file"`,

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

אם אינך יכול לגשת לתוכן הקובץ, כתוב בדיוק: "sorry can't access the audio file".`,

  enhance_transcript: `Please enhance this transcript.
Rules:
- Preserve the original language, meaning, and level of detail. Do not summarize, add, or omit substantive content.
- Organize the text into readable paragraphs. Add Markdown headings only when a clear topic shift is already present in the transcript.
- Remove obvious verbal filler (for example: um, uh, repeated false starts, and "you know") and only redundant repetition that does not carry meaning.
- Keep quotations, source references, names, and the speaker's train of thought intact.
- Render Hebrew words and sources in Hebrew characters whenever they appear in the transcript.
- Return only the polished transcript; do not add an introduction or editorial notes.`
};

const NO_CHARTS = `

ABSOLUTE OUTPUT RESTRICTION — NO CHARTS OR DIAGRAMS: Never create, imitate, or describe a chart, graph, diagram, flowchart, decision tree, visual map, table, timeline, or side-by-side layout. This includes ASCII/Unicode art and pseudo-diagrams made with arrows, boxes, connector lines, indentation trees, or characters such as ─, │, ┌, ┐, └, ┘, ◄, ►, ▲, ▼, →, ←, or ⇒. Do not put ideas into visual arrangements or label-and-arrow chains. Even when the material has a logical sequence, write it as normal complete prose or standard Markdown headings and simple bullet lists only. Output must be clean, linear, readable text.`;

const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
const state = {
  screen: "home", history: [], notes: saved?.notes || [], currentNoteId: null,
  currentFile: null, libraryFilter: "All", search: "", processing: null,
  draft: { url:"", source:"Imported audio", title:"Untitled Shiur", speaker:"", duration:"", output:"notes", promptMode:"default" },
  settings: saved?.settings || { defaultOutput:"notes", customNotesPrompt:"", customTranscriptPrompt:"", customMaamarPrompt:"" }
};

const $ = s => document.querySelector(s);
const app = $("#app"), title = $("#screenTitle"), backButton = $("#backButton"), topAction = $("#topAction");
const tabbar = $("#tabbar"), addDialog = $("#addDialog"), keyDialog = $("#keyDialog"), toast = $("#toast");
const urlInput = $("#shiurUrl"), audioInput = $("#audioFile");

function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify({notes:state.notes,settings:state.settings}));window.ShiurNotesExtensionSync?.scheduleSync();}
function showToast(m){toast.textContent=m;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),2200);}
function formatDate(v){return new Date(v).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}
function apiKey(){return localStorage.getItem(API_KEY_KEY)||"";}
function go(screen,push=true){if(push&&state.screen!==screen)state.history.push(state.screen);state.screen=screen;render();scrollTo(0,0);}
function goBack(){go(state.history.pop()||"home",false);}
function openReader(id){state.currentNoteId=id;go("reader");}
function configure(name,{back=false,add=false,tabs=true}={}){title.textContent=name;backButton.classList.toggle("hidden",!back);topAction.classList.toggle("hidden",!add);tabbar.hidden=!tabs;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===state.screen));}

function noteCard(n){return `<button class="note-card" data-note="${esc(n.id)}"><span class="note-icon">${n.type==="transcript"?"T":n.type==="maamar"?"מ":"א"}</span><span><h3>${esc(n.title)}</h3><p>${esc(n.speaker||n.source)}</p><small>${labelType(n.type)} · ${formatDate(n.date)}</small></span><span class="chevron">›</span></button>`;}
function bindCards(){document.querySelectorAll("[data-note]").forEach(b=>b.onclick=()=>openReader(b.dataset.note));}
function labelType(t){return t==="transcript"?"Transcript":t==="maamar"?"Maamar":"Notes";}

function renderHome(){
  configure("Home",{add:true});
  const recent=[...state.notes].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  app.innerHTML=`<section class="screen">
    <article class="hero"><p class="kicker">TORAH, ORGANIZED</p><h2>Turn a shiur into notes worth returning to.</h2><p>Import audio or paste a supported link. The app uses the same generation instructions as the Chrome extension.</p><button class="primary-button" id="newShiur">Add a shiur</button></article>
    <div class="section-heading"><h2>Recent</h2><button class="text-button" id="viewLibrary">View library</button></div>
    <div class="note-list">${recent.length?recent.map(noteCard).join(""):`<div class="empty-state"><strong>No shiurim yet</strong><p>Your generated notes and transcripts will appear here.</p></div>`}</div>
  </section>`;
  $("#newShiur").onclick=openAdd;$("#viewLibrary").onclick=()=>go("library");bindCards();
}
function renderLibrary(){
  configure("Library",{add:true});
  const q=state.search.toLowerCase().trim();
  const list=[...state.notes].filter(n=>state.libraryFilter==="All"||labelType(n.type)===state.libraryFilter).filter(n=>!q||`${n.title} ${n.speaker} ${n.markdown}`.toLowerCase().includes(q)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  app.innerHTML=`<section class="screen"><input class="search-input" id="search" type="search" placeholder="Search title, speaker, or text" value="${esc(state.search)}">
  <div class="filters">${["All","Notes","Transcript","Maamar"].map(f=>`<button class="filter-chip ${f===state.libraryFilter?"active":""}" data-filter="${f}">${f}</button>`).join("")}</div>
  <div class="note-list">${list.length?list.map(noteCard).join(""):`<div class="empty-state"><strong>No results</strong></div>`}</div></section>`;
  $("#search").oninput=e=>{state.search=e.target.value;renderLibrary();requestAnimationFrame(()=>{$("#search").focus();$("#search").setSelectionRange(state.search.length,state.search.length);});};
  document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{state.libraryFilter=b.dataset.filter;renderLibrary();});bindCards();
}
function renderSettings(){
  configure("Settings");
  app.innerHTML=`<section class="screen">
    <div class="settings-group"><h2>Gemini</h2><div class="settings-card">
      <div class="setting-row"><span>Personal API key</span><button id="keyButton">${apiKey()?"Configured":"Add key"}</button></div>
      <div class="setting-row"><span>Test connection</span><button id="testKey">Test</button></div>
      <div class="setting-row"><span>Default output</span><button id="cycleOutput">${labelType(state.settings.defaultOutput)}</button></div>
    </div></div>
    <div class="settings-group"><h2>Prompts</h2><div class="settings-card">
      <div class="setting-row"><span>Notes prompt</span><button data-prompt="notes">${state.settings.customNotesPrompt?"Custom":"Extension default"}</button></div>
      <div class="setting-row"><span>Transcript prompt</span><button data-prompt="transcript">${state.settings.customTranscriptPrompt?"Custom":"Extension default"}</button></div>
      <div class="setting-row"><span>Maamar prompt</span><button data-prompt="maamar">${state.settings.customMaamarPrompt?"Custom":"Extension default"}</button></div>
    </div></div>
    <div class="settings-group"><h2>Data</h2><div class="settings-card">
      <div class="setting-row"><span>Saved shiurim</span><small>${state.notes.length}</small></div>
      <div class="setting-row"><span>Chrome extension<small id="extensionSyncDetail" style="display:block; margin-top:3px;">Checking this browser…</small></span><button id="extensionSyncButton">Checking…</button></div>
      <div class="setting-row"><span>Export library</span><button id="export">Export</button></div>
      <div class="setting-row"><span>Clear API key</span><button id="clearKey">Clear</button></div>
    </div></div>
    <p class="notice">The web version stores notes and your key locally in Safari. The native app will use iOS Keychain instead.</p>
  </section>`;
  $("#keyButton").onclick=openKeyDialog;$("#testKey").onclick=testConnection;
  $("#cycleOutput").onclick=()=>{const a=["notes","transcript","maamar"];state.settings.defaultOutput=a[(a.indexOf(state.settings.defaultOutput)+1)%a.length];save();renderSettings();};
  document.querySelectorAll("[data-prompt]").forEach(b=>b.onclick=()=>editPrompt(b.dataset.prompt));
  $("#export").onclick=exportLibrary;$("#clearKey").onclick=()=>{localStorage.removeItem(API_KEY_KEY);renderSettings();showToast("API key removed");};
  $("#extensionSyncButton").onclick=()=>window.ShiurNotesExtensionSync?.connectOrSync();
  window.ShiurNotesExtensionSync?.renderStatus();
}
function editPrompt(type){
  const key=type==="notes"?"customNotesPrompt":type==="transcript"?"customTranscriptPrompt":"customMaamarPrompt";
  const current=state.settings[key]||PROMPTS[type];
  const value=prompt(`Edit the ${labelType(type)} prompt. Leave blank to restore the extension default.`,current);
  if(value===null)return;state.settings[key]=value.trim();save();renderSettings();
}
function exportLibrary(){const b=new Blob([JSON.stringify(state.notes,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="shiur-notes-library.json";a.click();URL.revokeObjectURL(u);}

function openAdd(){urlInput.value="";addDialog.showModal();}
function startFromFile(file){
  state.currentFile=file;state.draft={url:"",source:"Imported audio",title:file.name.replace(/\.[^.]+$/,"") ,speaker:"",duration:"",output:state.settings.defaultOutput,promptMode:"default"};addDialog.close();go("confirm");
}
async function startFromUrl(raw){
  const url=raw.trim();if(!url){showToast("Paste a link first");return;}
  state.currentFile=null;state.draft={url,source:detectSource(url),title:"Shiur from link",speaker:"",duration:"",output:state.settings.defaultOutput,promptMode:"default"};addDialog.close();go("confirm");
  try{const meta=await inspectSource(url);Object.assign(state.draft,meta);renderConfirmation();}catch(e){console.warn(e);}
}
function detectSource(u){if(/kolhalashon/i.test(u))return"Kol Halashon";if(/yutorah/i.test(u))return"YUTorah";return"Audio URL";}
async function inspectSource(pageUrl){
  if(/\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.test(pageUrl))return{title:decodeURIComponent(pageUrl.split("/").pop().split("?")[0]),source:"Direct audio"};
  const r=await fetch(pageUrl);if(!r.ok)throw new Error(`Could not inspect page (${r.status})`);const html=await r.text();const doc=new DOMParser().parseFromString(html,"text/html");
  const title=(doc.querySelector("h1")?.textContent||doc.querySelector("meta[property='og:title']")?.content||doc.title||"Shiur").trim();
  const speaker=(doc.querySelector("[class*='speaker'],[class*='rebbe'],[class*='rabbi']")?.textContent||"").trim();
  return{title,speaker,source:detectSource(pageUrl)};
}
function renderConfirmation(){
  configure("New Shiur",{back:true,tabs:false});
  app.innerHTML=`<section class="screen"><div class="panel">
    <div class="source-header"><div class="source-seal">ש</div><h2>${esc(state.draft.title)}</h2><div class="meta">${esc(state.draft.speaker||state.draft.source)}</div></div>
    <div class="form-row"><label for="titleInput">Title</label><input class="text-input" id="titleInput" value="${esc(state.draft.title)}"></div>
    <div class="form-row"><label for="speakerInput">Speaker</label><input class="text-input" id="speakerInput" value="${esc(state.draft.speaker)}" placeholder="Optional"></div>
    <div class="form-row"><p>Create</p><div class="segmented">${["notes","transcript","maamar"].map(t=>`<button class="${state.draft.output===t?"selected":""}" data-output="${t}">${labelType(t)}</button>`).join("")}</div></div>
    <div class="form-row"><label for="promptSelect">Prompt</label><select id="promptSelect"><option value="default">Extension default</option><option value="custom">Custom prompt from Settings</option></select></div>
    <button class="primary-button" id="generate">Generate ${labelType(state.draft.output)}</button>
  </div></section>`;
  $("#titleInput").oninput=e=>state.draft.title=e.target.value;$("#speakerInput").oninput=e=>state.draft.speaker=e.target.value;
  document.querySelectorAll("[data-output]").forEach(b=>b.onclick=()=>{state.draft.output=b.dataset.output;renderConfirmation();});
  $("#promptSelect").value=state.draft.promptMode;$("#promptSelect").onchange=e=>state.draft.promptMode=e.target.value;
  $("#generate").onclick=beginGeneration;
}
async function beginGeneration(){
  if(!apiKey()){openKeyDialog();showToast("Add a Gemini API key first");return;}
  state.processing={step:0,error:"",message:"Preparing source",percent:5};go("processing");
  try{
    let file=state.currentFile;
    if(!file){updateProgress(0,"Finding audio",8);const audioUrl=await resolveAudioUrl(state.draft.url);updateProgress(1,"Downloading audio",20);file=await fetchAudio(audioUrl);}
    updateProgress(2,"Uploading to Gemini",35);const uploaded=await uploadFile(file);
    updateProgress(3,`Generating ${labelType(state.draft.output).toLowerCase()}`,65);
    const result=await generateAudio(uploaded.uri,file.type||"audio/mpeg",state.draft.output,getPrompt(state.draft.output));
    updateProgress(4,"Saving to library",95);
    const note={id:crypto.randomUUID(),title:state.draft.title||"Untitled Shiur",speaker:state.draft.speaker,source:state.draft.source,sourceUrl:state.draft.url,type:state.draft.output,markdown:result.text,model:result.model,date:new Date().toISOString()};
    state.notes.unshift(note);state.currentNoteId=note.id;save();updateProgress(5,"Complete",100);setTimeout(()=>go("reader",false),350);
  }catch(e){console.error(e);state.processing.error=humanError(e);renderProcessing();}
}
function getPrompt(type){
  if(state.draft.promptMode==="custom"){
    const v=type==="notes"?state.settings.customNotesPrompt:type==="transcript"?state.settings.customTranscriptPrompt:state.settings.customMaamarPrompt;
    if(v)return v+NO_CHARTS;
  }
  if(type==="notes"&&state.draft.source==="Kol Halashon")return PROMPTS.kol_halashon_notes+NO_CHARTS;
  return PROMPTS[type]+NO_CHARTS;
}
function updateProgress(step,message,percent){state.processing={step,message,percent,error:""};renderProcessing();}
function renderProcessing(){
  configure(state.processing?.error?"Processing paused":"Generating",{back:false,tabs:false});
  const p=state.processing||{step:0,message:"Preparing",percent:5,error:""};
  const steps=["Source ready","Audio uploaded","Gemini processing","Result saved"];
  app.innerHTML=`<section class="screen"><div class="progress-card"><p class="kicker">${labelType(state.draft.output).toUpperCase()}</p><h2>${esc(state.draft.title)}</h2><p class="meta">${esc(p.error?"Processing stopped. See the update below.":p.message)}</p>
  <div class="progress-bar"><span style="width:${p.percent}%"></span></div><div class="steps">${steps.map((s,i)=>`<div class="step ${i<p.step?"done":i===p.step?"active":""}"><span class="step-dot"></span><span>${s}</span></div>`).join("")}</div>
  ${p.error?`<section class="issue-card issue-${esc(p.error.kind)}" role="alert"><div class="issue-eyebrow"><span class="issue-mark" aria-hidden="true">${p.error.kind==="google"?"G":p.error.kind==="connection"?"C":"i"}</span>${esc(p.error.source)}</div><h3>${esc(p.error.title)}</h3><p class="issue-explanation">${esc(p.error.explanation)}</p><div class="issue-action"><strong>What you can do</strong><p>${esc(p.error.action)}</p></div>${p.error.kind==="setup"?`<button class="secondary-button" id="reviewKey">Review API key</button><button class="secondary-button" id="retry">Try again</button>`:`<button class="secondary-button" id="retry">Try again</button>`}</section>`:""}</div></section>`;
  if($("#retry"))$("#retry").onclick=beginGeneration;
  if($("#reviewKey"))$("#reviewKey").onclick=openKeyDialog;
}

function humanError(e){
  const m=String(e?.message||e), status=Number(e?.status||0);
  const issue=(kind,source,title,action)=>({kind,source,title,explanation:m,action});
  if(e?.code==="GEMINI_CONNECTION_ERROR")return issue("connection","Connection to Google","Could not reach Google Gemini","Check your connection and any browser request blockers, then retry. No response arrived from Google, so the cause is not yet known.");
  if(e?.code==="GEMINI_HTTP_ERROR"){
    if(status>=500)return issue("google","Google Gemini service","Google is having a service problem","Google returned a server error. Wait a few minutes and try again; you do not need to change your API key for this error.");
    if(status===429)return issue("google","Google Gemini limit","Google has limited this request","Wait and retry. If this continues, check your Google project's quota and billing.");
    if(status===401||status===403||/API_KEY_INVALID|API key not valid/i.test(m))return issue("setup","Google account setup","Google did not accept this API key","Review the saved key and its Gemini API permissions in Google AI Studio.");
    return issue("other","Request rejected by Google","Google could not accept this request","Review Google's explanation below and check the recording or model being used. Retrying may help if the uploaded file expired.");
  }
  if(/failed to fetch|cors|audio download failed/i.test(m))return issue("connection","Audio source connection","Could not download the recording","Check the source link and connection. You can also download the MP3 and import it directly.");
  return issue("other","Processing update","We couldn't finish this request","Try again. If the problem continues, check the source recording and the explanation above.");
}

async function resolveAudioUrl(pageUrl){
  if(/\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.test(pageUrl))return pageUrl;
  let html="";try{const r=await fetch(pageUrl);if(r.ok)html=await r.text();}catch{}
  const normalized=html.replace(/\\\//g,"/");
  const direct=normalized.match(/https?:\/\/[^"'<>\\s]+\.mp3(?:\?[^"'<>\\s]*)?/i)?.[0];
  if(direct)return direct;
  const relative=normalized.match(/(?:href|src)=["']([^"']+\.mp3(?:\?[^"']*)?)["']/i)?.[1];
  if(relative)return new URL(relative,pageUrl).href;
  const id=pageUrl.match(/[?&]shiurid=(\d+)/i)?.[1]||pageUrl.match(/\/(?:lectures|lecture\.cfm)\/(\d+)/i)?.[1];
  if(id){
    const dataUrl=`https://www.yutorah.org/sidebar/LectureData?shiurID=${id}`;
    const r=await fetch(dataUrl);if(r.ok){const t=(await r.text()).replace(/\\\//g,"/");const m=t.match(/https?:\/\/[^"'<>\\s]+\.mp3(?:\?[^"'<>\\s]*)?/i)?.[0];if(m)return m;}
  }
  throw new Error("No audio file was found on the linked page.");
}
async function fetchAudio(url){const r=await fetch(url);if(!r.ok)throw new Error(`Audio download failed (${r.status})`);const b=await r.blob();return new File([b],"shiur-audio",{type:b.type||"audio/mpeg"});}
async function geminiFetch(url, options, action){
  let response;
  try{response=await fetch(url,options);}catch(error){if(/failed to fetch|networkerror|network error|load failed/i.test(String(error?.message||error))){const wrapped=new Error("The browser could not connect to Google Gemini. Check your connection or whether a VPN, firewall, or browser privacy extension is blocking Google API requests.");wrapped.code="GEMINI_CONNECTION_ERROR";throw wrapped;}throw error;}
  if(response.ok)return response;
  const body=await response.text().catch(()=>"");let detail="";try{detail=JSON.parse(body)?.error?.message||"";}catch{detail=body;}
  const status=response.status;let message;
  if(status>=500)message=`Google Gemini is having a service problem (${status}) while trying to ${action}. This is on Google's end; ShiurNotes and your API key are not the cause. Please wait a few minutes and try again.`;
  else if(status===429)message="Google Gemini has limited this request because of a quota or rate limit. The request reached Google successfully. Check the quota and billing for the Google project linked to your key, or wait and retry.";
  else if(status===401||status===403)message="Google rejected the API key or its permissions. Check the saved key and confirm the Gemini API is enabled for its Google project.";
  else if(status===404)message="Google could not find the requested Gemini model or uploaded file. Model availability may have changed; try again or check the selected model.";
  else message=`Google Gemini could not ${action} (${status}).`;
  const error=new Error(`${message}${detail?` Google says: ${detail}`:""}`);
  error.code="GEMINI_HTTP_ERROR";error.status=status;throw error;
}async function uploadFile(file){
  const key=apiKey();const start=await geminiFetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"X-Goog-Upload-Protocol":"resumable","X-Goog-Upload-Command":"start","X-Goog-Upload-Header-Content-Length":String(file.size),"X-Goog-Upload-Header-Content-Type":file.type||"audio/mpeg","Content-Type":"application/json"},body:JSON.stringify({file:{display_name:file.name||"shiur-audio"}})},"start the audio upload");
  const url=start.headers.get("X-Goog-Upload-URL");if(!url)throw new Error("Gemini did not return an upload URL.");
  const finish=await geminiFetch(url,{method:"POST",headers:{"X-Goog-Upload-Command":"upload, finalize","X-Goog-Upload-Offset":"0","Content-Type":file.type||"audio/mpeg"},body:file},"receive the audio file");
  const data=await finish.json();await waitForFile(data.file.name);return data.file;
}

async function waitForFile(name){for(let i=0;i<45;i++){const r=await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${encodeURIComponent(apiKey())}`,undefined,"check the uploaded file");const d=await r.json();if(d.state==="ACTIVE")return;if(d.state==="FAILED")throw new Error("Google Gemini received the upload but could not process the audio file.");await new Promise(x=>setTimeout(x,2000));}throw new Error("Google Gemini has not finished preparing the audio yet. Please try again in a few minutes.");}

async function generateAudio(fileUri,mimeType,type,promptText){
  let last;for(const model of MODELS){try{
    const r=await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey())}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{fileData:{mimeType,fileUri}},{text:promptText}]}],generationConfig:{temperature:.2,topP:.9,maxOutputTokens:65000},safetySettings:[{category:"HARM_CATEGORY_HARASSMENT",threshold:"BLOCK_NONE"},{category:"HARM_CATEGORY_HATE_SPEECH",threshold:"BLOCK_NONE"},{category:"HARM_CATEGORY_DANGEROUS_CONTENT",threshold:"BLOCK_NONE"},{category:"HARM_CATEGORY_SEXUALLY_EXPLICIT",threshold:"BLOCK_NONE"}]})},"generate the requested notes");
    const d=await r.json();const text=d?.candidates?.[0]?.content?.parts?.filter(p=>typeof p.text==="string").map(p=>p.text).join("\n");if(!text)throw new Error("Gemini returned no text.");return{text:clean(text),model};
  }catch(e){last=e;if(/401|403|429|quota|resource_exhausted|failed to fetch/i.test(String(e.message)))throw e;}}
  throw last||new Error("Generation failed.");
}

function clean(t){return t.replace(/\\text\{([^}]*)\}/g,"$1").replace(/\$\$([\s\S]*?)\$\$/g,"$1").trim();}
async function testConnection(){if(!apiKey()){openKeyDialog();return;}try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey())}`);if(r.ok){showToast("Google accepted the Gemini API key");return;}const body=await r.text().catch(()=>"");let detail="";try{detail=JSON.parse(body)?.error?.message||"";}catch{}if(r.status>=500)showToast(`Google Gemini is having a service problem (${r.status}); your key is not the cause. Try again shortly.`);else if(r.status===429)showToast("Google is rate limiting key checks. Wait a few minutes and try again.");else if(r.status===401||r.status===403)showToast(`Google did not accept this API key. Check the saved key and Gemini API access.${detail?` ${detail}`:""}`);else showToast(`Google returned an error while checking this key (${r.status}).${detail?` ${detail}`:""}`);}catch(error){showToast(/failed to fetch|networkerror|network error/i.test(String(error?.message||error))?"Could not connect to Google to check the key. Check your connection and try again.":`Could not check the key: ${error.message}`);}}

function renderReader(){
  const n=state.notes.find(x=>x.id===state.currentNoteId);if(!n){go("library",false);return;}
  configure(labelType(n.type),{back:true,tabs:false});
  app.innerHTML=`<section class="screen"><header class="reader-header"><p class="kicker">${esc(n.source||"SHIUR")}</p><h2>${esc(n.title)}</h2><div class="meta">${esc(n.speaker||"")} ${n.speaker?"·":""} ${formatDate(n.date)} · ${esc(n.model||"Gemini")}</div></header>
  <div class="reader-actions"><button id="copy">Copy</button><button id="share">Share</button><button id="delete">Delete</button></div>
  <article class="document">${renderMarkdown(n.markdown)}</article></section>`;
  $("#copy").onclick=async()=>{await navigator.clipboard.writeText(n.markdown);showToast("Copied");};
  $("#share").onclick=async()=>{if(navigator.share)await navigator.share({title:n.title,text:n.markdown});else showToast("Sharing is not available here");};
  $("#delete").onclick=()=>{if(confirm("Delete this item?")){window.ShiurNotesExtensionSync?.recordDeletion(n);state.notes=state.notes.filter(x=>x.id!==n.id);save();go("library",false);}};
}
function renderMarkdown(md=""){
  const lines=md.replace(/\r/g,"").split("\n");let out="",inList=false;
  const close=()=>{if(inList){out+="</ul>";inList=false;}};
  for(const raw of lines){const line=raw.trimEnd();if(/^###\s+/.test(line)){close();out+=`<h3>${inline(line.replace(/^###\s+/,""))}</h3>`;}else if(/^##\s+/.test(line)){close();out+=`<h2>${inline(line.replace(/^##\s+/,""))}</h2>`;}else if(/^#\s+/.test(line)){close();out+=`<h2>${inline(line.replace(/^#\s+/,""))}</h2>`;}else if(/^-\s+/.test(line)){if(!inList){out+="<ul>";inList=true;}out+=`<li>${inline(line.replace(/^-\s+/,""))}</li>`;}else if(/^>\s?/.test(line)){close();out+=`<blockquote>${inline(line.replace(/^>\s?/,""))}</blockquote>`;}else if(!line.trim()){close();}else{close();out+=`<p>${inline(line)}</p>`;}}
  close();return out;
}
function inline(s){return esc(s).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>");}

function render(){if(state.screen==="home")renderHome();else if(state.screen==="library")renderLibrary();else if(state.screen==="settings")renderSettings();else if(state.screen==="confirm")renderConfirmation();else if(state.screen==="processing")renderProcessing();else if(state.screen==="reader")renderReader();}
function openKeyDialog(){$("#apiKeyInput").value=apiKey();keyDialog.showModal();}

backButton.onclick=goBack;topAction.onclick=openAdd;
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>go(b.dataset.tab,false));
$("#continueLink").onclick=()=>startFromUrl(urlInput.value);
$("#importAudio").onclick=()=>audioInput.click();
audioInput.onchange=()=>{if(audioInput.files?.[0])startFromFile(audioInput.files[0]);};
$("#pasteClipboard").onclick=async()=>{try{urlInput.value=await navigator.clipboard.readText();}catch{showToast("Clipboard access was blocked");}};
$("#saveApiKey").onclick=()=>{const k=$("#apiKeyInput").value.trim();if(!k){showToast("Enter a key");return;}localStorage.setItem(API_KEY_KEY,k);keyDialog.close();showToast("API key saved");if(state.screen==="confirm")renderConfirmation();};

if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
render();
