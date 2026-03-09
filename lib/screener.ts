import type {
  OHLCVBar,
  MarketRegime,
  MarketTrend,
  ScreenerCandidate,
  ScreenerPattern,
} from "./types";

// ─── Universe (~600 liquid US equities + sector ETFs) ─────────────────────────
// Deduplicated with [...new Set()] at the end.

const RAW_UNIVERSE = [
  // ── Mega-cap tech & communication ─────────────────────────────────────────
  "AAPL","MSFT","NVDA","GOOGL","GOOG","META","AMZN","TSLA","NFLX","UBER",

  // ── Semiconductors ────────────────────────────────────────────────────────
  "AMD","INTC","QCOM","TXN","AVGO","MU","AMAT","LRCX","KLAC","MCHP","ON",
  "SWKS","MRVL","ADI","NXPI","SNPS","CDNS","ANSS","SMCI","ARM","QRVO",
  "COHU","UCTT","ACLS","MKSI","ENTG","RMBS","IPGP","WOLF","SIMO","DIOD",

  // ── Software / Cloud / SaaS ───────────────────────────────────────────────
  "ORCL","IBM","CSCO","CRM","NOW","WDAY","INTU","ADBE","TEAM","HUBS",
  "ZM","VEEV","PAYC","PCTY","CTSH","EPAM","IT","ACN","TWLO","DDOG",
  "SNOW","NET","ZS","PANW","FTNT","CRWD","OKTA","S","PLTR","AI",
  "MDB","GTLB","BILL","TTD","ZI","BRZE","CFLT","DOMO","ESTC","NCNO",
  "BSY","TOST","SMAR","SPSC","FROG","LSPD","U","RBLX","DUOL","DOCN",

  // ── Hardware / IT infrastructure ─────────────────────────────────────────
  "HPQ","HPE","DELL","PSTG","NTAP","WDC","STX","GDDY","AAPL",

  // ── Internet / Consumer tech ──────────────────────────────────────────────
  "SNAP","PINS","MTCH","IAC","ABNB","LYFT","HOOD","SOFI","AFRM","UPST",
  "OPEN","DLO","FLYW","PAYO","WEX","COIN","MSTR","MARA","RIOT","BTBT",
  "HUT","CIFR","BITF","CLSK","SQ","PYPL",

  // ── Finance: Banks (large-cap) ────────────────────────────────────────────
  "JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","COF","AXP","DFS",
  "SYF","ALLY","SCHW","IBKR","RJF","BK","STT","NTRS",

  // ── Finance: Banks (mid-cap) ──────────────────────────────────────────────
  "FITB","HBAN","RF","KEY","CMA","ZION","WAL","CFG","FHN","WBS","SNV",
  "UMBF","BOKF","WTFC","HTLF","FFIN","SFNC","GBCI","HWC","NWBI","PB",
  "OFG","TRMK","TBNK","HAFC","BRKL","CVBF","FCNCA","PNFP","IBCP",

  // ── Finance: Asset management / exchanges ─────────────────────────────────
  "BLK","BX","KKR","APO","ARES","IVZ","BEN","AMP","VOYA","LNC","EQH",
  "MCO","SPGI","MSCI","NDAQ","ICE","CME","CBOE","MKTX","LPLA",

  // ── Finance: Insurance ────────────────────────────────────────────────────
  "AIG","MET","PRU","AFL","ALL","CB","TRV","HIG","PGR","MKL","ERIE","CINF",
  "UNM","GL","FNF","RDN","ESNT","NMI","GNW","RLI","FAF","SFG","MMC","WTW",

  // ── Healthcare: Pharma / Large biotech ────────────────────────────────────
  "JNJ","PFE","ABBV","MRK","BMY","AMGN","GILD","REGN","BIIB","VRTX",
  "MRNA","BNTX","LLY","AZN","NVO","SNY","GSK","RHHBY","NVS","TAK",

  // ── Healthcare: Biotech (mid/small) ──────────────────────────────────────
  "SGEN","ALNY","IONS","INCY","EXEL","NBIX","ACAD","BMRN","ALKS","JAZZ",
  "PRGO","UTHR","NVAX","CRSP","EDIT","NTLA","BEAM","ARWR","DNLI","RCUS",
  "KRTX","FATE","IOVA","TVTX","VRNA","DRNA","TGTX","PHAT","PCVX","HALO",

  // ── Healthcare: Services / Managed care ──────────────────────────────────
  "UNH","CVS","HUM","CNC","MOH","HCA","THC","UHS","MCK","CI","ELV",

  // ── Healthcare: Medical devices & tools ──────────────────────────────────
  "ABT","MDT","BSX","EW","SYK","ZBH","ISRG","HOLX","IDXX","PODD","RMD",
  "STE","ALGN","DXCM","TMO","DHR","A","BIO","INSP","NVCR","AMED",
  "GMED","STVN","TMDX","SWAV","NARI","TNDM","AXNX","NUVA","OFIX",

  // ── Energy: E&P ───────────────────────────────────────────────────────────
  "XOM","CVX","COP","EOG","PXD","DVN","FANG","HES","OXY","CIVI","SM",
  "PDCE","CNX","AR","OVV","CHK","MUR","MTDR","SWN","EQT","ESTE","RRC",
  "GPOR","NOG","BATL","WTI","CRC","VAALCO",

  // ── Energy: Refining / Downstream ────────────────────────────────────────
  "MPC","PSX","VLO","PBF","DKL","HF",

  // ── Energy: Midstream / LNG ───────────────────────────────────────────────
  "PAA","MPLX","EPD","ET","WMB","KMI","LNG","TELL","OKE","DT","DTM",

  // ── Energy: Services & equipment ─────────────────────────────────────────
  "SLB","HAL","BKR","NOV","RIG","VAL","DO","NE","NESR","FTAI",

  // ── Consumer Discretionary: Retail ───────────────────────────────────────
  "HD","LOW","TGT","ROST","TJX","BURL","FIVE","DLTR","DG","BBY",
  "ORLY","AZO","AAP","GPC","DORM","TSCO","WSM","RH","ETSY","CHWY",

  // ── Consumer Discretionary: Auto & EV ────────────────────────────────────
  "GM","F","RIVN","LCID","NIO","LI","XPEV","AN","KMX","LAD","PAG","SAH",
  "HTZ","CAR","STLA","TM","HMC",

  // ── Consumer Discretionary: Restaurants / Food ───────────────────────────
  "MCD","SBUX","CMG","DPZ","YUM","QSR","JACK","WING","SHAK","FAT","NDLS",

  // ── Consumer Discretionary: Travel / Leisure ─────────────────────────────
  "H","HLT","MAR","WH","RCL","CCL","NCLH","EXPE","BKNG","TRIP","MTN",
  "MTCH","MGM","WYNN","LVS","CZR","PENN","DKNG","VICI",

  // ── Consumer Discretionary: Apparel ──────────────────────────────────────
  "NKE","LULU","PVH","HBI","RL","TPR","CPRI","VFC","CRI","PVH",

  // ── Consumer Staples ──────────────────────────────────────────────────────
  "WMT","COST","KR","PG","CL","KO","PEP","MO","PM","BTI","MNST",
  "EL","KMB","CLX","CHD","CAG","GIS","MKC","SJM","HRL","MDLZ","K",
  "POST","CPB","SFM","PFGC","USFD","SPTN","CASY","BJ","GO","COKE",

  // ── Industrials: Defense ─────────────────────────────────────────────────
  "LMT","RTX","NOC","GD","BA","LDOS","SAIC","BAH","HII","KTOS","AVAV","TDG",

  // ── Industrials: Airlines / Transportation ────────────────────────────────
  "UPS","FDX","JBHT","CHRW","KNX","ODFL","XPO","GXO","RXO",
  "DAL","UAL","AAL","LUV","ALGT","SAVE",

  // ── Industrials: Machinery / Conglomerates ────────────────────────────────
  "CAT","DE","MMM","GE","GEV","HON","ETN","EMR","PH","ITW","IR","TT",
  "ROK","AME","FTV","PNR","SPX","TKR","GGG","IEX","FLOW","NDSN","GTLS",
  "RBC","FWRD","RRX","AIN","ESAB","FORM","TRMB",

  // ── Industrials: Construction / Building materials ────────────────────────
  "CBRE","JLL","WY","LP","LPX","BECN","IBP","AZEK","DOOR","MAS","MLM",
  "VMC","CRH","SUM","EXP","UFPI","BLDR","TREX","AWI","FBIN","JELD",
  "FBHS","ROCK","NCI","STCK","AMWD",

  // ── Industrials: HVAC / Electrical ────────────────────────────────────────
  "CARR","OTIS","LII","WSO","AAON","GNRC","POWL","REZI","EMN","ACNB",

  // ── Materials ─────────────────────────────────────────────────────────────
  "LIN","APD","SHW","PPG","ECL","NEM","GOLD","AEM","PAAS","WPM","RGLD",
  "FNV","AG","NUE","STLD","RS","CLF","X","PKG","IP","WRK","SEE","SLGN",
  "BERY","AMCR","OC","SON","TROX","HUN","ASH","FUL","CE","ALB","LTHM",
  "SQM","PLL","LAC","LTUM",

  // ── Utilities ─────────────────────────────────────────────────────────────
  "NEE","DUK","SO","AEP","XEL","D","PCG","EIX","ES","AWK","WEC","LNT",
  "DTE","CMS","ETR","PPL","AES","OGE","IDA","AMRC","BEP","CWEN","ATO",
  "NI","SR","ONE","NWE","OTTR","AVA","SWX","NWN","MGEE",

  // ── REITs ─────────────────────────────────────────────────────────────────
  "AMT","SBAC","CCI","PLD","EQR","MAA","UDR","CPT","INVH","ESS","NNN",
  "O","VICI","WELL","VTR","PEAK","DOC","MPW","STAG","COLD","IIPR","LXP",
  "CUBE","EXR","PSA","AVB","EQIX","ARE","BXP","SLG","VNO","KIM","FRT",
  "REG","WPC","STORE","ROIC","ALEX","NXRT","ELME","IIPR","GLPI","GAMING",
  "NLY","AGNC","TWO","DX","RWT","EFC","RITM","BXMT","GPMT","RC",

  // ── Communication ─────────────────────────────────────────────────────────
  "T","TMUS","VZ","CMCSA","DIS","PARA","WBD","FOX","FOXA","SIRI","CHTR","LUMN",

  // ── Media / Gaming / Streaming ────────────────────────────────────────────
  "EA","TTWO","RBLX","U","ROKU","SPOT","WMG","LGF.A","IMAX","AMC","CINE",

  // ── Sector ETFs (high liquidity) ──────────────────────────────────────────
  "SPY","QQQ","IWM","DIA","XLF","XLE","XLK","XLV","XLI","XLP","XLU",
  "XLY","XLB","XLRE","GLD","SLV","GDX","GDXJ","IAU","TLT","HYG",
  "EEM","EFA","VNQ","ARKK","ARKG","ARKW","SMH","SOXX","IBB","XBI",

  // ── Additional Large / Mid Cap Tech ──────────────────────────────────────
  "FICO","GDDY","VRSN","AKAM","FFIV","JNPR","CDAY","TYL","PCOR","SAIC",
  "EXPE","YELP","CARS","EVRI","PRFT","CACI","MANT","MAXN","POWI","SITM",
  "ALGM","AEHR","KLIC","LSCC","MTSI","SMTC","SYNA","BRKS","CCMP","FORM",
  "GFS","IMOS","ONTO","PLAB","AOSL","AXTI","IIVI","MKSI","NOVT","NATI",

  // ── More SaaS / Cloud / Dev Tools ────────────────────────────────────────
  "APPF","APPN","BLKB","CVLT","FOUR","FRSH","JAMF","KVYO","MNDY","NTNX",
  "PEGA","QLYS","QTWO","ZUO","ASAN","BOX","DOCU","EGHT","FSLY","VMEO",
  "WIX","YEXT","BIGC","RPAY","TENB","CHKP","CYBR","VRNT","RPD","MIME",

  // ── AI / Autonomous / Robotics ────────────────────────────────────────────
  "BBAI","SOUN","ACHR","JOBY","LAZR","MVIS","OUST","VLDR","AEVA","AEYE",
  "INVZ","KOPN","PATH","IREN","CWAN","RXRX","RVMD","PTCT","NUVL","KYMR",

  // ── More Semiconductors ───────────────────────────────────────────────────
  "ENPH","FSLR","MAXN","SEDG","SPWR","RUN","ARRY","NOVA","FTCI","SHLS",
  "WOLF","AMAT","ACLS","UCTT","COHU","RMBS","IPGP","SIMO","DIOD","PLAB",

  // ── More Biotech / Pharma ─────────────────────────────────────────────────
  "IMVT","GPCR","FGEN","DAWN","ARVN","ARWR","ALNY","ALLO","APLS","APLT",
  "ARNA","ARQT","NBIX","ACAD","BMRN","ALKS","JAZZ","PRGO","UTHR","CRSP",
  "EDIT","NTLA","BEAM","DNLI","RCUS","KRTX","IOVA","TVTX","VRNA","DRNA",
  "TGTX","PCVX","HALO","INCY","EXEL","FATE","IKNA","MRUS","XENE","NUVL",
  "ASND","GRFS","ITCI","LGND","LMNX","LMNL","MDGL","MGNX","MIRM","MNKD",
  "MORF","MRVI","MRUS","MYPS","NEOS","NEUMF","NKTR","NBTX","OCGN","OCUL",

  // ── Healthcare Services / Tools ───────────────────────────────────────────
  "OPCH","AMED","ENSG","HCSG","OMCL","PDCO","PNTG","PRVA","RCKT","LHCG",
  "ACAD","ACHC","AGIO","AHCO","AMWL","TMDX","NARI","SWAV","INSP","NVCR",
  "AXNX","NUVA","OFIX","GMED","STVN","PODD","RMD","STE","ALGN","DXCM",

  // ── More Energy ───────────────────────────────────────────────────────────
  "AESI","BATL","CLB","CPE","CRK","DEN","DINO","FLNG","FRO","GLNG",
  "GPOR","KOS","MGY","MNRL","MRC","MUSA","NEX","NFG","TALO","TDW",
  "TRGP","W","VAALCO","ESTE","RRC","CNX","PDCE","SM","CIVI","MTDR",

  // ── More Industrials ─────────────────────────────────────────────────────
  "AGCO","FAST","GWW","MSC","SNA","SWK","ROLL","ROP","ATR","AYI",
  "BMI","CMI","CSWI","DXPE","ESE","GNSS","HUBB","KBR","KTOS","LNN",
  "MATX","MHK","MHO","NVR","POWL","ROAD","URI","TITN","TNC","WIRE",
  "ALLE","ACCO","ACM","AIMC","ARCB","AROW","ARTNA","ASGN","ASIX","ASMB",
  "ATC","ATKR","ATTO","ATVI","ATW","AWI","AWK","AXTA","AYI","AZTA",

  // ── More Consumer Discretionary ───────────────────────────────────────────
  "OLLI","LESL","BOOT","GOOS","LEVI","CURV","CPNG","CATO","WHR","SIG",
  "TLYS","RCII","PSMT","PRTY","PLBY","MBUU","BIRD","BIG","BGFV","MNSO",
  "ONON","DECK","CROX","BIRK","SKECHERS","SKX","PVH","GH","GRMN","LCII",
  "MCRI","MODV","MOHN","MOLI","MOMO","MONO","MOOV","MORN","MOS","MOST",
  "MOXC","MPLN","MRAM","MRCY","MREO","MRIN","MRKR","MRMR","MRNA","MRNB",

  // ── More Consumer Staples ─────────────────────────────────────────────────
  "COTY","ELF","HIMS","KVUE","OLPX","SKIN","WBA","UNFI","TWNK","PZZA",
  "VITL","WMK","VLTO","SFM","PFGC","USFD","SPTN","BJ","GO","COKE",
  "CHEF","DINE","EAT","JACK","LANC","LWAY","NATH","PTRY","RICK","RRGB",
  "RUTH","SHAK","SMWB","STKS","TXRH","USCF","WING","YUMC","ZOES","BJRI",

  // ── More Materials ────────────────────────────────────────────────────────
  "ARNC","ATI","BALL","CF","EMN","GEF","HXL","IPAR","MP","MTRN",
  "NEU","OEC","POOL","TROX","TRQ","AXTA","BCPC","CBT","HWKN","IOSP",
  "IFF","KWR","MEOH","MGPI","MMI","MTUS","NACCO","NOVL","OPAL","ORION",
  "SXT","TREX","TRNS","UFPI","UNVR","ZEUS","ZWS","AMCR","BERY","SLGN",

  // ── More REITs ────────────────────────────────────────────────────────────
  "ACC","AIV","AKR","AMH","APLE","BDN","BHR","BRSP","CLPR","CPLG",
  "CTRE","DEI","EGP","EPR","ESRT","FPI","GTY","IRM","MDV","OLP",
  "PINE","PK","SAFE","SELF","SITC","SKT","SVC","UBA","UBP","UE",
  "UHT","UNIT","GMRE","GOOD","HIW","IIPR","ILPT","KRG","NHI","NNN",
  "NXRT","OHI","OUT","PDM","PSTL","PTMN","ROIC","RPT","SBRA","SILA",

  // ── More Financials ───────────────────────────────────────────────────────
  "ARCC","BXSL","CSWC","FSK","GBDC","HTGC","MAIN","NMFC","OCSL","ORCC",
  "TCPC","TPVG","TRIN","TSLX","PSEC","SCM","SLRC","AGO","AIZ","NAVI",
  "NMIH","SLM","WRLD","CACC","ECPG","ENVA","OMF","PRAA","QCRH","CURO",
  "LPRO","ATLC","BCAL","BFIN","BGCP","BHLB","BKSC","BKSY","BKYI","BLFY",
  "BMBL","BMRC","BMTC","BNCN","BNDX","BNIX","BNS","BNTC","BNTX","BOCH",

  // ── Crypto / Digital Assets ───────────────────────────────────────────────
  "MSTR","MARA","RIOT","BTBT","HUT","CIFR","BITF","CLSK","COIN","HOOD",

  // ── More Communication / Media ────────────────────────────────────────────
  "NXST","GTN","SSP","SBGI","CCOI","LBRDA","LBRDK","FWONA","FWONK","LSXMA",
  "LSXMB","LSXMK","BATRA","BATRK","LLNW","IDT","SHEN","OOMA","VONAGE","BAND",

  // ── More Leveraged ETFs / Volatility ─────────────────────────────────────
  "SQQQ","TQQQ","SPXU","SPXL","UVXY","SVXY","VXX","VIXY","SOXL","SOXS",
  "LABD","LABU","NAIL","TNA","TZA","FAZ","FAS","NUGT","DUST","JNUG",
];

