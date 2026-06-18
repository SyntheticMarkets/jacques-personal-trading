const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || "33A3COZawHjD8XFQlwkg9";
const DERIV_CLIENT_SECRET = process.env.DERIV_CLIENT_SECRET || "";
const DERIV_REST_BASE_URL = process.env.DERIV_REST_BASE_URL || "https://api.derivws.com";
const DERIV_AUTH_TOKEN_URL = process.env.DERIV_AUTH_TOKEN_URL || "https://auth.deriv.com/oauth2/token";
const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const absolute = path.resolve(ROOT, `.${requested}`);
  return absolute.startsWith(ROOT) ? absolute : null;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

function buildAskAiPrompt(payload) {
  return `
You are the AI controller for a Deriv trading charting platform.
Return only JSON that matches the schema. Do not invent prices or claim certainty.
Use platform actions when helpful, and keep trading guidance educational, cautious, and practical.

Available actions:
- analyse_market: use when the user asks for market insight, direction, scan, setup quality, or current chart opinion.
- draw_trade_plan: draw a practical example plan only if analysis supports it.
- change_timeframe: timeframe_seconds must be one of the supported chart values.
- open_symbol: symbol_code must match a known symbol.
- add_indicator/remove_indicator/set_indicator_timeframe: indicator_value must match a known indicator.
- toggle_crosshair
- start_replay/select_replay_from/live_replay
- clear_ai_drawings
- summarize_context
- no_action: for conversation or unsupported requests.

Context:
${JSON.stringify(payload, null, 2)}
`.trim();
}

async function handleAskAi(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, {
      error: "OPENAI_API_KEY is not set. Add it to your environment before starting server.js.",
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request." });
    return;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      confidence: { type: "number" },
      actions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: [
                "analyse_market",
                "draw_trade_plan",
                "change_timeframe",
                "open_symbol",
                "add_indicator",
                "remove_indicator",
                "set_indicator_timeframe",
                "toggle_crosshair",
                "start_replay",
                "select_replay_from",
                "live_replay",
                "clear_ai_drawings",
                "summarize_context",
                "no_action",
              ],
            },
            symbol_code: { type: ["string", "null"] },
            timeframe_seconds: { type: ["number", "null"] },
            indicator_value: { type: ["string", "null"] },
            scan_group: { type: ["boolean", "null"] },
            draw_plan: { type: ["boolean", "null"] },
          },
          required: ["type", "symbol_code", "timeframe_seconds", "indicator_value", "scan_group", "draw_plan"],
        },
      },
    },
    required: ["reply", "confidence", "actions"],
  };

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: "You convert trading platform voice/text requests into safe structured platform actions.",
          },
          {
            role: "user",
            content: buildAskAiPrompt(payload),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "trading_platform_action_plan",
            strict: true,
            schema,
          },
        },
      }),
    });

    const data = await openAiResponse.json();
    if (!openAiResponse.ok) {
      sendJson(res, openAiResponse.status, { error: data?.error?.message || "OpenAI request failed." });
      return;
    }

    const text = data.output_text
      || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text
      || "";
    sendJson(res, 200, JSON.parse(text));
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Ask AI failed." });
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJsonBody(req) {
  return JSON.parse(await readRequestBody(req));
}

async function handleDerivToken(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request." });
    return;
  }

  const code = String(payload?.code || "");
  const codeVerifier = String(payload?.code_verifier || "");
  const redirectUri = String(payload?.redirect_uri || "");
  if (!code || !codeVerifier || !redirectUri) {
    sendJson(res, 400, { error: "Missing OAuth code, code_verifier, or redirect_uri." });
    return;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: DERIV_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  if (DERIV_CLIENT_SECRET) body.set("client_secret", DERIV_CLIENT_SECRET);

  try {
    const derivResponse = await fetch(DERIV_AUTH_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await derivResponse.json().catch(async () => ({ error: await derivResponse.text() }));
    if (!derivResponse.ok) {
      sendJson(res, derivResponse.status, { error: data?.error_description || data?.error || "Deriv token exchange failed." });
      return;
    }
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Deriv token exchange failed." });
  }
}

async function derivRest(req, res, restPath, options = {}) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing Deriv access token." });
    return;
  }

  try {
    const derivResponse = await fetch(`${DERIV_REST_BASE_URL}${restPath}`, {
      method: options.method || "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "deriv-app-id": DERIV_CLIENT_ID,
        "content-type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await derivResponse.json().catch(async () => ({ error: await derivResponse.text() }));
    if (!derivResponse.ok) {
      sendJson(res, derivResponse.status, { error: data?.error?.message || data?.message || data?.error || "Deriv REST request failed." });
      return;
    }
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Deriv REST request failed." });
  }
}

async function handleDerivAccounts(req, res) {
  await derivRest(req, res, "/trading/v1/options/accounts");
}

async function handleDerivOtp(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request." });
    return;
  }
  const accountId = String(payload?.account_id || payload?.loginid || "");
  if (!accountId) {
    sendJson(res, 400, { error: "Missing Deriv account id." });
    return;
  }
  await derivRest(req, res, `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`, {
    method: "POST",
  });
}

async function handleRealtimeSdp(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, {
      error: "OPENAI_API_KEY is not set. Add it to your environment before starting server.js.",
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request." });
    return;
  }

  const offerSdp = String(payload?.sdp || "");
  const instructions = String(payload?.instructions || "").slice(0, 12000);
  if (!offerSdp) {
    sendJson(res, 400, { error: "Missing WebRTC offer SDP." });
    return;
  }

  try {
    const form = new FormData();
    form.append("sdp", offerSdp);
    form.append("session", JSON.stringify({
      type: "realtime",
      model: OPENAI_REALTIME_MODEL,
      instructions,
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "server_vad",
          },
        },
        output: {
          voice: "marin",
        },
      },
    }));

    const openAiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    const body = await openAiResponse.text();
    if (!openAiResponse.ok) {
      sendJson(res, openAiResponse.status, { error: body || "OpenAI Realtime request failed." });
      return;
    }

    res.writeHead(200, {
      "content-type": "application/sdp",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Realtime voice failed." });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/ask-ai") {
    handleAskAi(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/realtime-sdp") {
    handleRealtimeSdp(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/deriv/token") {
    handleDerivToken(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/deriv/accounts") {
    handleDerivAccounts(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/deriv/ws-auth") {
    handleDerivOtp(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Deriv Trader UI running at http://localhost:${PORT}/index.html`);
});
