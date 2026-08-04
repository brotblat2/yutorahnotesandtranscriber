const STORAGE_KEY = "shiur-notes-web-mvp-v1";

const sampleContent = {
  overview: "The shiur examines the relationship between tefillah as a formal mitzvah and tefillah as avodah shebalev. The central question is whether prayer is defined primarily by its words, its structure, or the inner religious posture it expresses.",
  ideas: [
    "The Rambam presents daily prayer as a mitzvah, while the precise text and schedule were later formalized.",
    "Avodah shebalev means that the act cannot be reduced to recitation alone; intention gives the words their religious character.",
    "The fixed structure of Shemoneh Esrei creates discipline while still leaving room for personal dependence on Hashem."
  ],
  sources: [
    "Rambam, Hilchos Tefillah 1:1",
    "Gemara Berachos 26b",
    "Gemara Taanis 2a"
  ],
  conclusion: "The shiur concludes that fixed language and personal feeling are not competing models. The halachic form trains and carries the inner experience, while the inner experience transforms the form into genuine תפילה."
};

const seedNotes = [
  {
    id: crypto.randomUUID(),
    title: "The Nature of Tefillah",
    speaker: "Rav Michael Rosensweig",
    type: "Notes",
    source: "YUTorah",
    duration: "54 min",
    date: new Date().toISOString(),
    content: sampleContent
  },
  {
    id: crypto.randomUUID(),
    title: "Yevamos Shiur 14",
    speaker: "Rav Michael Rosensweig",
    type: "Transcript",
    source: "YUTorah",
    duration: "1 hr 12 min",
    date: new Date(Date.now() - 86400000).toISOString(),
    content: {
      overview: "A sample transcript entry showing how a full shiur would appear in the mobile library.",
      ideas: ["The transcript view would preserve paragraph breaks and Hebrew terminology.", "Future versions can add timestamps linked to audio playback."],
      sources: ["Yevamos 29a"],
      conclusion: "This prototype focuses on navigation and reading experience rather than real transcription."
    }
  },
  {
    id: crypto.randomUUID(),
    title: "The Two Dimensions of Teshuvah",
    speaker: "Rabbi Joseph B. Soloveitchik",
    type: "Notes",
    source: "Imported Audio",
    duration: "47 min",
    date: new Date(Date.now() - 4 * 86400000).toISOString(),
    content: {
      overview: "Teshuvah includes both repairing a particular act and rebuilding the identity of the person who sinned.",
      ideas: ["Confession addresses the concrete act.", "Returning to Hashem addresses the person as a whole."],
      sources: ["Rambam, Hilchos Teshuvah 1:1"],
      conclusion: "The complete process joins behavioral responsibility with personal transformation."
    }
  }
];

const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
const state = {
  screen: "home",
  history: [],
  notes: saved?.notes?.length ? saved.notes : seedNotes,
  currentNoteId: null,
  draft: {
    url: "",
    source: "YUTorah",
    title: "The Nature of Tefillah",
    speaker: "Rav Michael Rosensweig",
    duration: "54 min",
    output: "Notes",
    detail: "Comprehensive"
  },
  libraryFilter: "All",
  search: "",
  settings: saved?.settings || {
    appearance: "System",
    defaultOutput: "Notes",
    detail: "Comprehensive",
    keepAwake: false,
    demoMode: true
  },
  processingIndex: 0
};

const app = document.querySelector("#app");
const title = document.querySelector("#screenTitle");
const eyebrow = document.querySelector("#screenEyebrow");
const backButton = document.querySelector("#backButton");
const topAction = document.querySelector("#topAction");
const tabbar = document.querySelector("#tabbar");
const addDialog = document.querySelector("#addDialog");
const urlInput = document.querySelector("#shiurUrl");
const audioInput = document.querySelector("#audioFile");
const toast = document.querySelector("#toast");

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: state.notes, settings: state.settings }));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
}

