const APP_ID = 101122;
const WS_URLS = [
  `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`,
  `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`,
];
const REDIRECT_URI = "https://jacques-personal-trading.vercel.app";
const OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

let tabs;
let hlButtons;
let phoneEl;
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
let sigRejectEl;
let sigEntryEl;
let sigLevelEl;
let sigBlueEl;
let sigWhiteEl;
let signalBodyEl;
let toggleSignalBtn;
let chartBodyEl;
let toggleChartBtn;
let chartTfLabelEl;
let chartTfPickerEl;
let chartTfSelectEl;
let indicatorSelectEl;
let chartIndicatorListEl;
let trendModeSelectEl;
let miniChartCanvas;
let zoomInBtn;
let zoomOutBtn;
let resetChartBtn;
let autoToggleEl;
let autoAccountSelect;
let autoResultsEl;
let autoBodyEl;
let autoSectionEl;
let toggleAutoBtn;
let toggleAutoConfigBtn;
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
const CHART_INDICATOR_OPTIONS = [
  { value: "ICT_FVG", label: "ICT FVG" },
  { value: "ICT_OB", label: "ICT OB" },
  { value: "ICT_STRUCTURE", label: "ICT Structure" },
  { value: "ICT_LIQUIDITY", label: "ICT Liquidity" },
  { value: "ICT_FIB", label: "ICT Fib" },
  { value: "ICT_KILLZONES", label: "ICT Killzones" },
  { value: "ICT_BPR", label: "ICT BPR" },
  { value: "SMC_SETUP_08", label: "SMC Setup 08" },
  { value: "SMC_PRO_COMBO", label: "SMC Pro Combo" },
  { value: "ADX_VOL_WAVES", label: "ADX Volatility Waves" },
  { value: "BREAKOUT_TARGETS", label: "Breakout Targets" },
  { value: "DYNAMIC_Z_DIVERGENCE", label: "Dynamic Z-Score Divergence" },
  { value: "VOLUME_PROFILE_NODES", label: "Volume Profile Nodes" },
  { value: "LIQUIDITY_TRENDLINE", label: "Liquidity Trendline" },
  { value: "EMA", label: "EMA 9" },
];
const CHART_INDICATOR_GROUPS = [
  {
    key: "ICT",
    label: "ICT",
    items: ["ICT_FVG", "ICT_OB", "ICT_STRUCTURE", "ICT_LIQUIDITY", "ICT_FIB", "ICT_KILLZONES", "ICT_BPR"],
  },
  {
    key: "SMC",
    label: "SMC",
    items: ["SMC_SETUP_08", "SMC_PRO_COMBO"],
  },
  {
    key: "VOL",
    label: "Volatility",
    items: ["ADX_VOL_WAVES", "VOLUME_PROFILE_NODES"],
  },
  {
    key: "BO",
    label: "Breakouts",
    items: ["BREAKOUT_TARGETS"],
  },
  {
    key: "TL",
    label: "Trendlines",
    items: ["LIQUIDITY_TRENDLINE"],
  },
  {
    key: "MOM",
    label: "Momentum",
    items: ["DYNAMIC_Z_DIVERGENCE"],
  },
  {
    key: "MA",
    label: "Moving Avg",
    items: ["EMA"],
  },
];
const activeChartIndicators = new Set();

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
const TREND_MODE_OPTIONS = ["EMA", "AVG", "OBV", "STACK"];
let chartPoints = 24;
let chartOffset = 0;
let chartDragX = null;
let chartDragY = null;
let chartVerticalOffset = 0;
let chartGestureMoved = false;
let chartMouseTapCount = 0;
let chartLastMouseTapAt = 0;
let chartLastTouchTapAt = 0;
let autoTradeSessionCount = 0;
let currentTrendMode = "EMA";
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

function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function getLevelThreshold(candles) {
  const avg = averageRange(candles);
  const pip = currentPip || 0;
  const fallback = candles[candles.length - 1]?.close ? candles[candles.length - 1].close * 0.0001 : 0.0001;
  return Math.max(pip * 2, avg * 0.15, fallback);
}

function detectAverageTrend(candles, length = 10) {
  if (candles.length < length) {
    return { trend: "SIDEWAYS", trendStrength: 0 };
  }
  const recent = candles.slice(-length);
  const avgClose = recent.reduce((sum, candle) => sum + candle.close, 0) / recent.length;
  const lastClose = recent[recent.length - 1].close;
  const avgRange = averageRange(recent) || Math.abs(lastClose) || 1;
  const distance = Math.abs(lastClose - avgClose);
  let trend = "SIDEWAYS";
  if (lastClose > avgClose) trend = "UP";
  else if (lastClose < avgClose) trend = "DOWN";
  return { trend, trendStrength: clamp(distance / avgRange, 0, 1) };
}

function detectEmaTrend(candles) {
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

function detectObvTrend(candles) {
  if (candles.length < 21) {
    return { trend: "SIDEWAYS", trendStrength: 0 };
  }
  const emaTrend = detectEmaTrend(candles);
  const obv = calculateOBV(candles);
  const recent = obv.slice(-10);
  if (recent.length < 2) return emaTrend;
  const obvDelta = recent[recent.length - 1] - recent[0];
  const lastPrice = candles[candles.length - 1].close;
  const prevPrice = candles[Math.max(0, candles.length - 10)].close;
  const priceDelta = lastPrice - prevPrice;
  const obvBias = obvDelta > 0 ? "UP" : obvDelta < 0 ? "DOWN" : "SIDEWAYS";
  const priceBias = priceDelta > 0 ? "UP" : priceDelta < 0 ? "DOWN" : "SIDEWAYS";
  let trend = emaTrend.trend;
  if (obvBias !== "SIDEWAYS" && priceBias === obvBias) {
    trend = obvBias;
  } else if (priceBias === "SIDEWAYS" || obvBias === "SIDEWAYS") {
    trend = emaTrend.trend;
  } else if (priceBias !== obvBias) {
    trend = "SIDEWAYS";
  }
  return { trend, trendStrength: emaTrend.trendStrength };
}

function detectStructureTrend(candles) {
  if (candles.length < 5) {
    return { trend: "SIDEWAYS", trendStrength: 0, structureBias: "MIXED" };
  }
  const recent = candles.slice(-5);
  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i].high > recent[i - 1].high) higherHighs += 1;
    if (recent[i].low > recent[i - 1].low) higherLows += 1;
    if (recent[i].high < recent[i - 1].high) lowerHighs += 1;
    if (recent[i].low < recent[i - 1].low) lowerLows += 1;
  }

  if (higherHighs >= 2 && higherLows >= 2) {
    return {
      trend: "UP",
      trendStrength: clamp((higherHighs + higherLows) / 8, 0, 1),
      structureBias: "HH_HL",
    };
  }
  if (lowerHighs >= 2 && lowerLows >= 2) {
    return {
      trend: "DOWN",
      trendStrength: clamp((lowerHighs + lowerLows) / 8, 0, 1),
      structureBias: "LL_LH",
    };
  }

  return { trend: "SIDEWAYS", trendStrength: 0, structureBias: "MIXED" };
}

function assessCandleContinuation(candles) {
  if (candles.length < 3) {
    return { bullScore: 0, bearScore: 0, bodyStrength: 0 };
  }
  const recent = candles.slice(-3);
  const avgRange = averageRange(recent, recent.length) || 1;
  let bullScore = 0;
  let bearScore = 0;
  let bodyTotal = 0;

  recent.forEach((candle) => {
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const bodyRatio = clamp(body / avgRange, 0, 1);
    bodyTotal += bodyRatio;

    if (candle.close > candle.open && upperWick <= body * 0.75) {
      bullScore += 1;
    }
    if (candle.close < candle.open && lowerWick <= body * 0.75) {
      bearScore += 1;
    }
  });

  return {
    bullScore,
    bearScore,
    bodyStrength: clamp(bodyTotal / recent.length, 0, 1),
  };
}

function assessPullbackBehavior(candles, trendState) {
  if (candles.length < 8 || trendState.trend === "SIDEWAYS") {
    return { valid: false, score: 0 };
  }
  const recent = candles.slice(-8);
  const closes = recent.map((candle) => candle.close);
  const ema9 = calculateEMA(closes, Math.min(9, closes.length));
  const ema21 = calculateEMA(closes, Math.min(21, closes.length));
  const current = recent[recent.length - 1];
  const previous = recent[recent.length - 2];
  const avgRange = averageRange(recent, recent.length) || 1;

  if (trendState.trend === "UP") {
    const dip = Math.max(0, Math.max(previous.close, ema9 || previous.close) - current.low);
    const heldEmas = current.close >= (ema21 || current.close);
    return {
      valid: heldEmas && dip <= avgRange * 1.4,
      score: clamp(1 - (dip / (avgRange * 1.4 || 1)), 0, 1),
    };
  }

  const bounce = Math.max(0, current.high - Math.min(previous.close, ema9 || previous.close));
  const heldEmas = current.close <= (ema21 || current.close);
  return {
    valid: heldEmas && bounce <= avgRange * 1.4,
    score: clamp(1 - (bounce / (avgRange * 1.4 || 1)), 0, 1),
  };
}

function detectStackTrend(candles) {
  if (candles.length < 50) {
    return { trend: "SIDEWAYS", trendStrength: 0, modeLabel: "STACK" };
  }

  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const structureState = detectStructureTrend(candles);
  const rsi = calculateRSI(candles, 14);
  const candleState = assessCandleContinuation(candles);
  const emaTrend =
    ema9 > ema21 && ema21 > ema50 ? "UP" :
    ema9 < ema21 && ema21 < ema50 ? "DOWN" :
    "SIDEWAYS";
  const pullbackState = assessPullbackBehavior(candles, { trend: emaTrend });
  const momentumTrend = rsi == null ? "SIDEWAYS" : rsi > 50 ? "UP" : rsi < 50 ? "DOWN" : "SIDEWAYS";

  let trend = "SIDEWAYS";
  if (
    emaTrend === "UP" &&
    structureState.trend === "UP" &&
    momentumTrend === "UP" &&
    candleState.bullScore >= 2 &&
    pullbackState.valid
  ) {
    trend = "UP";
  } else if (
    emaTrend === "DOWN" &&
    structureState.trend === "DOWN" &&
    momentumTrend === "DOWN" &&
    candleState.bearScore >= 2 &&
    pullbackState.valid
  ) {
    trend = "DOWN";
  }

  const emaScore = emaTrend === "SIDEWAYS" ? 0 : 1;
  const structureScore = structureState.trend === "SIDEWAYS" ? 0 : structureState.trendStrength;
  const rsiScore = rsi == null ? 0 : clamp(Math.abs(rsi - 50) / 20, 0, 1);
  const candleScore =
    trend === "UP" ? clamp(candleState.bullScore / 3, 0, 1) :
    trend === "DOWN" ? clamp(candleState.bearScore / 3, 0, 1) :
    0;
  const trendStrength = trend === "SIDEWAYS"
    ? 0
    : clamp((emaScore * 0.3) + (structureScore * 0.25) + (rsiScore * 0.2) + (candleScore * 0.15) + (pullbackState.score * 0.1), 0, 1);

  return {
    trend,
    trendStrength,
    ema9,
    ema21,
    ema50,
    rsi,
    structureBias: structureState.structureBias,
    pullbackValid: pullbackState.valid,
    modeLabel: "STACK",
  };
}

function detectTrend(candles, mode = currentTrendMode) {
  if (mode === "AVG") return detectAverageTrend(candles);
  if (mode === "OBV") return detectObvTrend(candles);
  if (mode === "STACK") return detectStackTrend(candles);
  return detectEmaTrend(candles);
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

function detectLiquiditySweepEvent(candles, index, lookback = SIGNAL_STRUCTURE_LOOKBACK) {
  if (!Array.isArray(candles) || index <= 0) return null;
  const current = candles[index];
  const structureCandles = candles.slice(Math.max(0, index - lookback), index);
  if (!current || structureCandles.length < 5) return null;

  const previousHigh = Math.max(...structureCandles.map((c) => c.high));
  const previousLow = Math.min(...structureCandles.map((c) => c.low));
  const threshold = getLevelThreshold(structureCandles);
  const equalHighs = collectEqualLevels(structureCandles, "high", threshold);
  const equalLows = collectEqualLevels(structureCandles, "low", threshold);
  const highLiquidity = equalHighs.length ? Math.max(previousHigh, ...equalHighs) : previousHigh;
  const lowLiquidity = equalLows.length ? Math.min(previousLow, ...equalLows) : previousLow;

  if (current.high > highLiquidity && current.close < highLiquidity) {
    return {
      sweepType: "SELL",
      liquidityLabel: "BSL",
      referenceLevel: highLiquidity,
      extremeLevel: current.high,
      candle: current,
      candleIndex: index,
    };
  }

  if (current.low < lowLiquidity && current.close > lowLiquidity) {
    return {
      sweepType: "BUY",
      liquidityLabel: "SSL",
      referenceLevel: lowLiquidity,
      extremeLevel: current.low,
      candle: current,
      candleIndex: index,
    };
  }

  return null;
}

function isPivotHigh(candles, index, length = 3) {
  if (index < length || index >= candles.length - length) return false;
  const value = candles[index].high;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].high >= value || candles[index + offset].high > value) return false;
  }
  return true;
}

function isPivotLow(candles, index, length = 3) {
  if (index < length || index >= candles.length - length) return false;
  const value = candles[index].low;
  for (let offset = 1; offset <= length; offset += 1) {
    if (candles[index - offset].low <= value || candles[index + offset].low < value) return false;
  }
  return true;
}

function isPivotHighLR(candles, index, leftLen = 3, rightLen = 3) {
  if (index < leftLen || index >= candles.length - rightLen) return false;
  const value = candles[index].high;
  for (let offset = 1; offset <= leftLen; offset += 1) {
    if (candles[index - offset].high >= value) return false;
  }
  for (let offset = 1; offset <= rightLen; offset += 1) {
    if (candles[index + offset].high > value) return false;
  }
  return true;
}

function isPivotLowLR(candles, index, leftLen = 3, rightLen = 3) {
  if (index < leftLen || index >= candles.length - rightLen) return false;
  const value = candles[index].low;
  for (let offset = 1; offset <= leftLen; offset += 1) {
    if (candles[index - offset].low <= value) return false;
  }
  for (let offset = 1; offset <= rightLen; offset += 1) {
    if (candles[index + offset].low < value) return false;
  }
  return true;
}

