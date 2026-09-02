import { selectPrompt } from "./prompts.js";

const MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];
const USER_AGENT = "Mozilla/5.0 (compatible; ShiurNotes/1.0; +https://github.com/brotblat2/yutorahnotesandtranscriber)";
const METADATA_TIMEOUT_MS = 20_000;
const AUDIO_TIMEOUT_MS = 60_000;
const MAX_METADATA_CHARS = 2_000_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, service: "shiur-notes-web", time: new Date().toISOString() }, 200, request, env);
      }

      if (url.pathname === "/api/resolve" && request.method === "POST") {
        const body = await readJson(request);
        const resolved = await resolveSource(body.sourceUrl);
        return json({ ok: true, resolved }, 200, request, env);
      }

      if (url.pathname === "/api/generate" && request.method === "POST") {
        const apiKey = request.headers.get("X-Gemini-Key")?.trim();
        if (!apiKey) throw new HttpError(401, "A Gemini API key is required.");

        const body = await readJson(request);
        const sourceUrl = normalizeSourceUrl(body.sourceUrl);
        const type = normalizeType(body.type);
        const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt.slice(0, 30_000) : "";

        const resolved = await resolveSource(sourceUrl);
        const audio = await fetchValidatedAudio(resolved.audioUrl);
        let uploadedFile = null;

        try {
          uploadedFile = await uploadToGemini({
            apiKey,
            body: audio.response.body,
            byteLength: audio.byteLength,
            mimeType: audio.mimeType,
            displayName: makeDisplayName(resolved)
          });

          await waitForGeminiFile(apiKey, uploadedFile.name);

          const prompt = selectPrompt({
            type,
            source: resolved.source,
            customPrompt
          });

          const generated = await generateFromGeminiFile({
            apiKey,
            fileUri: uploadedFile.uri,
            mimeType: uploadedFile.mimeType || audio.mimeType,
            prompt
          });

          return json({
            ok: true,
            result: {
              text: generated.text,
              model: generated.model,
              type,
              title: resolved.title || "Shiur",
              speaker: resolved.speaker || "",
              source: sourceLabel(resolved.source),
              sourceUrl,
              audioUrl: resolved.audioUrl,
              audioBytes: audio.byteLength
            }
          }, 200, request, env);
        } finally {
          if (uploadedFile?.name) {
            cleanupGeminiFile(apiKey, uploadedFile.name).catch(() => {});
          }
        }
      }

      throw new HttpError(404, "API route not found.");
    } catch (error) {
      const normalized = normalizeError(error);
      console.error("[ShiurNotes]", normalized.logMessage);
      return json({ ok: false, error: normalized.publicMessage, code: normalized.code }, normalized.status, request, env);
    }
  }
};

class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(value, status, request, env) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env)
    }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = new Set([
    env.ALLOWED_ORIGIN,
    "https://brotblat2.github.io"
  ].filter(Boolean));

  return {
    "Access-Control-Allow-Origin": origin && allowed.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "Content-Type, X-Gemini-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Expected a JSON request body.");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "The request body was not valid JSON.");
  }
}

function normalizeSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Paste a YUTorah or Kol Halashon link.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new HttpError(400, "The shiur link is not a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new HttpError(400, "Only HTTPS shiur links are supported.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!isSupportedHost(host)) {
    throw new HttpError(400, "Only YUTorah, Kol Halashon, and their audio hosts are supported.");
  }

  return parsed.href;
}

function isSupportedHost(host) {
  return host === "yutorah.org" || host.endsWith(".yutorah.org") ||
    host === "kolhalashon.com" || host.endsWith(".kolhalashon.com");
}

function normalizeType(value) {
  return ["notes", "transcript", "maamar"].includes(value) ? value : "notes";
}

function sourceLabel(source) {
  return source === "kolhalashon" ? "Kol Halashon" : source === "yutorah" ? "YUTorah" : "Audio";
}

async function resolveSource(sourceUrl) {
  const parsed = new URL(normalizeSourceUrl(sourceUrl));
  const host = parsed.hostname.toLowerCase();

  if (looksLikeAudioUrl(parsed.href)) {
    return { source: detectSource(host), audioUrl: parsed.href, title: "Shiur", speaker: "" };
  }

  if (host.includes("yutorah.org")) return resolveYUTorah(parsed);
  if (host.includes("kolhalashon.com")) return resolveKolHalashon(parsed);
  throw new HttpError(400, "Unsupported shiur source.");
}

