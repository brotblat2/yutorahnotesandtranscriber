(() => {
  const SHORTCUT_URL = "https://www.icloud.com/shortcuts/d6ccbb97e60240199c52b0b62f814acb";

  renderHome = function renderHomeWithShortcut() {
    configure("Home", { add: true });
    const recent = [...state.notes]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4);

    app.innerHTML = `<section class="screen">
      <article class="hero">
        <p class="kicker">TORAH, ORGANIZED</p>
        <h2>Turn a shiur into notes worth returning to.</h2>
        <p>Import audio or paste a supported link. The app uses the same generation instructions as the Chrome extension.</p>
        <button class="primary-button" id="newShiur">Add a shiur</button>
      </article>

      <section class="home-shortcut-card" aria-labelledby="homeShortcutTitle">
        <div class="home-shortcut-copy">
          <span class="iphone-only-badge">iPhone only</span>
          <h2 id="homeShortcutTitle">Send a YUTorah shiur here from Share</h2>
          <p>Install the shortcut once. After that, open any shiur on YUTorah, tap Share, and choose Shiur Notes.</p>
        </div>
        <a class="shortcut-install-button" href="${SHORTCUT_URL}" target="_blank" rel="noopener noreferrer">Install iPhone Shortcut</a>
        <ol class="shortcut-steps">
          <li>Tap the button and choose <strong>Add Shortcut</strong>.</li>
          <li>Open a shiur on YUTorah and tap <strong>Share</strong>.</li>
          <li>Choose <strong>Shiur Notes</strong>.</li>
          <li>Select <strong>Notes</strong>, <strong>Transcript</strong>, or <strong>Maamar</strong>.</li>
        </ol>
      </section>

      <div class="section-heading"><h2>Recent</h2><button class="text-button" id="viewLibrary">View library</button></div>
      <div class="note-list">${recent.length ? recent.map(noteCard).join("") : `<div class="empty-state"><strong>No shiurim yet</strong><p>Your generated notes and transcripts will appear here.</p></div>`}</div>
    </section>`;

    $("#newShiur").onclick = openAdd;
    $("#viewLibrary").onclick = () => go("library");
    bindCards();
  };

  const style = document.createElement("style");
  style.id = "home-shortcut-v23-styles";
  style.textContent = `
    .home-shortcut-card {
      margin-top: 22px;
      border: 1px solid rgba(102, 126, 234, .48);
      border-radius: 14px;
      padding: 20px;
      background:
        radial-gradient(circle at 100% 0%, rgba(118, 75, 162, .18), transparent 46%),
        linear-gradient(135deg, rgba(66, 133, 244, .12), rgba(102, 126, 234, .06)),
        var(--surface);
      color: var(--ink);
    }

    .home-shortcut-copy h2 {
      margin: 10px 0 7px;
      color: var(--ink);
      font-size: 21px;
      line-height: 1.25;
    }

    .home-shortcut-copy p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }

    .iphone-only-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      background: rgba(66, 133, 244, .15);
      color: var(--primary-color, #4285f4);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }

    .home-shortcut-card .shortcut-install-button {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 50px;
      margin-top: 16px;
      border-radius: 9px;
      background: var(--primary-color, #4285f4);
      color: #fff;
      text-decoration: none;
      font-weight: 750;
    }

    .home-shortcut-card .shortcut-steps {
      margin: 16px 0 0;
      padding-left: 22px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .home-shortcut-card .shortcut-steps li + li { margin-top: 5px; }
    .home-shortcut-card .shortcut-steps strong { color: var(--ink); }

    @media (min-width: 720px) {
      .home-shortcut-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        column-gap: 24px;
        align-items: center;
      }
      .home-shortcut-card .shortcut-install-button { margin-top: 0; }
      .home-shortcut-card .shortcut-steps { grid-column: 1 / -1; }
    }
  `;
  document.head.appendChild(style);

  if (state.screen === "home") renderHome();
})();
