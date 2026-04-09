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
let autoTradeResults = [];
let autoTradeEnabled = false;
let autoTradeLoginId = "";
let lastAutoTradeCandle = null;
let sigTrendEl;
let sigDivEl;
let sigSweepEl;
let sigConfEl;
let sigSignalEl;
let sigTimeEl;
let signalBodyEl;
let toggleSignalBtn;
let sweepTrendEl;
let sweepTypeEl;
let sweepRejectEl;
let sweepConfEl;
let sweepEntryEl;
let sweepLevelEl;
let sweepBodyEl;
let toggleSweepBtn;
let chartBodyEl;
let toggleChartBtn;
let chartTfLabelEl;
let chartTfPickerEl;
let chartTfSelectEl;
let miniChartCanvas;
let zoomInBtn;
let zoomOutBtn;
let autoToggleEl;
let autoAccountSelect;
let autoResultsEl;
let autoBodyEl;
let toggleAutoBtn;
let toggleAutoResultsBtn;

const TIMEFRAME_OPTIONS = [
  { seconds: 10, label: "10s" },
  { seconds: 20, label: "20s" },
  { seconds: 30, label: "30s" },
  { seconds: 45, label: "45s" },
  { seconds: 60, label: "1m" },
  { seconds: 90, label: "1.5m" },
  { seconds: 120, label: "2m" },
  { seconds: 180, label: "3m" },
  { seconds: 240, label: "4m" },
  { seconds: 300, label: "5m" },
  { seconds: 600, label: "10m" },
  { seconds: 900, label: "15m" },
  { seconds: 1200, label: "20m" },
  { seconds: 1800, label: "30m" },
  { seconds: 2700, label: "45m" },
  { seconds: 3600, label: "1h" },
];
const DEFAULT_TIMEFRAME_SEC = 60;

class CandleBuilder {
  constructor(timeframe = DEFAULT_TIMEFRAME_SEC) {
    this.timeframe = timeframe;
    this.currentCandle = null;
    this.candles = [];
  }

  reset() {
    this.currentCandle = null;
    this.candles = [];
  }

