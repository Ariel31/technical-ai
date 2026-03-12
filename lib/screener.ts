import type {
  OHLCVBar,
  MarketRegime,
  MarketTrend,
  ScreenerCandidate,
} from "./types";
import { sma, ema, rsi, atr, detectPattern, detectReversalPattern, computeScores, passesBasicFilter, passesTrendFilter } from "./pipeline";

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
  "T","TMUS","VZ","CMCSA","DIS","WBD","FOX","FOXA","SIRI","CHTR","LUMN",

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
  "AIV","AKR","AMH","APLE","BDN","BHR","BRSP","CLPR","CPLG",
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

const RAW_SCAN: string[] = [
  // ── Mega-cap tech & communication ─────────────────────────────────────────
  "AAPL","MSFT","NVDA","GOOGL","GOOG","META","AMZN","TSLA","NFLX","UBER","ABNB","LYFT",

  // ── Semiconductors ────────────────────────────────────────────────────────
  "AMD","INTC","QCOM","AVGO","MU","AMAT","LRCX","TXN","KLAC","ARM","MRVL","ADI","SMCI",
  "ON","NXPI","SWKS","SNPS","CDNS","MPWR","MCHP","ENTG","WOLF","RMBS","IPGP","COHU",
  "UCTT","ACLS","MKSI","LSCC","MTSI","SYNA","ALGM","AEHR","KLIC","GFS","ONTO","PLAB",

  // ── Software / Cloud / SaaS ───────────────────────────────────────────────
  "ORCL","CRM","ADBE","NOW","INTU","WDAY","PLTR","DDOG","SNOW","NET",
  "ZS","PANW","CRWD","FTNT","OKTA","TEAM","HUBS","TTD","MDB","GTLB",
  "CFLT","BRZE","BILL","DUOL","DOCN","MNDY","APPN","KVYO","FRSH","BOX",
  "IBM","ACN","CSCO","CTSH","EPAM","GDDY","FICO","VRSN","AKAM","FFIV",
  "MANH","MSI","JKHY","TYL","CDW","ADSK","ANET","ANSS","CHKP","CIEN",
  "FIVN","GLOB","PD","QLYS","STNE","PCOR",
  "TOST","SPSC","NTNX","ASAN","DOCU","TENB","CYBR","RPD","VRNT",
  "EGHT","WIX","YEXT","APPF","BLKB","CVLT","JAMF","PEGA","QTWO",

  // ── AI / Robotics / Autonomous ────────────────────────────────────────────
  "BBAI","SOUN","PATH","CWAN","RXRX","IREN","ACHR","JOBY","AI",

  // ── Hardware / IT infrastructure ─────────────────────────────────────────
  "HPQ","HPE","DELL","PSTG","NTAP","WDC","STX","VIAV","CRUS",

  // ── Internet / Consumer tech ──────────────────────────────────────────────
  "SNAP","PINS","HOOD","SOFI","AFRM","UPST","COIN","MSTR","XYZ","PYPL",
  "MELI","BIDU","RBLX","SPOT","ROKU","ETSY","CHWY","EXPE","BKNG","TRIP",

  // ── Finance: Major banks & brokers ────────────────────────────────────────
  "JPM","BAC","WFC","C","GS","MS","USB","PNC","TFC","COF","AXP",
  "SYF","ALLY","SCHW","IBKR","RJF","BK","STT","NTRS",
  "V","MA","PYPL","FIS","FISV","GPN","WU","MQ","OWL",

  // ── Finance: Mid-cap banks ────────────────────────────────────────────────
  "FITB","HBAN","RF","KEY","CMA","ZION","WAL","CFG","FHN","WBS",
  "UMBF","WTFC","PNFP","FCNCA","BOKF","FFIN","OFG","CVBF","HWC",

  // ── Finance: Asset management / exchanges ─────────────────────────────────
  "BLK","BX","KKR","APO","ARES","IVZ","AMP","BEN","MCO","SPGI","MSCI",
  "NDAQ","ICE","CME","CBOE","MKTX","LPLA","VOYA","LNC","EQH",

  // ── Finance: Insurance ────────────────────────────────────────────────────
  "AIG","MET","PRU","AFL","ALL","CB","TRV","HIG","PGR","MKL","ERIE","CINF",
  "MMC","WTW","GL","FNF","RDN","ESNT","UNM","RLI","FAF","AXS","KNSL",

  // ── Finance: BDCs / Specialty ─────────────────────────────────────────────
  "ARCC","MAIN","HTGC","GBDC","FSK","CSWC","BXSL","SLRC","TCPC",

  // ── Healthcare: Large pharma / biotech ────────────────────────────────────
  "UNH","LLY","JNJ","ABBV","PFE","MRK","TMO","AMGN","REGN","GILD",
  "VRTX","MRNA","ABT","BMY","BIIB","AZN","NVO","CVS","HUM","CNC",
  "MOH","HCA","THC","UHS","MCK","CI","ELV","GEHC","OGN",

  // ── Healthcare: Med devices & tools ──────────────────────────────────────
  "MDT","BSX","EW","ISRG","DXCM","PODD","RMD","STE","ALGN","ABT",
  "SYK","ZBH","HOLX","IDXX","INSP","NVCR","DHR","A","BIO","ILMN",
  "IART","MMSI","GKOS","ATRC","DGX","XRAY","EXAS","AXSM","ELAN",

  // ── Healthcare: Biotech (mid/small) ──────────────────────────────────────
  "ALNY","ARWR","CRSP","EDIT","NTLA","BEAM","DNLI","KYMR","NUVL","RVMD",
  "IOVA","TVTX","PCVX","HALO","INCY","EXEL","NBIX","ACAD","BMRN","ALKS",
  "JAZZ","PRGO","UTHR","NVAX","RCUS","SRPT","TGTX","LGND","MDGL",

  // ── Energy: E&P ───────────────────────────────────────────────────────────
  "XOM","CVX","COP","EOG","OXY","DVN","FANG","SLB","HAL","BKR",
  "CIVI","SM","AR","MTDR","EQT","RRC","CNX","MUR","NOG",
  "GPOR","BATL","TALO","CRK","MGY","KOS","CLB",

  // ── Energy: Downstream / Midstream ───────────────────────────────────────
  "MPC","PSX","VLO","PBF","LNG","TRGP","OKE","WMB","KMI","EPD","ET",
  "PAA","MPLX","DT","DKL","DINO","FLNG","FRO","GLNG","TDW",

  // ── Consumer Discretionary: Retail ───────────────────────────────────────
  "COST","WMT","TGT","HD","LOW","ROST","TJX","BURL","FIVE","DLTR","DG",
  "BBY","ORLY","AZO","GPC","TSCO","WSM","RH","OLLI","LESL","BOOT",
  "NKE","LULU","ONON","DECK","CROX","PVH","RL","TPR","CPRI",
  "KSS","LEVI","MNSO","GOOS","WHR","SIG","TLYS",

  // ── Consumer Discretionary: Auto & EV ────────────────────────────────────
  "GM","F","RIVN","LCID","NIO","LI","XPEV","AN","KMX","LAD","PAG","HTZ","STLA",

  // ── Consumer Discretionary: Restaurants / Travel ─────────────────────────
  "MCD","SBUX","CMG","DPZ","YUM","QSR","WING","SHAK","TXRH","BJRI","EAT",
  "H","HLT","MAR","WH","BKNG","EXPE","RCL","CCL","NCLH","MTN","DKNG",
  "MGM","WYNN","LVS","CZR","PENN","VICI",

  // ── Consumer Staples ──────────────────────────────────────────────────────
  "PG","CL","KO","PEP","PM","MO","MNST","KMB","CLX","CHD","MDLZ",
  "GIS","MKC","SJM","HRL","CAG","POST","CPB","KR","COTY","ELF",
  "HIMS","KVUE","SFM","PFGC","USFD","BJ","CHEF","VITL",

  // ── Industrials: Defense ─────────────────────────────────────────────────
  "LMT","RTX","NOC","GD","BA","LDOS","SAIC","BAH","HII","KTOS","TDG","AVAV",

  // ── Industrials: Transportation ───────────────────────────────────────────
  "UPS","FDX","JBHT","CHRW","KNX","ODFL","XPO","GXO","RXO","ARCB",
  "DAL","UAL","AAL","LUV","ALGT","MATX",

  // ── Industrials: Machinery / Conglomerates ────────────────────────────────
  "CAT","DE","HON","GE","GEV","ETN","EMR","PH","ITW","IR","TT","ROK",
  "AME","FTV","PNR","GGG","IEX","NDSN","GTLS","AGCO","CMI","SNA","SWK",
  "ROP","URI","FAST","GWW","MSC","KBR","BMI","AYI","HUBB","ATR",

  // ── Industrials: Construction / Building ─────────────────────────────────
  "CBRE","JLL","WY","BLDR","IBP","MAS","MLM","VMC",
  "CRH","EXP","UFPI","TREX","AWI","NVR","MHO","LEN","PHM",
  "DHI","TOL","TMHC","GRBK","LGIH","MTH","CVCO","SKY",

  // ── Industrials: HVAC / Electrical ────────────────────────────────────────
  "CARR","OTIS","LII","WSO","GNRC","POWL","REZI","AAON","ALLE",

  // ── Materials ─────────────────────────────────────────────────────────────
  "LIN","APD","SHW","PPG","ECL","NEM","GOLD","AEM","PAAS","WPM","RGLD",
  "FNV","NUE","STLD","RS","CLF","PKG","IP","ALB","MP","CF","MOS",
  "BALL","AMCR","SEE","SLGN","OC","SON","AXTA","IFF","EMN",
  "HUN","ASH","CE","TROX","ATI","HWKN","BCPC","NEU","POOL",

  // ── Utilities ─────────────────────────────────────────────────────────────
  "NEE","DUK","SO","AEP","XEL","D","PCG","EIX","ES","AWK","WEC","LNT",
  "DTE","CMS","ETR","PPL","AES","ATO","NI","SR","AVA","SWX","NWE","OTTR",
  "AMRC","BEP","CWEN","OGE","IDA","MGEE",

  // ── REITs ─────────────────────────────────────────────────────────────────
  "AMT","SBAC","CCI","PLD","EQR","MAA","UDR","CPT","INVH","ESS","NNN","O",
  "VICI","WELL","VTR","DOC","STAG","COLD","CUBE","EXR","PSA","AVB","EQIX",
  "ARE","BXP","SLG","VNQ","KIM","FRT","REG","WPC","IRM","EPR",
  "NHI","OHI","SKT","SAFE","SITC","SBRA","KRG","CTRE","EGP","ESRT","PINE",

  // ── Communication ─────────────────────────────────────────────────────────
  "T","TMUS","VZ","CMCSA","DIS","CHTR","WBD","FOX","SIRI","LUMN",
  "NXST","GTN","CCOI","LBRDK","ROKU","WMG","EA","TTWO","RBLX","U",

  // ── Sector & Thematic ETFs ────────────────────────────────────────────────
  "SPY","QQQ","IWM","DIA","GLD","SLV","TLT","HYG","EEM","EFA","VNQ",
  "XLF","XLE","XLK","XLV","XLI","XLP","XLU","XLY","XLB","XLRE",
  "SMH","SOXX","IBB","XBI","ARKK","ARKG","ARKW","GDX","GDXJ","IAU",

  // ── Leveraged / Volatility ETFs ───────────────────────────────────────────
  "TQQQ","SQQQ","SPXL","SPXU","SOXL","SOXS","UVXY","VXX","LABU","LABD",
  "NUGT","DUST","TNA","TZA","FAS","FAZ","JNUG",
];