function buildICTStructureAnalysis(candles, pivotLength = 3) {
  const pivotHighs = [];
  const pivotLows = [];
  for (let i = pivotLength; i < candles.length - pivotLength; i += 1) {
    if (isPivotHigh(candles, i, pivotLength)) pivotHighs.push({ index: i, price: candles[i].high });
    if (isPivotLow(candles, i, pivotLength)) pivotLows.push({ index: i, price: candles[i].low });
  }

  const events = [];
  let trend = 0;
  let highPtr = 0;
  let lowPtr = 0;
  let lastHigh = null;
  let lastLow = null;
  let lastHighBroken = false;
  let lastLowBroken = false;

  for (let i = 0; i < candles.length; i += 1) {
    while (highPtr < pivotHighs.length && pivotHighs[highPtr].index <= i) {
      lastHigh = pivotHighs[highPtr];
      lastHighBroken = false;
      highPtr += 1;
    }
    while (lowPtr < pivotLows.length && pivotLows[lowPtr].index <= i) {
      lastLow = pivotLows[lowPtr];
      lastLowBroken = false;
      lowPtr += 1;
    }

    const candle = candles[i];
    if (lastHigh && !lastHighBroken && candle.close > lastHigh.price) {
      events.push({
        type: trend >= 0 ? "BOS" : "MSS",
        direction: "UP",
        pivotIndex: lastHigh.index,
        pivotPrice: lastHigh.price,
        breakIndex: i,
        breakPrice: candle.close,
        oppositePivot: lastLow,
      });
      trend = 1;
      lastHighBroken = true;
    }

    if (lastLow && !lastLowBroken && candle.close < lastLow.price) {
      events.push({
        type: trend <= 0 ? "BOS" : "MSS",
        direction: "DOWN",
        pivotIndex: lastLow.index,
        pivotPrice: lastLow.price,
        breakIndex: i,
        breakPrice: candle.close,
        oppositePivot: lastHigh,
      });
      trend = -1;
      lastLowBroken = true;
    }
  }

  return { pivotHighs, pivotLows, events };
}

function buildICTFVGs(candles, activeLimit = 3) {
  const bull = [];
  const bear = [];
  for (let i = 2; i < candles.length; i += 1) {
    if (candles[i].low > candles[i - 2].high) {
      bull.push({
        direction: "UP",
        startIndex: i - 1,
        endIndex: i,
        top: candles[i].low,
        bottom: candles[i - 2].high,
      });
    }
    if (candles[i].high < candles[i - 2].low) {
      bear.push({
        direction: "DOWN",
        startIndex: i - 1,
        endIndex: i,
        top: candles[i - 2].low,
        bottom: candles[i].high,
      });
    }
  }

  const finalizeZones = (zones, direction) => zones.map((zone) => {
    let mitigationIndex = null;
    for (let i = zone.endIndex + 1; i < candles.length; i += 1) {
      if (direction === "UP" && candles[i].low < zone.bottom) {
        mitigationIndex = i;
        break;
      }
      if (direction === "DOWN" && candles[i].high > zone.top) {
        mitigationIndex = i;
        break;
      }
    }
    return {
      ...zone,
      mitigationIndex,
      active: mitigationIndex == null,
      drawEndIndex: mitigationIndex ?? (candles.length - 1),
    };
  }).slice(-activeLimit);

  const bullish = finalizeZones(bull, "UP");
  const bearish = finalizeZones(bear, "DOWN");
  const bprs = [];

  bullish.forEach((bullZone) => {
    bearish.forEach((bearZone) => {
      const overlapEnd = Math.min(bullZone.drawEndIndex, bearZone.drawEndIndex);
      const top = Math.min(bullZone.top, bearZone.top);
      const bottom = Math.max(bullZone.bottom, bearZone.bottom);
      if (top > bottom && overlapEnd >= Math.max(bullZone.startIndex, bearZone.startIndex)) {
        bprs.push({
          startIndex: Math.min(bullZone.startIndex, bearZone.startIndex),
          endIndex: overlapEnd,
          top,
          bottom,
        });
      }
    });
  });

  return { bullish, bearish, bprs: bprs.slice(-2) };
}

