const APP_ID = 101122;
const WS_URLS = [
  `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`,
  `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`,
];
const REDIRECT_URI = "https://jacques-personal-trading.vercel.app";
const OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

let tabs;
let hlButtons;
let barrierField;
let quickRow;
let marketSelect;
let symbolSelect;
let symbolName;
let symbolPrice;
let statusEl;
let accountSummary;
let accountPanel;
let accountListEl;
let logoutBtn;
let toggleTradeBtn;
let tradeBody;
let barrierInput;
let stakeInput;
let btn1m;
let btn2m;
let directionButtons;
let tradeListEl;
let tradeResultsEl;
let toggleProposalsBtn;
let toggleResultsBtn;

let ws;
let wsIndex = 0;
let activeSymbols = [];
let symbolsByMarket = new Map();
let tickStreamId = null;
let currentSymbol = null;
let currentPip = null;
let reconnectTimer = null;
let reqIdCounter = 1;
let baseMinutes = 1;
let minDurationSec = 30;
let currentDirection = "CALL";
let calcInFlight = false;
let lastCalcAt = 0;
let lastSpot = null;
let proposalExpiries = [];
let proposals = [];
let countdownTimer = null;
let lastProposalError = null;
let rateLimitUntil = 0;
let pingTimer = null;
const PING_INTERVAL_MS = 30000;
const RATE_LIMIT_COOLDOWN_MS = 15000;
const MIN_REFRESH_MS = 1500;
let storedAccounts = [];
let activeToken = null;
let activeLoginId = null;
let isAuthorized = false;
let tradeResults = [];
let openContractSubs = new Map();
let sigTrendEl;
let sigDivEl;
let sigSweepEl;
let sigConfEl;
let sigSignalEl;
let sigTimeEl;
let signalBodyEl;
let toggleSignalBtn;

class CandleBuilder {
  constructor(timeframe = 60) {
    this.timeframe = timeframe;
    this.currentCandle = null;
    this.candles = [];
  }

  reset() {
    this.currentCandle = null;
    this.candles = [];
  }

  update(tick) {
    const time = Math.floor(tick.epoch / this.timeframe) * this.timeframe;
    const price = tick.quote;
    let newCandleFormed = false;

    if (!this.currentCandle || this.currentCandle.time !== time) {
      if (this.currentCandle) {
        this.candles.push(this.currentCandle);
        if (this.candles.length > MAX_CANDLES) {
          this.candles.shift();
        }
        newCandleFormed = true;
      }
      this.currentCandle = { time, open: price, high: price, low: price, close: price };
    } else {
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
    }

    return { candles: this.candles, newCandleFormed };
  }
}

const candleBuilder = new CandleBuilder(60);
const MIN_SIGNAL_CANDLES = 20;
const MAX_CANDLES = 200;
let lastSignalState = {
  trend: "--",
  divergence: "--",
  sweep: "--",
  confidence: "--",
  signal: "--",
  time: null,
};

