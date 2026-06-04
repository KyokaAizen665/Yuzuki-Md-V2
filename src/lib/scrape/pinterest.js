import https from "https";

function getInitialAuth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "id.pinterest.com",
      path: "/",
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
      },
    };
    https.get(options, (res) => {
      const cookies = res.headers["set-cookie"];
      if (cookies) {
        const csrfCookie = cookies.find((c) => c.startsWith("csrftoken="));
        const sessCookie = cookies.find((c) => c.startsWith("_pinterest_sess="));
        if (csrfCookie && sessCookie) {
          const csrftoken = csrfCookie.split(";")[0].split("=")[1];
          const sess = sessCookie.split(";")[0];
          resolve({ csrftoken, cookieHeader: `csrftoken=${csrftoken}; ${sess}` });
          return;
        }
      }
      reject(new Error("Failed to get Pinterest CSRF token."));
    }).on("error", reject);
  });
}

export async function searchPinterestAPI(query, limit = 25) {
  const { csrftoken, cookieHeader } = await getInitialAuth();
  let results = [];
  let bookmark = null;

  while (results.length < limit) {
    const postData = {
      options: {
        query,
        scope: "pins",
        bookmarks: bookmark ? [bookmark] : [],
      },
      context: {},
    };
    const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
    const dataString = `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(postData))}`;

    const responseData = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "id.pinterest.com",
          path: "/resource/BaseSearchResource/get/",
          method: "POST",
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0",
            "X-CSRFToken": csrftoken,
            Cookie: cookieHeader,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Length": Buffer.byteLength(dataString),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try { resolve(JSON.parse(body)); } catch { reject(new Error("Parse error")); }
          });
        }
      );
      req.on("error", reject);
      req.write(dataString);
      req.end();
    });

    const pins = responseData?.resource_response?.data?.results || [];
    for (const pin of pins) {
      const imgUrl =
        pin?.images?.orig?.url ||
        pin?.image_medium_url ||
        pin?.images?.["736x"]?.url;
      if (imgUrl) results.push(imgUrl);
      if (results.length >= limit) break;
    }

    bookmark = responseData?.resource_response?.bookmark;
    if (!bookmark || pins.length === 0) break;
  }

  return results.slice(0, limit);
}
