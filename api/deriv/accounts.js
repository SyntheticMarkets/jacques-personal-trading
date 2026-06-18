const { allowMethod, derivRest } = require("./_shared");

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ["GET"])) return;
  await derivRest(req, res, "/trading/v1/options/accounts");
};