function calculateOBV(candles) {
  const obv = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const volume = Math.abs(curr.close - prev.close) * 1000;
    if (curr.close > prev.close) obv.push(obv[i - 1] + volume);
    else if (curr.close < prev.close) obv.push(obv[i - 1] - volume);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

function detectTrend(candles, length = 10) {
  if (candles.length < length) return "SIDEWAYS";
  const recent = candles.slice(-length);
  const avg = recent.reduce((sum, c) => sum + c.close, 0) / length;
  const last = recent[recent.length - 1].close;
  if (last > avg) return "UP";
  if (last < avg) return "DOWN";
  return "SIDEWAYS";
}

function detectLiquiditySweep(candles) {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (last.high > prev.high && last.close < prev.high) return "SWEEP_HIGH";
  if (last.low < prev.low && last.close > prev.low) return "SWEEP_LOW";
  return null;
}

function detectDivergence(candles, obv, lookback = 5) {
  if (candles.length < lookback + 1) return null;
  const i = candles.length - 1;
  let priceHigh = -Infinity;
  let priceLow = Infinity;
  let obvHigh = -Infinity;
  let obvLow = Infinity;

  for (let j = i - lookback; j < i; j++) {
    priceHigh = Math.max(priceHigh, candles[j].high);
    priceLow = Math.min(priceLow, candles[j].low);
    obvHigh = Math.max(obvHigh, obv[j]);
    obvLow = Math.min(obvLow, obv[j]);
  }

  const curr = candles[i];
  if (curr.high >= priceHigh && obv[i] < obvHigh) return "SELL";
  if (curr.low <= priceLow && obv[i] > obvLow) return "BUY";
  return null;
}

function calculateConfidence({ divergence, trend, sweep }) {
  let score = 0;
  if (divergence) score += 40;
  if (divergence === "BUY" && trend === "UP") score += 20;
  if (divergence === "SELL" && trend === "DOWN") score += 20;
  if (sweep === "SWEEP_LOW" && divergence === "BUY") score += 20;
  if (sweep === "SWEEP_HIGH" && divergence === "SELL") score += 20;
  return score;
}

function updateSignalUI({ trend, divergence, sweep, confidence, signal, time }) {
  if (sigTrendEl) sigTrendEl.textContent = trend || "--";
  if (sigDivEl) sigDivEl.textContent = divergence || "--";
  if (sigSweepEl) sigSweepEl.textContent = sweep || "--";
  if (sigConfEl) sigConfEl.textContent = confidence != null ? `${confidence}%` : "--";
  if (sigSignalEl) sigSignalEl.textContent = signal || "--";
  if (sigTimeEl) sigTimeEl.textContent = time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";
}

function updateSignalFromCandles(candles) {
  const allCandles = candles;
  const buildPct = Math.min(100, Math.floor((allCandles.length / MIN_SIGNAL_CANDLES) * 100));
  const trend = allCandles.length >= 2
    ? detectTrend(allCandles, Math.min(10, allCandles.length))
    : `BUILDING ${buildPct}%`;

  if (allCandles.length >= MIN_SIGNAL_CANDLES) {
    const obv = calculateOBV(allCandles);
    const divergence = detectDivergence(allCandles, obv);
    const sweep = detectLiquiditySweep(allCandles);
    const confidence = calculateConfidence({ divergence, trend, sweep });
    let signal = null;
    if (divergence && confidence >= 60) {
      if (currentDirection === "CALL" && divergence === "BUY") signal = "BUY";
      if (currentDirection === "PUT" && divergence === "SELL") signal = "SELL";
    }
    lastSignalState = {
      trend,
      divergence: divergence || "--",
      sweep: sweep || "--",
      confidence,
      signal: signal || "--",
      time: Date.now(),
    };
  } else {
    lastSignalState = {
      ...lastSignalState,
      trend: `BUILDING ${buildPct}%`,
    };
  }

  updateSignalUI(lastSignalState);
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#e15b64" : "#9aa7b8";
}

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const url = WS_URLS[wsIndex % WS_URLS.length];
  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    setStatus(`Connected (${new URL(url).host})`);
    startPing();
  });

  ws.addEventListener("close", () => {
    setStatus("Disconnected. Retrying...", true);
    stopPing();
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    setStatus("WebSocket error. Retrying...", true);
    stopPing();
    scheduleReconnect(true);
  });

  ws.addEventListener("message", onMessage);
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ ping: 1 }));
  }, PING_INTERVAL_MS);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(forceNext = false) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (forceNext) wsIndex += 1;
    connectWS();
  }, 800);
}

function wsRequest(payload) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureOpen();
    } catch (err) {
      reject(err);
      return;
    }

    const reqId = reqIdCounter++;
    payload.req_id = reqId;

    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.req_id !== reqId) return;
      ws.removeEventListener("message", handler);
      if (data.error) reject(new Error(data.error.message || "API error"));
      else resolve(data);
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(payload));
  });
}

function onMessage(event) {
  const data = JSON.parse(event.data);
  if (data.msg_type === "tick" && data.tick) {
    if (data.tick.symbol !== currentSymbol) return;
    const price = data.tick.quote;
    lastSpot = price;
    if (symbolPrice) symbolPrice.textContent = formatPrice(price, currentPip);
    tickStreamId = data.tick.id || tickStreamId;
    scheduleProposalRefresh();

    const { candles } = candleBuilder.update(data.tick);
    const allCandles = candleBuilder.currentCandle ? [...candles, candleBuilder.currentCandle] : candles;
    updateSignalFromCandles(allCandles);
  }
  if (data.msg_type === "balance" && data.balance) {
    updateAccountSummary(data.balance);
  }
  if (data.msg_type === "proposal_open_contract" && data.proposal_open_contract) {
    handleOpenContractUpdate(data.proposal_open_contract, data.subscription?.id);
  }
}

