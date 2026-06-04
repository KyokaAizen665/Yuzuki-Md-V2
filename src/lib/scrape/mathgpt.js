import crypto from "crypto";

export async function mathgpt({ question, think = false, image = null, mime = null, ext = "jpg" } = {}) {
  if (!question) throw new Error("Question is required.");

  const ip = [10, crypto.randomInt(256), crypto.randomInt(256), crypto.randomInt(256)].join(".");

  const headers = {
    accept: "application/json",
    "accept-language": "en-US",
    "content-type": "application/json",
    origin: "https://math-gpt.ai",
    referer: "https://math-gpt.ai/",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    "x-forwarded-for": ip,
    "x-real-ip": ip,
  };

  let fileDetails = null;

  if (image && mime?.startsWith("image/")) {
    const filePath = `chat/${crypto.randomBytes(32).toString("hex")}.${ext}`;
    const upRes = await fetch("https://math-gpt.ai/api/trpc/uploads.signedUploadUrl?batch=1", {
      method: "POST",
      headers,
      body: JSON.stringify({ 0: { json: { path: filePath, bucket: "mathgpt" } } }),
    });
    const up = await upRes.json();
    await fetch(up[0].result.data.json, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: image,
    });
    fileDetails = { path: filePath, mime };
  }

  const payload = {
    0: {
      json: {
        messages: [
          ...(fileDetails
            ? [{ role: "user", content: [{ type: "image", source: { type: "file", file: fileDetails } }] }]
            : []),
          { role: "user", content: question },
        ],
        think,
        model: "claude-sonnet-4-5",
        systemVersion: 2,
        stream: false,
      },
    },
  };

  const res = await fetch("https://math-gpt.ai/api/trpc/chat.sendMessage?batch=1", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  const result = json?.[0]?.result?.data?.json;
  const content = result?.choices?.[0]?.message?.content;

  if (!content) throw new Error("MathGPT returned no response.");

  return typeof content === "string"
    ? content
    : content.map((c) => c.text || "").join("");
}