function detectSource(host) {
  if (host.includes("yutorah")) return "yutorah";
  if (host.includes("kolhalashon")) return "kolhalashon";
  return "audio";
}

async function resolveYUTorah(parsed) {
  const shiurId = parsed.searchParams.get("shiurid") ||
    parsed.pathname.match(/\/lecture\.cfm\/(\d+)/i)?.[1] ||
    parsed.pathname.match(/\/lectures\/(?:lecture\.cfm\/)?(\d+)/i)?.[1];

  const pages = [];
  if (shiurId) pages.push(`https://www.yutorah.org/sidebar/LectureData?shiurID=${shiurId}`);
  pages.push(parsed.href);

  let metadata = {};
  for (const page of pages) {
    const response = await fetchMetadata(page);
    metadata = mergeMetadata(metadata, extractMetadata(response.text, page));
    const audioUrl = findAudioUrl(response.text, page);
    if (audioUrl) {
      validateResolvedAudioHost(audioUrl);
      return { source: "yutorah", audioUrl, title: metadata.title || "Shiur", speaker: metadata.speaker || "", shiurId };
    }
  }

  throw new HttpError(422, "YUTorah did not return an audio file for this shiur.", "YUTORAH_AUDIO_NOT_FOUND");
}

async function resolveKolHalashon(parsed) {
  const pathId = parsed.pathname.match(/\/playShiur\/(\d+)/i)?.[1];
  const fileNameId = parsed.searchParams.get("FileName");
  const shiurId = pathId || (/^\d+$/.test(fileNameId || "") ? fileNameId : null);

  const page = await fetchMetadata(parsed.href);
  const metadata = extractMetadata(page.text, parsed.href);
  const embeddedAudio = findAudioUrl(page.text, parsed.href);
  if (embeddedAudio) {
    validateResolvedAudioHost(embeddedAudio);
    return { source: "kolhalashon", audioUrl: embeddedAudio, title: metadata.title || "Shiur", speaker: metadata.speaker || "", shiurId };
  }

  if (shiurId) {
    const candidates = [
      `https://srv.kolhalashon.com/api/files/GetMp3FileToPlay/${shiurId}`,
      `https://www.kolhalashon.com/api/files/GetMp3FileToPlay/${shiurId}`
    ];

    for (const candidate of candidates) {
      const inspected = await inspectMediaEndpoint(candidate);
      if (inspected) {
        validateResolvedAudioHost(inspected);
        return { source: "kolhalashon", audioUrl: inspected, title: metadata.title || "Shiur", speaker: metadata.speaker || "", shiurId };
      }
    }
  }

  throw new HttpError(422, "Kol Halashon did not return an audio file for this shiur.", "KOL_HALASHON_AUDIO_NOT_FOUND");
}

async function fetchMetadata(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new HttpError(502, `The source site returned ${response.status} while loading shiur details.`, "SOURCE_METADATA_FAILED");
  }

  const text = (await response.text()).slice(0, MAX_METADATA_CHARS);
  return { text, finalUrl: response.url || url };
}

async function inspectMediaEndpoint(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "audio/*,application/octet-stream,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  const finalUrl = response.url || url;

  if (isAudioContentType(contentType) || looksLikeAudioUrl(finalUrl) || contentType.includes("octet-stream")) {
    response.body?.cancel();
    return finalUrl;
  }

  if (contentType.includes("json") || contentType.includes("text") || contentType.includes("html")) {
    const text = (await response.text()).slice(0, MAX_METADATA_CHARS);
    return findAudioUrl(text, finalUrl);
  }

  response.body?.cancel();
  return null;
}

function extractMetadata(text, baseUrl) {
  const metadata = { title: "", speaker: "" };
  const jsonData = tryJson(text);
  if (jsonData) {
    metadata.title = firstDeepString(jsonData, ["title", "shiurTitle", "name", "displayName"]);
    metadata.speaker = firstDeepString(jsonData, ["speaker", "teacher", "rabbi", "author", "rebbe"]);
  }

  metadata.title ||= matchMeta(text, "og:title") || matchTag(text, "title");
  metadata.speaker ||= matchMeta(text, "author") || matchNamedContent(text, /speaker|rabbi|teacher/i);

  if (metadata.title) metadata.title = cleanText(metadata.title);
  if (metadata.speaker) metadata.speaker = cleanText(metadata.speaker);
  return metadata;
}

function mergeMetadata(current, next) {
  return { title: current.title || next.title || "", speaker: current.speaker || next.speaker || "" };
}

