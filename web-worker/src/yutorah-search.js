const USER_AGENT = "Mozilla/5.0 (compatible; ShiurNotes/1.0; +https://github.com/brotblat2/yutorahnotesandtranscriber)";
const SEARCH_LIMIT = 15;
const TIMEOUT_MS = 20_000;

export async function handleYUTorahSearch(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const sort = normalizeSort(url.searchParams.get("sort"));

  if (query.length < 2) return json({ ok: false, error: "Enter at least two characters." }, 400);
  if (query.length > 160) return json({ ok: false, error: "Search is too long." }, 400);

  const searchUrl = new URL("https://www.yutorah.org/search");
  searchUrl.searchParams.set("s", query);
  if (sort !== "relevance") searchUrl.searchParams.set("sort", sort);

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cf: { cacheTtl: 180, cacheEverything: true }
  });

  if (!response.ok) return json({ ok: false, error: `YUTorah search returned ${response.status}.` }, 502);
  const html = await response.text();
  const candidates = extractLectureCandidates(html).slice(0, SEARCH_LIMIT);

  const results = (await Promise.all(candidates.map(candidate => enrichLecture(candidate)))).filter(Boolean);
  return json({ ok: true, query, results }, 200);
}

function normalizeSort(value) {
  return ["newest", "oldest", "relevance"].includes(value) ? value : "relevance";
}

function extractLectureCandidates(html) {
  const decoded = decodeHtml(html.replace(/\\\//g, "/"));
  const pattern = /href=["']([^"']*(?:lecture\.cfm\/|\/lectures\/lecture\.cfm\/)(\d+)[^"']*)["']/gi;
  const seen = new Set();
  const results = [];
  let match;

  while ((match = pattern.exec(decoded))) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);

    const start = Math.max(0, match.index - 1200);
    const end = Math.min(decoded.length, match.index + 2400);
    const context = decoded.slice(start, end);
    results.push({
      id,
      pageUrl: absoluteYUTorahUrl(match[1], id),
      context
    });
    if (results.length >= SEARCH_LIMIT * 2) break;
  }

  return results;
}

async function enrichLecture(candidate) {
  try {
    const endpoint = `https://www.yutorah.org/sidebar/LectureData?shiurID=${candidate.id}`;
    const response = await fetch(endpoint, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json,text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    const text = response.ok ? await response.text() : "";
    const combined = `${text}\n${candidate.context}`;
    const data = tryJson(text);
    const title = cleanText(
      deepString(data, ["title", "shiurTitle", "name"]) ||
      metaValue(combined, "og:title") ||
      nearbyHeading(candidate.context) ||
      "Shiur"
    );
    const speaker = cleanText(
      deepString(data, ["speaker", "teacher", "rabbi", "rebbe", "author"]) ||
      labeledValue(combined, /speaker|teacher|rabbi/i)
    );
    const audioUrl = findAudioUrl(combined, candidate.pageUrl);
    if (!audioUrl) return null;

    return {
      id: candidate.id,
      title,
      speaker,
      date: extractDate(combined),
      duration: extractDuration(combined),
      categories: extractCategories(combined),
      pageUrl: candidate.pageUrl,
      audioUrl
    };
  } catch {
    return null;
  }
}

function findAudioUrl(text, baseUrl) {
  const normalized = decodeHtml(String(text || "").replace(/\\\//g, "/"));
  const data = tryJson(normalized);
  const deep = deepAudio(data);
  if (deep) return new URL(deep, baseUrl).href;

  const patterns = [
    /["']?(?:downloadURL|downloadUrl|audioUrl|audioURL|mp3Url|mp3URL|fileUrl|fileURL)["']?\s*[:=]\s*["']([^"']+)["']/i,
    /href=["']([^"']+\.(?:mp3|m4a|aac|wav|ogg)(?:\?[^"']*)?)["']/i,
    /(https?:\/\/[^"'<>\s]+\.(?:mp3|m4a|aac|wav|ogg)(?:\?[^"'<>\s]*)?)/i
  ];
  for (const pattern of patterns) {
    const value = normalized.match(pattern)?.[1];
    if (value) return new URL(value, baseUrl).href;
  }
  return "";
}

function deepAudio(value, depth = 0) {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") return /\.(mp3|m4a|aac|wav|ogg)(\?|$)/i.test(value) ? value : "";
  if (Array.isArray(value)) {
    for (const item of value) { const found = deepAudio(item, depth + 1); if (found) return found; }
  } else if (typeof value === "object") {
    for (const key of ["downloadURL", "downloadUrl", "audioUrl", "audioURL", "mp3Url", "mp3URL", "fileUrl", "fileURL", "src"]) {
      if (key in value) { const found = deepAudio(value[key], depth + 1); if (found) return found; }
    }
    for (const item of Object.values(value)) { const found = deepAudio(item, depth + 1); if (found) return found; }
  }
  return "";
}

function deepString(value, keys, depth = 0) {
  if (depth > 7 || !value || typeof value !== "object") return "";
  for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  for (const child of Object.values(value)) {
    const found = child && typeof child === "object" ? deepString(child, keys, depth + 1) : "";
    if (found) return found;
  }
  return "";
}

function nearbyHeading(context) {
  const headings = [...context.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
  return headings.length ? stripTags(headings[headings.length - 1][1]) : "";
}

function metaValue(text, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] || "";
}

function labeledValue(text, label) {
  const plain = stripTags(text);
  return plain.match(new RegExp(`${label.source}\\s*:?\\s*([^|•\\n]{2,100})`, "i"))?.[1]?.trim() || "";
}

function extractDate(text) {
  const plain = stripTags(text);
  return plain.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i)?.[0] || "";
}

function extractDuration(text) {
  const plain = stripTags(text);
  return plain.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/)?.[0] || plain.match(/\b\d{1,3}\s*(?:min|minutes)\b/i)?.[0] || "";
}

function extractCategories(text) {
  const values = [];
  for (const match of text.matchAll(/(?:category|subject|masechta)[^>]*>\s*([^<]{2,80})</gi)) {
    const value = cleanText(match[1]);
    if (value && !values.includes(value)) values.push(value);
    if (values.length === 3) break;
  }
  return values;
}

function absoluteYUTorahUrl(value, id) {
  try { return new URL(value, "https://www.yutorah.org").href; }
  catch { return `https://www.yutorah.org/lectures/lecture.cfm/${id}`; }
}

function tryJson(value) { try { return JSON.parse(value); } catch { return null; } }
function stripTags(value) { return decodeHtml(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function cleanText(value) { return stripTags(value).replace(/\s+[|–-]\s+YUTorah.*$/i, "").trim(); }
function decodeHtml(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/gi, "/"); }
function json(value, status) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