export const STOCK_UNIVERSE = [...new Set(RAW_UNIVERSE)];

// ─── Scan universe ─────────────────────────────────────────────────────────────
// 200 highly liquid, actively-traded US equities covering every major sector.
// These are fetched directly via the Yahoo Finance v8 chart API (the only endpoint
// that works reliably without authentication). Full 1-year OHLCV → deep analysis.

export const SCAN_UNIVERSE: string[] = [
  // ── Mega-cap tech ──────────────────────────────────────────────────────────
  "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","NFLX","UBER","ABNB",
  // ── Semiconductors ────────────────────────────────────────────────────────
  "AMD","INTC","QCOM","AVGO","MU","AMAT","LRCX","TXN","KLAC","ARM","MRVL","ADI","SMCI","ON","NXPI",
  // ── Software / Cloud / SaaS ───────────────────────────────────────────────
  "ORCL","CRM","ADBE","NOW","INTU","WDAY","PLTR","DDOG","SNOW","NET",
  "ZS","PANW","CRWD","FTNT","OKTA","TEAM","HUBS","TTD","MDB","GTLB",
  "CFLT","BRZE","BILL","DUOL","DOCN","MNDY","APPN","KVYO","FRSH","BOX",
  // ── AI / Data ─────────────────────────────────────────────────────────────
  "BBAI","SOUN","PATH","CWAN","RXRX","IREN",
  // ── Finance ───────────────────────────────────────────────────────────────
  "JPM","BAC","WFC","GS","MS","V","MA","AXP","BLK","BX",
  "C","USB","SCHW","COIN","HOOD","SOFI","KKR","APO","CME","ICE",
  // ── Healthcare ────────────────────────────────────────────────────────────
  "UNH","LLY","JNJ","ABBV","PFE","MRK","TMO","AMGN","REGN","GILD",
  "VRTX","MRNA","ABT","MDT","DXCM","ISRG","BSX","EW","PODD","RVMD",
  // ── Energy ────────────────────────────────────────────────────────────────
  "XOM","CVX","COP","OXY","SLB","DVN","EOG","FANG","MPC","LNG","VLO","TRGP",
  // ── Consumer Discretionary ────────────────────────────────────────────────
  "COST","TGT","WMT","HD","LOW","MCD","SBUX","CMG","BKNG","ETSY",
  "NKE","LULU","ROST","TJX","ORLY","AZO","CHWY","GM","F","RIVN",
  // ── Industrials / Defense ─────────────────────────────────────────────────
  "CAT","DE","HON","GE","BA","RTX","UPS","FDX","URI","LMT","GD","NOC","KTOS",
  // ── Biotech / High-beta ───────────────────────────────────────────────────
  "CRSP","BEAM","NVAX","NUVL","KYMR","ALNY","EDIT","NTLA","ARWR","IOVA",
  // ── Crypto / Digital assets ───────────────────────────────────────────────
  "MSTR","MARA","RIOT","CLSK","HUT","CIFR",
  // ── ETFs (sector benchmarks) ──────────────────────────────────────────────
  "SPY","QQQ","IWM","GLD","TLT","SMH","SOXX","XLF","XLE","XLK","XLV","ARKK",
];

