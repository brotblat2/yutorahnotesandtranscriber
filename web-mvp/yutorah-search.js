(() => {
  const searchState = { query: "", sort: "relevance", results: [], loading: false, error: "", expandedAudioId: null };
  const legacyRender = render;

  render = function renderWithYUTorahSearch() {
    if (state.screen === "yutorahSearch") return renderYUTorahSearch();
    return legacyRender();
  };

  function installSearchChoice() {
    const form = document.querySelector("#addForm");
    const label = form?.querySelector("label[for='shiurUrl']");
    if (!form || !label || document.querySelector("#searchYUTorahChoice")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "searchYUTorahChoice";
    button.className = "choice-button yutorah-search-choice";
    button.innerHTML = "<span><strong>Search YUTorah</strong><small>Find a shiur and create notes without copying a link</small></span><span class='search-choice-arrow'>›</span>";
    button.onclick = () => {
      addDialog.close();
      go("yutorahSearch");
    };

    form.insertBefore(button, label);
    const divider = document.createElement("div");
    divider.className = "divider";
    divider.innerHTML = "<span>or use a link</span>";
    form.insertBefore(divider, label);
  }

  function renderYUTorahSearch() {
    configure("Search YUTorah", { back: true, tabs: false });
    app.innerHTML = `<section class="screen yutorah-search-screen">
      <div class="search-intro">
        <p class="kicker">YUTORAH LIBRARY</p>
        <h2>Find a shiur</h2>
        <p>Search YUTorah, listen to the original recording, then create Notes, a Transcript, or a Maamar.</p>
      </div>
      <form class="yutorah-search-form" id="yutorahSearchForm">
        <input class="search-input" id="yutorahQuery" type="search" autocomplete="off" placeholder="Title, rabbi, masechta, or topic" value="${esc(searchState.query)}">
        <button class="primary-button" type="submit" ${searchState.loading ? "disabled" : ""}>${searchState.loading ? "Searching…" : "Search"}</button>
      </form>
      <div class="yutorah-search-toolbar">
        <label for="yutorahSort">Sort</label>
        <select id="yutorahSort">
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      ${searchState.error ? `<div class="error-box">${esc(searchState.error)}</div>` : ""}
      <div class="yutorah-results" id="yutorahResults">${renderResults()}</div>
    </section>`;

    const form = document.querySelector("#yutorahSearchForm");
    const input = document.querySelector("#yutorahQuery");
    const sort = document.querySelector("#yutorahSort");
    sort.value = searchState.sort;
    form.onsubmit = event => {
      event.preventDefault();
      runSearch(input.value);
    };
    sort.onchange = () => {
      searchState.sort = sort.value;
      if (searchState.query) runSearch(searchState.query);
    };
    bindResultActions();
    if (!searchState.results.length && !searchState.loading) requestAnimationFrame(() => input.focus());
  }

  function renderResults() {
    if (searchState.loading) return `<div class="search-loading"><span class="search-spinner"></span><strong>Searching YUTorah…</strong><p>Finding audio shiurim and verifying their recordings.</p></div>`;
    if (!searchState.query) return `<div class="empty-state"><strong>Search the YUTorah library</strong><p>Try a rabbi, masechta, parsha, or shiur title.</p></div>`;
    if (!searchState.results.length && !searchState.error) return `<div class="empty-state"><strong>No audio results found</strong><p>Try broader wording or another spelling.</p></div>`;

    return searchState.results.map(result => {
      const details = [result.speaker, result.date, result.duration].filter(Boolean).map(esc).join(" · ");
      const categories = Array.isArray(result.categories) && result.categories.length
        ? `<div class="result-tags">${result.categories.map(value => `<span>${esc(value)}</span>`).join("")}</div>`
        : "";
      const expanded = searchState.expandedAudioId === result.id;
      return `<article class="yutorah-result-card">
        <div class="result-source-row"><span class="result-source">YUTorah</span>${result.date ? `<span>${esc(result.date)}</span>` : ""}</div>
        <h3>${esc(result.title || "Shiur")}</h3>
        <p class="result-meta">${details || "Audio shiur"}</p>
        ${categories}
        ${expanded ? `<audio class="result-audio" controls preload="metadata" src="${esc(result.audioUrl)}"></audio>` : ""}
        <div class="result-actions">
          <button class="secondary-button" data-preview="${esc(result.id)}">${expanded ? "Hide player" : "Listen"}</button>
          <button class="primary-button" data-create="${esc(result.id)}">Create</button>
        </div>
      </article>`;
    }).join("");
  }

  async function runSearch(value) {
    const query = String(value || "").trim();
    if (query.length < 2) {
      searchState.error = "Enter at least two characters.";
      renderYUTorahSearch();
      return;
    }

    searchState.query = query;
    searchState.loading = true;
    searchState.error = "";
    searchState.expandedAudioId = null;
    renderYUTorahSearch();

    try {
      const params = new URLSearchParams({ q: query, sort: searchState.sort });
      const response = await fetch(`/api/yutorah/search?${params}`, { headers: { "Accept": "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Search failed (${response.status})`);
      searchState.results = Array.isArray(data.results) ? data.results : [];
    } catch (error) {
      console.error(error);
      searchState.results = [];
      searchState.error = error.message || "YUTorah search is temporarily unavailable.";
    } finally {
      searchState.loading = false;
      renderYUTorahSearch();
    }
  }

  function bindResultActions() {
    document.querySelectorAll("[data-preview]").forEach(button => {
      button.onclick = () => {
        searchState.expandedAudioId = searchState.expandedAudioId === button.dataset.preview ? null : button.dataset.preview;
        renderYUTorahSearch();
      };
    });

    document.querySelectorAll("[data-create]").forEach(button => {
      button.onclick = () => {
        const result = searchState.results.find(item => String(item.id) === button.dataset.create);
        if (!result) return;
        state.currentFile = null;
        state.draft = {
          url: result.pageUrl,
          source: "YUTorah",
          title: result.title || "Shiur",
          speaker: result.speaker || "",
          duration: result.duration || "",
          output: state.settings.defaultOutput,
          promptMode: "default"
        };
        go("confirm");
      };
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    .yutorah-search-choice { border-color: #d8dcff; background: linear-gradient(135deg, #f5f6ff, #ffffff); }
    .search-choice-arrow { font-size: 27px; color: #667eea; }
    .search-intro { margin-bottom: 18px; }
    .search-intro h2 { margin: 4px 0 7px; font-size: 29px; }
    .search-intro > p:last-child { color: #5f6368; line-height: 1.55; margin: 0; }
    .yutorah-search-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
    .yutorah-search-form .primary-button { width: auto; min-width: 104px; margin: 0; }
    .yutorah-search-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin: 13px 0; color: #5f6368; font-size: 13px; }
    .yutorah-search-toolbar select { border: 1px solid #dadce0; border-radius: 9px; background: #fff; padding: 8px 30px 8px 10px; color: #202124; }
    .yutorah-results { display: grid; gap: 13px; }
    .yutorah-result-card { background: #fff; border: 1px solid #e4e7eb; border-radius: 16px; padding: 17px; box-shadow: 0 2px 9px rgba(32,33,36,.055); }
    .result-source-row { display: flex; justify-content: space-between; gap: 12px; color: #777; font-size: 12px; margin-bottom: 7px; }
    .result-source { color: #667eea; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
    .yutorah-result-card h3 { font-size: 18px; line-height: 1.35; margin: 0 0 7px; color: #202124; }
    .result-meta { color: #5f6368; font-size: 14px; margin: 0; line-height: 1.45; }
    .result-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .result-tags span { background: #f1f3f4; color: #4a4d50; border-radius: 999px; padding: 4px 8px; font-size: 11px; }
    .result-audio { width: 100%; margin-top: 14px; height: 40px; }
    .result-actions { display: grid; grid-template-columns: 1fr 1.35fr; gap: 9px; margin-top: 15px; }
    .result-actions .primary-button, .result-actions .secondary-button { width: 100%; margin: 0; min-height: 43px; }
    .search-loading { text-align: center; padding: 42px 18px; color: #5f6368; }
    .search-loading strong { display: block; color: #202124; margin: 12px 0 4px; }
    .search-loading p { margin: 0; }
    .search-spinner { display: inline-block; width: 26px; height: 26px; border: 3px solid #e1e4ff; border-top-color: #667eea; border-radius: 50%; animation: yutorah-spin .8s linear infinite; }
    @keyframes yutorah-spin { to { transform: rotate(360deg); } }
    @media (max-width: 560px) {
      .yutorah-search-form { grid-template-columns: 1fr; }
      .yutorah-search-form .primary-button { width: 100%; }
    }
  `;
  document.head.appendChild(style);

  installSearchChoice();
})();