function findAudioUrl(text, baseUrl) {
  if (!text) return null;
  const normalized = decodeHtmlEntities(text.replace(/\\\//g, "/"));
  const jsonData = tryJson(normalized);

  if (jsonData) {
    const deep = findDeepAudioString(jsonData);
    if (deep) return absoluteUrl(deep, baseUrl);
  }

  const patterns = [
    /["']?(?:downloadURL|downloadUrl|audioUrl|audioURL|mp3Url|mp3URL|fileUrl|fileURL)["']?\s*[:=]\s*["']([^"']+)["']/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /<audio[^>]+src=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
    /href=["']([^"']+\.(?:mp3|m4a|aac|wav|ogg)(?:\?[^"']*)?)["']/i,
    /(https?:\/\/[^"'<>\s]+\.(?:mp3|m4a|aac|wav|ogg)(?:\?[^"'<>\s]*)?)/i,
    /(https?:\/\/[^"'<>\s]+\/api\/files\/GetMp3FileToPlay\/\d+)/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern)?.[1];
    if (match) return absoluteUrl(match, baseUrl);
  }
  return null;
}

function findDeepAudioString(value, depth = 0) {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") {
    if (looksLikeAudioUrl(value) || /GetMp3FileToPlay\/\d+/i.test(value)) return value;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeepAudioString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const preferredKeys = ["downloadURL", "downloadUrl", "audioUrl", "audioURL", "mp3Url", "mp3URL", "fileUrl", "fileURL", "src"];
    for (const key of preferredKeys) {
      if (key in value) {
        const found = findDeepAudioString(value[key], depth + 1);
        if (found) return found;
      }
    }
    for (const item of Object.values(value)) {
      const found = findDeepAudioString(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function firstDeepString(value, keys, depth = 0) {
  if (depth > 7 || value == null || typeof value !== "object") return "";
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = firstDeepString(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function matchMeta(text, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
    text.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1] || "";
}

function matchTag(text, tag) {
  return text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"))?.[1] || "";
}

function matchNamedContent(text, namePattern) {
  const tags = text.match(/<meta[^>]+>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1] || "";
    if (!namePattern.test(name)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (content) return content;
  }
  return "";
}

function cleanText(value) {
  return decodeHtmlEntities(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(decodeHtmlEntities(value), baseUrl).href; } catch { return null; }
}

function looksLikeAudioUrl(value) {
  if (!value) return false;
  return /\.(?:mp3|m4a|aac|wav|ogg)(?:$|[?#])/i.test(value) || /\/api\/files\/GetMp3FileToPlay\/\d+/i.test(value);
}

function validateResolvedAudioHost(audioUrl) {
  let parsed;
  try { parsed = new URL(audioUrl); } catch { throw new HttpError(422, "The source returned an invalid audio URL."); }
  if (!isSupportedHost(parsed.hostname.toLowerCase())) {
    throw new HttpError(422, "The source returned audio from an unsupported host.");
  }
}

async function fetchValidatedAudio(audioUrl, depth = 0) {
  if (depth > 2) throw new HttpError(502, "The source kept redirecting to non-audio content.");

  const response = await fetch(audioUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "audio/*,application/octet-stream;q=0.9,*/*;q=0.5"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new HttpError(502, `The audio server returned ${response.status}.`, "AUDIO_DOWNLOAD_FAILED");
  }

  const contentType = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const finalUrl = response.url || audioUrl;

  if (contentType.includes("text") || contentType.includes("html") || contentType.includes("json")) {
    const text = (await response.text()).slice(0, MAX_METADATA_CHARS);
    const nested = findAudioUrl(text, finalUrl);
    if (nested && nested !== audioUrl) return fetchValidatedAudio(nested, depth + 1);
    throw new HttpError(502, "The source returned a webpage instead of an audio file.", "SOURCE_RETURNED_HTML");
  }

  const byteLength = await determineContentLength(response, finalUrl);
  if (!byteLength || byteLength < 1024) {
    response.body?.cancel();
    throw new HttpError(502, "The source returned an empty or invalid audio file.", "INVALID_AUDIO_SIZE");
  }

  const mimeType = isAudioContentType(contentType) ? contentType : inferMimeType(finalUrl);
  return { response, byteLength, mimeType, finalUrl };
}

async function determineContentLength(response, url) {
  const direct = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(direct) && direct > 0) return direct;

  const range = response.headers.get("Content-Range")?.match(/\/(\d+)$/)?.[1];
  if (range) return Number(range);

  try {
    const head = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT, "Accept": "audio/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
    });
    const length = Number(head.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > 0) return length;
  } catch {}

  response.body?.cancel();
  throw new HttpError(502, "The audio server did not provide the file size required for a reliable upload.", "AUDIO_SIZE_UNKNOWN");
}

function isAudioContentType(contentType) {
  return contentType.startsWith("audio/");
}

function inferMimeType(url) {
  const lower = url.toLowerCase();
  if (lower.includes(".m4a")) return "audio/mp4";
  if (lower.includes(".wav")) return "audio/wav";
  if (lower.includes(".aac")) return "audio/aac";
  if (lower.includes(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function makeDisplayName(resolved) {
  const base = (resolved.title || `${resolved.source}-shiur`)
    .replace(/[^\p{L}\p{N}._ -]+/gu, "")
    .trim()
    .slice(0, 80) || "shiur";
  return `${base}.mp3`;
}

async function uploadToGemini({ apiKey, body, byteLength, mimeType, displayName }) {
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: displayName } })
  });

  if (!start.ok) {
    throw geminiError(start.status, await safeErrorText(start), "Gemini refused to start the audio upload.");
  }

  const uploadUrl = start.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new HttpError(502, "Gemini did not return an upload URL.", "GEMINI_UPLOAD_URL_MISSING");

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": mimeType
    },
    body,
    duplex: "half"
  });

  if (!finish.ok) {
    throw geminiError(finish.status, await safeErrorText(finish), "Gemini could not receive the audio file.");
  }

  const data = await finish.json();
  if (!data?.file?.name || !data?.file?.uri) {
    throw new HttpError(502, "Gemini returned incomplete upload information.", "GEMINI_UPLOAD_INVALID");
  }
  return data.file;
}

async function waitForGeminiFile(apiKey, fileName) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) throw geminiError(response.status, await safeErrorText(response), "Could not check Gemini audio processing.");
    const data = await response.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new HttpError(502, "Gemini could not process the uploaded audio file.", "GEMINI_FILE_FAILED");
    await sleep(2_000);
  }
  throw new HttpError(504, "Gemini took too long to prepare the audio file.", "GEMINI_FILE_TIMEOUT");
}

async function generateFromGeminiFile({ apiKey, fileUri, mimeType, prompt }) {
  let lastError = null;

  for (const model of MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ fileData: { mimeType, fileUri } }, { text: prompt }] }],
        generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 65_000 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!response.ok) {
      const error = geminiError(response.status, await safeErrorText(response), `Gemini model ${model} failed.`);
      lastError = error;
      if ([401, 403, 429].includes(response.status)) throw error;
      continue;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!text) {
      lastError = new HttpError(502, `Gemini model ${model} returned no text.`, "GEMINI_EMPTY_RESPONSE");
      continue;
    }

    if (/^sorry can['’]?t access the audio file[.!]?$/i.test(text)) {
      lastError = new HttpError(502, `Gemini model ${model} could not read the uploaded audio.`, "GEMINI_AUDIO_UNREADABLE");
      continue;
    }

    return { text: cleanGeminiFormatting(text), model };
  }

  throw lastError || new HttpError(502, "Gemini generation failed.", "GEMINI_GENERATION_FAILED");
}

