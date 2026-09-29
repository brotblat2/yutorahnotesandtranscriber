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
    if (code === "YUTORAH_AUDIO_NOT_FOUND") return {kind:"other",source:"YUTorah audio source",title:"No audio file was found",explanation:"YUTorah did not expose an audio file for this shiur. ShiurNotes checked both the lecture page and its LectureData endpoint.",action:"Open the shiur on YUTorah to confirm its audio is available, or import an audio file directly."};
    if (code === "KOL_HALASHON_AUDIO_NOT_FOUND") return {kind:"other",source:"Kol Halashon audio source",title:"No audio stream was found",explanation:"Kol Halashon did not expose an audio stream for this shiur.",action:"Confirm the recording plays on Kol Halashon, or import an audio file directly."};
    if (code === "SOURCE_RETURNED_HTML") return {kind:"other",source:"Audio source",title:"The source returned a webpage instead of audio",explanation:"The shiur may require a login or use an unsupported player.",action:"If you can access the recording, download the MP3 and import it directly."};
    if (code === "AUDIO_SIZE_UNKNOWN") return {kind:"other",source:"Audio source",title:"The audio server did not provide file details",explanation:"ShiurNotes stopped before sending an audio file whose size could not be confirmed.",action:"Try another source link or import the audio file directly."};
    if (code === "GEMINI_CONNECTION_ERROR") return {kind:"connection",source:"Connection to Google",title:"ShiurNotes could not reach Google Gemini",explanation:message,action:"The connection between ShiurNotes and Google failed. Wait a few minutes and retry. No Google response was received, so the cause is not yet known."};
    if (code === "GEMINI_SERVICE_ERROR") return {kind:"google",source:"Google Gemini service",title:"Google is having a service problem",explanation:message,action:"Google returned a server error. Wait a few minutes and try again; you do not need to change your API key for this error."};
    if (code === "GEMINI_ERROR") return {kind:"other",source:"Request rejected by Google",title:"Google could not accept this request",explanation:message,action:"Check Google's explanation and the source recording. The request or file may need to change before retrying."};
    if (["GEMINI_AUDIO_UNREADABLE","GEMINI_FILE_FAILED"].includes(code)) return {kind:"other",source:"Google audio processing",title:"Google could not read this recording",explanation:message,action:"Confirm the audio plays, then retry or import another copy of the recording."};
    if (["GEMINI_EMPTY_RESPONSE","GEMINI_FILE_TIMEOUT","GEMINI_GENERATION_FAILED","GEMINI_UPLOAD_INVALID","GEMINI_UPLOAD_URL_MISSING"].includes(code)) return {kind:"google",source:"Google Gemini response",title:"Google did not finish processing",explanation:message,action:"Wait a few minutes and retry. Google did not return a usable result for this attempt."};
    if (code === "GEMINI_QUOTA" || /429|quota|rate limit/i.test(message)) return {kind:"google",source:"Google Gemini limit",title:"Google has limited this request",explanation:message,action:"The request reached Google successfully. Wait and retry; if it keeps happening, check the quota and billing for the Google project linked to your key."};
    if (code === "GEMINI_AUTH_FAILED" || /401|403|api key|permission/i.test(message)) return {kind:"setup",source:"Google account setup",title:"Google did not accept this API key",explanation:message,action:"Check the saved key and confirm the Gemini API is enabled for its Google project."};
    if (code === "INTERNAL_ERROR" || code === "SERVER_ERROR") return {kind:"other",source:"ShiurNotes server",title:"ShiurNotes could not complete this request",explanation:message,action:"This error came from the ShiurNotes service. Wait a few minutes and try again; your API key may be fine."};
    if (code === "UPSTREAM_TIMEOUT" || code === "SOURCE_TIMEOUT") return {kind:"other",source:"Audio source connection",title:"The audio source took too long to respond",explanation:message,action:"Check the source link and try again in a few minutes."};
    if (/failed to fetch|networkerror|network error/i.test(message)) return {kind:"connection",source:"ShiurNotes connection",title:"The browser could not reach ShiurNotes",explanation:"The request did not receive a response from the ShiurNotes service.",action:"Check your internet connection, reload the page, and try again."};
    return {kind:"other",source:"Processing update",title:"We couldn't finish this request",explanation:message,action:"Try again. If it continues, check the source link and your API key settings."};
  }
})();
