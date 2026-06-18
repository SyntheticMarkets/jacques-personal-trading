const { allowMethod, derivRest, readJsonBody, sendJson } = require("./_shared");

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

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
};