export const SCAN_UNIVERSE = [...new Set(RAW_SCAN)];

// sma, rsi, atr, detectPattern, computeScores imported from ./pipeline

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

// ─── Deep indicator computation (requires 200+ OHLCV bars) ───────────────────

export function computeIndicators(
  ticker: string,
  name: string,
  bars: OHLCVBar[],
  spyReturn60d: number
): ScreenerCandidate | null {
  if (bars.length < 200) return null;

  const closes  = bars.map((b) => b.close);
  const highs   = bars.map((b) => b.high);
  const lows    = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const len     = bars.length;
  const price   = closes[len - 1];

  // ── Stage 1: Basic filter — price > $10, 50-day avg vol > 500k ───────────
  if (!passesBasicFilter(bars, price)) return null;

  // Moving averages
  const sm20  = sma(closes, 20);
  const sm50  = sma(closes, 50);
  const sm150 = sma(closes, 150);
  const sm200 = sma(closes, 200);
  if (sm20 === null || sm50 === null || sm150 === null || sm200 === null) return null;

  // Exponential moving averages
  const em20 = ema(closes, 20) ?? sm20;
  const em50 = ema(closes, 50) ?? sm50;

  // ── Stage 2: Trend filter — Minervini template ────────────────────────────
  // price > SMA200, price > SMA150, SMA150 > SMA200, within 15% of 52wk high
  const high52w = Math.max(...highs);
  const low52w  = Math.min(...lows);
  if (!passesTrendFilter(price, sm150, sm200, high52w)) return null;

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

  // Trade setup — chart-based stops so each stock has a unique R/R
  const entry    = price;
  const atrStop  = entry - 1.5 * atr14Val;

  let stopLevel: number;
  let targetLevel: number;

  switch (pattern) {
    case "bull_flag": {
      // Stop below the flag low; target = measured pole move above breakout
      const flagLow  = Math.min(...bars.slice(-10).map((b) => b.low));
      const poleHigh = bars[bars.length - 11]?.close ?? breakoutLevel;
      const poleBase = bars[bars.length - 30]?.close ?? (breakoutLevel * 0.9);
      stopLevel  = Math.max(flagLow * 0.993, atrStop);
      targetLevel = breakoutLevel + (poleHigh - poleBase) * 0.8;
      break;
    }
    case "cup_and_handle": {
      // Stop below handle low; target = breakout + cup depth (measured move)
      const handleLow = Math.min(...bars.slice(-20).map((b) => b.low));
      const cupLow    = Math.min(...bars.slice(-100).map((b) => b.low));
      stopLevel  = Math.max(handleLow * 0.993, atrStop);
      targetLevel = breakoutLevel + (breakoutLevel - cupLow) * 0.75;
      break;
    }
    case "double_bottom": {
      // Stop below the second bottom; target = neckline + measured move
      const searchBars = bars.slice(-60);
      const mid = Math.floor(searchBars.length / 2);
      const lo2 = Math.min(...searchBars.slice(mid).map((b) => b.low));
      stopLevel  = Math.max(lo2 * 0.993, atrStop);
      targetLevel = breakoutLevel + (breakoutLevel - lo2);
      break;
    }
    case "consolidation_breakout": {
      // Stop below the tight range; target = range width projected above breakout
      const consoLow = Math.min(...bars.slice(-10).map((b) => b.low));
      stopLevel  = Math.max(consoLow * 0.994, atrStop);
      targetLevel = breakoutLevel + (breakoutLevel - consoLow) * 3;
      break;
    }
    case "sma_bounce": {
      // Stop below SMA50; target at recent swing high (or 2× risk if swing is too close)
      stopLevel = Math.max(sm50 * 0.979, atrStop);
      const swingHigh = Math.max(...bars.slice(-20).map((b) => b.high));
      const riskDist  = entry - stopLevel;
      targetLevel = Math.max(swingHigh, entry + 2 * riskDist);
      break;
    }
    default: {
      // Momentum continuation / no pattern: plain ATR-based
      stopLevel   = atrStop;
      targetLevel = entry + 3.0 * (entry - stopLevel);
      break;
    }
  }

  // Safety bounds — stop can't exceed 4 × ATR away, must be at least 1.5 × ATR
  stopLevel  = Math.max(stopLevel, entry - 4 * atr14Val);
  stopLevel  = Math.min(stopLevel, entry - 1.5 * atr14Val);
  // Target must be above entry
  targetLevel = Math.max(targetLevel, entry + (entry - stopLevel));

  const riskPerShare = entry - stopLevel;
  const riskReward   = riskPerShare > 0 ? (targetLevel - entry) / riskPerShare : 0;

  // Legacy score components (kept for ScreenerPanel display)
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

  // New pipeline scores
  const { setupScore, opportunityScore, finalScore } = computeScores({
    pattern,
    breakoutDistance,
    volumeRatio,
    relativeStrength,
    trendAlignment,
    isContracting,
    range10d,
    riskReward,
    change5d,
    change20d,
    change60d,
  });

  return {
    ticker, name, price,
    sma20: sm20, sma50: sm50, sma150: sm150, sma200: sm200,
    aboveSma20: price > sm20, aboveSma50: price > sm50,
    aboveSma150: price > sm150, aboveSma200: price > sm200,
    ema20: em20, ema50: em50,
    high52w, low52w,
    change5d, change20d, change60d, relativeStrength,
    rsi14: rsi14Val, atr14: atr14Val, atr14Pct,
    volumeRatio,
    range10d, isContracting,
    pattern, breakoutLevel, breakoutDistance, consolidationDays,
    entry, stopLevel, targetLevel, riskReward,
    breakoutStrength, volumeExpansion, trendAlignment, volatilityContraction,
    rsRank: 0,  // filled later by assignRSRanks()
    setupScore,
    opportunityScore,
    score: finalScore,
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
    .filter((c) =>
      c.riskReward >= minRR &&
      c.pattern !== "none" &&                             // must have a real setup
      (c.targetLevel - c.entry) / c.entry * 100 >= 5     // at least 5% upside
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ─── Reversal candidate computation (skips Minervini trend filter) ────────────
// Runs on stocks that FAILED the trend filter to catch bottoming reversal patterns.

export function computeReversalIndicators(
  ticker: string,
  name: string,
  bars: OHLCVBar[],
  spyReturn60d: number,
): ScreenerCandidate | null {
  if (bars.length < 80) return null;

  const closes  = bars.map((b) => b.close);
  const highs   = bars.map((b) => b.high);
  const lows    = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const len     = bars.length;
  const price   = closes[len - 1];

  // Basic filters — price > $5, 50d avg vol > 500k
  if (price < 5) return null;
  const avgVol50 = volumes.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;
  if (avgVol50 < 500_000) return null;

  // Not a completely dead stock — within 60% of 52-week high
  const high52w = Math.max(...highs);
  const low52w  = Math.min(...lows);
  if (price < high52w * 0.40) return null;

  const sm20  = sma(closes, 20);
  const sm50  = sma(closes, 50);
  const sm150 = sma(closes, 150);
  const sm200 = sma(closes, 200);
  if (sm20 === null || sm50 === null || sm150 === null || sm200 === null) return null;

  const em20 = ema(closes, 20) ?? sm20;
  const em50 = ema(closes, 50) ?? sm50;

  // Skip stocks already passing Minervini — trend screener handles those
  if (passesTrendFilter(price, sm150, sm200, high52w)) return null;

  // Must detect a reversal pattern
  const { pattern, breakoutLevel, consolidationDays } = detectReversalPattern(bars, price);
  if (pattern === "none") return null;

  const rsi14Val = rsi(closes);
  if (rsi14Val === null || rsi14Val > 75) return null; // not already overbought

  const atr14Val  = atr(bars, 14);
  const atr14Pct  = price > 0 ? (atr14Val / price) * 100 : 0;

  const p5  = closes[len - 6]  ?? closes[0];
  const p20 = closes[len - 21] ?? closes[0];
  const p60 = closes[len - 61] ?? closes[0];
  const change5d  = ((price - p5)  / p5)  * 100;
  const change20d = ((price - p20) / p20) * 100;
  const change60d = ((price - p60) / p60) * 100;
  const relativeStrength = change60d - spyReturn60d;

  const latestVol   = volumes[len - 1];
  const volumeRatio = avgVol50 > 0 ? latestVol / avgVol50 : 1;

  const high10d  = Math.max(...bars.slice(-10).map((b) => b.high));
  const low10d   = Math.min(...bars.slice(-10).map((b) => b.low));
  const range10d = (high10d - low10d) / price * 100;

  const recentATR  = atr(bars.slice(-8),    7);
  const earlyATR   = atr(bars.slice(-15, -7), 7);
  const isContracting = range10d < 6 && earlyATR > 0 && recentATR < earlyATR * 0.85;

  const breakoutDistance = ((breakoutLevel - price) / price) * 100;

  // Trade setup — pattern-specific stops and measured-move targets
  const entry    = price;
  const atrStop  = entry - 1.5 * atr14Val;
  let stopLevel: number;
  let targetLevel: number;

  if (pattern === "falling_wedge") {
    const wedgeLow    = Math.min(...bars.slice(-10).map((b) => b.low));
    const wedgeHigh0  = Math.max(...bars.slice(-40, -35).map((b) => b.high));
    const wedgeRange  = wedgeHigh0 - Math.min(...bars.slice(-40).map((b) => b.low));
    stopLevel   = Math.max(wedgeLow * 0.993, atrStop);
    targetLevel = breakoutLevel + wedgeRange * 0.7;
  } else {
    // inverse_head_and_shoulders: stop below right shoulder, target = measured move
    const wb    = bars.slice(-80);
    const rsSeg = wb.slice(Math.floor(wb.length * 0.8));
    const rsLow = Math.min(...rsSeg.map((b) => b.low));
    const hdLow = Math.min(...bars.slice(-60).map((b) => b.low));
    stopLevel   = Math.max(rsLow * 0.993, atrStop);
    targetLevel = breakoutLevel + (breakoutLevel - hdLow) * 0.75;
  }

  // Safety bounds: stop between 1.5 × ATR and 4 × ATR from entry
  stopLevel   = Math.max(stopLevel, entry - 4 * atr14Val);
  stopLevel   = Math.min(stopLevel, entry - 1.5 * atr14Val);
  targetLevel = Math.max(targetLevel, entry + (entry - stopLevel));

  const riskPerShare = entry - stopLevel;
  const riskReward   = riskPerShare > 0 ? (targetLevel - entry) / riskPerShare : 0;

  if (riskReward < 1.8) return null;
  if ((targetLevel - entry) / entry * 100 < 5) return null;

  const trendAlignment =
    (price > sm20  ? 25 : 0) +
    (price > sm50  ? 25 : 0) +
    (price > sm150 ? 25 : 0) +
    (price > sm200 ? 25 : 0);

  const breakoutStrength   = 60;
  const volumeExpansion    = volumeRatio > 1.5 ? 60 : volumeRatio > 1.2 ? 40 : 20;
  const volatilityContraction =
    isContracting ? 80 : range10d < 8 ? 50 : range10d < 12 ? 25 : 0;

  const { setupScore, opportunityScore, finalScore } = computeScores({
    pattern,
    breakoutDistance,
    volumeRatio,
    relativeStrength,
    trendAlignment,
    isContracting,
    range10d,
    riskReward,
    change5d,
    change20d,
    change60d,
  });

  return {
    ticker, name, price,
    sma20: sm20, sma50: sm50, sma150: sm150, sma200: sm200,
    aboveSma20: price > sm20, aboveSma50: price > sm50,
    aboveSma150: price > sm150, aboveSma200: price > sm200,
    ema20: em20, ema50: em50,
    high52w, low52w,
    change5d, change20d, change60d, relativeStrength,
    rsi14: rsi14Val, atr14: atr14Val, atr14Pct,
    volumeRatio,
    range10d, isContracting,
    pattern, breakoutLevel, breakoutDistance, consolidationDays,
    entry, stopLevel, targetLevel, riskReward,
    breakoutStrength, volumeExpansion, trendAlignment, volatilityContraction,
    rsRank: 0,
    setupScore,
    opportunityScore,
    score: finalScore,
  };
}