function formatPrice(value, pip) {
  if (!pip || pip <= 0) return value.toFixed(2);
  const decimals = Math.max(0, Math.round(Math.abs(Math.log10(pip))));
  return Number(value).toFixed(decimals);
}

function formatOffset(value, pip) {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  return `${sign}${formatPrice(abs, pip)}`;
}

function setActiveTab(tabName) {
  tabs.forEach((t) => {
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle("active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const isHL = tabName === "higher_lower";
  hlButtons.style.display = isHL ? "grid" : "none";
  if (quickRow) quickRow.style.display = isHL ? "grid" : "none";
  if (barrierField) barrierField.style.display = isHL ? "block" : "none";
}

function parseOAuthTokens() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const params = searchParams.has("token1") ? searchParams : hashParams;
  const accounts = [];

  if (params.has("token1")) {
    for (let i = 1; i < 50; i++) {
      const token = params.get(`token${i}`);
      const loginid = params.get(`acct${i}`);
      const currency = params.get(`cur${i}`);
      if (!token || !loginid) break;
      accounts.push({ token, loginid, currency: currency || "" });
    }
  } else {
    // Fallback: accept any tokenN/acctN pair in params
    const tokens = Array.from(params.keys())
      .filter((k) => k.startsWith("token"))
      .map((k) => ({ key: k, idx: Number(k.replace("token", "")) }))
      .filter((t) => Number.isFinite(t.idx))
      .sort((a, b) => a.idx - b.idx);
    for (const t of tokens) {
      const token = params.get(t.key);
      const loginid = params.get(`acct${t.idx}`);
      const currency = params.get(`cur${t.idx}`);
      if (token && loginid) {
        accounts.push({ token, loginid, currency: currency || "" });
      }
    }
  }

  if (!accounts.length) return;

  if (accounts.length) {
    localStorage.setItem("deriv_accounts", JSON.stringify(accounts));
    storedAccounts = accounts;
    activeToken = accounts[0].token;
    activeLoginId = accounts[0].loginid;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

function loadStoredAccounts() {
  const raw = localStorage.getItem("deriv_accounts");
  if (!raw) return;
  try {
    storedAccounts = JSON.parse(raw) || [];
  } catch {
    storedAccounts = [];
  }
  if (storedAccounts.length) {
    activeToken = storedAccounts[0].token;
    activeLoginId = storedAccounts[0].loginid;
  }
}

function renderAccountList() {
  if (!accountListEl) return;
  if (!storedAccounts.length) {
    accountListEl.innerHTML = "<div class=\"trade-meta\">Not logged in</div>";
    return;
  }
  accountListEl.innerHTML = storedAccounts.map((acc) => {
    const label = `${acc.loginid} ${acc.currency || ""}`.trim();
    const active = acc.loginid === activeLoginId ? "active" : "";
    return `<button class="account-item ${active}" data-loginid="${acc.loginid}">${label}</button>`;
  }).join("");

  if (accountSummary && activeLoginId) {
    const current = storedAccounts.find((acc) => acc.loginid === activeLoginId);
    if (current) {
      accountSummary.innerHTML = `<span class="acct-label">${current.loginid}</span><span>${current.currency || ""}</span>`;
    }
  }
}

function subscribeOpenContract(contractId) {
  if (!contractId) return;
  ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 }));
}

function handleOpenContractUpdate(contract, subscriptionId) {
  const contractId = contract.contract_id;
  if (!contractId) return;
  if (subscriptionId) {
    openContractSubs.set(contractId, subscriptionId);
  }

  const index = tradeResults.findIndex((t) => t.contractId === contractId);
  if (index === -1) return;

  const buyPrice = contract.buy_price ?? tradeResults[index].price ?? null;
  const sellPrice = contract.sell_price ?? null;
  const profit = contract.profit ?? (sellPrice != null && buyPrice != null ? sellPrice - buyPrice : tradeResults[index].profit ?? null);
  const isSold = contract.is_sold ?? contract.status === "sold";
  const expiry = contract.date_expiry ?? tradeResults[index].expiry ?? null;

  tradeResults[index] = {
    ...tradeResults[index],
    price: buyPrice,
    profit,
    isSold,
    expiry,
    success: isSold ? (profit != null ? profit >= 0 : tradeResults[index].success) : tradeResults[index].success,
  };

  if (isSold && subscriptionId) {
    ws.send(JSON.stringify({ forget: subscriptionId }));
    openContractSubs.delete(contractId);
  }

  renderTradeResults();
}

async function authorizeWithToken(token) {
  if (!token) return;
  await wsRequest({ authorize: token });
  isAuthorized = true;
  await wsRequest({ balance: 1, subscribe: 1 });
}

function updateAccountSummary(balance) {
  if (!accountSummary) return;
  const login = activeLoginId ? `${activeLoginId}` : "Account";
  const amount = balance.balance != null ? balance.balance.toFixed(2) : "--";
  const cur = balance.currency || "";
  accountSummary.innerHTML = `<span class="acct-label">${login}</span><span>${amount} ${cur}</span>`;
}

function isDerivedMarket(symbol) {
  const market = (symbol.market || "").toLowerCase();
  const marketName = (symbol.market_display_name || "").toLowerCase();
  const submarketName = (symbol.submarket_display_name || "").toLowerCase();
  return (
    market === "synthetic_index" ||
    marketName.includes("derived") ||
    marketName.includes("synthetic") ||
    submarketName.includes("derived") ||
    submarketName.includes("synthetic")
  );
}

function isAllowedSymbol(symbol) {
  const name = (symbol.display_name || "").toLowerCase();
  return name.includes("volatility") || name.includes("bull") || name.includes("bear");
}

async function loadActiveSymbols() {
  setStatus("Loading markets...");
  try {
    const res = await wsRequest({ active_symbols: "full", product_type: "basic" });
    activeSymbols = res.active_symbols || [];
  } catch (err) {
    setStatus(`Load failed: ${err.message}`, true);
    return;
  }

  const derivedSymbols = activeSymbols.filter(isDerivedMarket).filter(isAllowedSymbol);

  symbolsByMarket = new Map();
  for (const s of derivedSymbols) {
    const key = s.market || "derived";
    if (!symbolsByMarket.has(key)) {
      symbolsByMarket.set(key, {
        market: key,
        display: s.market_display_name || "Derived",
        symbols: [],
      });
    }
    symbolsByMarket.get(key).symbols.push(s);
  }

  marketSelect.innerHTML = "";
  for (const entry of Array.from(symbolsByMarket.values()).sort((a, b) => a.display.localeCompare(b.display))) {
    const opt = document.createElement("option");
    opt.value = entry.market;
    opt.textContent = entry.display;
    marketSelect.appendChild(opt);
  }

  updateSymbols();
  setStatus("Markets loaded");
}

function updateSymbols() {
  const market = marketSelect.value;
  const entry = symbolsByMarket.get(market);
  symbolSelect.innerHTML = "";
  if (!entry) return;

  const symbols = entry.symbols
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  for (const s of symbols) {
    const opt = document.createElement("option");
    opt.value = s.symbol;
    opt.textContent = s.display_name;
    opt.dataset.pip = s.pip ?? s.pip_size ?? "";
    symbolSelect.appendChild(opt);
  }

  onSymbolChange();
}

function onSymbolChange() {
  const symbol = symbolSelect.value;
  const display = symbolSelect.selectedOptions[0]?.textContent || "--";
  const pip = Number(symbolSelect.selectedOptions[0]?.dataset?.pip || "0");

  symbolName.textContent = display;
  symbolPrice.textContent = "--";
  currentSymbol = symbol;
  currentPip = pip;

  if (tickStreamId && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ forget: tickStreamId }));
    tickStreamId = null;
  }

  if (symbol && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
  }

  candleBuilder.reset();
  updateSignalUI({ trend: "BUILDING 0%", divergence: "--", sweep: "--", confidence: null, signal: "--", time: null });
  loadTickHistory(symbol).catch(() => {});
  loadContractsFor(symbol).catch(() => {});
}

