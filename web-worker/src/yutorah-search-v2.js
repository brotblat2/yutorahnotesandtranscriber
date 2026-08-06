const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH_LIMIT = 15;
const TIMEOUT_MS = 20_000;

export async function handleYUTorahSearchV2(request, env, ctx, originalWorker) {
  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") || "").trim();
  const sort = normalizeSort(requestUrl.searchParams.get("sort"));

  if (query.length < 2) return json({ ok: false, error: "Enter at least two characters." }, 400);
  if (query.length > 160) return json({ ok: false, error: "Search is too long." }, 400);

  const searchUrls = exactSearchUrls(query, sort);
  let html = "";
  let lastStatus = 0;

  for (const searchUrl of searchUrls) {
    try {
      const response = await fetch(searchUrl, {
        headers: browserHeaders(),
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      lastStatus = response.status;
      if (!response.ok) continue;

      const body = await response.text();
      if (/lecture\.cfm\/\d+|\/lectures\/lecture\.cfm\/\d+/i.test(body)) {
        html = body;
        break;
      }
    } catch {
      // Try the next hostname.
    }
  }

  if (!html) {
    return json({
      ok: false,
      error: lastStatus === 403
        ? "YUTorah blocked the search request."
        : "YUTorah did not return searchable lecture results.",
      code: "YUTORAH_SEARCH_BLOCKED"
    }, 502);
  }

  const candidates = extractLectureCandidates(html).slice(0, SEARCH_LIMIT);
  const resolved = await Promise.all(
    candidates.map(candidate => resolveThroughExistingPipeline(candidate, request, env, ctx, originalWorker))
  );

  return json({
    ok: true,
    query,
    results: resolved.filter(Boolean)
  }, 200);
}

function exactSearchUrls(query, sort) {
  const sortValue = { relevance: "1", newest: "2", oldest: "3" }[sort] || "1";
  return [
    "https://www.yutorah.org/search/",
    "https://yutorah.org/search/",
    "https://v4.yutorah.org/search/",
    "https://cf.yutorah.org/search/"
  ].map(base => {
    const url = new URL(base);
    url.searchParams.set("s", query);
    url.searchParams.set("sort", sortValue);
    return url;
  });
}

function browserHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.yutorah.org/",
    "Upgrade-Insecure-Requests": "1"
  };
}

function normalizeSort(value) {
  return ["newest", "oldest", "relevance"].includes(value) ? value : "relevance";
}

function extractLectureCandidates(html) {
  const decoded = decodeHtml(String(html || "").replace(/\\\//g, "/"));
  const patterns = [
    /href=["']([^"']*\/lectures\/lecture\.cfm\/(\d+)[^"']*)["']/gi,
    /href=["']([^"']*lecture\.cfm\/(\d+)[^"']*)["']/gi,
    /href=["']([^"']*[?&]shiurid=(\d+)[^"']*)["']/gi
  ];
  const seen = new Set();
  const results = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(decoded))) {
      const id = match[2];
      if (seen.has(id)) continue;
      seen.add(id);

      const start = Math.max(0, match.index - 1400);
      const end = Math.min(decoded.length, match.index + 2600);
      results.push({
        id,
        pageUrl: absoluteLectureUrl(match[1], id),
        context: decoded.slice(start, end)
      });
      if (results.length >= SEARCH_LIMIT * 2) return results;
    }
  }

  return results;
}

async function resolveThroughExistingPipeline(candidate, request, env, ctx, originalWorker) {
  try {
    const internalUrl = new URL("/api/resolve", request.url);
    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": new URL(request.url).origin
      },
      body: JSON.stringify({ sourceUrl: candidate.pageUrl })
    });

    const response = await originalWorker.fetch(internalRequest, env, ctx);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.ok || !payload.resolved?.audioUrl) return null;

    const resolved = payload.resolved;
    return {
      id: candidate.id,
      title: resolved.title || nearbyHeading(candidate.context) || "Shiur",
      speaker: resolved.speaker || nearbySpeaker(candidate.context),
      date: extractDate(candidate.context),
      duration: extractDuration(candidate.context),
      categories: extractCategories(candidate.context),
      pageUrl: candidate.pageUrl,
      audioUrl: resolved.audioUrl
    };
  } catch {
    return null;
  }
}

function absoluteLectureUrl(value, id) {
  try {
    const url = new URL(decodeHtml(value), "https://www.yutorah.org");
    return url.href;
  } catch {
    return `https://www.yutorah.org/lectures/lecture.cfm/${id}`;
  }
}

function nearbyHeading(context) {
  const headings = [...String(context || "").matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
  return headings.length ? cleanText(headings[headings.length - 1][1]) : "";
}

function nearbySpeaker(context) {
  const plain = cleanText(context);
  return plain.match(/Speaker\s*:?\s*([^|•\n]{2,100})/i)?.[1]?.trim() || "";
}

function extractDate(text) {
  const plain = cleanText(text);
  return plain.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i)?.[0] || "";
}

function extractDuration(text) {
  const plain = cleanText(text);
  return plain.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/)?.[0] || plain.match(/\b\d{1,3}\s*(?:min|minutes)\b/i)?.[0] || "";
}

function extractCategories(text) {
  const values = [];
  for (const match of String(text || "").matchAll(/(?:category|subject|masechta)[^>]*>\s*([^<]{2,80})</gi)) {
    const value = cleanText(match[1]);
    if (value && !values.includes(value)) values.push(value);
    if (values.length === 3) break;
  }
  return values;
}

function cleanText(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/");
}

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