async function cleanupGeminiFile(apiKey, fileName) {
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`, { method: "DELETE" });
}

function geminiError(status, details, fallback) {
  if (status === 401 || status === 403) return new HttpError(401, "Gemini rejected the API key. Check it in Settings.", "GEMINI_AUTH_FAILED");
  if (status === 429) return new HttpError(429, "Gemini rate limit or quota reached. Try again later.", "GEMINI_QUOTA");
  return new HttpError(502, `${fallback}${details ? ` ${details.slice(0, 300)}` : ""}`, "GEMINI_ERROR");
}

async function safeErrorText(response) {
  try { return (await response.text()).replace(/AIza[\w-]+/g, "[redacted]"); } catch { return ""; }
}

function cleanGeminiFormatting(text) {
  return text.replace(/\\text\{([^}]*)\}/g, "$1").replace(/\$\$([\s\S]*?)\$\$/g, "$1").trim();
}

function normalizeError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, code: error.code, publicMessage: error.message, logMessage: `${error.code}: ${error.message}` };
  }
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return { status: 504, code: "UPSTREAM_TIMEOUT", publicMessage: "The source site took too long to respond.", logMessage: String(error) };
  }
  return { status: 500, code: "INTERNAL_ERROR", publicMessage: "The server could not complete this request.", logMessage: error?.stack || String(error) };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
