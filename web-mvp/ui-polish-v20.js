(() => {
  if (document.getElementById("ui-polish-v20")) return;

  const style = document.createElement("style");
  style.id = "ui-polish-v20";
  style.textContent = `
    #addDialog .sheet-card {
      color: var(--ink);
      max-height: min(90dvh, 780px);
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    #addDialog .sheet-head {
      align-items: center;
      gap: 18px;
      margin-bottom: 18px;
    }

    #addDialog .sheet-head > div {
      min-width: 0;
    }

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

    #addDialog .yutorah-search-choice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      min-height: 96px;
      border: 1px solid rgba(102, 126, 234, .68);
      border-radius: 14px;
      background:
        radial-gradient(circle at 100% 0%, rgba(118, 75, 162, .22), transparent 48%),
        linear-gradient(135deg, rgba(66, 133, 244, .16), rgba(102, 126, 234, .08)),
        var(--surface);
      color: var(--ink);
      padding: 18px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .10);
    }

    #addDialog .yutorah-search-choice:active {
      transform: scale(.995);
    }

    #addDialog .yutorah-search-choice strong {
      color: var(--ink);
      font-size: 18px;
      line-height: 1.25;
    }

    #addDialog .yutorah-search-choice small {
      margin-top: 5px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.42;
    }

    #addDialog .search-choice-arrow {
      color: var(--primary-color, #4285f4);
      font-size: 31px;
      line-height: 1;
      font-weight: 400;
    }

    #addDialog .field-label {
      color: var(--ink);
      line-height: 1.35;
    }

    #addDialog .divider {
      color: var(--muted);
      font-size: 13px;
    }

    #addDialog .divider::before,
    #addDialog .divider::after {
      background: var(--line);
    }

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

      #addDialog .sheet-head {
        margin-bottom: 16px;
      }

      #addDialog .yutorah-search-choice {
        min-height: 92px;
        padding: 16px;
      }

      #addDialog .field-label {
        margin-top: 15px;
        font-size: 13px;
      }
    }
  `;

  document.head.appendChild(style);
})();