function formatDate(value) {
  const date = new Date(value);
  const today = new Date();
  const diff = Math.floor((today.setHours(0,0,0,0) - new Date(date).setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function go(screen, push = true) {
  if (push && state.screen !== screen) state.history.push(state.screen);
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function goBack() {
  const previous = state.history.pop();
  go(previous || "home", false);
}

function openReader(id, push = true) {
  state.currentNoteId = id;
  go("reader", push);
}

function configureChrome({ titleText, eyebrowText = "SHIUR NOTES", back = false, add = false, tabs = true }) {
  title.textContent = titleText;
  eyebrow.textContent = eyebrowText;
  backButton.classList.toggle("hidden", !back);
  topAction.classList.toggle("hidden", !add);
  tabbar.hidden = !tabs;
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === state.screen);
  });
}

function noteCard(note) {
  const letter = note.type === "Transcript" ? "T" : "א";
  return `
    <button class="note-card" data-note-id="${esc(note.id)}">
      <span class="note-icon">${letter}</span>
      <span>
        <h3>${esc(note.title)}</h3>
        <p>${esc(note.speaker)}</p>
        <small>${esc(note.type)} · ${esc(note.duration)} · ${formatDate(note.date)}</small>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
}

function bindNoteCards() {
  document.querySelectorAll("[data-note-id]").forEach(card => {
    card.addEventListener("click", () => openReader(card.dataset.noteId));
  });
}

function renderHome() {
  configureChrome({ titleText: "Home", add: true });
  const recent = [...state.notes].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  app.innerHTML = `
    <section class="screen">
      <article class="hero">
        <p class="eyebrow">TORAH, ORGANIZED</p>
        <h2>Turn any shiur into notes you will actually revisit.</h2>
        <p>Share a link or import audio, choose notes or transcript, and keep the result in a calm personal library.</p>
        <button class="primary-button" id="newShiur">＋ New Shiur</button>
      </article>

      <div class="section-heading">
        <h2>Recent</h2>
        <button class="text-button" id="viewLibrary">View Library</button>
      </div>
      <div class="note-list">${recent.map(noteCard).join("")}</div>
    </section>`;
  document.querySelector("#newShiur").addEventListener("click", openAddSheet);
  document.querySelector("#viewLibrary").addEventListener("click", () => go("library"));
  bindNoteCards();
}

function renderLibrary() {
  configureChrome({ titleText: "Library", add: true });
  const query = state.search.trim().toLowerCase();
  const filtered = [...state.notes]
    .filter(note => state.libraryFilter === "All" || note.type === state.libraryFilter)
    .filter(note => !query || `${note.title} ${note.speaker} ${note.source} ${JSON.stringify(note.content)}`.toLowerCase().includes(query))
    .sort((a,b) => new Date(b.date) - new Date(a.date));

  app.innerHTML = `
    <section class="screen">
      <div class="search-row">
        <input class="search-input" id="librarySearch" type="search" placeholder="Search notes, rabbis, or topics" value="${esc(state.search)}">
      </div>
      <div class="filters">
        ${["All", "Notes", "Transcript"].map(filter => `<button class="filter-chip ${state.libraryFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}
      </div>
      <div class="note-list" id="libraryList">
        ${filtered.length ? filtered.map(noteCard).join("") : `<div class="empty-state"><strong>No results</strong><p>Try a different search or filter.</p></div>`}
      </div>
    </section>`;

  document.querySelector("#librarySearch").addEventListener("input", event => {
    state.search = event.target.value;
    renderLibrary();
    requestAnimationFrame(() => {
      const input = document.querySelector("#librarySearch");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.libraryFilter = button.dataset.filter;
      renderLibrary();
    });
  });
  bindNoteCards();
}

function settingRow(label, value, id) {
  return `<div class="setting-row"><span>${label}</span><button data-setting="${id}">${esc(value)} ›</button></div>`;
}

function renderSettings() {
  configureChrome({ titleText: "Settings" });
  app.innerHTML = `
    <section class="screen">
      <div class="settings-group">
        <h2>AI</h2>
        <div class="settings-card">
          ${settingRow("API configuration", state.settings.demoMode ? "Demo Mode" : "Personal Key", "api")}
          ${settingRow("Default output", state.settings.defaultOutput, "output")}
          ${settingRow("Notes detail", state.settings.detail, "detail")}
          <div class="setting-row"><span>Test connection</span><button id="testConnection">Test</button></div>
        </div>
      </div>

      <div class="settings-group">
        <h2>Reading</h2>
        <div class="settings-card">
          ${settingRow("Appearance", state.settings.appearance, "appearance")}
          <label class="setting-row"><span>Keep screen awake</span><input class="toggle" id="keepAwake" type="checkbox" ${state.settings.keepAwake ? "checked" : ""}></label>
        </div>
      </div>

      <div class="settings-group">
        <h2>Data</h2>
        <div class="settings-card">
          <div class="setting-row"><span>Saved shiurim</span><small>${state.notes.length}</small></div>
          <div class="setting-row"><span>Export prototype data</span><button id="exportData">Export</button></div>
          <div class="setting-row"><span>Reset prototype</span><button id="resetData">Reset</button></div>
        </div>
      </div>

      <div class="settings-group">
        <h2>Privacy</h2>
        <div class="settings-card">
          <div class="setting-row"><span>Prototype status</span><small>No real audio leaves this browser</small></div>
        </div>
      </div>
    </section>`;

  document.querySelectorAll("[data-setting]").forEach(button => {
    button.addEventListener("click", () => cycleSetting(button.dataset.setting));
  });
  document.querySelector("#keepAwake").addEventListener("change", event => {
    state.settings.keepAwake = event.target.checked;
    save();
    showToast(event.target.checked ? "Keep-awake preference saved" : "Keep-awake disabled");
  });
  document.querySelector("#testConnection").addEventListener("click", () => showToast("Prototype connection looks good"));
  document.querySelector("#exportData").addEventListener("click", exportData);
  document.querySelector("#resetData").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

function cycleSetting(key) {
  const options = {
    api: ["Demo Mode", "Personal Key"],
    output: ["Notes", "Transcript"],
    detail: ["Concise", "Standard", "Comprehensive"],
    appearance: ["System", "Light", "Dark"]
  }[key];
  const current = key === "api" ? (state.settings.demoMode ? "Demo Mode" : "Personal Key") : state.settings[key === "output" ? "defaultOutput" : key];
  const next = options[(options.indexOf(current) + 1) % options.length];
  if (key === "api") state.settings.demoMode = next === "Demo Mode";
  else if (key === "output") state.settings.defaultOutput = next;
  else state.settings[key] = next;
  save();
  renderSettings();
  showToast(`${next} selected`);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ notes: state.notes, settings: state.settings }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shiur-notes-prototype.json";
  link.click();
  URL.revokeObjectURL(url);
}

function renderConfirmation() {
  configureChrome({ titleText: "New Shiur", eyebrowText: "CONFIRM", back: true, tabs: false });
  app.innerHTML = `
    <section class="screen">
      <article class="confirmation-card">
        <div class="source-mark">ש</div>
        <h2>${esc(state.draft.title)}</h2>
        <div class="meta">${esc(state.draft.speaker)}<br>${esc(state.draft.source)} · ${esc(state.draft.duration)}</div>

        <div class="form-section">
          <p>Create</p>
          <div class="segmented" id="outputSegment">
            <button class="${state.draft.output === "Notes" ? "selected" : ""}" data-output="Notes">Notes</button>
            <button class="${state.draft.output === "Transcript" ? "selected" : ""}" data-output="Transcript">Transcript</button>
          </div>
        </div>

        <div class="form-section">
          <label for="detailSelect">Notes detail</label>
          <select id="detailSelect" ${state.draft.output === "Transcript" ? "disabled" : ""}>
            ${["Concise", "Standard", "Comprehensive"].map(option => `<option ${state.draft.detail === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>

        <div class="form-section">
          <label for="languageSelect">Language</label>
          <select id="languageSelect"><option>Original language</option><option>English</option><option>Hebrew</option></select>
        </div>

        <button class="primary-button full" id="generateButton">Generate ${esc(state.draft.output)}</button>
      </article>
    </section>`;

  document.querySelectorAll("[data-output]").forEach(button => {
    button.addEventListener("click", () => {
      state.draft.output = button.dataset.output;
      renderConfirmation();
    });
  });
  document.querySelector("#detailSelect").addEventListener("change", event => state.draft.detail = event.target.value);
  document.querySelector("#generateButton").addEventListener("click", startProcessing);
}

const stages = ["Retrieving audio", "Preparing secure upload", "Generating organized content", "Saving to your library"];

function renderProcessing() {
  configureChrome({ titleText: `Creating ${state.draft.output}`, eyebrowText: "PROCESSING", back: false, tabs: false });
  const percent = Math.round(((state.processingIndex + 0.4) / stages.length) * 100);
  app.innerHTML = `
    <section class="screen processing">
      <div class="progress-ring" style="--progress:${Math.min(percent, 96)}%"><span>${Math.min(percent, 96)}%</span></div>
      <h2>${esc(state.draft.title)}</h2>
      <p>Simulating the real generation workflow.</p>
      <div class="stage-list">
        ${stages.map((stage, index) => {
          const status = index < state.processingIndex ? "done" : index === state.processingIndex ? "active" : "";
          const mark = index < state.processingIndex ? "✓" : "";
          return `<div class="stage ${status}"><span class="stage-dot">${mark}</span><span>${stage}</span></div>`;
        }).join("")}
      </div>
      <button class="ghost-button full" id="cancelProcessing">Cancel</button>
    </section>`;
  document.querySelector("#cancelProcessing").addEventListener("click", () => go("home", false));
}

async function startProcessing() {
  state.processingIndex = 0;
  go("processing");
  for (let index = 0; index < stages.length; index += 1) {
    if (state.screen !== "processing") return;
    state.processingIndex = index;
    renderProcessing();
    await new Promise(resolve => setTimeout(resolve, 720));
  }
  if (state.screen !== "processing") return;
  const newNote = {
    id: crypto.randomUUID(),
    title: state.draft.title,
    speaker: state.draft.speaker,
    type: state.draft.output,
    source: state.draft.source,
    duration: state.draft.duration,
    date: new Date().toISOString(),
    content: {
      ...sampleContent,
      overview: `${sampleContent.overview} This ${state.draft.detail.toLowerCase()} prototype result was generated locally to demonstrate the finished reading flow.`
    }
  };
  state.notes.unshift(newNote);
  state.currentNoteId = newNote.id;
  save();
  showToast(`${state.draft.output} ready`);
  go("reader", false);
}

function renderReader() {
  const note = state.notes.find(item => item.id === state.currentNoteId) || state.notes[0];
  configureChrome({ titleText: note.type, eyebrowText: note.source.toUpperCase(), back: true, tabs: false });
  const content = note.content || sampleContent;
  app.innerHTML = `
    <section class="screen">
      <header class="reader-header">
        <p class="eyebrow">${esc(note.type.toUpperCase())}</p>
        <h2>${esc(note.title)}</h2>
        <div class="meta">${esc(note.speaker)}<br>${esc(note.source)} · ${esc(note.duration)} · ${formatDate(note.date)}</div>
      </header>

      <div class="reader-actions">
        <button id="copyNote">Copy</button>
        <button id="shareNote">Share</button>
        <button id="refineNote">Refine</button>
      </div>

      <article class="reader-card" id="readerContent">
        <h3>Overview</h3>
        <p>${esc(content.overview)}</p>

        <h3>Central Ideas</h3>
        <ul>${content.ideas.map(item => `<li>${esc(item)}</li>`).join("")}</ul>

        <h3>Key Sources</h3>
        <ul>${content.sources.map(item => `<li>${esc(item)}</li>`).join("")}</ul>

        <h3>Practical Conclusion</h3>
        <p>${esc(content.conclusion)}</p>
        <p class="hebrew">עבודה שבלב מחברת בין הנוסח הקבוע לבין הכוונה האישית.</p>
      </article>
    </section>`;

  document.querySelector("#copyNote").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.querySelector("#readerContent").innerText);
    showToast("Note copied");
  });
  document.querySelector("#shareNote").addEventListener("click", async () => {
    const data = { title: note.title, text: `${note.title}\n${note.speaker}\n\n${document.querySelector("#readerContent").innerText}` };
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.text);
      showToast("Copied for sharing");
    }
  });
  document.querySelector("#refineNote").addEventListener("click", () => showToast("AI refinements come after MVP review"));
}

function render() {
  const renderers = {
    home: renderHome,
    library: renderLibrary,
    settings: renderSettings,
    confirm: renderConfirmation,
    processing: renderProcessing,
    reader: renderReader
  };
  (renderers[state.screen] || renderHome)();
}

function openAddSheet() {
  urlInput.value = state.draft.url;
  if (typeof addDialog.showModal === "function") addDialog.showModal();
  else addDialog.setAttribute("open", "");
  setTimeout(() => urlInput.focus(), 120);
}

function continueWithLink(url) {
  state.draft.url = url || "https://www.yutorah.org/lectures/example";
  state.draft.source = state.draft.url.toLowerCase().includes("kolhalashon") ? "Kol Halashon" : "YUTorah";
  state.draft.title = "The Nature of Tefillah";
  state.draft.speaker = "Rav Michael Rosensweig";
  state.draft.duration = "54 min";
  state.draft.output = state.settings.defaultOutput;
  state.draft.detail = state.settings.detail;
  addDialog.close();
  go("confirm");
}

backButton.addEventListener("click", goBack);
topAction.addEventListener("click", openAddSheet);

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    state.history = [];
    go(button.dataset.tab, false);
  });
});

document.querySelector("#continueLink").addEventListener("click", () => continueWithLink(urlInput.value.trim()));
document.querySelector("#importAudio").addEventListener("click", () => audioInput.click());
audioInput.addEventListener("change", () => {
  const file = audioInput.files?.[0];
  if (!file) return;
  state.draft.url = "";
  state.draft.source = "Imported Audio";
  state.draft.title = file.name.replace(/\.[^.]+$/, "") || "Imported Shiur";
  state.draft.speaker = "Speaker not identified";
  state.draft.duration = "Audio file";
  state.draft.output = state.settings.defaultOutput;
  addDialog.close();
  go("confirm");
});

document.querySelector("#pasteClipboard").addEventListener("click", async () => {
  try {
    const value = await navigator.clipboard.readText();
    urlInput.value = value;
    continueWithLink(value);
  } catch {
    showToast("Paste the link into the field above");
    urlInput.focus();
  }
});

addDialog.addEventListener("click", event => {
  if (event.target === addDialog) addDialog.close();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

render();