function buildICTOrderBlocks(candles, structureEvents, activeLimit = 2) {
  const bullish = [];
  const bearish = [];

  structureEvents.forEach((event) => {
    const from = Math.max(0, event.pivotIndex - 6);
    if (event.direction === "UP") {
      for (let i = event.breakIndex - 1; i >= from; i -= 1) {
        if (candles[i].close < candles[i].open) {
          bullish.push({
            direction: "UP",
            index: i,
            top: candles[i].high,
            bottom: candles[i].low,
          });
          break;
        }
      }
    } else {
      for (let i = event.breakIndex - 1; i >= from; i -= 1) {
        if (candles[i].close > candles[i].open) {
          bearish.push({
            direction: "DOWN",
            index: i,
            top: candles[i].high,
            bottom: candles[i].low,
          });
          break;
        }
      }
    }
  });

  const dedupe = (zones) => {
    const seen = new Set();
    return zones.filter((zone) => {
      const key = `${zone.index}:${zone.top}:${zone.bottom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const finalizeZones = (zones, direction) => dedupe(zones).map((zone) => {
    let mitigationIndex = null;
    for (let i = zone.index + 1; i < candles.length; i += 1) {
      if (direction === "UP" && candles[i].close < zone.bottom) {
        mitigationIndex = i;
        break;
      }
      if (direction === "DOWN" && candles[i].close > zone.top) {
        mitigationIndex = i;
        break;
      }
    }
    return {
      ...zone,
      mitigationIndex,
      active: mitigationIndex == null,
      drawEndIndex: mitigationIndex ?? (candles.length - 1),
    };
  }).slice(-activeLimit);

  return {
    bullish: finalizeZones(bullish, "UP"),
    bearish: finalizeZones(bearish, "DOWN"),
  };
}

function buildICTFibLevels(structureEvents) {
  const lastEvent = structureEvents[structureEvents.length - 1];
  if (!lastEvent?.oppositePivot) return null;
  const bullish = lastEvent.direction === "UP";
  const anchor0 = bullish ? lastEvent.pivotPrice : lastEvent.oppositePivot.price;
  const anchor1 = bullish ? lastEvent.oppositePivot.price : lastEvent.pivotPrice;
  const range = anchor1 - anchor0;
  if (!Number.isFinite(range) || range === 0) return null;
  const makeLevel = (ratio) => anchor0 + (range * ratio);

  return {
    direction: lastEvent.direction,
    startIndex: Math.min(lastEvent.pivotIndex, lastEvent.oppositePivot.index ?? lastEvent.pivotIndex),
    endIndex: lastEvent.breakIndex,
    levels: [
      { label: "0.5", price: makeLevel(0.5), color: "#9aa7b8" },
      { label: "0.618", price: makeLevel(0.618), color: "#0db787" },
      { label: "0.705", price: makeLevel(0.705), color: "#5ce1ff" },
      { label: "0.79", price: makeLevel(0.79), color: "#f2c94c" },
    ],
  };
}

function getKillzoneKey(epochSec) {
  const shifted = new Date((epochSec - (5 * 3600)) * 1000);
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const total = (hours * 60) + minutes;
  if (total >= 1200 || total < 0) return "ASIA";
  if (total >= 120 && total < 300) return "LONDON";
  if (total >= 510 && total < 660) return "NYAM";
  if (total >= 810 && total < 960) return "NYPM";
  return null;
}

function buildICTKillzones(points, startIndex) {
  const colors = {
    ASIA: "rgba(45, 140, 255, 0.08)",
    LONDON: "rgba(13, 183, 135, 0.08)",
    NYAM: "rgba(225, 91, 100, 0.08)",
    NYPM: "rgba(242, 201, 76, 0.08)",
  };
  const segments = [];
  let current = null;
  for (let i = 0; i < points.length; i += 1) {
    const key = getKillzoneKey(points[i].time);
    if (!key) {
      if (current) segments.push(current);
      current = null;
      continue;
    }
    const absoluteIndex = startIndex + i;
    if (!current || current.key !== key) {
      if (current) segments.push(current);
      current = { key, startIndex: absoluteIndex, endIndex: absoluteIndex, color: colors[key] };
    } else {
      current.endIndex = absoluteIndex;
    }
  }
  if (current) segments.push(current);
  return segments;
}

function getLastPivotBefore(pivots, index) {
  let result = null;
  for (let i = 0; i < pivots.length; i += 1) {
    if (pivots[i].index >= index) break;
    result = pivots[i];
  }
  return result;
}

function detectBullishFVGAt(candles, index) {
  if (index < 2) return null;
  if (candles[index].low > candles[index - 2].high) {
    return {
      index: index - 1,
      top: candles[index].low,
      bottom: candles[index - 2].high,
    };
  }
  return null;
}

function detectBearishFVGAt(candles, index) {
  if (index < 2) return null;
  if (candles[index].high < candles[index - 2].low) {
    return {
      index: index - 1,
      top: candles[index - 2].low,
      bottom: candles[index].high,
    };
  }
  return null;
}

function buildSMCSetup08(candles, swingPeriod = 5) {
  if (!Array.isArray(candles) || candles.length < Math.max(40, swingPeriod * 4)) {
    return { bullish: [], bearish: [] };
  }

  const pivotHighs = [];
  const pivotLows = [];
  for (let i = swingPeriod; i < candles.length - swingPeriod; i += 1) {
    if (isPivotHigh(candles, i, swingPeriod)) pivotHighs.push({ index: i, price: candles[i].high });
    if (isPivotLow(candles, i, swingPeriod)) pivotLows.push({ index: i, price: candles[i].low });
  }

  const bullCandidates = [];
  const bearCandidates = [];
  const bullish = [];
  const bearish = [];
  const pendingBullish = [];
  const pendingBearish = [];

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const lastHigh = getLastPivotBefore(pivotHighs, i);
    const lastLow = getLastPivotBefore(pivotLows, i);

    if (lastLow) {
      const age = i - lastLow.index;
      if (age >= swingPeriod + 2 && age <= 100 && candle.low < lastLow.price && candle.close > lastLow.price) {
        const chochPivot = getLastPivotBefore(pivotHighs, i);
        if (chochPivot) {
          bullCandidates.push({
            active: true,
            direction: "BULL",
            status: "TRACKING",
            swingIndex: lastLow.index,
            swingPrice: lastLow.price,
            levelIndex: chochPivot.index,
            levelPrice: chochPivot.price,
            poiIndex: i,
            poiFillIndex: null,
            poiTop: candle.high,
            poiBottom: candle.low,
            levelBreakIndex: null,
            fvg: null,
            triggerIndex: null,
          });
        }
      }
    }

    if (lastHigh) {
      const age = i - lastHigh.index;
      if (age >= swingPeriod + 2 && age <= 70 && candle.high > lastHigh.price && candle.close < lastHigh.price) {
        const chochPivot = getLastPivotBefore(pivotLows, i);
        if (chochPivot) {
          bearCandidates.push({
            active: true,
            direction: "BEAR",
            status: "TRACKING",
            swingIndex: lastHigh.index,
            swingPrice: lastHigh.price,
            levelIndex: chochPivot.index,
            levelPrice: chochPivot.price,
            poiIndex: i,
            poiFillIndex: null,
            poiTop: candle.high,
            poiBottom: candle.low,
            levelBreakIndex: null,
            fvg: null,
            triggerIndex: null,
          });
        }
      }
    }

    bullCandidates.forEach((candidate) => {
      if (!candidate.active || i <= candidate.poiIndex) return;
      if (candidate.poiBottom > candle.close) {
        candidate.active = false;
        return;
      }

      const latestHigh = getLastPivotBefore(pivotHighs, i);
      if (!candidate.levelBreakIndex && latestHigh && latestHigh.price > candidate.levelPrice) {
        candidate.levelIndex = latestHigh.index;
        candidate.levelPrice = latestHigh.price;
      }

      if (candidate.poiFillIndex == null && i >= candidate.poiIndex + swingPeriod) {
        if (candidate.poiTop > candle.low && candle.close > candidate.poiBottom) {
          candidate.poiFillIndex = i;
          candidate.status = "POI";
        }
      }

      if (candidate.levelBreakIndex == null && candle.close > candidate.levelPrice) {
        candidate.levelBreakIndex = i;
        candidate.status = "CHOCH";
      }

      if (!candidate.fvg && candidate.poiFillIndex != null) {
        const fvg = detectBullishFVGAt(candles, i);
        if (fvg) {
          candidate.fvg = fvg;
          candidate.status = "FVG";
        }
      } else if (candidate.fvg) {
        if (candle.low < candidate.fvg.top && candle.close > candidate.fvg.bottom && candidate.levelBreakIndex != null) {
          candidate.triggerIndex = i;
          candidate.status = "TRIGGERED";
          bullish.push(candidate);
          candidate.active = false;
        } else if (candle.close < candidate.fvg.bottom) {
          candidate.active = false;
        }
      }
    });

    bearCandidates.forEach((candidate) => {
      if (!candidate.active || i <= candidate.poiIndex) return;
      if (candidate.poiTop < candle.close) {
        candidate.active = false;
        return;
      }

      const latestLow = getLastPivotBefore(pivotLows, i);
      if (!candidate.levelBreakIndex && latestLow && latestLow.price < candidate.levelPrice) {
        candidate.levelIndex = latestLow.index;
        candidate.levelPrice = latestLow.price;
      }

      if (candidate.poiFillIndex == null && i >= candidate.poiIndex + swingPeriod) {
        if (candidate.poiBottom < candle.high) {
          candidate.poiFillIndex = i;
          candidate.status = "POI";
        }
      }

      if (candidate.levelBreakIndex == null && candle.close < candidate.levelPrice) {
        candidate.levelBreakIndex = i;
        candidate.status = "CHOCH";
      }

      if (!candidate.fvg && candidate.poiFillIndex != null) {
        const fvg = detectBearishFVGAt(candles, i);
        if (fvg) {
          candidate.fvg = fvg;
          candidate.status = "FVG";
        }
      } else if (candidate.fvg) {
        if (candle.high > candidate.fvg.bottom && candle.close < candidate.fvg.top && candidate.levelBreakIndex != null) {
          candidate.triggerIndex = i;
          candidate.status = "TRIGGERED";
          bearish.push(candidate);
          candidate.active = false;
        } else if (candle.close > candidate.fvg.top) {
          candidate.active = false;
        }
      }
    });
  }

  bullCandidates.forEach((candidate) => {
    if (!candidate.active) return;
    if (candidate.fvg || candidate.levelBreakIndex != null || candidate.poiFillIndex != null) {
      pendingBullish.push(candidate);
    }
  });

  bearCandidates.forEach((candidate) => {
    if (!candidate.active) return;
    if (candidate.fvg || candidate.levelBreakIndex != null || candidate.poiFillIndex != null) {
      pendingBearish.push(candidate);
    }
  });

  const mergeRecent = (completed, pending) => {
    const seen = new Set(completed.map((item) => `${item.direction}:${item.poiIndex}:${item.swingIndex}`));
    pending.forEach((item) => {
      const key = `${item.direction}:${item.poiIndex}:${item.swingIndex}`;
      if (!seen.has(key)) completed.push(item);
    });
    return completed
      .sort((a, b) => {
        const aIndex = a.triggerIndex ?? a.fvg?.index ?? a.levelBreakIndex ?? a.poiFillIndex ?? a.poiIndex;
        const bIndex = b.triggerIndex ?? b.fvg?.index ?? b.levelBreakIndex ?? b.poiFillIndex ?? b.poiIndex;
        return aIndex - bIndex;
      })
      .slice(-3);
  };

  return {
    bullish: mergeRecent(bullish, pendingBullish),
    bearish: mergeRecent(bearish, pendingBearish),
  };
}

function simpleMovingAverage(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += Number(values[i] || 0);
    if (i >= period) sum -= Number(values[i - period] || 0);
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

function rollingStdDev(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period;
    result[i] = Math.sqrt(variance);
  }
  return result;
}

function rmaSeries(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += Number(values[i] || 0);
  let prev = seed / period;
  result[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = ((prev * (period - 1)) + Number(values[i] || 0)) / period;
    result[i] = prev;
  }
  return result;
}

function emaSeries(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, value) => sum + Number(value || 0), 0) / period;
  result[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = (Number(values[i] || 0) * k) + (prev * (1 - k));
    result[i] = prev;
  }
  return result;
}

function weightedMovingAverage(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  const divisor = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < period; j += 1) {
      sum += Number(values[i - j] || 0) * (period - j);
    }
    result[i] = sum / divisor;
  }
  return result;
}

function rollingLowest(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    let low = Number.POSITIVE_INFINITY;
    for (let j = i - period + 1; j <= i; j += 1) low = Math.min(low, Number(values[j] || 0));
    result[i] = low;
  }
  return result;
}

function rollingHighest(values, period) {
  if (!Array.isArray(values) || !values.length || period <= 0) return [];
  const result = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    let high = Number.NEGATIVE_INFINITY;
    for (let j = i - period + 1; j <= i; j += 1) high = Math.max(high, Number(values[j] || 0));
    result[i] = high;
  }
  return result;
}

function rsiSeries(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return [];
  const result = new Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = Number(values[i] || 0) - Number(values[i - 1] || 0);
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  for (let i = period + 1; i < values.length; i += 1) {
    const change = Number(values[i] || 0) - Number(values[i - 1] || 0);
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }
  return result;
}

function macdLineSeries(values, fast = 12, slow = 26) {
  const fastEma = emaSeries(values, fast);
  const slowEma = emaSeries(values, slow);
  return values.map((_, index) => (
    Number.isFinite(fastEma[index]) && Number.isFinite(slowEma[index])
      ? fastEma[index] - slowEma[index]
      : null
  ));
}

function zScoreSeries(values, length) {
  const ma = simpleMovingAverage(values.map((v) => Number(v ?? 0)), length);
  const sd = rollingStdDev(values.map((v) => Number(v ?? 0)), length);
  return values.map((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(ma[index]) || !Number.isFinite(sd[index])) return null;
    return (value - ma[index]) / (sd[index] === 0 ? 1 : sd[index]);
  });
}

function tanhApprox(x) {
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

function buildDynamicZDivergence(candles, config = {}) {
  const lenZ = config.lenZ ?? 100;
  const smoothLen = config.smoothLen ?? 10;
  const slopeIndex = config.slopeIndex ?? 1;
  const lookbackLeft = config.lookbackLeft ?? 15;
  const lookbackRight = config.lookbackRight ?? 1;
  const rangeMin = config.rangeMin ?? 5;
  const rangeMax = config.rangeMax ?? 60;
  const saRsiLen = config.saRsiLen ?? 21;
  const saZLen = config.saZLen ?? 200;
  const saBaseLen = config.saBaseLen ?? 80;
  const saIntensity = config.saIntensity ?? 0.15;
  const saSlopeIndex = config.saSlopeIndex ?? 1;
  const saBandAtrLen = config.saBandAtrLen ?? 14;
  const saBandMult = config.saBandMult ?? 1.4;

  if (!Array.isArray(candles) || candles.length < Math.max(saZLen, lenZ, lookbackLeft + lookbackRight + 10)) {
    return { buySignals: [], sellSignals: [], bullDivs: [], bearDivs: [], saema: [], saUpper: [], saLower: [], saColor: [] };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const rsi14 = rsiSeries(closes, 14);
  const rZ = zScoreSeries(rsi14, lenZ);

  const rsiLow14 = rollingLowest(rsi14.map((v) => v ?? 0), 14);
  const rsiHigh14 = rollingHighest(rsi14.map((v) => v ?? 0), 14);
  const stochRsi = rsi14.map((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(rsiLow14[index]) || !Number.isFinite(rsiHigh14[index])) return null;
    const denom = rsiHigh14[index] - rsiLow14[index];
    return denom === 0 ? 0 : ((value - rsiLow14[index]) / denom) * 100;
  });
  const kZ = zScoreSeries(stochRsi, lenZ);

  const macdLine = macdLineSeries(closes, 12, 26);
  const mZ = zScoreSeries(macdLine, lenZ);

  const avgZ = closes.map((_, index) => {
    const values = [rZ[index], kZ[index], mZ[index]].filter(Number.isFinite);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const mainLine = emaSeries(avgZ.map((v) => v ?? 0), smoothLen);

  const buySignals = [];
  const sellSignals = [];
  const bullDivs = [];
  const bearDivs = [];

  let prevPL = null;
  let prevPH = null;
  const innerUpper = 1.0;
  const innerLower = -1.0;

  for (let i = slopeIndex * 2; i < candles.length; i += 1) {
    const prevA = mainLine[i - slopeIndex];
    const prevB = mainLine[i - (slopeIndex * 2)];
    const curr = mainLine[i];
    if (Number.isFinite(prevA) && Number.isFinite(prevB) && Number.isFinite(curr)) {
      const slopePrev = prevA - prevB;
      const slopeCurr = curr - prevA;
      const slopeFlip = slopePrev * slopeCurr < 0;
      if (slopeFlip && slopePrev < 0 && slopeCurr > 0 && curr < innerLower) {
        buySignals.push({ index: i, entryIndex: i + 1 < candles.length ? i + 1 : null, value: curr });
      }
      if (slopeFlip && slopePrev > 0 && slopeCurr < 0 && curr > innerUpper) {
        sellSignals.push({ index: i, entryIndex: i + 1 < candles.length ? i + 1 : null, value: curr });
      }
    }

    const pivotIndex = i - lookbackRight;
    if (pivotIndex >= lookbackLeft && pivotIndex < candles.length - lookbackRight) {
      if (isPivotLowLR(candles.map((c, idx) => ({ ...c, low: Number.isFinite(mainLine[idx]) ? mainLine[idx] : Number.POSITIVE_INFINITY })), pivotIndex, lookbackLeft, lookbackRight)) {
        const currPivot = { z: mainLine[pivotIndex], price: lows[pivotIndex], index: pivotIndex };
        if (
          prevPL &&
          currPivot.z > prevPL.z &&
          currPivot.price < prevPL.price &&
          currPivot.index - prevPL.index >= rangeMin &&
          currPivot.index - prevPL.index <= rangeMax
        ) {
          bullDivs.push({ ...currPivot, entryIndex: i + 1 < candles.length ? i + 1 : null });
        }
        prevPL = currPivot;
      }
      if (isPivotHighLR(candles.map((c, idx) => ({ ...c, high: Number.isFinite(mainLine[idx]) ? mainLine[idx] : Number.NEGATIVE_INFINITY })), pivotIndex, lookbackLeft, lookbackRight)) {
        const currPivot = { z: mainLine[pivotIndex], price: highs[pivotIndex], index: pivotIndex };
        if (
          prevPH &&
          currPivot.z < prevPH.z &&
          currPivot.price > prevPH.price &&
          currPivot.index - prevPH.index >= rangeMin &&
          currPivot.index - prevPH.index <= rangeMax
        ) {
          bearDivs.push({ ...currPivot, entryIndex: i + 1 < candles.length ? i + 1 : null });
        }
        prevPH = currPivot;
      }
    }
  }

  const saRsi = rsiSeries(closes, saRsiLen);
  const saRsiMa = simpleMovingAverage(saRsi.map((v) => v ?? 0), saZLen);
  const saRsiSd = rollingStdDev(saRsi.map((v) => v ?? 0), saZLen);
  const zSoft = closes.map((_, index) => {
    if (!Number.isFinite(saRsi[index]) || !Number.isFinite(saRsiMa[index]) || !Number.isFinite(saRsiSd[index])) return null;
    const zRaw = (saRsi[index] - saRsiMa[index]) / (saRsiSd[index] === 0 ? 1 : saRsiSd[index]);
    return tanhApprox(zRaw * 0.4);
  });
  const baseAlpha = 2 / saBaseLen;
  const saema = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i += 1) {
    const src = closes[i];
    if (i === 0) {
      saema[i] = src;
      continue;
    }
    const alpha = baseAlpha + ((Math.abs(zSoft[i] ?? 0)) * saIntensity);
    saema[i] = saema[i - 1] + (alpha * (src - saema[i - 1]));
  }
  const saSlope = saema.map((value, index) => (
    index >= saSlopeIndex && Number.isFinite(value) && Number.isFinite(saema[index - saSlopeIndex])
      ? value - saema[index - saSlopeIndex]
      : null
  ));
  const saAtr = rmaSeries(candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  }), saBandAtrLen);
  const saUpper = saema.map((value, index) => Number.isFinite(value) && Number.isFinite(saAtr[index]) ? value + (saAtr[index] * saBandMult) : null);
  const saLower = saema.map((value, index) => Number.isFinite(value) && Number.isFinite(saAtr[index]) ? value - (saAtr[index] * saBandMult) : null);
  const saColor = saSlope.map((slope) => slope > 0 ? "#00fec3" : slope < 0 ? "#e600ff" : "#9aa7b8");

  return {
    buySignals,
    sellSignals,
    bullDivs,
    bearDivs,
    saema,
    saUpper,
    saLower,
    saColor,
  };
}

function buildVolumeProfileNodes(candles, config = {}) {
  const profileLength = Math.min(candles.length, config.profileLength ?? 360);
  const rows = config.rows ?? 60;
  const valueAreaThreshold = config.valueAreaThreshold ?? 0.7;
  const peakPercent = config.peakPercent ?? 0.09;
  const troughPercent = config.troughPercent ?? 0.07;
  const thresholdPercent = config.thresholdPercent ?? 0.01;
  const highestCount = config.highestCount ?? 2;
  const lowestCount = config.lowestCount ?? 2;

  if (!Array.isArray(candles) || candles.length < 30 || rows < 10) {
    return { rows: [], pocIndex: null, vahIndex: null, valIndex: null, highestPrice: null, lowestPrice: null };
  }

  const sample = candles.slice(-profileLength);
  const highestPrice = Math.max(...sample.map((c) => c.high));
  const lowestPrice = Math.min(...sample.map((c) => c.low));
  const priceRange = highestPrice - lowestPrice;
  if (!(priceRange > 0)) {
    return { rows: [], pocIndex: null, vahIndex: null, valIndex: null, highestPrice, lowestPrice };
  }

  const step = priceRange / rows;
  const profileRows = Array.from({ length: rows }, (_, index) => ({
    index,
    top: lowestPrice + ((index + 1) * step),
    bottom: lowestPrice + (index * step),
    total: 0,
    bullish: 0,
    bearish: 0,
    peak: false,
    trough: false,
    highest: false,
    lowest: false,
  }));

  sample.forEach((candle) => {
    const levelLow = candle.low;
    const levelHigh = candle.high;
    const candleRange = Math.max(levelHigh - levelLow, 0.0000001);
    const proxyVolume = ((levelHigh - levelLow) + Math.abs(candle.close - candle.open)) * 1000;
    const bullish = candle.close >= candle.open;
    const startSlot = Math.max(0, Math.floor((levelLow - lowestPrice) / step));
    const endSlot = Math.min(rows - 1, Math.floor((levelHigh - lowestPrice) / step));
    for (let rowIndex = startSlot; rowIndex <= endSlot; rowIndex += 1) {
      const row = profileRows[rowIndex];
      const overlapTop = Math.min(levelHigh, row.top);
      const overlapBottom = Math.max(levelLow, row.bottom);
      const overlap = Math.max(0, overlapTop - overlapBottom);
      const proportion = overlap / candleRange;
      const addVolume = proxyVolume * proportion;
      row.total += addVolume;
      if (bullish) row.bullish += addVolume;
      else row.bearish += addVolume;
    }
  });

  const totals = profileRows.map((row) => row.total);
  const maxVol = Math.max(...totals, 0);
  const pocIndex = totals.indexOf(maxVol);
  let vahIndex = pocIndex;
  let valIndex = pocIndex;
  let currentValueArea = pocIndex >= 0 ? totals[pocIndex] : 0;
  const targetValueArea = totals.reduce((sum, value) => sum + value, 0) * valueAreaThreshold;

  while (currentValueArea < targetValueArea && (valIndex > 0 || vahIndex < rows - 1)) {
    const above = vahIndex < rows - 1 ? totals[vahIndex + 1] : -1;
    const below = valIndex > 0 ? totals[valIndex - 1] : -1;
    if (above >= below) {
      vahIndex += 1;
      currentValueArea += Math.max(0, above);
    } else {
      valIndex -= 1;
      currentValueArea += Math.max(0, below);
    }
  }

  const peakN = Math.max(1, Math.round(rows * peakPercent));
  const troughN = Math.max(1, Math.round(rows * troughPercent));
  const threshold = maxVol * thresholdPercent;

  for (let i = peakN; i < rows - peakN; i += 1) {
    const current = totals[i];
    if (current < threshold) continue;
    let peak = true;
    for (let offset = 1; offset <= peakN; offset += 1) {
      if (totals[i - offset] >= current || totals[i + offset] >= current) {
        peak = false;
        break;
      }
    }
    if (peak) profileRows[i].peak = true;
  }

  for (let i = troughN; i < rows - troughN; i += 1) {
    const current = totals[i];
    if (current < threshold) continue;
    let trough = true;
    for (let offset = 1; offset <= troughN; offset += 1) {
      if (totals[i - offset] <= current || totals[i + offset] <= current) {
        trough = false;
        break;
      }
    }
    if (trough) profileRows[i].trough = true;
  }

  const sortedHigh = [...profileRows]
    .sort((a, b) => b.total - a.total)
    .slice(0, highestCount)
    .map((row) => row.index);
  const sortedLow = [...profileRows]
    .filter((row) => row.total > 0)
    .sort((a, b) => a.total - b.total)
    .slice(0, lowestCount)
    .map((row) => row.index);

  sortedHigh.forEach((index) => { profileRows[index].highest = true; });
  sortedLow.forEach((index) => { profileRows[index].lowest = true; });

  return {
    rows: profileRows,
    pocIndex,
    vahIndex,
    valIndex,
    highestPrice,
    lowestPrice,
    maxVolume: maxVol,
    startIndex: candles.length - sample.length,
  };
}

function buildLiquidityTrendlineSignals(candles, config = {}) {
  const len = config.len ?? 5;
  const space = config.space ?? 2;
  const colorUp = config.colorUp ?? "#0044ff";
  const colorDown = config.colorDown ?? "#ff2b00";

  if (!Array.isArray(candles) || candles.length < Math.max(30, len * 4)) {
    return { upperChannels: [], lowerChannels: [], signals: [] };
  }

  const tr = candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  const atr = rmaSeries(tr, 200);
  const padAt = (index) => Math.min((atr[index] ?? 0) * 0.1, candles[index].close * 0.001) * space;

  const pivotHighs = [];
  const pivotLows = [];
  const upperChannels = [];
  const lowerChannels = [];
  const signals = [];
  let upperBroken = false;
  let lowerBroken = false;
  let activeUpper = null;
  let activeLower = null;

  const buildChannel = (from, to, pad, direction) => {
    const dx = to.index - from.index;
    if (dx <= 0) return null;
    const slope = (to.price - from.price) / dx;
    return {
      direction,
      startIndex: from.index,
      endIndex: to.index,
      top1: direction === "UPPER" ? from.price : from.price + pad,
      top2: direction === "UPPER" ? to.price : to.price + pad,
      bottom1: direction === "UPPER" ? from.price - pad : from.price,
      bottom2: direction === "UPPER" ? to.price - pad : to.price,
      slope,
      pad,
      color: direction === "UPPER" ? colorDown : colorUp,
      liveEndIndex: to.index,
      liveTop: direction === "UPPER" ? to.price : to.price + pad,
      liveBottom: direction === "UPPER" ? to.price - pad : to.price,
    };
  };

  const lineValueAt = (startValue, slope, bars) => startValue + (slope * bars);

  for (let i = 0; i < candles.length; i += 1) {
    const pivotIndex = i - len;
    if (pivotIndex >= len && pivotIndex < candles.length - len) {
      if (isPivotHighLR(candles, pivotIndex, len, len)) {
        pivotHighs.unshift({ index: pivotIndex, price: candles[pivotIndex].high });
        if (pivotHighs.length > 4) pivotHighs.pop();
        if (pivotHighs.length > 1) {
          const current = pivotHighs[0];
          const before = pivotHighs[1];
          let valid = false;
          if (current.price < before.price) {
            if (upperBroken) valid = true;
            else if (pivotHighs.length > 3) {
              const pastOld = pivotHighs[3];
              const pastCur = pivotHighs[2];
              const now = pivotHighs[1];
              const late = pivotHighs[0];
              valid = now.price < pastCur.price && now.price < pastOld.price && late.price < pastCur.price && late.price < pastOld.price;
            }
          }
          if (valid) {
            const channel = buildChannel(before, current, padAt(i), "UPPER");
            if (channel) {
              let remove = false;
              for (let idx = before.index; idx <= i; idx += 1) {
                const projectedTop = lineValueAt(channel.top1, channel.slope, idx - before.index);
                if (candles[idx].low > projectedTop) {
                  remove = true;
                  break;
                }
              }
              if (remove) {
                activeUpper = null;
                pivotHighs.length = 0;
                upperBroken = true;
              } else {
                activeUpper = channel;
                upperChannels.push(channel);
                pivotHighs.length = 0;
                upperBroken = false;
              }
            }
          }
        }
      }

      if (isPivotLowLR(candles, pivotIndex, len, len)) {
        pivotLows.unshift({ index: pivotIndex, price: candles[pivotIndex].low });
        if (pivotLows.length > 4) pivotLows.pop();
        if (pivotLows.length > 1) {
          const current = pivotLows[0];
          const before = pivotLows[1];
          let valid = false;
          if (current.price > before.price) {
            if (lowerBroken) valid = true;
            else if (pivotLows.length > 3) {
              const pastOld = pivotLows[3];
              const pastCur = pivotLows[2];
              const now = pivotLows[1];
              const late = pivotLows[0];
              valid = now.price > pastCur.price && now.price > pastOld.price && late.price > pastCur.price && late.price > pastOld.price;
            }
          }
          if (valid) {
            const channel = buildChannel(before, current, padAt(i), "LOWER");
            if (channel) {
              let remove = false;
              for (let idx = before.index; idx <= i; idx += 1) {
                const projectedBottom = lineValueAt(channel.bottom1, channel.slope, idx - before.index);
                if (candles[idx].high < projectedBottom) {
                  remove = true;
                  break;
                }
              }
              if (remove) {
                activeLower = null;
                pivotLows.length = 0;
                lowerBroken = true;
              } else {
                activeLower = channel;
                lowerChannels.push(channel);
                pivotLows.length = 0;
                lowerBroken = false;
              }
            }
          }
        }
      }
    }

    if (activeUpper) {
      activeUpper.liveEndIndex = i;
      activeUpper.liveTop = lineValueAt(activeUpper.top1, activeUpper.slope, i - activeUpper.startIndex);
      activeUpper.liveBottom = lineValueAt(activeUpper.bottom1, activeUpper.slope, i - activeUpper.startIndex);
      if (candles[i].low > activeUpper.liveTop) {
        signals.push({
          type: "UP",
          signalIndex: i,
          entryIndex: i + 1 < candles.length ? i + 1 : null,
          price: candles[i].low,
          color: colorUp,
        });
        activeUpper = null;
        upperBroken = true;
        pivotHighs.length = 0;
      }
    }

    if (activeLower) {
      activeLower.liveEndIndex = i;
      activeLower.liveTop = lineValueAt(activeLower.top1, activeLower.slope, i - activeLower.startIndex);
      activeLower.liveBottom = lineValueAt(activeLower.bottom1, activeLower.slope, i - activeLower.startIndex);
      if (candles[i].high < activeLower.liveBottom) {
        signals.push({
          type: "DOWN",
          signalIndex: i,
          entryIndex: i + 1 < candles.length ? i + 1 : null,
          price: candles[i].high,
          color: colorDown,
        });
        activeLower = null;
        lowerBroken = true;
        pivotLows.length = 0;
      }
    }
  }

  return {
    upperChannels,
    lowerChannels,
    signals,
  };
}

function buildBreakoutTargets(candles, config = {}) {
  const len = config.len ?? 99;
  const preventOverlap = config.preventOverlap ?? true;
  const atrPeriod = config.atrPeriod ?? 14;
  const slMultiplier = config.slMultiplier ?? 5;
  const tp1Multiplier = config.tp1Multiplier ?? 0.5;
  const tp2Multiplier = config.tp2Multiplier ?? 1.0;
  const tp3Multiplier = config.tp3Multiplier ?? 1.5;
  const lenHalf = Math.max(2, Math.floor(len / 2));

  if (!Array.isArray(candles) || candles.length < Math.max(len, atrPeriod, lenHalf * 2 + 5)) {
    return { channels: [], breakouts: [], trades: [] };
  }

  const bodyAbs = candles.map((candle) => Math.abs(candle.close - candle.open));
  const v1 = weightedMovingAverage(bodyAbs, len);
  const v2 = emaSeries(bodyAbs, len);
  const tr = candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  const atr = rmaSeries(tr, atrPeriod);
  const rangeAtr = rmaSeries(tr, len).map((value) => Number.isFinite(value) ? value / 2 : null);

  let lastPivotHigh = null;
  let lastPivotLow = null;
  let lastChannelRight = -1;
  const channels = [];
  const activeChannels = [];
  const breakouts = [];
  const trades = [];
  let activeTrade = null;

  for (let i = 1; i < candles.length; i += 1) {
    const pivotIndex = i - lenHalf;
    if (pivotIndex >= lenHalf && pivotIndex < candles.length - lenHalf) {
      if (isPivotHighLR(candles, pivotIndex, lenHalf, lenHalf)) {
        lastPivotHigh = { index: pivotIndex, price: candles[pivotIndex].high };
      }
      if (isPivotLowLR(candles, pivotIndex, lenHalf, lenHalf)) {
        lastPivotLow = { index: pivotIndex, price: candles[pivotIndex].low };
      }
    }

    const crossedUnder = Number.isFinite(v1[i - 1]) && Number.isFinite(v2[i - 1]) && Number.isFinite(v1[i]) && Number.isFinite(v2[i])
      && v1[i - 1] >= v2[i - 1]
      && v1[i] < v2[i];

    if (crossedUnder && lastPivotHigh && lastPivotLow) {
      let top = null;
      let bottom = null;
      let startIndex = null;
      if (lastPivotHigh.index > lastPivotLow.index) {
        top = lastPivotHigh.price;
        startIndex = lastPivotHigh.index;
        if (i - startIndex > 0) {
          let minLow = candles[i].high;
          for (let j = startIndex; j <= i; j += 1) minLow = Math.min(minLow, candles[j].low);
          bottom = minLow;
        }
      } else {
        bottom = lastPivotLow.price;
        startIndex = lastPivotLow.index;
        if (i - startIndex > 0) {
          let maxHigh = candles[i].low;
          for (let j = startIndex; j <= i; j += 1) maxHigh = Math.max(maxHigh, candles[j].high);
          top = maxHigh;
        }
      }

      const vola = rangeAtr[i] ?? 0;
      if (
        Number.isFinite(top) &&
        Number.isFinite(bottom) &&
        candles[i].close <= top &&
        candles[i].close >= bottom &&
        (!preventOverlap || startIndex > lastChannelRight)
      ) {
        const channel = {
          startIndex,
          endIndex: i,
          top,
          bottom,
          upperBandBottom: top - vola,
          lowerBandTop: bottom + vola,
        };
        channels.push(channel);
        activeChannels.push(channel);
        lastChannelRight = i;
      }
    }

    for (let channelIndex = activeChannels.length - 1; channelIndex >= 0; channelIndex -= 1) {
      const channel = activeChannels[channelIndex];
      if (candles[i].close > channel.top) {
        channel.endIndex = i;
        const entryIndex = i + 1 < candles.length ? i + 1 : null;
        breakouts.push({ index: i, entryIndex, direction: "UP", price: channel.bottom });
        activeChannels.splice(channelIndex, 1);
        const volatility = atr[i] ?? 0;
        const entry = entryIndex != null ? candles[entryIndex].open : candles[i].close;
        const stop = candles[i].low - (volatility * slMultiplier);
        const risk = Math.abs(entry - stop);
        activeTrade = {
          direction: "UP",
          signalIndex: i,
          startIndex: entryIndex ?? i,
          endIndex: entryIndex ?? i,
          entry,
          sl: stop,
          tp1: entry + (risk * tp1Multiplier),
          tp2: entry + (risk * tp2Multiplier),
          tp3: entry + (risk * tp3Multiplier),
          tp3Hit: false,
        };
        trades.push(activeTrade);
      } else if (candles[i].close < channel.bottom) {
        channel.endIndex = i;
        const entryIndex = i + 1 < candles.length ? i + 1 : null;
        breakouts.push({ index: i, entryIndex, direction: "DOWN", price: channel.top });
        activeChannels.splice(channelIndex, 1);
        const volatility = atr[i] ?? 0;
        const entry = entryIndex != null ? candles[entryIndex].open : candles[i].close;
        const stop = candles[i].high + (volatility * slMultiplier);
        const risk = Math.abs(entry - stop);
        activeTrade = {
          direction: "DOWN",
          signalIndex: i,
          startIndex: entryIndex ?? i,
          endIndex: entryIndex ?? i,
          entry,
          sl: stop,
          tp1: entry - (risk * tp1Multiplier),
          tp2: entry - (risk * tp2Multiplier),
          tp3: entry - (risk * tp3Multiplier),
          tp3Hit: false,
        };
        trades.push(activeTrade);
      } else {
        channel.endIndex = i;
      }
    }

    if (activeTrade && !activeTrade.tp3Hit) {
      activeTrade.endIndex = i;
      if (activeTrade.direction === "UP" && candles[i].high >= activeTrade.tp3) {
        activeTrade.tp3Hit = true;
      } else if (activeTrade.direction === "DOWN" && candles[i].low <= activeTrade.tp3) {
        activeTrade.tp3Hit = true;
      }
    }
  }

  return {
    channels,
    breakouts,
    trades,
  };
}

function buildADXVolatilityWaves(candles, config = {}) {
  const bbLength = config.bbLength ?? 20;
  const bbMult = config.bbMult ?? 1.5;
  const adxLength = config.adxLength ?? 14;
  const adxSmooth = config.adxSmooth ?? 14;
  const adxInfluence = config.adxInfluence ?? 0.8;
  const zoneOffset = config.zoneOffset ?? 1;
  const zoneExpansion = config.zoneExpansion ?? 1;
  const smoothLength = config.smoothLength ?? 50;
  const signalCooldown = config.signalCooldown ?? 20;

  if (!Array.isArray(candles) || candles.length < Math.max(60, smoothLength)) {
    return { topBands: [], bottomBands: [], signals: [] };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const bbBasis = simpleMovingAverage(closes, bbLength);
  const bbStd = rollingStdDev(closes, bbLength);

  const tr = candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  const plusDM = candles.map((candle, index) => {
    if (index === 0) return 0;
    const upMove = candle.high - highs[index - 1];
    const downMove = lows[index - 1] - candle.low;
    return upMove > downMove && upMove > 0 ? upMove : 0;
  });
  const minusDM = candles.map((candle, index) => {
    if (index === 0) return 0;
    const upMove = candle.high - highs[index - 1];
    const downMove = lows[index - 1] - candle.low;
    return downMove > upMove && downMove > 0 ? downMove : 0;
  });

  const trRma = rmaSeries(tr, adxLength);
  const plusRma = rmaSeries(plusDM, adxLength);
  const minusRma = rmaSeries(minusDM, adxLength);
  const diPlus = candles.map((_, index) => {
    const denom = trRma[index];
    return denom ? (100 * (plusRma[index] ?? 0)) / denom : null;
  });
  const diMinus = candles.map((_, index) => {
    const denom = trRma[index];
    return denom ? (100 * (minusRma[index] ?? 0)) / denom : null;
  });
  const dx = candles.map((_, index) => {
    const plus = diPlus[index];
    const minus = diMinus[index];
    if (!Number.isFinite(plus) || !Number.isFinite(minus) || plus + minus === 0) return null;
    return (100 * Math.abs(plus - minus)) / (plus + minus);
  });
  const adx = rmaSeries(dx.map((value) => value ?? 0), adxSmooth);

  const bbUpper = candles.map((_, index) => {
    if (!Number.isFinite(bbBasis[index]) || !Number.isFinite(bbStd[index])) return null;
    const adxNormalized = (adx[index] ?? 0) / 100;
    const adxMultiplier = 1 + (adxNormalized * adxInfluence);
    return bbBasis[index] + (bbMult * bbStd[index] * adxMultiplier);
  });
  const bbLower = candles.map((_, index) => {
    if (!Number.isFinite(bbBasis[index]) || !Number.isFinite(bbStd[index])) return null;
    const adxNormalized = (adx[index] ?? 0) / 100;
    const adxMultiplier = 1 + (adxNormalized * adxInfluence);
    return bbBasis[index] - (bbMult * bbStd[index] * adxMultiplier);
  });

  const bbUpperSmooth = simpleMovingAverage(bbUpper.map((value) => value ?? 0), smoothLength);
  const bbLowerSmooth = simpleMovingAverage(bbLower.map((value) => value ?? 0), smoothLength);
  const topBands = Array.from({ length: 11 }, () => new Array(candles.length).fill(null));
  const bottomBands = Array.from({ length: 11 }, () => new Array(candles.length).fill(null));
  const signals = [];
  let lastBuySignalBar = -999;
  let lastSellSignalBar = -999;

  for (let i = 0; i < candles.length; i += 1) {
    const upperSmooth = bbUpperSmooth[i];
    const lowerSmooth = bbLowerSmooth[i];
    if (!Number.isFinite(upperSmooth) || !Number.isFinite(lowerSmooth)) continue;
    const range = upperSmooth - lowerSmooth;
    const offsetDistance = range * zoneOffset;
    const topZoneBottom = upperSmooth + offsetDistance;
    const topZoneTop = topZoneBottom + (range * zoneExpansion);
    const bottomZoneTop = lowerSmooth - offsetDistance;
    const bottomZoneBottom = bottomZoneTop - (range * zoneExpansion);

    for (let level = 0; level <= 10; level += 1) {
      const ratio = level / 10;
      topBands[level][i] = topZoneBottom + ((topZoneTop - topZoneBottom) * ratio);
      bottomBands[level][i] = bottomZoneTop - ((bottomZoneTop - bottomZoneBottom) * ratio);
    }

    const priceInTopZone = closes[i] > topZoneBottom;
    const priceInBottomZone = closes[i] < bottomZoneTop;
    const prevPriceInTopZone = i > 0 && Number.isFinite(topBands[0][i - 1]) ? closes[i - 1] > topBands[0][i - 1] : false;
    const prevPriceInBottomZone = i > 0 && Number.isFinite(bottomBands[0][i - 1]) ? closes[i - 1] < bottomBands[0][i - 1] : false;

    const enterTopZone = priceInTopZone && !prevPriceInTopZone && (i - lastSellSignalBar >= signalCooldown);
    const enterBottomZone = priceInBottomZone && !prevPriceInBottomZone && (i - lastBuySignalBar >= signalCooldown);

    if (enterBottomZone) {
      lastBuySignalBar = i;
      signals.push({ index: i, entryIndex: i + 1 < candles.length ? i + 1 : null, type: "BUY" });
    }
    if (enterTopZone) {
      lastSellSignalBar = i;
      signals.push({ index: i, entryIndex: i + 1 < candles.length ? i + 1 : null, type: "SELL" });
    }
  }

  return {
    topBands,
    bottomBands,
    signals,
  };
}

function buildSMCProCombo(candles, config = {}) {
  const leftLen = config.leftLen ?? 5;
  const rightLen = config.rightLen ?? 5;
  const atrLen = config.atrLen ?? 14;
  const atrMult = config.atrMult ?? 0.1;
  const volLen = config.volLen ?? 20;
  const minBodyPct = config.minBodyPct ?? 55;
  const useAtrBuffer = config.useAtrBuffer ?? true;
  const useBodyFilter = config.useBodyFilter ?? true;

  if (!Array.isArray(candles) || candles.length < Math.max(30, leftLen + rightLen + 5)) {
    return {
      support: null,
      resistance: null,
      signals: [],
      board: null,
    };
  }

  const trueRanges = candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevClose),
      Math.abs(candle.low - prevClose),
    );
  });
  const atrValues = simpleMovingAverage(trueRanges, atrLen);
  const activityValues = candles.map((candle, index) => {
    const prevClose = candles[index - 1]?.close ?? candle.close;
    return ((candle.high - candle.low) + Math.abs(candle.close - prevClose)) * 1000;
  });
  const avgActivity = simpleMovingAverage(activityValues, volLen);

  let support = null;
  let resistance = null;
  const signals = [];
  const supportHistory = [];
  const resistanceHistory = [];
  const stats = {
    buy: { wins: 0, total: 0 },
    sell: { wins: 0, total: 0 },
  };

  for (let i = 0; i < candles.length; i += 1) {
    const pivotIndex = i - rightLen;
    if (pivotIndex >= leftLen && pivotIndex < candles.length - rightLen) {
      if (isPivotLowLR(candles, pivotIndex, leftLen, rightLen)) {
        support = {
          index: pivotIndex,
          confirmIndex: i,
          price: candles[pivotIndex].low,
          direction: "SUPPORT",
        };
        supportHistory.push(support);
      }
      if (isPivotHighLR(candles, pivotIndex, leftLen, rightLen)) {
        resistance = {
          index: pivotIndex,
          confirmIndex: i,
          price: candles[pivotIndex].high,
          direction: "RESISTANCE",
        };
        resistanceHistory.push(resistance);
      }
    }

    const candle = candles[i];
    const atr = atrValues[i] ?? 0;
    const buffer = useAtrBuffer ? atr * atrMult : 0;
    const range = Math.max(candle.high - candle.low, 0.0000001);
    const body = Math.abs(candle.close - candle.open);
    const bodyPct = (body / range) * 100;
    const bodyOK = !useBodyFilter || bodyPct >= minBodyPct;
    const highActivity = (activityValues[i] ?? 0) > (avgActivity[i] ?? Number.POSITIVE_INFINITY);

    const bullTrap = support
      && i > support.confirmIndex
      && candle.low < (support.price - buffer)
      && candle.close > support.price
      && candle.close > candle.open
      && bodyOK;

    const bearTrap = resistance
      && i > resistance.confirmIndex
      && candle.high > (resistance.price + buffer)
      && candle.close < resistance.price
      && candle.close < candle.open
      && bodyOK;

    if (bullTrap) {
      const entryIndex = i + 1 < candles.length ? i + 1 : null;
      const entryCandle = entryIndex != null ? candles[entryIndex] : null;
      const isWin = entryCandle ? entryCandle.close > entryCandle.open : null;
      if (entryCandle) {
        stats.buy.total += 1;
        if (isWin) stats.buy.wins += 1;
      }
      signals.push({
        index: i,
        entryIndex,
        type: highActivity ? "STRONG_BUY" : "WEAK_BUY",
        reference: support.price,
        levelIndex: support.index,
        confirmIndex: support.confirmIndex,
        bodyPct,
        result: isWin,
        buyStats: { ...stats.buy },
        sellStats: { ...stats.sell },
      });
    } else if (bearTrap) {
      const entryIndex = i + 1 < candles.length ? i + 1 : null;
      const entryCandle = entryIndex != null ? candles[entryIndex] : null;
      const isWin = entryCandle ? entryCandle.close < entryCandle.open : null;
      if (entryCandle) {
        stats.sell.total += 1;
        if (isWin) stats.sell.wins += 1;
      }
      signals.push({
        index: i,
        entryIndex,
        type: highActivity ? "STRONG_SELL" : "WEAK_SELL",
        reference: resistance.price,
        levelIndex: resistance.index,
        confirmIndex: resistance.confirmIndex,
        bodyPct,
        result: isWin,
        buyStats: { ...stats.buy },
        sellStats: { ...stats.sell },
      });
    }
  }

  const lastSignal = signals[signals.length - 1] ?? null;
  let board = null;
  if (lastSignal) {
    const barsAgo = (candles.length - 1) - lastSignal.index;
    if (lastSignal.type === "STRONG_BUY") {
      board = {
        title: "STRONG BUY",
        status: "BEAR TRAP",
        bias: "BULLISH",
        barsAgo,
        headerColor: "#006400",
        statusColor: "#00e676",
        lines: ["Sellers trapped", "Smart money in"],
      };
    } else if (lastSignal.type === "STRONG_SELL") {
      board = {
        title: "STRONG SELL",
        status: "BULL TRAP",
        bias: "BEARISH",
        barsAgo,
        headerColor: "#8b0000",
        statusColor: "#ff5252",
        lines: ["Buyers trapped", "Smart money rejection"],
      };
    } else if (lastSignal.type === "WEAK_BUY") {
      board = {
        title: "WEAK BUY",
        status: "BEAR TRAP",
        bias: "BULLISH",
        barsAgo,
        headerColor: "#355c7d",
        statusColor: "#6c8ebf",
        lines: ["Trap detected", "Low activity confirmation"],
      };
    } else {
      board = {
        title: "WEAK SELL",
        status: "BULL TRAP",
        bias: "BEARISH",
        barsAgo,
        headerColor: "#6b3e3e",
        statusColor: "#9a6666",
        lines: ["Trap detected", "Low activity confirmation"],
      };
    }
  } else {
    board = {
      title: "SMC SYSTEM",
      status: "WAITING...",
      bias: "NEUTRAL",
      barsAgo: null,
      headerColor: "#1e222d",
      statusColor: "#2a2e39",
      lines: ["System running", "Waiting for first signal"],
    };
  }

  return {
    support,
    resistance,
    supportHistory: supportHistory.slice(-4),
    resistanceHistory: resistanceHistory.slice(-4),
    signals,
    stats,
    board,
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
    time: Date.now(),
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

function updateFrameSignalUI(signalState) {
  if (!phoneEl) return;
  phoneEl.classList.remove("frame-neutral", "frame-buy", "frame-sell");

  const hasBuySignal = signalState?.tradeDirection === "CALL" && typeof signalState?.signal === "string" && signalState.signal !== "--";
  const hasSellSignal = signalState?.tradeDirection === "PUT" && typeof signalState?.signal === "string" && signalState.signal !== "--";

  if (hasBuySignal) {
    phoneEl.classList.add("frame-buy");
    return;
  }
  if (hasSellSignal) {
    phoneEl.classList.add("frame-sell");
    return;
  }
  phoneEl.classList.add("frame-neutral");
}

function updateVisibleCandleCountUI(blueCount, whiteCount) {
  if (sigBlueEl) sigBlueEl.textContent = Number.isFinite(blueCount) ? String(blueCount) : "--";
  if (sigWhiteEl) sigWhiteEl.textContent = Number.isFinite(whiteCount) ? String(whiteCount) : "--";
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
  updateFrameSignalUI(lastSignalState);
  lastSweepState = getLiquidityPanelState(allCandles);
  if (sigRejectEl) sigRejectEl.textContent = lastSweepState.rejection || "--";
  if (sigEntryEl) sigEntryEl.textContent = lastSweepState.entry || "--";
  if (sigLevelEl) sigLevelEl.textContent = lastSweepState.level || "--";
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
  if (!candles.length) {
    updateVisibleCandleCountUI(null, null);
    return;
  }

  const maxOffset = Math.max(0, candles.length - chartPoints);
  chartOffset = Math.max(0, Math.min(chartOffset, maxOffset));
  const end = candles.length - chartOffset;
  const start = Math.max(0, end - chartPoints);
  const points = candles.slice(start, end);
  if (!points.length) {
    updateVisibleCandleCountUI(null, null);
    return;
  }
  const barrierOffset = Number(barrierInput?.value || "0");
  let blueCount = 0;
  let whiteCount = 0;
  points.forEach((candle) => {
    const bodySize = Math.abs(candle.close - candle.open);
    const isLarge = barrierOffset > 0 && bodySize >= barrierOffset;
    if (!isLarge) return;
    if (candle.close >= candle.open) blueCount += 1;
    else whiteCount += 1;
  });
  updateVisibleCandleCountUI(blueCount, whiteCount);
  const lows = points.map((c) => c.low);
  const highs = points.map((c) => c.high);
  const rawMin = Math.min(...lows);
  const rawMax = Math.max(...highs);
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

  const range = rawMax - rawMin;
  if (range === 0) return;
  const min = rawMin + chartVerticalOffset;
  const max = rawMax + chartVerticalOffset;
  // Candlesticks
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;
  const candleGap = 2;
  const candleW = Math.max(2, Math.floor(plotW / points.length) - candleGap);
  const slotW = plotW / points.length;
  const toY = (price) => height - bottomPad - ((price - min) / (max - min)) * plotH;

  const hasICTKillzones = activeChartIndicators.has("ICT_KILLZONES");
  const hasICTFVG = activeChartIndicators.has("ICT_FVG");
  const hasICTBPR = activeChartIndicators.has("ICT_BPR");
  const hasICTOB = activeChartIndicators.has("ICT_OB");
  const hasICTStructure = activeChartIndicators.has("ICT_STRUCTURE");
  const hasICTFib = activeChartIndicators.has("ICT_FIB");
  const hasICTLiquidity = activeChartIndicators.has("ICT_LIQUIDITY");
  const hasAnyICT = hasICTKillzones || hasICTFVG || hasICTBPR || hasICTOB || hasICTStructure || hasICTFib || hasICTLiquidity;
  const hasSMCSetup08 = activeChartIndicators.has("SMC_SETUP_08");
  const hasSMCProCombo = activeChartIndicators.has("SMC_PRO_COMBO");
  const hasADXVolWaves = activeChartIndicators.has("ADX_VOL_WAVES");
  const hasBreakoutTargets = activeChartIndicators.has("BREAKOUT_TARGETS");
  const hasDynamicZDivergence = activeChartIndicators.has("DYNAMIC_Z_DIVERGENCE");
  const hasVolumeProfileNodes = activeChartIndicators.has("VOLUME_PROFILE_NODES");
  const hasLiquidityTrendline = activeChartIndicators.has("LIQUIDITY_TRENDLINE");

  if (hasICTKillzones) {
    const killzones = buildICTKillzones(points, start);
    killzones.forEach((segment) => {
      const localStart = segment.startIndex - start;
      const localEnd = segment.endIndex - start;
      const x = leftPad + (localStart * slotW);
      const w = Math.max(slotW, (localEnd - localStart + 1) * slotW);
      ctx.save();
      ctx.fillStyle = segment.color;
      ctx.fillRect(x, topPad, w, plotH);
      ctx.restore();
    });
  }

  points.forEach((c, i) => {
    const x = leftPad + i * slotW + candleGap / 2;
    const openY = toY(c.open);
    const closeY = toY(c.close);
    const highY = toY(c.high);
    const lowY = toY(c.low);
    const up = c.close >= c.open;
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

  if (activeChartIndicators.has("EMA")) {
    const emaValues = calculateChartEMA(points, 9);
    ctx.save();
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    emaValues.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const x = leftPad + index * slotW + (slotW / 2);
      const y = toY(value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (started) ctx.stroke();
    ctx.restore();
  }

  if (hasAnyICT) {
    const structure = buildICTStructureAnalysis(candles);
    const fvgs = buildICTFVGs(candles);
    const orderBlocks = buildICTOrderBlocks(candles, structure.events);
    const fib = buildICTFibLevels(structure.events);

    if (hasICTFVG) {
      [...fvgs.bullish, ...fvgs.bearish].forEach((zone) => {
        const localStart = Math.max(0, zone.startIndex - start);
        const localEnd = Math.min(points.length - 1, zone.drawEndIndex - start);
        if (localEnd < 0 || localStart > points.length - 1) return;
        const x = leftPad + (localStart * slotW);
        const w = Math.max(slotW, (localEnd - localStart + 1) * slotW);
        ctx.save();
        ctx.fillStyle = zone.direction === "UP" ? "rgba(13, 183, 135, 0.12)" : "rgba(225, 91, 100, 0.12)";
        ctx.strokeStyle = zone.direction === "UP" ? "rgba(13, 183, 135, 0.35)" : "rgba(225, 91, 100, 0.35)";
        ctx.lineWidth = 1;
        const topY = toY(zone.top);
        const bottomY = toY(zone.bottom);
        ctx.fillRect(x, topY, w, Math.max(2, bottomY - topY));
        ctx.strokeRect(x, topY, w, Math.max(2, bottomY - topY));
        const ceY = toY((zone.top + zone.bottom) / 2);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, ceY);
        ctx.lineTo(x + w, ceY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    if (hasICTBPR) {
      fvgs.bprs.forEach((zone) => {
        const localStart = Math.max(0, zone.startIndex - start);
        const localEnd = Math.min(points.length - 1, zone.endIndex - start);
        if (localEnd < 0 || localStart > points.length - 1) return;
        const x = leftPad + (localStart * slotW);
        const w = Math.max(slotW, (localEnd - localStart + 1) * slotW);
        ctx.save();
        ctx.fillStyle = "rgba(155, 89, 182, 0.12)";
        ctx.strokeStyle = "rgba(155, 89, 182, 0.35)";
        const topY = toY(zone.top);
        const bottomY = toY(zone.bottom);
        ctx.fillRect(x, topY, w, Math.max(2, bottomY - topY));
        ctx.strokeRect(x, topY, w, Math.max(2, bottomY - topY));
        ctx.fillStyle = "#c39bd3";
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("BPR", x + 3, topY + 2);
        ctx.restore();
      });
    }

    if (hasICTOB) {
      [...orderBlocks.bullish, ...orderBlocks.bearish].forEach((zone) => {
        const localIndex = zone.index - start;
        const localEnd = zone.drawEndIndex - start;
        if (localEnd < 0 || localIndex > points.length - 1) return;
        const x = leftPad + (Math.max(0, localIndex) * slotW);
        const w = Math.max(slotW, ((Math.min(points.length - 1, localEnd) - Math.max(0, localIndex)) + 1) * slotW);
        ctx.save();
        ctx.fillStyle = zone.direction === "UP" ? "rgba(45, 140, 255, 0.10)" : "rgba(242, 242, 233, 0.10)";
        ctx.strokeStyle = zone.direction === "UP" ? "rgba(45, 140, 255, 0.30)" : "rgba(242, 242, 233, 0.25)";
        const topY = toY(zone.top);
        const bottomY = toY(zone.bottom);
        ctx.fillRect(x, topY, w, Math.max(2, bottomY - topY));
        ctx.strokeRect(x, topY, w, Math.max(2, bottomY - topY));
        const midY = toY((zone.top + zone.bottom) / 2);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x + w, midY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = zone.direction === "UP" ? "#5ca8ff" : "#d6d6ce";
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(zone.direction === "UP" ? "Bull OB" : "Bear OB", x + 3, topY + 2);
        ctx.restore();
      });
    }

    if (hasICTStructure) {
      structure.events.slice(-8).forEach((event) => {
        if (event.breakIndex < start || event.pivotIndex > end - 1) return;
        const x1 = leftPad + ((event.pivotIndex - start) * slotW) + (slotW / 2);
        const x2 = leftPad + ((Math.min(end - 1, event.breakIndex) - start) * slotW) + (slotW / 2);
        const y = toY(event.pivotPrice);
        const color = event.direction === "UP" ? "#0db787" : "#e15b64";
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        if (event.type === "MSS") ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(event.type, (x1 + x2) / 2, y - 3);
        ctx.restore();
      });
    }

    if (hasICTFib && fib?.levels?.length) {
      const fibStartX = leftPad + (Math.max(0, fib.startIndex - start) * slotW);
      const fibEndX = leftPad + ((Math.min(end - 1, fib.endIndex ?? (candles.length - 1)) - start) * slotW) + slotW;
      fib.levels.forEach((level) => {
        const y = toY(level.price);
        if (!Number.isFinite(y)) return;
        ctx.save();
        ctx.strokeStyle = level.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(fibStartX, y);
        ctx.lineTo(Math.max(fibStartX + slotW, fibEndX), y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = level.color;
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(level.label, Math.max(fibStartX + 4, fibEndX + 4), y);
        ctx.restore();
      });
    }

    if (hasICTLiquidity) {
      const visibleSweepEvents = [];
      for (let globalIndex = start; globalIndex < end; globalIndex += 1) {
        const event = detectLiquiditySweepEvent(candles, globalIndex);
        if (event) visibleSweepEvents.push(event);
      }

      visibleSweepEvents.slice(-6).forEach((event) => {
        const visibleIndex = event.candleIndex - start;
        if (visibleIndex < 0 || visibleIndex >= points.length) return;
        const x = leftPad + visibleIndex * slotW + candleGap / 2;
        const centerX = x + candleW / 2;
        const refY = toY(event.referenceLevel);
        const extremeY = toY(event.extremeLevel);
        const isBuySweep = event.sweepType === "BUY";
        const sweepColor = isBuySweep ? "#2d8cff" : "#e15b64";
        const fillColor = isBuySweep ? "rgba(45, 140, 255, 0.18)" : "rgba(225, 91, 100, 0.18)";
        const lineHalf = Math.max(10, slotW * 0.8);

        ctx.save();
        ctx.strokeStyle = sweepColor;
        ctx.fillStyle = fillColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(leftPad, centerX - lineHalf), refY);
        ctx.lineTo(Math.min(width - rightPad, centerX + lineHalf), refY);
        ctx.stroke();
        ctx.setLineDash([]);

        const topY = Math.min(refY, extremeY);
        const zoneH = Math.max(3, Math.abs(refY - extremeY));
        ctx.fillRect(centerX - Math.max(3, candleW * 0.35), topY, Math.max(6, candleW * 0.7), zoneH);

        ctx.fillStyle = sweepColor;
        ctx.beginPath();
        if (isBuySweep) {
          ctx.moveTo(centerX, extremeY + 1);
          ctx.lineTo(centerX - 4, extremeY + 7);
          ctx.lineTo(centerX + 4, extremeY + 7);
        } else {
          ctx.moveTo(centerX, extremeY - 1);
          ctx.lineTo(centerX - 4, extremeY - 7);
          ctx.lineTo(centerX + 4, extremeY - 7);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sweepColor;
        ctx.font = "9px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = isBuySweep ? "top" : "bottom";
        ctx.fillText(event.liquidityLabel, centerX, isBuySweep ? extremeY + 9 : extremeY - 9);
        ctx.restore();
      });
    }
  }

  if (hasSMCSetup08) {
    const smc = buildSMCSetup08(candles, 5);
    [...smc.bullish, ...smc.bearish].forEach((setup) => {
      const isBull = setup.direction === "BULL";
      const swingX1 = leftPad + ((Math.max(start, setup.swingIndex) - start) * slotW) + (slotW / 2);
      const swingX2 = leftPad + ((Math.min(end - 1, setup.poiIndex) - start) * slotW) + (slotW / 2);
      const swingY = toY(setup.swingPrice);
      const chochX1 = leftPad + ((Math.max(start, setup.levelIndex) - start) * slotW) + (slotW / 2);
      const chochX2 = leftPad + ((Math.min(end - 1, setup.levelBreakIndex ?? setup.poiIndex) - start) * slotW) + (slotW / 2);
      const chochY = toY(setup.levelPrice);
      const poiStart = Math.max(0, setup.poiIndex - start);
      const poiEnd = Math.max(poiStart, Math.min(points.length - 1, (setup.poiFillIndex ?? setup.poiIndex) - start));
      const poiX = leftPad + (poiStart * slotW);
      const poiW = Math.max(slotW, (poiEnd - poiStart + 1) * slotW);
      const poiTopY = toY(setup.poiTop);
      const poiBottomY = toY(setup.poiBottom);
      const color = isBull ? "#5be660" : "#e65b5b";
      const zoneColor = isBull ? "rgba(80, 159, 255, 0.18)" : "rgba(255, 235, 80, 0.18)";

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(swingX1, swingY);
      ctx.lineTo(swingX2, swingY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(chochX1, chochY);
      ctx.lineTo(chochX2, chochY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(isBull ? "SSL" : "BSL", (swingX1 + swingX2) / 2, swingY - 3);
      ctx.fillText("ChoCh", (chochX1 + chochX2) / 2, chochY - 3);

      ctx.fillStyle = zoneColor;
      ctx.strokeStyle = isBull ? "#509fff" : "#ffeb50";
      ctx.fillRect(poiX, poiTopY, poiW, Math.max(2, poiBottomY - poiTopY));
      ctx.strokeRect(poiX, poiTopY, poiW, Math.max(2, poiBottomY - poiTopY));
      ctx.fillStyle = "#dadada";
      ctx.textBaseline = "middle";
      ctx.fillText("POI", poiX + (poiW / 2), (poiTopY + poiBottomY) / 2);

      if (setup.fvg) {
        const fvgStart = Math.max(0, setup.fvg.index - start);
        const fvgEnd = Math.max(fvgStart, Math.min(points.length - 1, (setup.triggerIndex ?? setup.fvg.index) - start));
        const fvgX = leftPad + (fvgStart * slotW);
        const fvgW = Math.max(slotW, (fvgEnd - fvgStart + 1) * slotW);
        const fvgTopY = toY(setup.fvg.top);
        const fvgBottomY = toY(setup.fvg.bottom);
        ctx.strokeStyle = isBull ? "#68ff6d" : "#ff6868";
        ctx.fillStyle = isBull ? "rgba(104, 255, 109, 0.14)" : "rgba(255, 104, 104, 0.14)";
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(fvgX, fvgTopY, fvgW, Math.max(2, fvgBottomY - fvgTopY));
        ctx.setLineDash([]);
        ctx.fillRect(fvgX, fvgTopY, fvgW, Math.max(2, fvgBottomY - fvgTopY));
        ctx.fillStyle = "#dadada";
        ctx.fillText("Imbalance", fvgX + (fvgW / 2), (fvgTopY + fvgBottomY) / 2);
      }

      const setupEntryIndex = setup.triggerIndex != null && setup.triggerIndex + 1 < candles.length
        ? setup.triggerIndex + 1
        : setup.triggerIndex;
      if (setupEntryIndex != null && setupEntryIndex >= start && setupEntryIndex < end) {
        const triggerX = leftPad + ((setupEntryIndex - start) * slotW) + (slotW / 2);
        const triggerY = isBull ? toY(candles[setupEntryIndex].low) + 10 : toY(candles[setupEntryIndex].high) - 10;
        ctx.fillStyle = isBull ? "#5be660" : "#e65b5b";
        ctx.beginPath();
        if (isBull) {
          ctx.moveTo(triggerX, triggerY - 6);
          ctx.lineTo(triggerX - 5, triggerY + 4);
          ctx.lineTo(triggerX + 5, triggerY + 4);
        } else {
          ctx.moveTo(triggerX, triggerY + 6);
          ctx.lineTo(triggerX - 5, triggerY - 4);
          ctx.lineTo(triggerX + 5, triggerY - 4);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });
  }

  if (hasSMCProCombo) {
    const smc = buildSMCProCombo(candles, {
      leftLen: 5,
      rightLen: 5,
      atrLen: 14,
      atrMult: 0.1,
      volLen: 20,
      minBodyPct: 55,
      useAtrBuffer: true,
      useBodyFilter: true,
    });

    const drawLevel = (level, color, label) => {
      if (!level) return;
      const localStart = Math.max(0, level.index - start);
      const x1 = leftPad + (localStart * slotW) + (slotW / 2);
      const x2 = width - rightPad;
      const y = toY(level.price);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, Math.min(x1 + 4, x2 - 24), y - 3);
      ctx.restore();
    };

    drawLevel(smc.support, "rgba(88, 156, 255, 0.88)", "Support");
    drawLevel(smc.resistance, "rgba(231, 91, 100, 0.88)", "Resistance");

    smc.signals.forEach((signal) => {
      if (signal.entryIndex == null || signal.entryIndex < start || signal.entryIndex >= end) return;
      const visibleIndex = signal.entryIndex - start;
      const candle = candles[signal.entryIndex];
      const x = leftPad + visibleIndex * slotW + candleGap / 2;
      const centerX = x + candleW / 2;
      const isBuy = signal.type.endsWith("BUY");
      const isStrong = signal.type.startsWith("STRONG");
      const markerColor = isBuy
        ? (isStrong ? "#20d07a" : "#9aa7b8")
        : (isStrong ? "#ff5b6b" : "#9aa7b8");
      const refY = toY(signal.reference);
      const wickY = isBuy ? toY(candle.low) : toY(candle.high);
      const bodyTopY = toY(Math.max(candle.open, candle.close));
      const bodyBottomY = toY(Math.min(candle.open, candle.close));
      const topY = Math.min(refY, wickY);
      const zoneH = Math.max(3, Math.abs(refY - wickY));

      ctx.save();
      ctx.fillStyle = isStrong
        ? (isBuy ? "rgba(32, 208, 122, 0.10)" : "rgba(255, 91, 107, 0.10)")
        : "rgba(154, 167, 184, 0.08)";
      ctx.fillRect(x - 1, topY, candleW + 2, zoneH);

      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 1;
      ctx.setLineDash(isStrong ? [4, 2] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.max(leftPad, centerX - 10), refY);
      ctx.lineTo(Math.min(width - rightPad, centerX + 10), refY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = markerColor;
      ctx.beginPath();
      if (isBuy) {
        const triangleY = bodyBottomY + 10;
        ctx.moveTo(centerX, triangleY - 7);
        ctx.lineTo(centerX - 5, triangleY + 3);
        ctx.lineTo(centerX + 5, triangleY + 3);
      } else {
        const triangleY = bodyTopY - 10;
        ctx.moveTo(centerX, triangleY + 7);
        ctx.lineTo(centerX - 5, triangleY - 3);
        ctx.lineTo(centerX + 5, triangleY - 3);
      }
      ctx.closePath();
      ctx.fill();

      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = isBuy ? "bottom" : "top";
      const textY = isBuy ? bodyBottomY + 1 : bodyTopY - 1;
      ctx.fillText(
        isStrong ? (isBuy ? "SM BUY" : "SM SELL") : (isBuy ? "Weak Buy" : "Weak Sell"),
        centerX,
        textY,
      );
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#c4ccd7";
    ctx.font = "9px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`B ${smc.stats.buy.wins}/${smc.stats.buy.total}`, leftPad + 4, topPad + 4);
    ctx.fillText(`S ${smc.stats.sell.wins}/${smc.stats.sell.total}`, leftPad + 4, topPad + 16);
    ctx.restore();

  }

  if (hasADXVolWaves) {
    const waves = buildADXVolatilityWaves(candles, {
      bbLength: 20,
      bbMult: 1.5,
      adxLength: 14,
      adxSmooth: 14,
      adxInfluence: 0.8,
      zoneOffset: 1,
      zoneExpansion: 1,
      smoothLength: 50,
      signalCooldown: 20,
    });
    const topColors = [
      "rgba(255, 229, 229, 0.20)",
      "rgba(255, 204, 204, 0.22)",
      "rgba(255, 179, 179, 0.24)",
      "rgba(255, 153, 153, 0.26)",
      "rgba(255, 128, 128, 0.28)",
      "rgba(255, 102, 102, 0.30)",
      "rgba(255, 77, 77, 0.32)",
      "rgba(255, 51, 51, 0.34)",
      "rgba(255, 26, 26, 0.36)",
      "rgba(255, 0, 0, 0.38)",
    ];
    const bottomColors = [
      "rgba(229, 255, 229, 0.20)",
      "rgba(204, 255, 204, 0.22)",
      "rgba(179, 255, 179, 0.24)",
      "rgba(153, 255, 153, 0.26)",
      "rgba(128, 255, 128, 0.28)",
      "rgba(102, 255, 102, 0.30)",
      "rgba(77, 255, 77, 0.32)",
      "rgba(51, 255, 51, 0.34)",
      "rgba(26, 255, 26, 0.36)",
      "rgba(0, 255, 0, 0.38)",
    ];
    const drawBandFill = (lowerSeries, upperSeries, color) => {
      ctx.save();
      ctx.fillStyle = color;
      for (let i = start; i < end; i += 1) {
        const lowerA = lowerSeries[i];
        const upperA = upperSeries[i];
        const lowerB = i + 1 < candles.length ? lowerSeries[i + 1] : null;
        const upperB = i + 1 < candles.length ? upperSeries[i + 1] : null;
        if (![lowerA, upperA, lowerB, upperB].every(Number.isFinite)) continue;
        const x1 = leftPad + ((i - start) * slotW);
        const x2 = leftPad + ((i - start + 1) * slotW);
        ctx.beginPath();
        ctx.moveTo(x1, toY(upperA));
        ctx.lineTo(x2, toY(upperB));
        ctx.lineTo(x2, toY(lowerB));
        ctx.lineTo(x1, toY(lowerA));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    for (let band = 0; band < 10; band += 1) {
      drawBandFill(waves.topBands[band], waves.topBands[band + 1], topColors[band]);
      drawBandFill(waves.bottomBands[band + 1], waves.bottomBands[band], bottomColors[band]);
    }

    waves.signals.forEach((signal) => {
      if (signal.entryIndex == null || signal.entryIndex < start || signal.entryIndex >= end) return;
      const visibleIndex = signal.entryIndex - start;
      const candle = candles[signal.entryIndex];
      const centerX = leftPad + (visibleIndex * slotW) + (slotW / 2);
      const isBuy = signal.type === "BUY";
      const anchorY = isBuy ? toY(candle.low) : toY(candle.high);
      const labelY = isBuy ? anchorY + 14 : anchorY - 14;
      const bg = isBuy ? "#00ff88" : "#ff3366";
      const fg = isBuy ? "#111111" : "#ffffff";

      ctx.save();
      ctx.font = "bold 8px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = signal.type;
      const textW = ctx.measureText(text).width;
      const boxW = textW + 10;
      const boxH = 14;
      const boxX = centerX - (boxW / 2);
      const boxY = isBuy ? labelY : labelY - boxH;
      ctx.fillStyle = bg;
      ctx.strokeStyle = bg;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(centerX, isBuy ? boxY : boxY + boxH);
      ctx.lineTo(centerX, isBuy ? anchorY + 2 : anchorY - 2);
      ctx.stroke();
      ctx.beginPath();
      if (isBuy) {
        ctx.moveTo(centerX, anchorY + 2);
        ctx.lineTo(centerX - 4, anchorY + 8);
        ctx.lineTo(centerX + 4, anchorY + 8);
      } else {
        ctx.moveTo(centerX, anchorY - 2);
        ctx.lineTo(centerX - 4, anchorY - 8);
        ctx.lineTo(centerX + 4, anchorY - 8);
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.fillText(text, centerX, boxY + (boxH / 2));
      ctx.restore();
    });
  }

  if (hasBreakoutTargets) {
    const breakout = buildBreakoutTargets(candles, {
      len: 99,
      preventOverlap: true,
      atrPeriod: 14,
      slMultiplier: 5,
      tp1Multiplier: 0.5,
      tp2Multiplier: 1.0,
      tp3Multiplier: 1.5,
    });

    breakout.channels.slice(-6).forEach((channel) => {
      const localStart = Math.max(0, channel.startIndex - start);
      const localEnd = Math.min(points.length - 1, channel.endIndex - start);
      if (localEnd < 0 || localStart > points.length - 1) return;
      const x = leftPad + (localStart * slotW);
      const w = Math.max(slotW, (localEnd - localStart + 1) * slotW);
      const topY = toY(channel.top);
      const bottomY = toY(channel.bottom);
      const upperBandY = toY(channel.upperBandBottom);
      const lowerBandY = toY(channel.lowerBandTop);
      const centerY = toY((channel.top + channel.bottom) / 2);

      ctx.save();
      ctx.fillStyle = "rgba(200, 205, 214, 0.10)";
      ctx.fillRect(x, topY, w, Math.max(2, bottomY - topY));
      ctx.fillStyle = "rgba(255, 17, 0, 0.18)";
      ctx.fillRect(x, topY, w, Math.max(2, upperBandY - topY));
      ctx.fillStyle = "rgba(0, 255, 187, 0.18)";
      ctx.fillRect(x, lowerBandY, w, Math.max(2, bottomY - lowerBandY));
      ctx.strokeStyle = "rgba(200, 205, 214, 0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, topY, w, Math.max(2, bottomY - topY));
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x + w, centerY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    breakout.breakouts.forEach((event) => {
      const renderIndex = event.entryIndex ?? event.index;
      if (renderIndex < start || renderIndex >= end) return;
      const centerX = leftPad + ((renderIndex - start) * slotW) + (slotW / 2);
      const y = toY(event.price);
      const isBull = event.direction === "UP";
      ctx.save();
      ctx.fillStyle = isBull ? "#00ffbb" : "#ff1100";
      ctx.font = "bold 10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isBull ? "▲" : "▼", centerX, y);
      ctx.restore();
    });

    breakout.trades.slice(-3).forEach((trade) => {
      const localStart = Math.max(0, trade.startIndex - start);
      const localEnd = Math.min(points.length - 1, trade.endIndex - start);
      if (localEnd < 0 || localStart > points.length - 1) return;
      const x1 = leftPad + (localStart * slotW);
      const x2 = leftPad + ((localEnd + 1) * slotW);
      const levels = [
        { key: "entry", value: trade.entry, color: trade.direction === "UP" ? "#00ffbb" : "#ff1100", label: "Entry" },
        { key: "sl", value: trade.sl, color: "rgba(255, 17, 0, 0.75)", label: "SL" },
        { key: "tp1", value: trade.tp1, color: "rgba(0, 255, 187, 0.50)", label: "TP1" },
        { key: "tp2", value: trade.tp2, color: "rgba(0, 255, 187, 0.65)", label: "TP2" },
        { key: "tp3", value: trade.tp3, color: "rgba(0, 255, 187, 0.85)", label: "TP3" },
      ];

      ctx.save();
      levels.forEach((level) => {
        const y = toY(level.value);
        ctx.strokeStyle = level.color;
        ctx.lineWidth = level.key === "entry" ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.fillStyle = level.color;
        ctx.font = "8px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(level.label, Math.min(width - rightPad + 4, x2 + 4), y);
      });
      ctx.fillStyle = trade.direction === "UP" ? "rgba(0, 255, 187, 0.06)" : "rgba(255, 17, 0, 0.06)";
      const topFill = toY(Math.max(trade.entry, trade.sl, trade.tp3));
      const bottomFill = toY(Math.min(trade.entry, trade.sl, trade.tp3));
      ctx.fillRect(x1, Math.min(topFill, bottomFill), Math.max(2, x2 - x1), Math.max(2, Math.abs(bottomFill - topFill)));
      ctx.restore();
    });
  }

  if (hasDynamicZDivergence) {
    const dzd = buildDynamicZDivergence(candles, {
      lenZ: 100,
      smoothLen: 10,
      slopeIndex: 1,
      lookbackLeft: 15,
      lookbackRight: 1,
      rangeMin: 5,
      rangeMax: 60,
      saRsiLen: 21,
      saZLen: 200,
      saBaseLen: 80,
      saIntensity: 0.15,
      saSlopeIndex: 1,
      saBandAtrLen: 14,
      saBandMult: 1.4,
    });

    const drawSeries = (values, colors, widthPx = 1.5) => {
      ctx.save();
      ctx.lineWidth = widthPx;
      let started = false;
      for (let i = start; i < end; i += 1) {
        const value = values[i];
        if (!Number.isFinite(value)) {
          started = false;
          continue;
        }
        const x = leftPad + ((i - start) * slotW) + (slotW / 2);
        const y = toY(value);
        ctx.strokeStyle = Array.isArray(colors) ? (colors[i] || "#9aa7b8") : colors;
        if (!started) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        const nextValue = i + 1 < end ? values[i + 1] : null;
        if (!Number.isFinite(nextValue)) {
          ctx.stroke();
          started = false;
        }
      }
      if (started) ctx.stroke();
      ctx.restore();
    };

    ctx.save();
    for (let i = start; i < end - 1; i += 1) {
      const mainA = dzd.saema[i];
      const mainB = dzd.saema[i + 1];
      const upperA = dzd.saUpper[i];
      const upperB = dzd.saUpper[i + 1];
      const lowerA = dzd.saLower[i];
      const lowerB = dzd.saLower[i + 1];
      const bullSlope = dzd.saColor[i] === "#00fec3";
      const bearSlope = dzd.saColor[i] === "#e600ff";
      const x1 = leftPad + ((i - start) * slotW) + (slotW / 2);
      const x2 = leftPad + ((i - start + 1) * slotW) + (slotW / 2);

      if (bullSlope && [mainA, mainB, lowerA, lowerB].every(Number.isFinite)) {
        ctx.fillStyle = "rgba(0, 254, 195, 0.14)";
        ctx.beginPath();
        ctx.moveTo(x1, toY(mainA));
        ctx.lineTo(x2, toY(mainB));
        ctx.lineTo(x2, toY(lowerB));
        ctx.lineTo(x1, toY(lowerA));
        ctx.closePath();
        ctx.fill();
      }
      if (bearSlope && [mainA, mainB, upperA, upperB].every(Number.isFinite)) {
        ctx.fillStyle = "rgba(230, 0, 255, 0.14)";
        ctx.beginPath();
        ctx.moveTo(x1, toY(mainA));
        ctx.lineTo(x2, toY(mainB));
        ctx.lineTo(x2, toY(upperB));
        ctx.lineTo(x1, toY(upperA));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    drawSeries(dzd.saUpper, dzd.saColor.map((c) => c === "#e600ff" ? "#e600ff" : "rgba(230,0,255,0.15)"), 1);
    drawSeries(dzd.saLower, dzd.saColor.map((c) => c === "#00fec3" ? "#00fec3" : "rgba(0,254,195,0.15)"), 1);
    drawSeries(dzd.saema, dzd.saColor, 1.6);

    dzd.buySignals.forEach((signal) => {
      if (signal.entryIndex == null || signal.entryIndex < start || signal.entryIndex >= end) return;
      const x = leftPad + ((signal.entryIndex - start) * slotW) + (slotW / 2);
      const y = toY(candles[signal.entryIndex].low) + 10;
      ctx.save();
      ctx.fillStyle = "#00fec3";
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x - 5, y + 3);
      ctx.lineTo(x + 5, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("✘", x, y - 8);
      ctx.restore();
    });

    dzd.sellSignals.forEach((signal) => {
      if (signal.entryIndex == null || signal.entryIndex < start || signal.entryIndex >= end) return;
      const x = leftPad + ((signal.entryIndex - start) * slotW) + (slotW / 2);
      const y = toY(candles[signal.entryIndex].high) - 10;
      ctx.save();
      ctx.fillStyle = "#e600ff";
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x - 5, y - 3);
      ctx.lineTo(x + 5, y - 3);
      ctx.closePath();
      ctx.fill();
      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("✘", x, y + 8);
      ctx.restore();
    });

    dzd.bullDivs.forEach((div) => {
      if (div.entryIndex == null || div.entryIndex < start || div.entryIndex >= end) return;
      const x = leftPad + ((div.entryIndex - start) * slotW) + (slotW / 2);
      const y = toY(candles[div.entryIndex].low) + 20;
      ctx.save();
      ctx.fillStyle = "#5cf0d7";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Up", x, y);
      ctx.restore();
    });

    dzd.bearDivs.forEach((div) => {
      if (div.entryIndex == null || div.entryIndex < start || div.entryIndex >= end) return;
      const x = leftPad + ((div.entryIndex - start) * slotW) + (slotW / 2);
      const y = toY(candles[div.entryIndex].high) - 20;
      ctx.save();
      ctx.fillStyle = "#b32ac3";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Down", x, y);
      ctx.restore();
    });
  }

  if (hasVolumeProfileNodes) {
    const vp = buildVolumeProfileNodes(candles, {
      profileLength: 360,
      rows: 60,
      valueAreaThreshold: 0.7,
      peakPercent: 0.09,
      troughPercent: 0.07,
      thresholdPercent: 0.01,
      highestCount: 2,
      lowestCount: 2,
    });

    if (vp.rows.length && vp.maxVolume > 0) {
      const profileWidth = Math.max(36, Math.floor((width - rightPad - leftPad) * 0.18));
      const profileRight = width - rightPad - 4;
      const profileLeft = profileRight - profileWidth;

      vp.rows.forEach((row) => {
        const rowTopY = toY(row.top);
        const rowBottomY = toY(row.bottom);
        const rowH = Math.max(1, rowBottomY - rowTopY);
        const bullWidth = Math.max(0, Math.round((row.bullish / vp.maxVolume) * profileWidth));
        const bearWidth = Math.max(0, Math.round((row.bearish / vp.maxVolume) * profileWidth));
        const totalWidth = Math.max(1, Math.round((row.total / vp.maxVolume) * profileWidth));
        const inValueArea = vp.valIndex != null && vp.vahIndex != null && row.index >= vp.valIndex && row.index <= vp.vahIndex;

        ctx.save();
        if (inValueArea) {
          ctx.fillStyle = "rgba(41, 98, 255, 0.10)";
          ctx.fillRect(profileLeft, rowTopY, profileWidth, rowH);
        }
        ctx.fillStyle = row.index === vp.pocIndex
          ? "rgba(251, 192, 45, 0.38)"
          : row.peak
            ? "rgba(0, 123, 255, 0.25)"
            : row.trough
              ? "rgba(120, 120, 120, 0.18)"
              : "rgba(93, 96, 107, 0.14)";
        ctx.fillRect(profileRight - totalWidth, rowTopY, totalWidth, rowH);

        if (bullWidth > 0) {
          ctx.fillStyle = inValueArea ? "rgba(41, 98, 255, 0.28)" : "rgba(93, 96, 107, 0.24)";
          ctx.fillRect(profileRight - bullWidth, rowTopY, bullWidth, rowH);
        }
        if (bearWidth > 0) {
          ctx.fillStyle = inValueArea ? "rgba(251, 192, 45, 0.26)" : "rgba(209, 212, 220, 0.20)";
          ctx.fillRect(profileRight - totalWidth, rowTopY, Math.min(totalWidth, bearWidth), rowH);
        }

        if (row.highest) {
          ctx.fillStyle = "rgba(255, 165, 0, 0.18)";
          ctx.fillRect(profileLeft, rowTopY, profileWidth, rowH);
        }
        if (row.lowest) {
          ctx.fillStyle = "rgba(0, 0, 128, 0.16)";
          ctx.fillRect(profileLeft, rowTopY, profileWidth, rowH);
        }
        ctx.restore();
      });

      if (vp.pocIndex != null && vp.pocIndex >= 0) {
        const pocRow = vp.rows[vp.pocIndex];
        const pocY = toY((pocRow.top + pocRow.bottom) / 2);
        ctx.save();
        ctx.strokeStyle = "#fbc02d";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(profileLeft - 8, pocY);
        ctx.lineTo(profileRight, pocY);
        ctx.stroke();
        ctx.fillStyle = "#fbc02d";
        ctx.font = "8px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("POC", Math.max(leftPad + 2, profileLeft - 26), pocY - 2);
        ctx.restore();
      }

      const drawVaLine = (index, color, label) => {
        if (index == null || index < 0 || index >= vp.rows.length) return;
        const row = vp.rows[index];
        const y = toY(label === "VAL" ? row.bottom : row.top);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(profileLeft - 8, y);
        ctx.lineTo(profileRight, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "8px Segoe UI, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, Math.max(leftPad + 2, profileLeft - 26), y - 2);
        ctx.restore();
      };

      drawVaLine(vp.vahIndex, "#2962ff", "VAH");
      drawVaLine(vp.valIndex, "#2962ff", "VAL");
    }
  }

  if (hasLiquidityTrendline) {
    const lt = buildLiquidityTrendlineSignals(candles, {
      len: 5,
      space: 2,
      colorUp: "#0044ff",
      colorDown: "#ff2b00",
    });

    const drawChannel = (channel) => {
      const renderEnd = channel.liveEndIndex ?? channel.endIndex;
      if (renderEnd < start || channel.startIndex > end - 1) return;
      const levelAt = (base, bars) => base + (channel.slope * bars);
      const startX = leftPad + ((Math.max(start, channel.startIndex) - start) * slotW) + (slotW / 2);
      const endX = leftPad + ((Math.min(end - 1, renderEnd) - start) * slotW) + (slotW / 2);
      const topStartPrice = levelAt(channel.top1, Math.max(start, channel.startIndex) - channel.startIndex);
      const topEndPrice = levelAt(channel.top1, Math.min(end - 1, renderEnd) - channel.startIndex);
      const bottomStartPrice = levelAt(channel.bottom1, Math.max(start, channel.startIndex) - channel.startIndex);
      const bottomEndPrice = levelAt(channel.bottom1, Math.min(end - 1, renderEnd) - channel.startIndex);
      ctx.save();
      ctx.strokeStyle = channel.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(startX, toY(topStartPrice));
      ctx.lineTo(endX, toY(topEndPrice));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(startX, toY(bottomStartPrice));
      ctx.lineTo(endX, toY(bottomEndPrice));
      ctx.stroke();
      ctx.fillStyle = channel.direction === "UPPER" ? "rgba(255,43,0,0.18)" : "rgba(0,68,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(startX, toY(topStartPrice));
      ctx.lineTo(endX, toY(topEndPrice));
      ctx.lineTo(endX, toY(bottomEndPrice));
      ctx.lineTo(startX, toY(bottomStartPrice));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    lt.upperChannels.slice(-3).forEach(drawChannel);
    lt.lowerChannels.slice(-3).forEach(drawChannel);

    lt.signals.forEach((signal) => {
      if (signal.entryIndex == null || signal.entryIndex < start || signal.entryIndex >= end) return;
      const x = leftPad + ((signal.entryIndex - start) * slotW) + (slotW / 2);
      const isUp = signal.type === "UP";
      const y = isUp ? toY(candles[signal.entryIndex].low) + 10 : toY(candles[signal.entryIndex].high) - 10;
      ctx.save();
      ctx.fillStyle = signal.color;
      ctx.beginPath();
      if (isUp) {
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x - 5, y + 4);
        ctx.lineTo(x + 5, y + 4);
      } else {
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x - 5, y - 4);
        ctx.lineTo(x + 5, y - 4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

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

function panChartVertically(deltaY) {
  const built = getBuiltCandles();
  if (!miniChartCanvas || !built.length) {
    renderMiniChart(built);
    return;
  }
  const maxOffset = Math.max(0, built.length - chartPoints);
  const end = built.length - Math.max(0, Math.min(chartOffset, maxOffset));
  const start = Math.max(0, end - chartPoints);
  const points = built.slice(start, end);
  if (!points.length) return;
  const lows = points.map((c) => c.low);
  const highs = points.map((c) => c.high);
  const range = Math.max(0.0000001, Math.max(...highs) - Math.min(...lows));
  const plotHeight = Math.max(1, miniChartCanvas.clientHeight - 12);
  chartVerticalOffset += (deltaY / plotHeight) * range;
  renderMiniChart(built);
}

function resetChartView() {
  chartOffset = 0;
  chartDragX = null;
  chartDragY = null;
  chartVerticalOffset = 0;
  renderMiniChart(getBuiltCandles());
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#e15b64" : "#9aa7b8";
}

function getTimeframeLabel(seconds) {
  return TIMEFRAME_OPTIONS.find((option) => option.seconds === seconds)?.label || `${seconds}s`;
}

function getChartIndicatorLabel(value) {
  return CHART_INDICATOR_OPTIONS.find((option) => option.value === value)?.label || value;
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

function openTimeframePicker() {
  if (!chartTfSelectEl) return;
  showTimeframePicker();
  requestAnimationFrame(() => {
    try {
      if (typeof chartTfSelectEl.showPicker === "function") {
        chartTfSelectEl.showPicker();
      } else {
        chartTfSelectEl.focus();
        chartTfSelectEl.click();
      }
    } catch {
      chartTfSelectEl.focus();
    }
  });
}

function populateTimeframeOptions() {
  if (!chartTfSelectEl) return;
  chartTfSelectEl.innerHTML = TIMEFRAME_OPTIONS
    .map((option) => `<option value="${option.seconds}">${option.label}</option>`)
    .join("");
  updateTimeframeUI();
}

function renderChartIndicatorList() {
  if (!chartIndicatorListEl) return;
  if (!activeChartIndicators.size) {
    chartIndicatorListEl.innerHTML = "";
    return;
  }
  chartIndicatorListEl.innerHTML = Array.from(activeChartIndicators)
    .map((value) => (
      `<span class="chart-indicator-chip" data-indicator="${value}">
        ${getChartIndicatorLabel(value)}
        <button class="chart-indicator-remove" type="button" data-remove-indicator="${value}" aria-label="Remove ${getChartIndicatorLabel(value)}">x</button>
      </span>`
    ))
    .join("");
}

function populateIndicatorOptions() {
  if (!indicatorSelectEl) return;
  const groups = CHART_INDICATOR_GROUPS
    .map((group) => {
      const options = group.items
        .map((value) => `<option value="${value}">${getChartIndicatorLabel(value)}</option>`)
        .join("");
      return `<optgroup label="${group.label}">${options}</optgroup>`;
    })
    .join("");
  indicatorSelectEl.innerHTML = `<option value="">Indicators</option>${groups}`;
}

function addChartIndicator(value) {
  if (!value) return;
  activeChartIndicators.add(value);
  renderChartIndicatorList();
  renderMiniChart(getBuiltCandles());
}

function removeChartIndicator(value) {
  if (!value) return;
  activeChartIndicators.delete(value);
  renderChartIndicatorList();
  renderMiniChart(getBuiltCandles());
}

function calculateChartEMA(candles, period = 9) {
  if (!Array.isArray(candles) || candles.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [];
  let prev = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
  for (let i = 0; i < candles.length; i += 1) {
    if (i < period - 1) {
      ema.push(null);
      continue;
    }
    if (i === period - 1) {
      ema.push(prev);
      continue;
    }
    prev = (candles[i].close * k) + (prev * (1 - k));
    ema.push(prev);
  }
  return ema;
}

function populateTrendModeOptions() {
  if (!trendModeSelectEl) return;
  const labels = {
    EMA: "EMA Trend",
    AVG: "AVG Trend",
    OBV: "OBV Trend",
    STACK: "Stack Trend",
  };
  trendModeSelectEl.innerHTML = TREND_MODE_OPTIONS
    .map((mode) => `<option value="${mode}">${labels[mode] || mode}</option>`)
    .join("");
  trendModeSelectEl.value = currentTrendMode;
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
    let built = [];

    if (candleBuilder.timeframe < 60) {
      built = await loadAggregatedTickHistory(symbol);
    } else {
      built = await loadCandleHistory(symbol);
    }

    updateSignalFromCandles(built);
  } catch (err) {
    setStatus(err?.message || "History load failed", true);
  }
}

function rebuildCandlesFromHistory(prices, times) {
  candleBuilder.reset();
  const len = Math.min(prices.length, times.length);
  for (let i = 0; i < len; i++) {
    candleBuilder.update({ epoch: Number(times[i]), quote: Number(prices[i]) });
  }
  return candleBuilder.currentCandle
    ? [...candleBuilder.candles, candleBuilder.currentCandle]
    : candleBuilder.candles;
}

async function loadCandleHistory(symbol) {
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
    return candleBuilder.currentCandle
      ? [...candleBuilder.candles, candleBuilder.currentCandle]
      : candleBuilder.candles;
  }

  const history = res.history || {};
  return rebuildCandlesFromHistory(history.prices || [], history.times || []);
}

async function loadAggregatedTickHistory(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const lookbackWindowSec = candleBuilder.timeframe * MAX_CANDLES;
  const res = await wsRequest({
    ticks_history: symbol,
    start: now - lookbackWindowSec,
    end: "latest",
    style: "ticks",
    count: 5000,
  });

  const history = res.history || {};
  return rebuildCandlesFromHistory(history.prices || [], history.times || []);
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
  phoneEl = document.querySelector(".phone");
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
  sigRejectEl = document.getElementById("sigReject");
  sigEntryEl = document.getElementById("sigEntry");
  sigLevelEl = document.getElementById("sigLevel");
  sigBlueEl = document.getElementById("sigBlue");
  sigWhiteEl = document.getElementById("sigWhite");
  signalBodyEl = document.getElementById("signalBody");
  toggleSignalBtn = document.getElementById("toggleSignal");
  chartBodyEl = document.getElementById("chartBody");
  toggleChartBtn = document.getElementById("toggleChart");
  chartTfLabelEl = document.getElementById("chartTfLabel");
  chartTfPickerEl = document.getElementById("chartTfPicker");
  chartTfSelectEl = document.getElementById("chartTfSelect");
  indicatorSelectEl = document.getElementById("indicatorSelect");
  chartIndicatorListEl = document.getElementById("chartIndicatorList");
  trendModeSelectEl = document.getElementById("trendModeSelect");
  miniChartCanvas = document.getElementById("miniChart");
  zoomInBtn = document.getElementById("zoomIn");
  zoomOutBtn = document.getElementById("zoomOut");
  resetChartBtn = document.getElementById("resetChart");
  autoToggleEl = document.getElementById("autoToggle");
  autoAccountSelect = document.getElementById("autoAccountSelect");
  autoResultsEl = document.getElementById("autoResults");
  autoBodyEl = document.getElementById("autoBody");
  autoSectionEl = document.getElementById("autoSection");
  toggleAutoBtn = document.getElementById("toggleAuto");
  toggleAutoConfigBtn = document.getElementById("toggleAutoConfig");
  toggleAutoResultsBtn = document.getElementById("toggleAutoResults");
  directionButtons = hlButtons?.querySelectorAll(".pill") || [];

  if (!marketSelect || !symbolSelect) {
    setStatus("UI error: market/symbol selects missing", true);
    return;
  }

  marketSelect.addEventListener("change", updateSymbols);
  symbolSelect.addEventListener("change", onSymbolChange);
  populateTimeframeOptions();
  populateTrendModeOptions();
  populateIndicatorOptions();
  renderChartIndicatorList();
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

  if (toggleAutoBtn && autoSectionEl) {
    toggleAutoBtn.addEventListener("click", () => {
      const isCollapsed = autoSectionEl.classList.toggle("collapsed");
      autoSectionEl.hidden = isCollapsed;
      toggleAutoBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleAutoBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }

  if (toggleAutoConfigBtn && autoBodyEl) {
    toggleAutoConfigBtn.addEventListener("click", () => {
      const isCollapsed = autoBodyEl.classList.toggle("collapsed");
      toggleAutoConfigBtn.textContent = isCollapsed ? "Expand" : "Collapse";
      toggleAutoConfigBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
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

  chartTfLabelEl?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (chartTfPickerEl?.classList.contains("hidden")) openTimeframePicker();
    else hideTimeframePicker();
  });

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
    chartDragY = event.clientY;
    chartGestureMoved = false;
    miniChartCanvas.setPointerCapture?.(event.pointerId);
  });

  miniChartCanvas?.addEventListener("pointermove", (event) => {
    if (chartDragX == null || chartDragY == null) return;
    const deltaX = event.clientX - chartDragX;
    const deltaY = event.clientY - chartDragY;
    if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
    chartDragX = event.clientX;
    chartDragY = event.clientY;
    chartGestureMoved = true;
    panChartByPixels(deltaX);
    panChartVertically(deltaY);
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
    chartDragY = null;
    chartGestureMoved = false;
  });

  miniChartCanvas?.addEventListener("pointercancel", () => {
    chartDragX = null;
    chartDragY = null;
    chartGestureMoved = false;
  });

  miniChartCanvas?.addEventListener("pointerleave", () => {
    chartDragX = null;
    chartDragY = null;
    chartGestureMoved = false;
  });

  chartTfSelectEl?.addEventListener("change", () => {
    setChartTimeframe(chartTfSelectEl.value).catch((err) => {
      setStatus(err?.message || "Timeframe change failed", true);
    });
  });

  indicatorSelectEl?.addEventListener("change", () => {
    const value = indicatorSelectEl.value;
    if (!value) return;
    addChartIndicator(value);
    indicatorSelectEl.value = "";
  });

  chartIndicatorListEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const value = target.getAttribute("data-remove-indicator");
    if (!value) return;
    removeChartIndicator(value);
  });

  trendModeSelectEl?.addEventListener("change", () => {
    currentTrendMode = TREND_MODE_OPTIONS.includes(trendModeSelectEl.value) ? trendModeSelectEl.value : "EMA";
    updateSignalFromCandles(getBuiltCandles());
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

  resetChartBtn?.addEventListener("click", () => {
    resetChartView();
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
  updateFrameSignalUI(lastSignalState);

  // Default collapsed state for sections
  tradeBody?.classList.add("collapsed");
  toggleTradeBtn && (toggleTradeBtn.textContent = "Expand", toggleTradeBtn.setAttribute("aria-expanded", "false"));
  tradeListEl?.classList.add("collapsed");
  toggleProposalsBtn && (toggleProposalsBtn.textContent = "Expand", toggleProposalsBtn.setAttribute("aria-expanded", "false"));
  tradeResultsEl?.classList.add("collapsed");
  toggleResultsBtn && (toggleResultsBtn.textContent = "Expand", toggleResultsBtn.setAttribute("aria-expanded", "false"));
  signalBodyEl?.classList.add("collapsed");
  toggleSignalBtn && (toggleSignalBtn.textContent = "Expand", toggleSignalBtn.setAttribute("aria-expanded", "false"));
  chartBodyEl?.classList.add("collapsed");
  toggleChartBtn && (toggleChartBtn.textContent = "Expand", toggleChartBtn.setAttribute("aria-expanded", "false"));
  autoSectionEl?.classList.add("collapsed");
  if (autoSectionEl) autoSectionEl.hidden = true;
  toggleAutoBtn && (toggleAutoBtn.textContent = "Expand", toggleAutoBtn.setAttribute("aria-expanded", "false"));
  autoBodyEl?.classList.add("collapsed");
  toggleAutoConfigBtn && (toggleAutoConfigBtn.textContent = "Expand", toggleAutoConfigBtn.setAttribute("aria-expanded", "false"));
  autoResultsEl?.classList.add("collapsed");
  toggleAutoResultsBtn && (toggleAutoResultsBtn.textContent = "Expand", toggleAutoResultsBtn.setAttribute("aria-expanded", "false"));
}

window.addEventListener("DOMContentLoaded", init);
