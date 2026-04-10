import { fetchStockData } from "./yahoo-finance";
import type { OHLCVBar, SectorData, ScreenerCandidate } from "./types";

// ─── 11 GICS Sector ETFs ──────────────────────────────────────────────────────

export const SECTOR_ETFS: Array<{ name: string; etf: string }> = [
  { name: "Energy",                 etf: "XLE"  },
  { name: "Technology",             etf: "XLK"  },
  { name: "Financials",             etf: "XLF"  },
  { name: "Healthcare",             etf: "XLV"  },
  { name: "Industrials",            etf: "XLI"  },
  { name: "Consumer Discretionary", etf: "XLY"  },
  { name: "Consumer Staples",       etf: "XLP"  },
  { name: "Materials",              etf: "XLB"  },
  { name: "Utilities",              etf: "XLU"  },
  { name: "Real Estate",            etf: "XLRE" },
  { name: "Communication Services", etf: "XLC"  },
];

// ─── Ticker → Sector ETF mapping ─────────────────────────────────────────────
// Maps each scan-universe ticker to its GICS sector ETF

export const TICKER_SECTOR: Record<string, string> = {
  // ── Technology ──────────────────────────────────────────────────────────────
  AAPL:"XLK", MSFT:"XLK", NVDA:"XLK", GOOGL:"XLK", GOOG:"XLK",
  AMD:"XLK",  INTC:"XLK", QCOM:"XLK", AVGO:"XLK", MU:"XLK",
  AMAT:"XLK", LRCX:"XLK", TXN:"XLK", KLAC:"XLK", ARM:"XLK",
  MRVL:"XLK", ADI:"XLK", SMCI:"XLK", ON:"XLK", NXPI:"XLK",
  SWKS:"XLK", SNPS:"XLK", CDNS:"XLK", MPWR:"XLK", MCHP:"XLK",
  ENTG:"XLK", WOLF:"XLK", RMBS:"XLK", IPGP:"XLK", COHU:"XLK",
  UCTT:"XLK", ACLS:"XLK", MKSI:"XLK", LSCC:"XLK", MTSI:"XLK",
  SYNA:"XLK", ALGM:"XLK", AEHR:"XLK", KLIC:"XLK", GFS:"XLK",
  ONTO:"XLK", PLAB:"XLK",
  ORCL:"XLK", CRM:"XLK", ADBE:"XLK", NOW:"XLK", INTU:"XLK",
  WDAY:"XLK", PLTR:"XLK", DDOG:"XLK", SNOW:"XLK", NET:"XLK",
  ZS:"XLK",  PANW:"XLK", CRWD:"XLK", FTNT:"XLK", OKTA:"XLK",
  TEAM:"XLK", HUBS:"XLK", TTD:"XLK", MDB:"XLK", GTLB:"XLK",
  CFLT:"XLK", BRZE:"XLK", BILL:"XLK", DUOL:"XLK", DOCN:"XLK",
  MNDY:"XLK", APPN:"XLK", KVYO:"XLK", FRSH:"XLK", BOX:"XLK",
  IBM:"XLK",  ACN:"XLK", CSCO:"XLK", CTSH:"XLK", EPAM:"XLK",
  GDDY:"XLK", FICO:"XLK", VRSN:"XLK", AKAM:"XLK", FFIV:"XLK",
  MANH:"XLK", MSI:"XLK", JKHY:"XLK", TYL:"XLK", CDW:"XLK",
  ADSK:"XLK", ANET:"XLK", ANSS:"XLK", CHKP:"XLK", CIEN:"XLK",
  FIVN:"XLK", GLOB:"XLK", PD:"XLK", QLYS:"XLK", STNE:"XLK",
  PCOR:"XLK", TOST:"XLK", SPSC:"XLK", NTNX:"XLK", ASAN:"XLK",
  DOCU:"XLK", TENB:"XLK", CYBR:"XLK", RPD:"XLK", VRNT:"XLK",
  EGHT:"XLK", WIX:"XLK", YEXT:"XLK", APPF:"XLK", BLKB:"XLK",
  CVLT:"XLK", JAMF:"XLK", PEGA:"XLK", QTWO:"XLK",
  BBAI:"XLK", SOUN:"XLK", PATH:"XLK", CWAN:"XLK", RXRX:"XLK",
  IREN:"XLK", AI:"XLK",
  HPQ:"XLK",  HPE:"XLK", DELL:"XLK", PSTG:"XLK", NTAP:"XLK",
  WDC:"XLK",  STX:"XLK", VIAV:"XLK", CRUS:"XLK",

  // ── Communication Services ───────────────────────────────────────────────────
  META:"XLC",  AMZN:"XLC", NFLX:"XLC", UBER:"XLC", ABNB:"XLC", LYFT:"XLC",
  ACHR:"XLC",  JOBY:"XLC",
  SNAP:"XLC",  PINS:"XLC", COIN:"XLC", MSTR:"XLC", XYZ:"XLC",
  MELI:"XLC",  BIDU:"XLC", RBLX:"XLC", SPOT:"XLC", ROKU:"XLC",
  ETSY:"XLC",  CHWY:"XLC", EXPE:"XLC", BKNG:"XLC", TRIP:"XLC",
  T:"XLC",     TMUS:"XLC", VZ:"XLC", CMCSA:"XLC", DIS:"XLC",
  CHTR:"XLC",  WBD:"XLC", FOX:"XLC", SIRI:"XLC", LUMN:"XLC",
  NXST:"XLC",  GTN:"XLC", CCOI:"XLC", LBRDK:"XLC",
  WMG:"XLC",   EA:"XLC", TTWO:"XLC", U:"XLC",
  DKNG:"XLC",  MGM:"XLC", WYNN:"XLC", LVS:"XLC", CZR:"XLC",
  PENN:"XLC",

  // ── Financials ───────────────────────────────────────────────────────────────
  JPM:"XLF",  BAC:"XLF", WFC:"XLF", C:"XLF", GS:"XLF", MS:"XLF",
  USB:"XLF",  PNC:"XLF", TFC:"XLF", COF:"XLF", AXP:"XLF",
  SYF:"XLF",  ALLY:"XLF", SCHW:"XLF", IBKR:"XLF", RJF:"XLF",
  BK:"XLF",   STT:"XLF", NTRS:"XLF",
  V:"XLF",    MA:"XLF", PYPL:"XLF", FIS:"XLF", FISV:"XLF",
  GPN:"XLF",  WU:"XLF", MQ:"XLF", OWL:"XLF",
  FITB:"XLF", HBAN:"XLF", RF:"XLF", KEY:"XLF", CMA:"XLF",
  ZION:"XLF", WAL:"XLF", CFG:"XLF", FHN:"XLF", WBS:"XLF",
  UMBF:"XLF", WTFC:"XLF", PNFP:"XLF", FCNCA:"XLF", BOKF:"XLF",
  FFIN:"XLF", OFG:"XLF", CVBF:"XLF", HWC:"XLF",
  BLK:"XLF",  BX:"XLF", KKR:"XLF", APO:"XLF", ARES:"XLF",
  IVZ:"XLF",  AMP:"XLF", BEN:"XLF", MCO:"XLF", SPGI:"XLF",
  MSCI:"XLF", NDAQ:"XLF", ICE:"XLF", CME:"XLF", CBOE:"XLF",
  MKTX:"XLF", LPLA:"XLF", VOYA:"XLF", LNC:"XLF", EQH:"XLF",
  AIG:"XLF",  MET:"XLF", PRU:"XLF", AFL:"XLF", ALL:"XLF",
  CB:"XLF",   TRV:"XLF", HIG:"XLF", PGR:"XLF", MKL:"XLF",
  ERIE:"XLF", CINF:"XLF", MMC:"XLF", WTW:"XLF", GL:"XLF",
  FNF:"XLF",  RDN:"XLF", ESNT:"XLF", UNM:"XLF", RLI:"XLF",
  FAF:"XLF",  AXS:"XLF", KNSL:"XLF",
  ARCC:"XLF", MAIN:"XLF", HTGC:"XLF", GBDC:"XLF", FSK:"XLF",
  CSWC:"XLF", BXSL:"XLF", SLRC:"XLF", TCPC:"XLF",
  HOOD:"XLF", SOFI:"XLF", AFRM:"XLF", UPST:"XLF",

  // ── Healthcare ───────────────────────────────────────────────────────────────
  UNH:"XLV",  LLY:"XLV", JNJ:"XLV", ABBV:"XLV", PFE:"XLV",
  MRK:"XLV",  TMO:"XLV", AMGN:"XLV", REGN:"XLV", GILD:"XLV",
  VRTX:"XLV", MRNA:"XLV", ABT:"XLV", BMY:"XLV", BIIB:"XLV",
  AZN:"XLV",  NVO:"XLV", CVS:"XLV", HUM:"XLV", CNC:"XLV",
  MOH:"XLV",  HCA:"XLV", THC:"XLV", UHS:"XLV", MCK:"XLV",
  CI:"XLV",   ELV:"XLV", GEHC:"XLV", OGN:"XLV",
  MDT:"XLV",  BSX:"XLV", EW:"XLV", ISRG:"XLV", DXCM:"XLV",
  PODD:"XLV", RMD:"XLV", STE:"XLV", ALGN:"XLV",
  SYK:"XLV",  ZBH:"XLV", HOLX:"XLV", IDXX:"XLV", INSP:"XLV",
  NVCR:"XLV", DHR:"XLV", A:"XLV", BIO:"XLV", ILMN:"XLV",
  IART:"XLV", MMSI:"XLV", GKOS:"XLV", ATRC:"XLV", DGX:"XLV",
  XRAY:"XLV", EXAS:"XLV", AXSM:"XLV", ELAN:"XLV",
  ALNY:"XLV", ARWR:"XLV", CRSP:"XLV", EDIT:"XLV", NTLA:"XLV",
  BEAM:"XLV", DNLI:"XLV", KYMR:"XLV", NUVL:"XLV", RVMD:"XLV",
  IOVA:"XLV", TVTX:"XLV", PCVX:"XLV", HALO:"XLV", INCY:"XLV",
  EXEL:"XLV", NBIX:"XLV", ACAD:"XLV", BMRN:"XLV", ALKS:"XLV",
  JAZZ:"XLV", PRGO:"XLV", UTHR:"XLV", NVAX:"XLV", RCUS:"XLV",
  SRPT:"XLV", TGTX:"XLV", LGND:"XLV", MDGL:"XLV",

  // ── Energy ───────────────────────────────────────────────────────────────────
  XOM:"XLE",  CVX:"XLE", COP:"XLE", EOG:"XLE", OXY:"XLE",
  DVN:"XLE",  FANG:"XLE", SLB:"XLE", HAL:"XLE", BKR:"XLE",
  CIVI:"XLE", SM:"XLE", AR:"XLE", MTDR:"XLE", EQT:"XLE",
  RRC:"XLE",  CNX:"XLE", MUR:"XLE", NOG:"XLE",
  GPOR:"XLE", BATL:"XLE", TALO:"XLE", CRK:"XLE", MGY:"XLE",
  KOS:"XLE",  CLB:"XLE",
  MPC:"XLE",  PSX:"XLE", VLO:"XLE", PBF:"XLE", LNG:"XLE",
  TRGP:"XLE", OKE:"XLE", WMB:"XLE", KMI:"XLE", EPD:"XLE",
  ET:"XLE",   PAA:"XLE", MPLX:"XLE", DKL:"XLE", DINO:"XLE",
  FLNG:"XLE", FRO:"XLE", GLNG:"XLE", TDW:"XLE",

  // ── Consumer Discretionary ───────────────────────────────────────────────────
  TSLA:"XLY",
  COST:"XLY", WMT:"XLY", TGT:"XLY", HD:"XLY", LOW:"XLY",
  ROST:"XLY", TJX:"XLY", BURL:"XLY", FIVE:"XLY", DLTR:"XLY",
  DG:"XLY",   BBY:"XLY", ORLY:"XLY", AZO:"XLY", GPC:"XLY",
  TSCO:"XLY", WSM:"XLY", RH:"XLY", OLLI:"XLY", LESL:"XLY",
  BOOT:"XLY", NKE:"XLY", LULU:"XLY", ONON:"XLY", DECK:"XLY",
  CROX:"XLY", PVH:"XLY", RL:"XLY", TPR:"XLY", CPRI:"XLY",
  KSS:"XLY",  LEVI:"XLY", MNSO:"XLY", GOOS:"XLY", WHR:"XLY",
  SIG:"XLY",  TLYS:"XLY",
  GM:"XLY",   F:"XLY", RIVN:"XLY", LCID:"XLY", NIO:"XLY",
  LI:"XLY",   XPEV:"XLY", AN:"XLY", KMX:"XLY", LAD:"XLY",
  PAG:"XLY",  HTZ:"XLY", STLA:"XLY",
  MCD:"XLY",  SBUX:"XLY", CMG:"XLY", DPZ:"XLY", YUM:"XLY",
  QSR:"XLY",  WING:"XLY", SHAK:"XLY", TXRH:"XLY", BJRI:"XLY",
  EAT:"XLY",
  H:"XLY",    HLT:"XLY", MAR:"XLY", WH:"XLY",
  RCL:"XLY",  CCL:"XLY", NCLH:"XLY", MTN:"XLY",
  VICI:"XLY",

  // ── Consumer Staples ─────────────────────────────────────────────────────────
  PG:"XLP",   CL:"XLP", KO:"XLP", PEP:"XLP", PM:"XLP", MO:"XLP",
  MNST:"XLP", KMB:"XLP", CLX:"XLP", CHD:"XLP", MDLZ:"XLP",
  GIS:"XLP",  MKC:"XLP", SJM:"XLP", HRL:"XLP", CAG:"XLP",
  POST:"XLP", CPB:"XLP", KR:"XLP", COTY:"XLP", ELF:"XLP",
  HIMS:"XLP", KVUE:"XLP", SFM:"XLP", PFGC:"XLP", USFD:"XLP",
  BJ:"XLP",   CHEF:"XLP", VITL:"XLP",

  // ── Industrials ──────────────────────────────────────────────────────────────
  LMT:"XLI",  RTX:"XLI", NOC:"XLI", GD:"XLI", BA:"XLI",
  LDOS:"XLI", SAIC:"XLI", BAH:"XLI", HII:"XLI", KTOS:"XLI",
  TDG:"XLI",  AVAV:"XLI",
  UPS:"XLI",  FDX:"XLI", JBHT:"XLI", CHRW:"XLI", KNX:"XLI",
  ODFL:"XLI", XPO:"XLI", GXO:"XLI", RXO:"XLI", ARCB:"XLI",
  DAL:"XLI",  UAL:"XLI", AAL:"XLI", LUV:"XLI", ALGT:"XLI",
  MATX:"XLI",
  CAT:"XLI",  DE:"XLI", HON:"XLI", GE:"XLI", GEV:"XLI",
  ETN:"XLI",  EMR:"XLI", PH:"XLI", ITW:"XLI", IR:"XLI",
  TT:"XLI",   ROK:"XLI", AME:"XLI", FTV:"XLI", PNR:"XLI",
  GGG:"XLI",  IEX:"XLI", NDSN:"XLI", GTLS:"XLI", AGCO:"XLI",
  CMI:"XLI",  SNA:"XLI", SWK:"XLI", ROP:"XLI", URI:"XLI",
  FAST:"XLI", GWW:"XLI", MSC:"XLI", KBR:"XLI", BMI:"XLI",
  AYI:"XLI",  HUBB:"XLI", ATR:"XLI",
  CBRE:"XLI", JLL:"XLI", WY:"XLI", BLDR:"XLI", IBP:"XLI",
  MAS:"XLI",  MLM:"XLI", VMC:"XLI", CRH:"XLI", EXP:"XLI",
  UFPI:"XLI", TREX:"XLI", AWI:"XLI",
  NVR:"XLI",  MHO:"XLI", LEN:"XLI", PHM:"XLI", DHI:"XLI",
  TOL:"XLI",  TMHC:"XLI", GRBK:"XLI", LGIH:"XLI", MTH:"XLI",
  CVCO:"XLI", SKY:"XLI",
  CARR:"XLI", OTIS:"XLI", LII:"XLI", WSO:"XLI", GNRC:"XLI",
  POWL:"XLI", REZI:"XLI", AAON:"XLI", ALLE:"XLI",

  // ── Materials ────────────────────────────────────────────────────────────────
  LIN:"XLB",  APD:"XLB", SHW:"XLB", PPG:"XLB", ECL:"XLB",
  NEM:"XLB",  GOLD:"XLB", AEM:"XLB", PAAS:"XLB", WPM:"XLB",
  RGLD:"XLB", FNV:"XLB", NUE:"XLB", STLD:"XLB", RS:"XLB",
  CLF:"XLB",  PKG:"XLB", IP:"XLB", ALB:"XLB", MP:"XLB",
  CF:"XLB",   MOS:"XLB", BALL:"XLB", AMCR:"XLB", SEE:"XLB",
  SLGN:"XLB", OC:"XLB", SON:"XLB", AXTA:"XLB", IFF:"XLB",
  EMN:"XLB",  HUN:"XLB", ASH:"XLB", CE:"XLB", TROX:"XLB",
  ATI:"XLB",  HWKN:"XLB", BCPC:"XLB", NEU:"XLB", POOL:"XLB",

  // ── Utilities ────────────────────────────────────────────────────────────────
  NEE:"XLU",  DUK:"XLU", SO:"XLU", AEP:"XLU", XEL:"XLU",
  D:"XLU",    PCG:"XLU", EIX:"XLU", ES:"XLU", AWK:"XLU",
  WEC:"XLU",  LNT:"XLU", DTE:"XLU", CMS:"XLU", ETR:"XLU",
  PPL:"XLU",  AES:"XLU", ATO:"XLU", NI:"XLU", SR:"XLU",
  AVA:"XLU",  SWX:"XLU", NWE:"XLU", OTTR:"XLU", AMRC:"XLU",
  BEP:"XLU",  CWEN:"XLU", OGE:"XLU", IDA:"XLU", MGEE:"XLU",

  // ── Real Estate ──────────────────────────────────────────────────────────────
  AMT:"XLRE", SBAC:"XLRE", CCI:"XLRE", PLD:"XLRE", EQR:"XLRE",
  MAA:"XLRE", UDR:"XLRE", CPT:"XLRE", INVH:"XLRE", ESS:"XLRE",
  NNN:"XLRE", O:"XLRE", WELL:"XLRE", VTR:"XLRE", DOC:"XLRE",
  STAG:"XLRE",COLD:"XLRE", CUBE:"XLRE", EXR:"XLRE", PSA:"XLRE",
  AVB:"XLRE", EQIX:"XLRE", ARE:"XLRE", BXP:"XLRE", SLG:"XLRE",
  KIM:"XLRE", FRT:"XLRE", REG:"XLRE", WPC:"XLRE", IRM:"XLRE",
  EPR:"XLRE", NHI:"XLRE", OHI:"XLRE", SKT:"XLRE", SAFE:"XLRE",
  SITC:"XLRE",SBRA:"XLRE", KRG:"XLRE", CTRE:"XLRE", EGP:"XLRE",
  ESRT:"XLRE",PINE:"XLRE",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function returnPct(bars: OHLCVBar[], lookback: number): number {
  if (bars.length < lookback + 1) return 0;
  const last  = bars[bars.length - 1].close;
  const prior = bars[bars.length - 1 - lookback].close;
  return ((last - prior) / prior) * 100;
}

function avg20dVolume(bars: OHLCVBar[]): number {
  if (bars.length < 20) return bars[bars.length - 1]?.volume ?? 0;
  const slice = bars.slice(-20);
  return slice.reduce((s, b) => s + b.volume, 0) / 20;
}

function scoreVolume(ratio: number): number {
  if (ratio >= 1.5) return 2;
  if (ratio >= 1.2) return 1;
  if (ratio >= 0.8) return 0;
  return -1;
}

function scoreBreadth(pct: number): number {
  if (pct >= 65) return 2;
  if (pct >= 50) return 1;
  if (pct >= 35) return 0;
  return -1;
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Fetches all 11 sector ETFs (25 bars each = covers 5d + 20d + volume avg)
 * then computes sector scores using:
 *   - Relative strength vs SPY (5d and 20d)
 *   - Breadth from screener candidates (% above SMA50)
 *   - Volume expansion vs 20d average
 */
export async function computeSectorScores(
  spyBars: OHLCVBar[],
  candidates: ScreenerCandidate[],   // all stocks that had enough data (pre-filter)
): Promise<SectorData[]> {
  const spy5d  = returnPct(spyBars, 5);
  const spy20d = returnPct(spyBars, 20);

  // Build breadth lookup: etf → { above50, total }
  const breadthMap = new Map<string, { above: number; total: number }>();
  for (const c of candidates) {
    const etf = TICKER_SECTOR[c.ticker];
    if (!etf) continue;
    const entry = breadthMap.get(etf) ?? { above: 0, total: 0 };
    entry.total++;
    if (c.aboveSma50) entry.above++;
    breadthMap.set(etf, entry);
  }

  // Fetch all sector ETFs in parallel (25 bars = enough for 20d return + volume)
  const etfFetches = await Promise.allSettled(
    SECTOR_ETFS.map(({ etf }) =>
      fetchStockData({ ticker: etf, timeframe: "1d", bars: 25 })
    )
  );

  const results: SectorData[] = [];

  for (let i = 0; i < SECTOR_ETFS.length; i++) {
    const { name, etf } = SECTOR_ETFS[i];
    const fetch = etfFetches[i];
    if (fetch.status !== "fulfilled") continue;

    const bars = fetch.value.bars;
    if (bars.length < 6) continue;

    const etfReturn5d  = returnPct(bars, 5);
    const etfReturn20d = returnPct(bars, 20);
    const rs5d  = etfReturn5d  - spy5d;
    const rs20d = etfReturn20d - spy20d;
    const rsScore = (rs5d * 0.6) + (rs20d * 0.4);

    const breadth = breadthMap.get(etf);
    const breadthPct = breadth && breadth.total > 0
      ? (breadth.above / breadth.total) * 100
      : 50; // default neutral if no mapped stocks
    const bScore = scoreBreadth(breadthPct);

    const lastBar   = bars[bars.length - 1];
    const vol20dAvg = avg20dVolume(bars.slice(0, -1)); // exclude today for avg
    const volumeRatio  = vol20dAvg > 0 ? lastBar.volume / vol20dAvg : 1;
    const vScore = scoreVolume(volumeRatio);

    const sectorScore = (rsScore * 5) + bScore + vScore;

    results.push({
      name, etf,
      rs5d:     +rs5d.toFixed(2),
      rs20d:    +rs20d.toFixed(2),
      rsScore:  +rsScore.toFixed(2),
      breadthScore: bScore,
      volumeScore:  vScore,
      sectorScore:  +sectorScore.toFixed(2),
      breadthPct:   +breadthPct.toFixed(1),
      volumeRatio:  +volumeRatio.toFixed(2),
      etfReturn5d:  +etfReturn5d.toFixed(2),
    });
  }

  // Sort by sectorScore descending
  results.sort((a, b) => b.sectorScore - a.sectorScore);
  return results;
}