async function loadTickHistory(symbol) {
  if (!symbol) return;
  try {
    const res = await wsRequest({
      ticks_history: symbol,
      end: "latest",
      count: 1200,
      style: "ticks",
    });
    const history = res.history || {};
    const prices = history.prices || [];
    const times = history.times || [];
    const len = Math.min(prices.length, times.length);
    for (let i = 0; i < len; i++) {
      candleBuilder.update({ epoch: times[i], quote: prices[i] });
    }
    const built = candleBuilder.currentCandle
      ? [...candleBuilder.candles, candleBuilder.currentCandle]
      : candleBuilder.candles;
    updateSignalFromCandles(built);
  } catch (err) {
    setStatus(err?.message || "History load failed", true);
  }
}

function parseDurationToSeconds(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  const match = text.match(/^(\d+(?:\.\d+)?)([smhdw]|t)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : unit === "d" ? 86400 : unit === "w" ? 604800 : 1;
  return Math.round(amount * mult);
}

async function loadContractsFor(symbol) {
  if (!symbol) return;
  try {
    const res = await wsRequest({ contracts_for: symbol });
    const list = res.contracts_for?.available || res.contracts_for?.contracts || res.contracts_for?.available_contracts || [];
    let mins = [];
    for (const item of list) {
      if (item.contract_type !== "CALL" && item.contract_type !== "PUT") continue;
      const candidate = item.min_contract_duration ?? item.min_duration ?? item.minimum_duration;
      const sec = parseDurationToSeconds(candidate);
      if (sec) mins.push(sec);
    }
    if (mins.length) {
      minDurationSec = Math.min(...mins);
    }
  } catch {
    // keep fallback
  }

  buildExpiries();
}

function setExpiryMinutes(minutes) {
  baseMinutes = minutes;
  if (btn1m && btn2m) {
    btn1m.classList.toggle("active", minutes === 1);
    btn2m.classList.toggle("active", minutes === 2);
  }
  buildExpiries();
}

function buildExpiries() {
  const now = Math.floor(Date.now() / 1000);
  const step = baseMinutes * 60;
  const minHold = Math.max(minDurationSec, step);
  const firstAligned = Math.ceil((now + minHold) / step) * step;
  proposalExpiries = Array.from({ length: 5 }, (_, i) => firstAligned + step * i);
  renderTradeList();
  scheduleProposalRefresh(true);
}

function rollExpiries() {
  if (!proposalExpiries.length) return false;
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  while (proposalExpiries.length && proposalExpiries[0] - now <= minDurationSec) {
    proposalExpiries.shift();
    const last = proposalExpiries[proposalExpiries.length - 1] || now;
    proposalExpiries.push(last + baseMinutes * 60);
    changed = true;
  }
  return changed;
}

async function getProposal({ symbol, contractType, barrier, stake, durationSec }) {
  const res = await wsRequest({
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: contractType,
    barrier,
    duration: Math.max(1, Math.floor(durationSec)),
    duration_unit: "s",
    symbol,
    currency: "USD",
  });
  return res.proposal;
}

function scheduleProposalRefresh(force = false) {
  if (!currentSymbol || !lastSpot) return;
  if (calcInFlight) return;
  if (Date.now() < rateLimitUntil) return;
  const now = Date.now();
  if (!force && now - lastCalcAt < MIN_REFRESH_MS) return;
  lastCalcAt = now;
  refreshProposals().catch((err) => {
    setStatus(err.message, true);
  });
}

async function refreshProposals() {
  if (calcInFlight) return;
  if (!currentSymbol || !lastSpot) return;

  calcInFlight = true;
  try {
    const spot = lastSpot;
    const results = [];
    let ok = 0;
    lastProposalError = null;
    for (const expiry of proposalExpiries) {
      const stake = Number(stakeInput?.value || "0");
      const nowSec = Math.floor(Date.now() / 1000);
      const durationSec = Math.max(minDurationSec, expiry - nowSec);
      if (durationSec <= 0) {
        results.push({ expiry, barrier: null, payout: null, profitPct: null, offset: null });
        continue;
      }
      const offsetVal = Number(barrierInput?.value || "0");
      if (!stake || !offsetVal) {
        results.push({ expiry, barrier: null, payout: null, profitPct: null, offset: null });
        continue;
      }
      const signedOffset = currentDirection === "CALL" ? offsetVal : -offsetVal;
      const barrier = formatOffset(signedOffset, currentPip);
      try {
        const proposal = await getProposal({
          symbol: currentSymbol,
          contractType: currentDirection,
          barrier,
          stake,
          durationSec,
        });
        const payout = proposal.payout;
        const askPrice = proposal.ask_price ?? proposal.buy_price ?? stake;
        const profitPct = ((payout - stake) / stake) * 100;
        results.push({
          expiry,
          barrier: spot + signedOffset,
          payout,
          profitPct,
          offset: signedOffset,
          proposalId: proposal.id,
          askPrice,
        });
        ok += 1;
      } catch (err) {
        lastProposalError = err?.message || "Proposal error";
        if (lastProposalError.toLowerCase().includes("rate limit")) {
          rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        }
        results.push({ expiry, barrier: null, payout: null, profitPct: null, offset: null });
      }
    }
    proposals = results;
    renderTradeList();
    if (proposalExpiries.length) {
      if (ok === 0 && lastProposalError) {
        setStatus(`Proposals: 0/${proposalExpiries.length} (${lastProposalError})`, true);
      } else {
        setStatus(`Proposals: ${ok}/${proposalExpiries.length}`);
      }
    }
  } finally {
    calcInFlight = false;
  }
}

async function findBarrierForTarget({ spot, stake, targetPct, durationSec }) {
  let offset = spot * 0.001;
  let lastBelow = null;
  let lastAbove = null;
  const minOffset = Math.max(currentPip || 0, 0.0001);

  for (let i = 0; i < 12; i++) {
    const signed = currentDirection === "CALL" ? offset : -offset;
    const barrier = formatOffset(signed, currentPip);
    try {
      const proposal = await getProposal({
        symbol: currentSymbol,
        contractType: currentDirection,
        barrier,
        stake,
        durationSec,
      });
      const payout = proposal.payout;
      const profitPct = ((payout - stake) / stake) * 100;
      if (profitPct >= targetPct) {
        lastAbove = { offset, payout, profitPct };
        if (lastBelow) break;
        offset = Math.max(minOffset, offset / 1.6);
      } else {
        lastBelow = { offset, payout, profitPct };
        if (lastAbove) break;
        offset *= 1.6;
      }
    } catch (err) {
      lastProposalError = err?.message || "Proposal error";
      if (!lastBelow) lastBelow = { offset, payout: 0, profitPct: 0 };
      offset *= 1.6;
    }
  }

  if (!lastAbove || !lastBelow) return null;

  let low = lastBelow.offset;
  let high = lastAbove.offset;
  let best = null;

  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    const signed = currentDirection === "CALL" ? mid : -mid;
    const barrier = formatOffset(signed, currentPip);
    try {
      const proposal = await getProposal({
        symbol: currentSymbol,
        contractType: currentDirection,
        barrier,
        stake,
        durationSec,
      });
      const payout = proposal.payout;
      const profitPct = ((payout - stake) / stake) * 100;
      if (profitPct >= targetPct) {
        best = { payout, profitPct, offset: mid };
        high = mid;
      } else {
        low = mid;
      }
    } catch (err) {
      lastProposalError = err?.message || "Proposal error";
      low = mid;
    }
  }

  return best;
}

