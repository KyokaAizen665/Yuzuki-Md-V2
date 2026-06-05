import axios from "axios";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

// ── Strategy 1: Parse Pinterest's embedded page JSON ────────────────────────
async function fromPinterestPage(query, limit) {
  const { data } = await axios.get(
    `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
    { headers: BROWSER_HEADERS, timeout: 20000 }
  );
  const match = data.match(/<script id="__PWS_INITIAL_STRING__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("__PWS_INITIAL_STRING__ not found");

  const json = JSON.parse(match[1]);
  const results = [];

  function extractPins(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(extractPins); return; }
    if (obj.images) {
      const url = obj.images?.orig?.url || obj.images?.["736x"]?.url || obj.image_medium_url;
      if (url) results.push({ url, title: obj.title || obj.description || "", id: obj.id });
      return;
    }
    Object.values(obj).forEach(extractPins);
  }

  const resourceResponses = json?.props?.pageProps?.resourceResponses || [];
  extractPins(resourceResponses);
  if (!results.length) throw new Error("No pins in page JSON");
  return results.slice(0, limit);
}

// ── Strategy 2: Pinterest internal API with auto-fetched cookies ─────────────
async function fromPinterestAPI(query, limit) {
  const initRes = await axios.get("https://www.pinterest.com/", {
    headers: BROWSER_HEADERS, timeout: 10000,
  });
  const rawCookies = initRes.headers["set-cookie"] || [];
  const cookieHeader = rawCookies.map((c) => c.split(";")[0]).join("; ");
  const csrfRaw = rawCookies.find((c) => c.startsWith("csrftoken="));
  const csrftoken = csrfRaw ? csrfRaw.split("=")[1].split(";")[0] : "";
  if (!csrftoken) throw new Error("No CSRF token");

  const postData = {
    options: { query, scope: "pins", page_size: Math.min(limit * 3, 25), bookmarks: [] },
    context: {},
  };
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
  const body = `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(postData))}`;

  const { data } = await axios.post(
    "https://www.pinterest.com/resource/BaseSearchResource/get/",
    body,
    {
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRFToken": csrftoken,
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
        Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 15000,
    }
  );

  const pins = data?.resource_response?.data?.results || [];
  const results = [];
  for (const pin of pins) {
    const url = pin?.images?.orig?.url || pin?.images?.["736x"]?.url || pin?.image_medium_url;
    if (url) results.push({ url, title: pin?.title || "", id: pin?.id });
    if (results.length >= limit) break;
  }
  if (!results.length) throw new Error("No pins from API");
  return results;
}

// ── Strategy 3: Unsplash public API (free, no key, great fallback) ───────────
async function fromUnsplash(query, limit) {
  const { data } = await axios.get(
    `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}`,
    {
      headers: { ...BROWSER_HEADERS, Accept: "application/json", Referer: "https://unsplash.com/" },
      timeout: 15000,
    }
  );
  const photos = data?.results || [];
  if (!photos.length) throw new Error("No Unsplash results");
  return photos.slice(0, limit).map((p) => ({
    url: p.urls?.regular || p.urls?.small,
    title: p.alt_description || p.description || "",
    id: p.id,
  }));
}

export async function searchPinterest(query, limit = 10) {
  for (const strategy of [fromPinterestPage, fromPinterestAPI, fromUnsplash]) {
    try {
      const results = await strategy(query, limit);
      if (results?.length) return results.slice(0, limit);
    } catch {}
  }
  throw new Error("Pinterest search failed. Try again later.");
}

export { searchPinterest as searchPinterestAPI };
