import crypto from "crypto";

export async function chatex(prompt) {
  if (!prompt) throw new Error("Prompt is required.");

  const sessionId = crypto.randomUUID();
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://chatex.ai",
    Referer: "https://chatex.ai/",
  };

  const res = await fetch("https://chatex.ai/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      session_id: sessionId,
      stream: false,
    }),
  });

  if (!res.ok) {
    // Fallback: try alternate endpoint
    const res2 = await fetch("https://chatex.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });
    if (!res2.ok) throw new Error(`ChatEx API error: ${res2.status}`);
    const j2 = await res2.json();
    return j2?.choices?.[0]?.message?.content || j2?.content || "";
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content || json?.content || json?.reply || "";
}