  setHistory(candles) {
    const normalized = (candles || [])
      .map((c) => ({
        time: Number(c.time ?? c.epoch ?? 0),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter((c) => c.time && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time);

    const limited = normalized.slice(-MAX_CANDLES);
    this.currentCandle = limited.length ? limited[limited.length - 1] : null;
    this.candles = this.currentCandle ? limited.slice(0, -1) : limited;
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

const candleBuilder = new CandleBuilder(DEFAULT_TIMEFRAME_SEC);
const MIN_SIGNAL_CANDLES = 20;
const MAX_CANDLES = 2000;
const SIGNAL_STRUCTURE_LOOKBACK = 20;
const SIGNAL_EQUAL_LEVEL_LOOKBACK = 12;
const SIGNAL_ENTRY_SECOND = 50;
const MAX_AUTO_TRADES_PER_SESSION = 5;
let chartPoints = 24;
let chartOffset = 0;
let chartDragX = null;
let chartGestureMoved = false;
let chartMouseTapCount = 0;
let chartLastMouseTapAt = 0;
let chartLastTouchTapAt = 0;
let autoTradeSessionCount = 0;
let lastSignalState = {
  trend: "--",
  divergence: "--",
  sweep: "--",
  confidence: "--",
  signal: "--",
  time: null,
  allowEntry: false,
  tradeDirection: null,
};
let lastSweepState = {
  trend: "--",
  sweep: "--",
  rejection: "--",
  confidence: "--",
  entry: "--",
  level: "--",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function averageRange(candles, lookback = SIGNAL_STRUCTURE_LOOKBACK) {
  const sample = candles.slice(-lookback);
  if (!sample.length) return 0;
  return sample.reduce((sum, candle) => sum + Math.abs(candle.high - candle.low), 0) / sample.length;
}

function calculateEMA(values, period) {
  if (!values.length) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = (values[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function getLevelThreshold(candles) {
  const avg = averageRange(candles);
  const pip = currentPip || 0;
  const fallback = candles[candles.length - 1]?.close ? candles[candles.length - 1].close * 0.0001 : 0.0001;
  return Math.max(pip * 2, avg * 0.15, fallback);
}

function detectTrend(candles) {
  if (candles.length < 21) {
    return { trend: "SIDEWAYS", ema9: null, ema21: null, trendStrength: 0 };
  }
  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const avg = averageRange(candles) || Math.abs(closes[closes.length - 1]) || 1;
  const diff = Math.abs((ema9 || 0) - (ema21 || 0));
  const trendStrength = clamp(diff / avg, 0, 1);
  let trend = "SIDEWAYS";
  if (ema9 > ema21) trend = "UP";
  else if (ema9 < ema21) trend = "DOWN";
  return { trend, ema9, ema21, trendStrength };
}

function detectDivergence(candles, obv, lookback = 5) {
  if (candles.length < lookback + 1 || obv.length < candles.length) return null;
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

  const current = candles[i];
  if (current.high >= priceHigh && obv[i] < obvHigh) return "SELL";
  if (current.low <= priceLow && obv[i] > obvLow) return "BUY";
  return null;
}

function collectEqualLevels(candles, side, threshold) {
  const recent = candles.slice(-SIGNAL_EQUAL_LEVEL_LOOKBACK);
  const levels = [];
  for (let i = 1; i < recent.length; i++) {
    const current = side === "high" ? recent[i].high : recent[i].low;
    const previous = side === "high" ? recent[i - 1].high : recent[i - 1].low;
    if (Math.abs(current - previous) <= threshold) {
      levels.push((current + previous) / 2);
    }
  }
  return levels;
}

function analyzeRejection(candle) {
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const body = Math.abs(candle.close - candle.open);
  const safeBody = Math.max(body, currentPip || 0.0001);
  return {
    upperWick,
    lowerWick,
    body,
    safeBody,
    strongSellRejection: upperWick > safeBody * 1.5,
    strongBuyRejection: lowerWick > safeBody * 1.5,
    bullishConfirm: candle.close > candle.open,
    bearishConfirm: candle.close < candle.open,
  };
}

function detectLiquiditySweepState(candles) {
  if (candles.length < MIN_SIGNAL_CANDLES) {
    return {
      sweepType: null,
      sweepLabel: "--",
      rejectionLabel: "--",
      referenceLevel: null,
      penetration: 0,
      wickStrength: 0,
      candleStrength: 0,
      levelStrength: 0,
      rejection: null,
    };
  }

  const current = candles[candles.length - 1];
  const structureCandles = candles.slice(-(SIGNAL_STRUCTURE_LOOKBACK + 1), -1);
  const previousHigh = Math.max(...structureCandles.map((c) => c.high));
  const previousLow = Math.min(...structureCandles.map((c) => c.low));
  const threshold = getLevelThreshold(structureCandles);
  const equalHighs = collectEqualLevels(structureCandles, "high", threshold);
  const equalLows = collectEqualLevels(structureCandles, "low", threshold);
  const highLiquidity = equalHighs.length ? Math.max(previousHigh, ...equalHighs) : previousHigh;
  const lowLiquidity = equalLows.length ? Math.min(previousLow, ...equalLows) : previousLow;
  const rejection = analyzeRejection(current);
  const avgRange = averageRange(structureCandles) || threshold || 1;

  let sweepType = null;
  let referenceLevel = null;
  let penetration = 0;

  if (current.high > highLiquidity && current.close < highLiquidity) {
    sweepType = "SELL";
    referenceLevel = highLiquidity;
    penetration = current.high - highLiquidity;
  } else if (current.low < lowLiquidity && current.close > lowLiquidity) {
    sweepType = "BUY";
    referenceLevel = lowLiquidity;
    penetration = lowLiquidity - current.low;
  }

  const wick = sweepType === "SELL" ? rejection.upperWick : sweepType === "BUY" ? rejection.lowerWick : 0;
  const wickStrength = sweepType ? clamp(wick / (rejection.safeBody * 3), 0, 1) : 0;
  const candleStrength = clamp(rejection.safeBody / avgRange, 0, 1);
  const levelStrength = sweepType ? clamp(penetration / avgRange, 0, 1) : 0;
  let rejectionLabel = "WEAK";
  if (sweepType === "BUY" && rejection.strongBuyRejection && rejection.bullishConfirm) rejectionLabel = "BUY REJECT";
  if (sweepType === "SELL" && rejection.strongSellRejection && rejection.bearishConfirm) rejectionLabel = "SELL REJECT";

  return {
    sweepType,
    sweepLabel: sweepType ? `SWEEP_${sweepType}` : "--",
    rejectionLabel,
    referenceLevel,
    penetration,
    wickStrength,
    candleStrength,
    levelStrength,
    rejection,
  };
}

function calculateConfidence({ trendStrength, wickStrength, candleStrength, levelStrength }) {
  const score =
    (trendStrength * 0.3) +
    (wickStrength * 0.3) +
    (candleStrength * 0.2) +
    (levelStrength * 0.2);
  return Math.round(clamp(score, 0, 1) * 100);
}

function getSignalState(candles) {
  const trendState = detectTrend(candles);
  const obv = calculateOBV(candles);
  const divergence = detectDivergence(candles, obv);
  const sweepState = detectLiquiditySweepState(candles);
  const current = candles[candles.length - 1];
  let confidence = calculateConfidence({
    trendStrength: trendState.trendStrength,
    wickStrength: sweepState.wickStrength,
    candleStrength: sweepState.candleStrength,
    levelStrength: sweepState.levelStrength,
  });
  if (divergence && divergence === sweepState.sweepType) {
    confidence = Math.min(100, confidence + 15);
  }
  const allowEntry = new Date().getSeconds() >= SIGNAL_ENTRY_SECOND;

  let signal = "--";
  let tradeDirection = null;
  const rejection = sweepState.rejection;
  const buyReady =
    trendState.trend === "UP" &&
    sweepState.sweepType === "BUY" &&
    rejection?.strongBuyRejection &&
    rejection?.bullishConfirm;
  const sellReady =
    trendState.trend === "DOWN" &&
    sweepState.sweepType === "SELL" &&
    rejection?.strongSellRejection &&
    rejection?.bearishConfirm;

  if (buyReady) {
    signal = allowEntry ? "ENTER NOW BUY" : "WAIT BUY";
    tradeDirection = "CALL";
  } else if (sellReady) {
    signal = allowEntry ? "ENTER NOW SELL" : "WAIT SELL";
    tradeDirection = "PUT";
  }

  return {
    trend: trendState.trend,
    divergence: divergence || "--",
    sweep: sweepState.sweepType ? `${sweepState.sweepLabel} ${sweepState.rejectionLabel}` : "--",
    confidence,
    signal,
    time: current ? current.time * 1000 : Date.now(),
    allowEntry,
    tradeDirection,
  };
}

function updateSignalUI({ trend, divergence, sweep, confidence, signal, time }) {
  if (sigTrendEl) sigTrendEl.textContent = trend || "--";
  if (sigDivEl) sigDivEl.textContent = divergence || "--";
  if (sigSweepEl) sigSweepEl.textContent = sweep || "--";
  if (sigConfEl) sigConfEl.textContent = Number.isFinite(confidence) ? `${confidence}%` : "--";
  if (sigSignalEl) sigSignalEl.textContent = signal || "--";
  if (sigTimeEl) sigTimeEl.textContent = time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";
}

function updateLiquiditySweepUI({ trend, sweep, rejection, confidence, entry, level }) {
  if (sweepTrendEl) sweepTrendEl.textContent = trend || "--";
  if (sweepTypeEl) sweepTypeEl.textContent = sweep || "--";
  if (sweepRejectEl) sweepRejectEl.textContent = rejection || "--";
  if (sweepConfEl) sweepConfEl.textContent = Number.isFinite(confidence) ? `${confidence}%` : confidence || "--";
  if (sweepEntryEl) sweepEntryEl.textContent = entry || "--";
  if (sweepLevelEl) sweepLevelEl.textContent = level || "--";
}

function getLiquidityPanelState(candles) {
  if (candles.length < MIN_SIGNAL_CANDLES) {
    return {
      trend: `BUILDING ${Math.min(100, Math.floor((candles.length / MIN_SIGNAL_CANDLES) * 100))}%`,
      sweep: "--",
      rejection: "--",
      confidence: "--",
      entry: "--",
      level: "--",
    };
  }

  const trendState = detectTrend(candles);
  const sweepState = detectLiquiditySweepState(candles);
  const confidence = calculateConfidence({
    trendStrength: trendState.trendStrength,
    wickStrength: sweepState.wickStrength,
    candleStrength: sweepState.candleStrength,
    levelStrength: sweepState.levelStrength,
  });
  const level = sweepState.referenceLevel != null ? formatPrice(sweepState.referenceLevel, currentPip) : "--";
  let entry = "WAIT";
  if (sweepState.sweepType === "BUY" && sweepState.rejection?.strongBuyRejection && sweepState.rejection?.bullishConfirm) {
    entry = new Date().getSeconds() >= SIGNAL_ENTRY_SECOND ? "ENTER NOW BUY" : "WAIT BUY";
  } else if (sweepState.sweepType === "SELL" && sweepState.rejection?.strongSellRejection && sweepState.rejection?.bearishConfirm) {
    entry = new Date().getSeconds() >= SIGNAL_ENTRY_SECOND ? "ENTER NOW SELL" : "WAIT SELL";
  }

  return {
    trend: trendState.trend,
    sweep: sweepState.sweepLabel,
    rejection: sweepState.rejectionLabel,
    confidence,
    entry,
    level,
  };
}

function updateSignalFromCandles(candles) {
  const allCandles = candles;
  const buildPct = Math.min(100, Math.floor((allCandles.length / MIN_SIGNAL_CANDLES) * 100));

  if (allCandles.length >= MIN_SIGNAL_CANDLES) {
    lastSignalState = getSignalState(allCandles);
  } else {
    lastSignalState = {
      ...lastSignalState,
      trend: `BUILDING ${buildPct}%`,
      divergence: "--",
      sweep: "--",
      confidence: "--",
      signal: "--",
      allowEntry: false,
      tradeDirection: null,
    };
  }

  updateSignalUI(lastSignalState);
  lastSweepState = getLiquidityPanelState(allCandles);
  updateLiquiditySweepUI(lastSweepState);
  renderMiniChart(candles);

  if (autoTradeEnabled && lastSignalState.signal !== "--" && candles.length >= MIN_SIGNAL_CANDLES) {
    const candleTime = candleBuilder.currentCandle?.time || candles[candles.length - 1]?.time;
    if (candleTime && candleTime !== lastAutoTradeCandle) {
      tryAutoTrade();
      lastAutoTradeCandle = candleTime;
    }
  }
}

function setDirection(direction, { refresh = true } = {}) {
  currentDirection = direction === "PUT" ? "PUT" : "CALL";
  directionButtons.forEach((btn) => {
    const isLower = btn.textContent.trim().toLowerCase() === "lower";
    btn.classList.toggle("active", currentDirection === "PUT" ? isLower : !isLower);
  });
  renderTradeList();
  if (refresh) scheduleProposalRefresh(true);
}

async function tryAutoTrade() {
  if (!autoTradeEnabled) return;
  if (autoTradeSessionCount >= MAX_AUTO_TRADES_PER_SESSION) {
    setStatus(`Auto trade session limit reached (${MAX_AUTO_TRADES_PER_SESSION})`, true);
    return;
  }
  if (!autoTradeLoginId) {
    setStatus("Select an account for auto trade", true);
    return;
  }
  const signal = lastSignalState.signal;
  const confidence = Number(lastSignalState.confidence || 0);
  const direction = lastSignalState.tradeDirection;

  if (!lastSignalState.allowEntry || !signal.startsWith("ENTER NOW") || !direction || confidence < 60) return;
  if (calcInFlight) return;

  if (currentDirection !== direction) {
    setDirection(direction, { refresh: false });
    await refreshProposals();
  }

  const proposal = proposals[0];
  if (!proposal || !proposal.proposalId) {
    setStatus("Auto trade: proposal not ready", true);
    return;
  }

  const account = storedAccounts.find((acc) => acc.loginid === autoTradeLoginId);
  if (!account) {
    setStatus("Auto trade: account not found", true);
    return;
  }

  const price = proposal.askPrice ?? Number(stakeInput?.value || "0");
  setStatus("Auto trade: placing...");
  authorizeWithToken(account.token)
    .then(() => wsRequest({ buy: proposal.proposalId, price }))
    .then((res) => {
      const buy = res.buy;
      const contractId = buy?.contract_id ?? "--";
      const buyPrice = buy?.buy_price ?? price;
      autoTradeResults.unshift({
        time: Date.now(),
        success: true,
        contractId,
        price: buyPrice,
        profit: null,
        direction,
        isSold: false,
        expiry: null,
      });
      autoTradeResults = autoTradeResults.slice(0, 20);
      renderAutoTradeResults();
      if (contractId && contractId !== "--") {
        subscribeOpenContract(contractId);
      }
      autoTradeSessionCount += 1;
      setStatus(`Auto trade opened. Contract ${contractId}`);
    })
    .catch((err) => {
      autoTradeResults.unshift({
        time: Date.now(),
        success: false,
        contractId: null,
        price: price,
        profit: null,
        direction,
        isSold: true,
        expiry: null,
      });
      autoTradeResults = autoTradeResults.slice(0, 20);
      renderAutoTradeResults();
      setStatus(err?.message || "Auto trade failed", true);
    });
}

function renderMiniChart(candles) {
  if (!miniChartCanvas) return;
  const ctx = miniChartCanvas.getContext("2d");
  if (!ctx) return;
  const width = miniChartCanvas.clientWidth;
  const height = miniChartCanvas.clientHeight;
  if (width > 0 && height > 0 && (miniChartCanvas.width !== width || miniChartCanvas.height !== height)) {
    miniChartCanvas.width = width;
    miniChartCanvas.height = height;
  }
  ctx.clearRect(0, 0, miniChartCanvas.width, miniChartCanvas.height);
  if (!candles.length) return;

  const maxOffset = Math.max(0, candles.length - chartPoints);
  chartOffset = Math.max(0, Math.min(chartOffset, maxOffset));
  const end = candles.length - chartOffset;
  const start = Math.max(0, end - chartPoints);
  const points = candles.slice(start, end);
  if (!points.length) return;
  const lows = points.map((c) => c.low);
  const highs = points.map((c) => c.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const leftPad = 6;
  const rightPad = 72;
  const topPad = 6;
  const bottomPad = 6;

  if (width === 0 || height === 0) return;
  ctx.strokeStyle = "#1f2735";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftPad, height - bottomPad - 0.5);
  ctx.lineTo(width - rightPad, height - bottomPad - 0.5);
  ctx.stroke();

  if (max === min) return;
  // Candlesticks
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;
  const candleGap = 2;
  const candleW = Math.max(2, Math.floor(plotW / points.length) - candleGap);
  points.forEach((c, i) => {
    const x = leftPad + i * (plotW / points.length) + candleGap / 2;
    const openY = height - bottomPad - ((c.open - min) / (max - min)) * plotH;
    const closeY = height - bottomPad - ((c.close - min) / (max - min)) * plotH;
    const highY = height - bottomPad - ((c.high - min) / (max - min)) * plotH;
    const lowY = height - bottomPad - ((c.low - min) / (max - min)) * plotH;
    const up = c.close >= c.open;
    const barrierOffset = Number(barrierInput?.value || "0");
    const bodySize = Math.abs(c.close - c.open);
    const isLarge = barrierOffset > 0 && bodySize >= barrierOffset;
    ctx.strokeStyle = "#3a465a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, highY);
    ctx.lineTo(x + candleW / 2, lowY);
    ctx.stroke();

    if (isLarge) {
      ctx.fillStyle = up ? "#2d8cff" : "#f2f2e9";
    } else {
      ctx.fillStyle = up ? "#0db787" : "#e15b64";
    }
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(closeY - openY));
    ctx.fillRect(x, bodyY, candleW, bodyH);
  });

  // Current price dot and right-side labels
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const lastY = height - bottomPad - ((last.close - min) / (max - min)) * (height - topPad - bottomPad);
    const lastX = width - rightPad;

    let dotColor = "#0db787";
    if (last.close > prev.high) dotColor = "#2d8cff";
    else if (last.close < prev.low) dotColor = "#e15b64";

    ctx.strokeStyle = dotColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftPad, lastY);
    ctx.lineTo(width - rightPad, lastY);
    ctx.stroke();

    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    const highY = height - bottomPad - ((prev.high - min) / (max - min)) * (height - topPad - bottomPad);
    const lowY = height - bottomPad - ((prev.low - min) / (max - min)) * (height - topPad - bottomPad);
    const labelX = width - rightPad + 8;
    ctx.fillStyle = "#9aa7b8";
    ctx.font = "10px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const diff =
      last.close > prev.high ? last.close - prev.high :
      last.close < prev.low ? prev.low - last.close : 0;
    const priceLabel = `${formatPrice(last.close, currentPip)}`;
    const diffLabel = diff > 0 ? `Δ ${formatPrice(diff, currentPip)}` : "Δ 0";

    ctx.fillStyle = dotColor;
    const priceY = lastY - 10;
    const diffY = lastY + 10;
    if (Math.abs(priceY - highY) < 10 || Math.abs(priceY - lowY) < 10) {
      ctx.fillText(priceLabel, labelX, lastY - 20);
    } else {
      ctx.fillText(priceLabel, labelX, priceY);
    }
    if (Math.abs(diffY - highY) < 10 || Math.abs(diffY - lowY) < 10) {
      ctx.fillText(diffLabel, labelX, lastY + 20);
    } else {
      ctx.fillText(diffLabel, labelX, diffY);
    }
  }

  const current = points[points.length - 1];
  const candleSize = current ? Math.abs(current.close - current.open) : 0;
  const sizeLabel = `Body ${formatPrice(candleSize, currentPip)}`;
  ctx.fillStyle = "#9aa7b8";
  ctx.font = "10px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(sizeLabel, width - 8, height - 8);
}

function getBuiltCandles() {
  return candleBuilder.currentCandle
    ? [...candleBuilder.candles, candleBuilder.currentCandle]
    : candleBuilder.candles;
}

function panChartByPixels(deltaX) {
  const built = getBuiltCandles();
  if (!miniChartCanvas || built.length <= chartPoints) {
    renderMiniChart(built);
    return;
  }
  const plotWidth = Math.max(1, miniChartCanvas.clientWidth - 78);
  const pixelsPerCandle = plotWidth / Math.max(1, Math.min(chartPoints, built.length));
  const candleShift = Math.round(deltaX / Math.max(1, pixelsPerCandle));
  if (!candleShift) return;
  const maxOffset = Math.max(0, built.length - chartPoints);
  chartOffset = Math.max(0, Math.min(chartOffset + candleShift, maxOffset));
  renderMiniChart(built);
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#e15b64" : "#9aa7b8";
}

function getTimeframeLabel(seconds) {
  return TIMEFRAME_OPTIONS.find((option) => option.seconds === seconds)?.label || `${seconds}s`;
}

function updateTimeframeUI() {
  const label = getTimeframeLabel(candleBuilder.timeframe);
  if (chartTfLabelEl) chartTfLabelEl.textContent = label;
  if (chartTfSelectEl) chartTfSelectEl.value = String(candleBuilder.timeframe);
}

function hideTimeframePicker() {
  chartTfPickerEl?.classList.add("hidden");
}

function showTimeframePicker() {
  if (!chartTfPickerEl || !chartTfSelectEl) return;
  chartTfPickerEl.classList.remove("hidden");
  chartTfSelectEl.value = String(candleBuilder.timeframe);
  chartTfSelectEl.focus();
}

function populateTimeframeOptions() {
  if (!chartTfSelectEl) return;
  chartTfSelectEl.innerHTML = TIMEFRAME_OPTIONS
    .map((option) => `<option value="${option.seconds}">${option.label}</option>`)
    .join("");
  updateTimeframeUI();
}

async function setChartTimeframe(seconds) {
  const next = Number(seconds);
  if (!next || next === candleBuilder.timeframe) {
    updateTimeframeUI();
    hideTimeframePicker();
    return;
  }

  candleBuilder.timeframe = next;
  chartOffset = 0;
  chartDragX = null;
  chartGestureMoved = false;
  lastAutoTradeCandle = null;
  candleBuilder.reset();
  updateTimeframeUI();
  hideTimeframePicker();
  updateSignalUI({ trend: "BUILDING 0%", divergence: "--", sweep: "--", confidence: null, signal: "--", time: null });
  renderMiniChart([]);

  if (currentSymbol) {
    await loadTickHistory(currentSymbol);
  }
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
  if (hlButtons) hlButtons.style.display = isHL ? "grid" : "none";
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

  if (autoAccountSelect) {
    autoAccountSelect.innerHTML = `<option value="">Select account</option>` + storedAccounts
      .map((acc) => `<option value="${acc.loginid}">${acc.loginid} ${acc.currency || ""}</option>`)
      .join("");
    if (autoTradeLoginId) {
      autoAccountSelect.value = autoTradeLoginId;
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
  const autoIndex = autoTradeResults.findIndex((t) => t.contractId === contractId);
  if (index === -1 && autoIndex === -1) return;

  const buyPrice = contract.buy_price ?? tradeResults[index].price ?? null;
  const sellPrice = contract.sell_price ?? null;
  const profit = contract.profit ?? (sellPrice != null && buyPrice != null ? sellPrice - buyPrice : tradeResults[index].profit ?? null);
  const isSold = contract.is_sold ?? contract.status === "sold";
  const expiry = contract.date_expiry ?? tradeResults[index].expiry ?? null;

  if (index !== -1) {
    tradeResults[index] = {
      ...tradeResults[index],
      price: buyPrice,
      profit,
      isSold,
      expiry,
      success: isSold ? (profit != null ? profit >= 0 : tradeResults[index].success) : tradeResults[index].success,
    };
  }
  if (autoIndex !== -1) {
    autoTradeResults[autoIndex] = {
      ...autoTradeResults[autoIndex],
      price: buyPrice,
      profit,
      isSold,
      expiry,
      success: isSold ? (profit != null ? profit >= 0 : autoTradeResults[autoIndex].success) : autoTradeResults[autoIndex].success,
    };
  }

  if (isSold && subscriptionId) {
    ws.send(JSON.stringify({ forget: subscriptionId }));
    openContractSubs.delete(contractId);
  }

  renderTradeResults();
  renderAutoTradeResults();
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
  chartOffset = 0;
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
      count: MAX_CANDLES,
      style: "candles",
      granularity: candleBuilder.timeframe,
    });

    const candleHistory = Array.isArray(res.candles)
      ? res.candles
      : Array.isArray(res.history?.candles)
        ? res.history.candles
        : [];

    if (candleHistory.length) {
      candleBuilder.setHistory(candleHistory);
    } else {
      const history = res.history || {};
      const prices = history.prices || [];
      const times = history.times || [];
      const len = Math.min(prices.length, times.length);
      for (let i = 0; i < len; i++) {
        candleBuilder.update({ epoch: times[i], quote: prices[i] });
      }
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
  proposalExpiries = Array.from({ length: 3 }, (_, i) => firstAligned + step * i);
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

function renderAutoTradeResults() {
  if (!autoResultsEl) return;
  if (!autoTradeResults.length) {
    autoResultsEl.innerHTML = "<div class=\"trade-meta\">No auto trades yet</div>";
    return;
  }
  autoResultsEl.innerHTML = autoTradeResults.map((item) => {
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
  sweepTrendEl = document.getElementById("sweepTrend");
  sweepTypeEl = document.getElementById("sweepType");
  sweepRejectEl = document.getElementById("sweepReject");
  sweepConfEl = document.getElementById("sweepConf");
  sweepEntryEl = document.getElementById("sweepEntry");
  sweepLevelEl = document.getElementById("sweepLevel");
  sweepBodyEl = document.getElementById("sweepBody");
  toggleSweepBtn = document.getElementById("toggleSweep");
  chartBodyEl = document.getElementById("chartBody");
  toggleChartBtn = document.getElementById("toggleChart");
  chartTfLabelEl = document.getElementById("chartTfLabel");
  chartTfPickerEl = document.getElementById("chartTfPicker");
  chartTfSelectEl = document.getElementById("chartTfSelect");
  miniChartCanvas = document.getElementById("miniChart");
  zoomInBtn = document.getElementById("zoomIn");
  zoomOutBtn = document.getElementById("zoomOut");
  autoToggleEl = document.getElementById("autoToggle");
  autoAccountSelect = document.getElementById("autoAccountSelect");
  autoResultsEl = document.getElementById("autoResults");
  autoBodyEl = document.getElementById("autoBody");
  toggleAutoBtn = document.getElementById("toggleAuto");
  toggleAutoResultsBtn = document.getElementById("toggleAutoResults");
  directionButtons = hlButtons?.querySelectorAll(".pill") || [];

  if (!marketSelect || !symbolSelect) {
    setStatus("UI error: market/symbol selects missing", true);
    return;
  }

  marketSelect.addEventListener("change", updateSymbols);
  symbolSelect.addEventListener("change", onSymbolChange);
  populateTimeframeOptions();
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

  if (toggleSweepBtn && sweepBodyEl) {
    toggleSweepBtn.addEventListener("click", () => {
      const isCollapsed = sweepBodyEl.classList.toggle("collapsed");
      toggleSweepBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleSweepBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleAutoBtn && autoBodyEl) {
    toggleAutoBtn.addEventListener("click", () => {
      const isCollapsed = autoBodyEl.classList.toggle("collapsed");
      toggleAutoBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleAutoBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleAutoResultsBtn && autoResultsEl) {
    toggleAutoResultsBtn.addEventListener("click", () => {
      const isCollapsed = autoResultsEl.classList.toggle("collapsed");
      toggleAutoResultsBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleAutoResultsBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleChartBtn && chartBodyEl) {
    toggleChartBtn.addEventListener("click", () => {
      const isCollapsed = chartBodyEl.classList.toggle("collapsed");
      toggleChartBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleChartBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  window.addEventListener("resize", () => {
    renderMiniChart(getBuiltCandles());
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (chartTfPickerEl?.contains(target)) return;
    if (chartBodyEl?.contains(target)) return;
    hideTimeframePicker();
  });

  miniChartCanvas?.addEventListener("wheel", (event) => {
    event.preventDefault();
    const built = getBuiltCandles();
    if (event.shiftKey) {
      const step = Math.max(1, Math.floor(chartPoints / 6));
      const direction = Math.sign(event.deltaY || event.deltaX);
      const maxOffset = Math.max(0, built.length - chartPoints);
      chartOffset = Math.max(0, Math.min(chartOffset + (direction * step), maxOffset));
    } else {
      const delta = Math.sign(event.deltaY);
      if (delta > 0) chartPoints = Math.min(MAX_CANDLES, chartPoints + 10);
      else chartPoints = Math.max(20, chartPoints - 10);
      const maxOffset = Math.max(0, built.length - chartPoints);
      chartOffset = Math.min(chartOffset, maxOffset);
    }
    renderMiniChart(built);
  }, { passive: false });

  miniChartCanvas?.addEventListener("pointerdown", (event) => {
    chartDragX = event.clientX;
    chartGestureMoved = false;
    miniChartCanvas.setPointerCapture?.(event.pointerId);
  });

  miniChartCanvas?.addEventListener("pointermove", (event) => {
    if (chartDragX == null) return;
    const deltaX = chartDragX - event.clientX;
    if (Math.abs(deltaX) < 4) return;
    chartDragX = event.clientX;
    chartGestureMoved = true;
    panChartByPixels(deltaX);
  });

  miniChartCanvas?.addEventListener("pointerup", (event) => {
    if (!chartGestureMoved) {
      const now = Date.now();
      if (event.pointerType === "mouse") {
        chartMouseTapCount = now - chartLastMouseTapAt < 550 ? chartMouseTapCount + 1 : 1;
        chartLastMouseTapAt = now;
        if (chartMouseTapCount >= 3) {
          chartMouseTapCount = 0;
          showTimeframePicker();
        }
      } else {
        if (now - chartLastTouchTapAt < 350) {
          chartLastTouchTapAt = 0;
          showTimeframePicker();
        } else {
          chartLastTouchTapAt = now;
        }
      }
    }
    chartDragX = null;
    chartGestureMoved = false;
  });

  miniChartCanvas?.addEventListener("pointercancel", () => {
    chartDragX = null;
    chartGestureMoved = false;
  });

  miniChartCanvas?.addEventListener("pointerleave", () => {
    chartDragX = null;
    chartGestureMoved = false;
  });

  chartTfSelectEl?.addEventListener("change", () => {
    setChartTimeframe(chartTfSelectEl.value).catch((err) => {
      setStatus(err?.message || "Timeframe change failed", true);
    });
  });

  zoomInBtn?.addEventListener("click", () => {
    chartPoints = Math.max(10, chartPoints - 10);
    const built = getBuiltCandles();
    const maxOffset = Math.max(0, built.length - chartPoints);
    chartOffset = Math.min(chartOffset, maxOffset);
    renderMiniChart(built);
  });

  zoomOutBtn?.addEventListener("click", () => {
    chartPoints = Math.min(MAX_CANDLES, chartPoints + 10);
    const built = getBuiltCandles();
    const maxOffset = Math.max(0, built.length - chartPoints);
    chartOffset = Math.min(chartOffset, maxOffset);
    renderMiniChart(built);
  });

  autoToggleEl?.addEventListener("change", () => {
    autoTradeEnabled = autoToggleEl.checked;
    if (autoTradeEnabled && !storedAccounts.length) {
      window.location.href = OAUTH_URL;
    }
  });

  autoAccountSelect?.addEventListener("change", () => {
    autoTradeLoginId = autoAccountSelect.value;
    if (autoTradeLoginId) {
      const account = storedAccounts.find((acc) => acc.loginid === autoTradeLoginId);
      if (account) {
        activeLoginId = account.loginid;
        activeToken = account.token;
        authorizeWithToken(activeToken).catch(() => {});
        renderAccountList();
      }
    }
  });

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
    autoTradeLoginId = account.loginid;
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
      const direction = btn.textContent.trim().toLowerCase() === "lower" ? "PUT" : "CALL";
      setDirection(direction);
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
  renderAutoTradeResults();

  // Default collapsed state for sections
  tradeBody?.classList.add("collapsed");
  toggleTradeBtn && (toggleTradeBtn.textContent = "Expand", toggleTradeBtn.setAttribute("aria-expanded", "false"));
  tradeListEl?.classList.add("collapsed");
  toggleProposalsBtn && (toggleProposalsBtn.textContent = "Expand", toggleProposalsBtn.setAttribute("aria-expanded", "false"));
  tradeResultsEl?.classList.add("collapsed");
  toggleResultsBtn && (toggleResultsBtn.textContent = "Expand", toggleResultsBtn.setAttribute("aria-expanded", "false"));
  signalBodyEl?.classList.add("collapsed");
  toggleSignalBtn && (toggleSignalBtn.textContent = "Expand", toggleSignalBtn.setAttribute("aria-expanded", "false"));
  sweepBodyEl?.classList.add("collapsed");
  toggleSweepBtn && (toggleSweepBtn.textContent = "Expand", toggleSweepBtn.setAttribute("aria-expanded", "false"));
  chartBodyEl?.classList.add("collapsed");
  toggleChartBtn && (toggleChartBtn.textContent = "Expand", toggleChartBtn.setAttribute("aria-expanded", "false"));
  autoBodyEl?.classList.add("collapsed");
  toggleAutoBtn && (toggleAutoBtn.textContent = "Expand", toggleAutoBtn.setAttribute("aria-expanded", "false"));
  autoResultsEl?.classList.add("collapsed");
  toggleAutoResultsBtn && (toggleAutoResultsBtn.textContent = "Expand", toggleAutoResultsBtn.setAttribute("aria-expanded", "false"));
}

window.addEventListener("DOMContentLoaded", init);
