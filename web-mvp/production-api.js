(() => {
  const legacyBeginGeneration = beginGeneration;
  const legacyInspectSource = inspectSource;
  let backendStatus = null;

  async function hasProductionBackend() {
    if (backendStatus !== null) return backendStatus;
    try {
      const response = await fetch("/api/health", {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      const data = response.ok ? await response.json() : null;
      backendStatus = Boolean(data?.ok && data?.service === "shiur-notes-web");
    } catch {
      backendStatus = false;
    }
    return backendStatus;
  }

  inspectSource = async function productionInspectSource(sourceUrl) {
    if (!(await hasProductionBackend())) return legacyInspectSource(sourceUrl);

    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ sourceUrl })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Could not inspect source (${response.status})`);

    return {
      title: data.resolved.title || "Shiur",
      speaker: data.resolved.speaker || "",
      source: data.resolved.source === "kolhalashon" ? "Kol Halashon" : data.resolved.source === "yutorah" ? "YUTorah" : "Audio"
    };
  };

  beginGeneration = async function productionBeginGeneration() {
    if (state.currentFile || !(await hasProductionBackend())) {
      return legacyBeginGeneration();
    }

    if (!apiKey()) {
      openKeyDialog();
      showToast("Add a Gemini API key first");
      return;
    }

    state.processing = { step: 0, error: "", message: "Sending shiur to the server", percent: 8 };
    go("processing");

    const timers = [
      setTimeout(() => updateProgress(1, "Resolving and validating the audio", 25), 1_500),
      setTimeout(() => updateProgress(2, "Uploading the audio to Gemini", 48), 7_000),
      setTimeout(() => updateProgress(3, `Generating ${labelType(state.draft.output).toLowerCase()}`, 72), 18_000)
    ];

    try {
      const customPrompt = state.draft.promptMode === "custom"
        ? state.draft.output === "notes"
          ? state.settings.customNotesPrompt
          : state.draft.output === "transcript"
            ? state.settings.customTranscriptPrompt
            : state.settings.customMaamarPrompt
        : "";

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Gemini-Key": apiKey()
        },
        body: JSON.stringify({
          sourceUrl: state.draft.url,
          type: state.draft.output,
          customPrompt
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        const error = new Error(data?.error || `The server returned ${response.status}.`);
        error.code = data?.code || "SERVER_ERROR";
        throw error;
      }

      const result = data.result;
      updateProgress(4, "Saving to library", 95);
      const initialTitle = state.draft.title === "Shiur from link" || state.draft.title === "Shiur";
      const note = {
        id: crypto.randomUUID(),
        title: initialTitle ? (result.title || "Shiur") : (state.draft.title || result.title || "Shiur"),
        speaker: state.draft.speaker || result.speaker || "",
        source: result.source || state.draft.source,
        sourceUrl: state.draft.url,
        type: state.draft.output,
        markdown: result.text,
        model: result.model,
        date: new Date().toISOString()
      };

      state.notes.unshift(note);
      state.currentNoteId = note.id;
      save();
      updateProgress(5, "Complete", 100);
      setTimeout(() => go("reader", false), 350);
    } catch (error) {
      console.error(error);
      state.processing.error = productionHumanError(error);
      renderProcessing();
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  function productionHumanError(error) {
    const message = String(error?.message || error);
    const code = String(error?.code || "");
    if (code === "YUTORAH_AUDIO_NOT_FOUND") return "YUTorah did not expose an audio file for this shiur. The server checked both the lecture page and LectureData endpoint.";
    if (code === "KOL_HALASHON_AUDIO_NOT_FOUND") return "Kol Halashon did not expose an audio stream for this shiur.";
    if (code === "SOURCE_RETURNED_HTML") return "The source returned a webpage instead of audio. This shiur may require a login or use an unsupported player.";
    if (code === "AUDIO_SIZE_UNKNOWN") return "The audio server did not provide a reliable file size, so the upload was stopped before sending invalid data to Gemini.";
    if (code === "GEMINI_AUDIO_UNREADABLE") return "Gemini received the file but could not read its audio. The server rejected all model attempts rather than saving an empty result.";
    if (/401|403|api key|permission/i.test(message)) return "Gemini rejected the API key. Check it in Settings and try again.";
    if (/429|quota|rate limit/i.test(message)) return "Gemini rate limit or quota reached. Wait briefly or check the key’s quota.";
    return message;
  }
})();
