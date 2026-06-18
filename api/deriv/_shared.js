const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || "33A3COZawHjD8XFQlwkg9";
const DERIV_CLIENT_SECRET = process.env.DERIV_CLIENT_SECRET || "";
const DERIV_REST_BASE_URL = process.env.DERIV_REST_BASE_URL || "https://api.derivws.com";
const DERIV_AUTH_TOKEN_URL = process.env.DERIV_AUTH_TOKEN_URL || "https://auth.deriv.com/oauth2/token";

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
}

function allowMethod(req, res, methods) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (!methods.includes(req.method)) {
    res.setHeader("allow", methods.join(", "));
    sendJson(res, 405, { error: "Method not allowed." });
    return false;
  }
  return true;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function parseDerivResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
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
    const data = await parseDerivResponse(derivResponse);
    if (!derivResponse.ok) {
      sendJson(res, derivResponse.status, {
        error: data?.error?.message || data?.message || data?.error || "Deriv REST request failed.",
        details: data,
      });
      return;
    }
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Deriv REST request failed." });
  }
}

module.exports = {
  DERIV_CLIENT_ID,
  DERIV_CLIENT_SECRET,
  DERIV_AUTH_TOKEN_URL,
  allowMethod,
  derivRest,
  readJsonBody,
  sendJson,
  parseDerivResponse,
};
