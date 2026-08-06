(() => {
  if (document.getElementById("ui-polish-v20")) return;

  const style = document.createElement("style");
  style.id = "ui-polish-v20";
  style.textContent = `
    #addDialog .sheet-card {
      color: var(--ink);
      max-height: min(92dvh, 820px);
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    #addDialog .sheet-head {
      align-items: center;
      gap: 18px;
      margin-bottom: 18px;
    }

    #addDialog .sheet-head > div { min-width: 0; }

    #addDialog .sheet-head h2 {
      color: var(--ink);
      font-size: clamp(25px, 5vw, 29px);
      line-height: 1.12;
    }

    #addDialog .close-button {
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--primary-color, #4285f4);
      padding: 9px 14px;
      line-height: 1;
      font-size: 14px;
      font-weight: 700;
      box-shadow: none;
      outline: none;
    }

    #addDialog .close-button:focus-visible {
      border-color: var(--primary-color, #4285f4);
      box-shadow: 0 0 0 3px rgba(66, 133, 244, .22);
    }

    #addDialog .field-label {
      color: var(--ink);
      line-height: 1.35;
      margin-top: 0;
    }

    #addDialog .divider {
      color: var(--muted);
      font-size: 13px;
    }

    #addDialog .divider::before,
    #addDialog .divider::after { background: var(--line); }

    #addDialog .text-input,
    #addDialog .choice-button {
      border-color: var(--line);
      background: var(--surface);
      color: var(--ink);
    }

    #addDialog .text-input::placeholder {
      color: var(--muted);
      opacity: .9;
    }

    #addDialog .choice-button strong {
      color: var(--ink);
      font-size: 16px;
      line-height: 1.3;
    }

    #addDialog .choice-button small {
      color: var(--muted);
      line-height: 1.4;
    }

    #addDialog .primary-button {
      min-height: 54px;
      border-radius: 10px;
    }

    #addDialog .iphone-shortcut-card {
      margin-top: 22px;
      border: 1px solid rgba(102, 126, 234, .52);
      border-radius: 14px;
      padding: 17px;
      background:
        radial-gradient(circle at 100% 0%, rgba(118, 75, 162, .18), transparent 46%),
        linear-gradient(135deg, rgba(66, 133, 244, .12), rgba(102, 126, 234, .06)),
        var(--surface);
      color: var(--ink);
    }

    #addDialog .iphone-shortcut-heading h3 {
      margin: 9px 0 6px;
      color: var(--ink);
      font-size: 18px;
      line-height: 1.3;
    }

    #addDialog .iphone-shortcut-heading p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    #addDialog .iphone-only-badge {
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

    #addDialog .shortcut-install-button {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      margin-top: 15px;
      border-radius: 9px;
      background: var(--primary-color, #4285f4);
      color: #fff;
      text-decoration: none;
      font-weight: 750;
    }

    #addDialog .shortcut-install-button:active { transform: scale(.995); }

    #addDialog .shortcut-steps {
      margin: 15px 0 0;
      padding-left: 22px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    #addDialog .shortcut-steps li + li { margin-top: 5px; }
    #addDialog .shortcut-steps strong { color: var(--ink); }

    @media (max-width: 560px) {
      #addDialog.sheet {
        width: 100%;
        max-height: calc(100dvh - 18px);
      }

      #addDialog .sheet-card {
        max-height: calc(100dvh - 18px);
        padding: 20px 16px calc(22px + env(safe-area-inset-bottom));
        border-radius: 24px 24px 0 0;
      }

      #addDialog .sheet-head { margin-bottom: 16px; }
      #addDialog .field-label { font-size: 13px; }
      #addDialog .iphone-shortcut-card { padding: 15px; }
    }
  `;

  document.head.appendChild(style);
})();