function formatCountdown(expiry) {
  const now = Math.floor(Date.now() / 1000);
  let diff = Math.max(0, expiry - now);
  const min = Math.floor(diff / 60);
  const sec = diff % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function renderTradeList() {
  if (!tradeListEl) return;
  if (!proposalExpiries.length) {
    tradeListEl.innerHTML = "<div class=\"trade-meta\">No proposals yet</div>";
    return;
  }

  const stake = Number(stakeInput?.value || "0");
  const directionLabel = currentDirection === "CALL" ? "Higher" : "Lower";
  const dirClass = currentDirection === "CALL" ? "higher" : "lower";
  const errorBanner = lastProposalError ? `<div class="trade-meta">Error: ${lastProposalError}</div>` : "";

  tradeListEl.innerHTML = errorBanner + proposalExpiries.map((expiry, idx) => {
    const item = proposals[idx] || {};
    const countdown = formatCountdown(expiry);
    const barrierText = item.barrier == null ? "--" : formatPrice(item.barrier, currentPip);
    const offsetText = item.offset == null ? "--" : formatOffset(item.offset, currentPip);
    const profit = item.payout == null || !stake ? null : item.payout - stake;
    const profitText = profit == null ? "--" : profit.toFixed(2);
    const pctText = item.profitPct == null ? "--" : item.profitPct.toFixed(1);
    const proposalId = item.proposalId ? `data-proposal=\"${item.proposalId}\"` : "";
    const priceAttr = item.askPrice != null ? `data-price=\"${item.askPrice}\"` : "";
    return `
      <div class="trade-row">
        <button class="trade-btn ${dirClass}" data-expiry="${expiry}" ${proposalId} ${priceAttr}>
          <div class="trade-title"><span class="trade-tag">${directionLabel}</span> • ends in ${countdown}</div>
          <div class="trade-meta">Profit: ${profitText} (${pctText}%)</div>
          <div class="trade-meta">Barrier: ${barrierText} (offset ${offsetText})</div>
        </button>
        <button class="buy-btn" data-expiry="${expiry}" ${proposalId} ${priceAttr}>Buy</button>
      </div>
    `;
  }).join("");
}

function renderTradeResults() {
  if (!tradeResultsEl) return;
  if (!tradeResults.length) {
    tradeResultsEl.innerHTML = "<div class=\"trade-meta\">No trades yet</div>";
    return;
  }
  tradeResultsEl.innerHTML = tradeResults.map((item) => {
    const time = new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const status = item.success ? "Success" : "Failed";
    const profitText = item.profit != null ? item.profit.toFixed(2) : "--";
    const priceText = item.price != null ? item.price.toFixed(2) : "--";
    const timeLeft = item.expiry && !item.isSold ? ` • Time left: ${formatCountdown(item.expiry)}` : "";
    return `
      <div class="trade-btn ${item.direction === "CALL" ? "higher" : "lower"}">
        <div class="trade-title">${status} • ${time}${timeLeft}</div>
        <div class="trade-meta">Contract: ${item.contractId || "--"}</div>
        <div class="trade-meta">Price: ${priceText} • Profit: ${profitText}</div>
      </div>
    `;
  }).join("");
}

function startCountdowns() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const changed = rollExpiries();
    renderTradeList();
    renderTradeResults();
    if (changed) {
      scheduleProposalRefresh(true);
    }
  }, 1000);
}

