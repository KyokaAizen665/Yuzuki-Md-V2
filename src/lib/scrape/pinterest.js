import https from "https";

async function getAuth() {
  return new Promise((resolve, reject) => {
    https.get(
      {
        hostname: "www.pinterest.com",
        path: "/",
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        const cookies = res.headers["set-cookie"] || [];
        const csrfCookie = cookies.find((c) => c.startsWith("csrftoken="));
        const sessCookie = cookies.find((c) => c.startsWith("_pinterest_sess="));
        if (csrfCookie && sessCookie) {
          const csrftoken = csrfCookie.split(";")[0].split("=")[1];
          const cookieHeader =
            csrfCookie.split(";")[0] + "; " + sessCookie.split(";")[0];
          resolve({ csrftoken, cookieHeader });
        } else {
          reject(new Error("Could not get Pinterest auth cookies."));
        }
      }
    ).on("error", reject);
  });
}

export async function searchPinterest(query, limit = 10) {
  const { csrftoken, cookieHeader } = await getAuth();
  const results = [];
  let bookmark = null;

  while (results.length < limit) {
    const postData = {
      options: {
        query,
        scope: "pins",
        page_size: 25,
        bookmarks: bookmark ? [bookmark] : [],
      },
      context: {},
    };
    const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
    const body =
      `source_url=${encodeURIComponent(sourceUrl)}` +
      `&data=${encodeURIComponent(JSON.stringify(postData))}`;

    const data = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "www.pinterest.com",
          path: "/resource/BaseSearchResource/get/",
          method: "POST",
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "X-CSRFToken": csrftoken,
            Cookie: cookieHeader,
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw));
            } catch {
              reject(new Error("Pinterest returned invalid JSON."));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const pins = data?.resource_response?.data?.results || [];
    for (const pin of pins) {
      const url =
        pin?.images?.orig?.url ||
        pin?.images?.["736x"]?.url ||
        pin?.image_medium_url;
      if (url) results.push({ url, title: pin?.title || "", id: pin?.id });
      if (results.length >= limit) break;
    }

    bookmark = data?.resource_response?.bookmark;
    if (!bookmark || pins.length === 0) break;
  }

  return results.slice(0, limit);
}

export { searchPinterest as searchPinterestAPI };
