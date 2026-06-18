const {
  DERIV_AUTH_TOKEN_URL,
  DERIV_CLIENT_ID,
  DERIV_CLIENT_SECRET,
  allowMethod,
  parseDerivResponse,
  readJsonBody,
  sendJson,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

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
    const data = await parseDerivResponse(derivResponse);
    if (!derivResponse.ok) {
      sendJson(res, derivResponse.status, {
        error: data?.error_description || data?.error || "Deriv token exchange failed.",
        details: data,
      });
      return;
    }
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Deriv token exchange failed." });
  }
};