function ensureOpen() {
  return new Promise((resolve, reject) => {
    connectWS();
    if (ws.readyState === WebSocket.OPEN) return resolve();
    const t = setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

function init() {
  tabs = document.querySelectorAll(".tab");
  hlButtons = document.getElementById("hlButtons");
  barrierField = document.getElementById("barrierField");
  quickRow = document.getElementById("quickRow");
  tradeBody = document.getElementById("tradeBody");
  toggleTradeBtn = document.getElementById("toggleTrade");
  marketSelect = document.getElementById("marketSelect");
  symbolSelect = document.getElementById("symbolSelect");
  symbolName = document.getElementById("symbolName");
  symbolPrice = document.getElementById("symbolPrice");
  statusEl = document.getElementById("status");
  accountSummary = document.getElementById("accountSummary");
  accountPanel = document.getElementById("accountPanel");
  accountListEl = document.getElementById("accountList");
  logoutBtn = document.getElementById("logoutBtn");
  barrierInput = document.getElementById("barrierInput");
  stakeInput = document.getElementById("stakeInput");
  btn1m = document.getElementById("btn1m");
  btn2m = document.getElementById("btn2m");
  tradeListEl = document.getElementById("tradeList");
  tradeResultsEl = document.getElementById("tradeResults");
  toggleProposalsBtn = document.getElementById("toggleProposals");
  toggleResultsBtn = document.getElementById("toggleResults");
  sigTrendEl = document.getElementById("sigTrend");
  sigDivEl = document.getElementById("sigDiv");
  sigSweepEl = document.getElementById("sigSweep");
  sigConfEl = document.getElementById("sigConf");
  sigSignalEl = document.getElementById("sigSignal");
  sigTimeEl = document.getElementById("sigTime");
  signalBodyEl = document.getElementById("signalBody");
  toggleSignalBtn = document.getElementById("toggleSignal");
  directionButtons = hlButtons?.querySelectorAll(".pill") || [];

  if (!marketSelect || !symbolSelect) {
    setStatus("UI error: market/symbol selects missing", true);
    return;
  }

  marketSelect.addEventListener("change", updateSymbols);
  symbolSelect.addEventListener("change", onSymbolChange);
  tradeListEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("buy-btn")) return;

    const proposalId = target.getAttribute("data-proposal");
    const priceStr = target.getAttribute("data-price");
    if (!proposalId) {
      setStatus("Proposal not ready yet", true);
      return;
    }
    if (!activeToken || !isAuthorized) {
      setStatus("Please log in to execute trades.", true);
      window.location.href = OAUTH_URL;
      return;
    }
    const price = priceStr ? Number(priceStr) : Number(stakeInput?.value || "0");
    if (!price) {
      setStatus("Invalid buy price", true);
      return;
    }
    setStatus("Placing trade...");
    wsRequest({ buy: proposalId, price })
      .then((res) => {
        const buy = res.buy;
        const contractId = buy?.contract_id ?? "--";
        const buyPrice = buy?.buy_price ?? price;
        setStatus(`Trade opened. Contract ${contractId}, price ${buyPrice}`);
        tradeResults.unshift({
          time: Date.now(),
          success: true,
          contractId,
          price: buyPrice,
          profit: null,
          direction: currentDirection,
          isSold: false,
          expiry: null,
        });
        tradeResults = tradeResults.slice(0, 20);
        renderTradeResults();
        if (contractId && contractId !== "--") {
          subscribeOpenContract(contractId);
        }
      })
      .catch((err) => {
        setStatus(err.message || "Buy failed", true);
        tradeResults.unshift({
          time: Date.now(),
          success: false,
          contractId: null,
          price: price,
          profit: null,
          direction: currentDirection,
          isSold: true,
          expiry: null,
        });
        tradeResults = tradeResults.slice(0, 20);
        renderTradeResults();
      });
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  if (toggleTradeBtn && tradeBody) {
    toggleTradeBtn.addEventListener("click", () => {
      const isCollapsed = tradeBody.classList.toggle("collapsed");
      toggleTradeBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleTradeBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleProposalsBtn && tradeListEl) {
    toggleProposalsBtn.addEventListener("click", () => {
      const isCollapsed = tradeListEl.classList.toggle("collapsed");
      toggleProposalsBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleProposalsBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleResultsBtn && tradeResultsEl) {
    toggleResultsBtn.addEventListener("click", () => {
      const isCollapsed = tradeResultsEl.classList.toggle("collapsed");
      toggleResultsBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleResultsBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleSignalBtn && signalBodyEl) {
    toggleSignalBtn.addEventListener("click", () => {
      const isCollapsed = signalBodyEl.classList.toggle("collapsed");
      toggleSignalBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleSignalBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (accountSummary && accountPanel) {
    accountSummary.addEventListener("click", () => {
      if (!storedAccounts.length) {
        window.location.href = OAUTH_URL;
        return;
      }
      accountPanel.classList.toggle("hidden");
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (accountPanel.contains(target) || accountSummary.contains(target)) return;
      accountPanel.classList.add("hidden");
    });
  }

  accountListEl?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const loginid = target.getAttribute("data-loginid");
    if (!loginid) return;
    const account = storedAccounts.find((acc) => acc.loginid === loginid);
    if (!account) return;
    activeLoginId = account.loginid;
    activeToken = account.token;
    renderAccountList();
    await authorizeWithToken(activeToken);
  });

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("deriv_accounts");
    storedAccounts = [];
    activeToken = null;
    activeLoginId = null;
    isAuthorized = false;
    if (accountSummary) {
      accountSummary.innerHTML = "<span class=\"acct-label\">Log in</span>";
    }
    renderAccountList();
    accountPanel?.classList.add("hidden");
  });

  directionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      directionButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentDirection = btn.textContent.trim().toLowerCase() === "lower" ? "PUT" : "CALL";
      scheduleProposalRefresh(true);
      renderTradeList();
    });
  });

  btn1m?.addEventListener("click", () => setExpiryMinutes(1));
  btn2m?.addEventListener("click", () => setExpiryMinutes(2));
  barrierInput?.addEventListener("input", () => scheduleProposalRefresh(true));
  stakeInput?.addEventListener("input", () => scheduleProposalRefresh(true));

  setActiveTab("higher_lower");
  connectWS();
  loadActiveSymbols();
  setExpiryMinutes(1);
  startCountdowns();

  parseOAuthTokens();
  loadStoredAccounts();
  renderAccountList();
  if (activeToken) {
    authorizeWithToken(activeToken).catch(() => {});
  }
  renderTradeResults();
}

window.addEventListener("DOMContentLoaded", init);
