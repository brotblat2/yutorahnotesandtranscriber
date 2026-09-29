(() => {
  "use strict";

  const STORAGE_KEY = "shiur-notes-web-v2";
  const ENABLED_KEY = "shiur-notes-extension-sync-enabled";
  const TOMBSTONES_KEY = "shiur-notes-extension-sync-tombstones";
  const WEB_SOURCE = "shiurnotes-web";
  const EXTENSION_SOURCE = "shiurnotes-extension";
  const REQUEST_TIMEOUT = 2500;
  const pending = new Map();
  let installed = false;
  let syncing = false;
  let queued = false;
  let syncTimer = 0;

  function enabled() {
    return localStorage.getItem(ENABLED_KEY) === "true";
  }

  function request(action, payload = {}) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("The ShiurNotes extension did not respond."));
      }, REQUEST_TIMEOUT);
      pending.set(requestId, { resolve, reject, timer });
      window.postMessage({ source: WEB_SOURCE, requestId, action, payload }, window.location.origin);
    });
  }

  function safeType(value) {
    return ["notes", "transcript", "maamar"].includes(value) ? value : "notes";
  }

  function extensionKey(note) {
    if (/^(?:yutorah|kolhalashon|shiurbank|upload)_[a-z0-9._-]+_(?:notes|transcript|maamar|ocr|enhanced|translated_en|translated_heb)$/i.test(note.extensionKey || "")) return note.extensionKey;
    const url = String(note.sourceUrl || "");
    const type = safeType(note.type);
    const yutorah = url.match(/\/(?:lectures|lecture\.cfm)\/(\d+)/i)?.[1] || url.match(/[?&]shiurid=(\d+)/i)?.[1];
    if (yutorah) return `yutorah_${yutorah}_${type}`;
    const kolHalashon = url.match(/\/playShiur\/(\d+)/i)?.[1];
    if (kolHalashon) return `kolhalashon_${kolHalashon}_${type}`;
    const shiurBank = url.match(/\/shiur\/([\w-]+)/i)?.[1];
    if (shiurBank) return `shiurbank_${shiurBank}_${type}`;
    const id = String(note.id || crypto.randomUUID()).replace(/[^a-z0-9.-]/gi, "-").slice(0, 100);
    return `upload_web-${id}_${type}`;
  }

  function prepareNote(note) {
    const key = extensionKey(note);
    const updatedAt = Number(note.updatedAt) || Date.parse(note.date) || Date.now();
    return { ...note, extensionKey: key, updatedAt };
  }

  function tombstones() {
    try { return JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || "{}"); }
    catch { return {}; }
  }

  function persistLibrary() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: window.state.notes, settings: window.state.settings }));
  }

  function renderStatus() {
    const button = document.querySelector("#extensionSyncButton");
    const detail = document.querySelector("#extensionSyncDetail");
    if (!button || !detail) return;
    button.disabled = syncing;
    button.textContent = syncing ? "Syncing…" : installed ? (enabled() ? "Sync now" : "Connect") : "Not installed";
    detail.textContent = installed
      ? enabled() ? "Connected in this Chrome profile" : "Available in this browser"
      : "Install or reload the Chrome extension";
  }

  async function detect() {
    try {
      await request("PING");
      installed = true;
      renderStatus();
      if (enabled()) await syncNow({ quiet: true });
    } catch {
      installed = false;
      renderStatus();
    }
  }

  async function syncNow({ quiet = false } = {}) {
    if (!installed || syncing || !window.state) {
      if (syncing) queued = true;
      return;
    }
    syncing = true;
    queued = false;
    renderStatus();
    try {
      const localNotes = window.state.notes.map(prepareNote);
      const existingByKey = new Map(localNotes.map(note => [note.extensionKey, note]));
      const result = await request("SYNC_LIBRARY", { notes: localNotes, tombstones: tombstones() });
      const deleted = result.tombstones || {};
      const merged = (result.notes || []).filter(note => {
        const deletedAt = Number(deleted[note.extensionKey]) || 0;
        return deletedAt < (Number(note.updatedAt) || 0);
      }).map(note => {
        const existing = existingByKey.get(note.extensionKey);
        return { ...note, id: existing?.id || note.id || note.extensionKey };
      });
      window.state.notes = merged;
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(deleted));
      persistLibrary();
      window.renderShiurNotesApp?.();
      if (!quiet) window.showToast?.(`Synced ${merged.length} ${merged.length === 1 ? "shiur" : "shiurim"}`);
    } catch (error) {
      installed = false;
      if (!quiet) window.showToast?.(error.message || "Extension sync failed");
    } finally {
      syncing = false;
      renderStatus();
      if (queued) scheduleSync(100);
    }
  }

  async function connectOrSync() {
    if (!installed) {
      await detect();
      if (!installed) {
        window.showToast?.("Reload the extension, then refresh this page");
        return;
      }
    }
    localStorage.setItem(ENABLED_KEY, "true");
    await syncNow();
  }

  function scheduleSync(delay = 500) {
    if (!enabled()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow({ quiet: true }), delay);
  }

  function recordDeletion(note) {
    if (!note) return;
    const deleted = tombstones();
    deleted[extensionKey(note)] = Date.now();
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(deleted));
    scheduleSync(50);
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== EXTENSION_SOURCE) return;
    if (message.action === "LIBRARY_CHANGED") {
      scheduleSync();
      return;
    }
    const requestState = pending.get(message.requestId);
    if (!requestState) return;
    clearTimeout(requestState.timer);
    pending.delete(message.requestId);
    if (message.ok) requestState.resolve(message.data);
    else requestState.reject(new Error(message.error || "Extension sync failed."));
  });

  window.ShiurNotesExtensionSync = { connectOrSync, detect, recordDeletion, renderStatus, scheduleSync, syncNow };
  window.addEventListener("DOMContentLoaded", detect, { once: true });
})();