// ─── Indicator helpers ────────────────────────────────────────────────────────

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const slice = changes.slice(-period);
  const gains = slice.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses =
    slice.filter((c) => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function atr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs = bars.slice(1).map((b, i) => {
    const prev = bars[i].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── Market regime from SPY OHLCV ────────────────────────────────────────────

export function computeMarketRegime(bars: OHLCVBar[]): MarketRegime | null {
  if (bars.length < 200) return null;
  const closes = bars.map((b) => b.close);
  const spyPrice = closes[closes.length - 1];

  const spySma200 = sma(closes, 200);
  if (spySma200 === null) return null;

  const aboveSma200 = spyPrice > spySma200;

  const price60dAgo = closes[closes.length - 61] ?? closes[0];
  const return60d = ((spyPrice - price60dAgo) / price60dAgo) * 100;

  // Trend from SMA200 slope (current vs 20 bars ago)
  const sma200_20dAgo = sma(closes.slice(0, closes.length - 20), 200);
  let trend: MarketTrend = "sideways";
  if (sma200_20dAgo !== null) {
    const slope = ((spySma200 - sma200_20dAgo) / sma200_20dAgo) * 100;
    if (slope > 0.5 && aboveSma200) trend = "uptrend";
    else if (slope < -0.5 || !aboveSma200) trend = "downtrend";
  }

  const label =
    trend === "uptrend" ? "Bull market" :
    trend === "downtrend" ? "Bear market" : "Sideways market";

  return {
    spyPrice,
    spySma200,
    aboveSma200,
    trend,
    return60d,
    note: `${label} — SPY ${aboveSma200 ? "above" : "below"} 200SMA, ${return60d >= 0 ? "+" : ""}${return60d.toFixed(1)}% in 60d`,
  };
}

// ─── Pattern detection ────────────────────────────────────────────────────────

function detectPattern(
  bars: OHLCVBar[],
  price: number,
  sm20: number,
  sm50: number,
): { pattern: ScreenerPattern; breakoutLevel: number; consolidationDays: number } {
  const closes = bars.map((b) => b.close);
  const highs  = bars.map((b) => b.high);
  const lows   = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const len = bars.length;

  // Cup & Handle: U-shaped base 60-100 bars, handle < 50% of cup depth
  if (len >= 80) {
    const cup = bars.slice(-100);
    const cupHighL = cup[0].close;
    const cupHighR = cup[cup.length - 1].close;
    const cupLow   = Math.min(...cup.map((b) => b.low));
    const rimLevel = Math.max(cupHighL, cupHighR);
    const cupDepth = ((rimLevel - cupLow) / rimLevel) * 100;
    if (cupDepth >= 12 && cupDepth <= 40) {
      const handle    = bars.slice(-20);
      const handleLow = Math.min(...handle.map((b) => b.low));
      const retracement = ((rimLevel - handleLow) / (rimLevel - cupLow)) * 100;
      if (retracement < 50 && price > rimLevel * 0.97) {
        return { pattern: "cup_and_handle", breakoutLevel: rimLevel, consolidationDays: 20 };
      }
    }
  }

  // Double Bottom: two lows within 3% of each other in last 60 bars
  if (len >= 40) {
    const search = bars.slice(-60);
    const mid    = Math.floor(search.length / 2);
    const lo1    = Math.min(...search.slice(0, mid).map((b) => b.low));
    const lo2    = Math.min(...search.slice(mid).map((b) => b.low));
    if (Math.abs(lo1 - lo2) / lo1 < 0.03) {
      const neckline = Math.max(...search.map((b) => b.high));
      return { pattern: "double_bottom", breakoutLevel: neckline, consolidationDays: search.length };
    }
  }

  // Bull Flag: 20-bar pole > 8% then 10-bar flag < 5% range
  if (len >= 30) {
    const pole    = bars.slice(-30, -10);
    const flag    = bars.slice(-10);
    const poleRet = ((pole[pole.length - 1].close - pole[0].close) / pole[0].close) * 100;
    const flagRange = (Math.max(...flag.map((b) => b.high)) - Math.min(...flag.map((b) => b.low))) / price * 100;
    if (poleRet > 8 && flagRange < 5) {
      return { pattern: "bull_flag", breakoutLevel: Math.max(...flag.map((b) => b.high)), consolidationDays: 10 };
    }
  }

  // Consolidation Breakout: tight 10-day range near 52-week high
  const high10d  = Math.max(...highs.slice(-10));
  const low10d   = Math.min(...lows.slice(-10));
  const range10d = (high10d - low10d) / price * 100;
  const high52w  = Math.max(...highs);
  if (range10d < 5 && price > high52w * 0.95) {
    return { pattern: "consolidation_breakout", breakoutLevel: high10d, consolidationDays: 10 };
  }

  // SMA Bounce: pulled back to SMA20/50, now recovering
  const recentLow = Math.min(...lows.slice(-5));
  if (recentLow <= sm20 * 1.01 && price > sm20 && price > sm50) {
    return { pattern: "sma_bounce", breakoutLevel: Math.max(...highs.slice(-20)), consolidationDays: 5 };
  }

  // Momentum Continuation: above SMAs, RSI 50-72, volume expanding
  const rsi14Val = rsi(closes);
  if (rsi14Val !== null && rsi14Val >= 50 && rsi14Val <= 72 && price > sm20 && price > sm50) {
    const avgVol20   = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const recentVol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (recentVol5 > avgVol20 * 1.1) {
      return { pattern: "momentum_continuation", breakoutLevel: Math.max(...highs.slice(-20)), consolidationDays: 5 };
    }
  }

  return { pattern: "none", breakoutLevel: price * 1.03, consolidationDays: 0 };
}

// ─── Deep indicator computation (requires 200+ OHLCV bars) ───────────────────

export function computeIndicators(
  ticker: string,
  name: string,
  bars: OHLCVBar[],
  spyReturn60d: number
): ScreenerCandidate | null {
  if (bars.length < 200) return null;

  const closes  = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const len     = bars.length;
  const price   = closes[len - 1];

  // Moving averages
  const sm20  = sma(closes, 20);
  const sm50  = sma(closes, 50);
  const sm150 = sma(closes, 150);
  const sm200 = sma(closes, 200);
  if (sm20 === null || sm50 === null || sm150 === null || sm200 === null) return null;

  const rsi14Val = rsi(closes);
  if (rsi14Val === null) return null;

  // ATR
  const atr14Val  = atr(bars, 14);
  const atr14Pct  = price > 0 ? (atr14Val / price) * 100 : 0;

  // Momentum
  const p5  = closes[len - 6]  ?? closes[0];
  const p20 = closes[len - 21] ?? closes[0];
  const p60 = closes[len - 61] ?? closes[0];
  const change5d  = ((price - p5)  / p5)  * 100;
  const change20d = ((price - p20) / p20) * 100;
  const change60d = ((price - p60) / p60) * 100;
  const relativeStrength = change60d - spyReturn60d;

  // Volume ratio vs 50-day avg
  const latestVol = volumes[len - 1];
  const avgVol50  = volumes.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;
  const volumeRatio = avgVol50 > 0 ? latestVol / avgVol50 : 1;

  // 10-day range
  const high10d  = Math.max(...bars.slice(-10).map((b) => b.high));
  const low10d   = Math.min(...bars.slice(-10).map((b) => b.low));
  const range10d = (high10d - low10d) / price * 100;

  // Volatility contraction: recent ATR < early ATR within 14-bar window
  const recentATR = atr(bars.slice(-8),    7);
  const earlyATR  = atr(bars.slice(-15, -7), 7);
  const isContracting = range10d < 6 && earlyATR > 0 && recentATR < earlyATR * 0.85;

  // Pattern detection
  const { pattern, breakoutLevel, consolidationDays } = detectPattern(bars, price, sm20, sm50);
  const breakoutDistance = ((breakoutLevel - price) / price) * 100;

  // Trade setup
  const entry       = price;
  const stopLevel   = entry - 1.5 * atr14Val;
  const riskPerShare = entry - stopLevel;
  const targetLevel  = entry + 3 * riskPerShare;
  const riskReward   = riskPerShare > 0 ? (targetLevel - entry) / riskPerShare : 0;

  // Score components (0-100)
  let breakoutStrength = 0;
  if (pattern !== "none") {
    breakoutStrength += 30;
    if (breakoutDistance < 1)      breakoutStrength += 40;
    else if (breakoutDistance < 3) breakoutStrength += 25;
    else if (breakoutDistance < 6) breakoutStrength += 10;
    if (volumeRatio > 1.5)         breakoutStrength += 20;
    else if (volumeRatio > 1.2)    breakoutStrength += 10;
    breakoutStrength = Math.min(100, breakoutStrength);
  }

  let volumeExpansion = 0;
  if      (volumeRatio > 3)   volumeExpansion = 100;
  else if (volumeRatio > 2.5) volumeExpansion = 85;
  else if (volumeRatio > 2)   volumeExpansion = 70;
  else if (volumeRatio > 1.5) volumeExpansion = 50;
  else if (volumeRatio > 1.2) volumeExpansion = 30;
  else if (volumeRatio > 1)   volumeExpansion = 15;

  const trendAlignment =
    (price > sm20  ? 25 : 0) +
    (price > sm50  ? 25 : 0) +
    (price > sm150 ? 25 : 0) +
    (price > sm200 ? 25 : 0);

  const volatilityContraction =
    isContracting    ? 80 :
    range10d < 8     ? 50 :
    range10d < 12    ? 25 : 0;

  // RS component: map relativeStrength to 0-100 (±10% range → 0-100)
  const rsComponent = Math.max(0, Math.min(100, (relativeStrength + 10) * 5));

  const score =
    0.35 * breakoutStrength +
    0.25 * rsComponent +
    0.20 * volumeExpansion +
    0.10 * trendAlignment +
    0.10 * volatilityContraction;

  return {
    ticker, name, price,
    sma20: sm20, sma50: sm50, sma150: sm150, sma200: sm200,
    aboveSma20: price > sm20, aboveSma50: price > sm50,
    aboveSma150: price > sm150, aboveSma200: price > sm200,
    change5d, change20d, change60d, relativeStrength,
    rsi14: rsi14Val, atr14: atr14Val, atr14Pct,
    volumeRatio,
    range10d, isContracting,
    pattern, breakoutLevel, breakoutDistance, consolidationDays,
    entry, stopLevel, targetLevel, riskReward,
    breakoutStrength, volumeExpansion, trendAlignment, volatilityContraction,
    rsRank: 0,  // filled later by assignRSRanks()
    score,
  };
}

// ─── Assign RS rank percentiles in place ─────────────────────────────────────

export function assignRSRanks(candidates: ScreenerCandidate[]): void {
  if (candidates.length === 0) return;
  const sorted = [...candidates].sort((a, b) => a.relativeStrength - b.relativeStrength);
  sorted.forEach((c, i) => {
    const pct = candidates.length > 1
      ? Math.round((i / (candidates.length - 1)) * 100)
      : 100;
    const original = candidates.find((x) => x.ticker === c.ticker);
    if (original) original.rsRank = pct;
  });
}

// ─── Get top N candidates: RR filter + weighted score sort ───────────────────

export function getTopCandidates(
  candidates: ScreenerCandidate[],
  topN = 12,
  minRR = 1.8
): ScreenerCandidate[] {
  return [...candidates]
    .filter((c) => c.riskReward >= minRR)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
