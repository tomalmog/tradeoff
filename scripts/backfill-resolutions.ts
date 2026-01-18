/**
 * Backfill Script: Fetch resolved Polymarket events and match with stock prices
 * 
 * This script:
 * 1. Fetches resolved Polymarket events from the last 6 months
 * 2. Matches events to stocks by exact company name
 * 3. Fetches closing price on resolution date from Yahoo Finance
 * 4. Saves to data/resolutions.json
 * 
 * Run with: npx ts-node scripts/backfill-resolutions.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ Types ============

// Topic categories for semantic matching
type EventTopic = 
  | 'regulatory'      // Tariffs, bans, laws, regulations
  | 'safety_incident' // Crashes, emergencies, accidents
  | 'product_launch'  // New products, releases, unveilings
  | 'executive'       // CEO actions, tweets, statements
  | 'legal'           // Lawsuits, court cases, indictments
  | 'financial'       // Earnings, IPO, stock movements
  | 'geopolitical'    // Wars, conflicts, international relations
  | 'social_media'    // Tweets, posts, platform activity
  | 'crypto'          // Cryptocurrency, blockchain, tokens
  | 'entertainment'   // Movies, celebrities, sports
  | 'ai_tech'         // AI, machine learning, tech products
  | 'election'        // Political elections, voting
  | 'other';          // Catch-all

interface ResolvedEvent {
  eventId: string;
  title: string;
  slug: string;
  description: string;
  resolutionDate: string;
  outcome: 'YES' | 'NO' | 'UNKNOWN';
  finalProbability: number | null;
  topic: EventTopic;  // NEW: Topic category for semantic matching
}

interface StockPrice {
  ticker: string;
  companyName: string;
  priceOnResolution: number | null;
  resolutionDate: string;
}

interface EventStockPair {
  event: ResolvedEvent;
  matchedStocks: StockPrice[];
  matchReason: string;
}

interface BackfillData {
  generatedAt: string;
  totalEvents: number;
  totalMatches: number;
  dateRange: {
    from: string;
    to: string;
  };
  pairs: EventStockPair[];
}

// ============ Company Name Mappings ============

// Words to EXCLUDE from matching (they cause false positives)
const EXCLUDED_WORDS = new Set([
  'intelligence', // Don't match "Intel" in "intelligence"
  'block', // Don't match "Block" in "blocked" or "blockchain"
  'target', // Don't match "Target" in "targeting"
  'ford', // Don't match "Ford" in "afford", "Stanford"
  'snap', // Don't match "Snap" in "snapshot"
  'zoom', // Don't match "Zoom" in "zooming"
  'meta', // Don't match "Meta" in "metadata", "metamorphosis"
  'oracle', // Don't match "Oracle" in non-company context
]);

// Function to check if match is a false positive
function isValidMatch(text: string, matchWord: string, startIndex: number): boolean {
  const textLower = text.toLowerCase();
  const matchLower = matchWord.toLowerCase();
  
  // Check surrounding characters - we want word boundaries
  const charBefore = startIndex > 0 ? textLower[startIndex - 1] : ' ';
  const charAfter = startIndex + matchLower.length < textLower.length 
    ? textLower[startIndex + matchLower.length] 
    : ' ';
  
  // Must be word boundaries (not part of a larger word)
  const isWordBoundaryBefore = !/[a-z]/.test(charBefore);
  const isWordBoundaryAfter = !/[a-z]/.test(charAfter);
  
  if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
    return false;
  }
  
  // Check for known false positive patterns
  const surroundingText = textLower.slice(
    Math.max(0, startIndex - 20), 
    Math.min(textLower.length, startIndex + matchLower.length + 20)
  );
  
  // False positive checks
  if (matchLower === 'intel' && surroundingText.includes('intelligence')) return false;
  if (matchLower === 'block' && (surroundingText.includes('blocked') || surroundingText.includes('blockchain'))) return false;
  if (matchLower === 'ford' && (surroundingText.includes('afford') || surroundingText.includes('stanford'))) return false;
  if (matchLower === 'meta' && surroundingText.includes('metadata')) return false;
  
  return true;
}

// Expanded company mappings with aliases, products, executives, and keywords
const COMPANY_MAPPINGS: Record<string, { ticker: string; names: string[]; exactOnly?: string[] }> = {
  // ============ MEGA CAP TECH ============
  AAPL: { 
    ticker: 'AAPL', 
    names: [
      'Apple', 'iPhone', 'iPad', 'MacBook', 'Apple Watch', 'AirPods', 'Vision Pro',
      'Tim Cook', 'App Store', 'iOS', 'macOS', 'Apple TV', 'Apple Music', 'iCloud',
      'Siri', 'Apple Silicon', 'M1', 'M2', 'M3', 'M4'
    ] 
  },
  MSFT: { 
    ticker: 'MSFT', 
    names: [
      'Microsoft', 'Azure', 'Windows', 'Satya Nadella', 'Xbox', 'Office 365',
      'LinkedIn', 'GitHub', 'Bing', 'Copilot', 'Surface', 'Activision'
      // Note: Removed OpenAI - it's not publicly traded and creates confusing correlations
    ],
    exactOnly: ['Microsoft Teams'] // Don't match "Teams" alone (could be sports)
  },
  GOOGL: { 
    ticker: 'GOOGL', 
    names: [
      'Google', 'Alphabet', 'YouTube', 'Sundar Pichai', 'Android', 'Chrome',
      'Pixel', 'Waymo', 'DeepMind', 'Google Cloud', 'Gmail', 'Google Maps',
      'Google Search', 'Bard', 'Google Play'
    ],
    exactOnly: ['Google Gemini'] // Don't match "Gemini" alone (could be crypto exchange)
  },
  META: { 
    ticker: 'META', 
    names: [
      'Facebook', 'Instagram', 'WhatsApp', 'Mark Zuckerberg', 'Zuckerberg',
      'Threads', 'Oculus', 'Quest', 'Reality Labs', 'Messenger', 'Metaverse'
    ],
    exactOnly: ['Meta'] // Only match "Meta" as a standalone word
  },
  AMZN: { 
    ticker: 'AMZN', 
    names: [
      'Amazon', 'AWS', 'Jeff Bezos', 'Andy Jassy', 'Alexa', 'Echo',
      'Kindle', 'Whole Foods', 'Amazon Web Services', 'Ring', 'Twitch', 'MGM',
      'Amazon Prime', 'Blue Origin', 'Prime Video', 'Prime Day'
    ],
    exactOnly: ['Amazon Prime'] // Don't match "Prime" alone (could be Prime Minister)
  },
  
  // ============ AI & CHIPS ============
  NVDA: { 
    ticker: 'NVDA', 
    names: [
      'Nvidia', 'NVIDIA', 'Jensen Huang', 'GeForce', 'RTX', 'CUDA', 'A100', 'H100',
      'Blackwell', 'Grace Hopper', 'DGX', 'Mellanox'
    ] 
  },
  AMD: { 
    ticker: 'AMD', 
    names: [
      'AMD', 'Lisa Su', 'Ryzen', 'Radeon', 'EPYC', 'Xilinx', 'Instinct', 'ROCm'
    ] 
  },
  INTC: { 
    ticker: 'INTC', 
    names: [
      'Pat Gelsinger', 'Core i', 'Xeon', 'Altera', 'Mobileye'
    ],
    exactOnly: ['Intel'] // Be careful with "Intel" - require word boundary
  },
  ARM: { ticker: 'ARM', names: ['ARM Holdings', 'Arm Holdings', 'ARM chips'] },
  AVGO: { ticker: 'AVGO', names: ['Broadcom', 'VMware'] },
  QCOM: { ticker: 'QCOM', names: ['Qualcomm', 'Snapdragon'] },
  TSM: { ticker: 'TSM', names: ['TSMC', 'Taiwan Semiconductor'] },
  ASML: { ticker: 'ASML', names: ['ASML'] },
  MU: { ticker: 'MU', names: ['Micron'] },
  
  // ============ ELECTRIC VEHICLES & ENERGY ============
  TSLA: { 
    ticker: 'TSLA', 
    names: [
      'Tesla', 'Elon Musk', 'Cybertruck', 'Model S', 'Model 3', 'Model X', 'Model Y',
      'Supercharger', 'Powerwall', 'Megapack', 'Full Self-Driving', 'FSD',
      'Autopilot', 'Gigafactory', 'SpaceX', 'Starlink', 'Neuralink', 'xAI'
    ] 
  },
  RIVN: { ticker: 'RIVN', names: ['Rivian', 'R1T', 'R1S'] },
  LCID: { ticker: 'LCID', names: ['Lucid', 'Lucid Air', 'Lucid Motors'] },
  NIO: { ticker: 'NIO', names: ['NIO', 'Nio'] },
  XPEV: { ticker: 'XPEV', names: ['XPeng', 'Xpeng'] },
  LI: { ticker: 'LI', names: ['Li Auto'] },
  FSR: { ticker: 'FSR', names: ['Fisker'] },
  F: { 
    ticker: 'F', 
    names: ['Ford Motor', 'Ford F-150', 'Mustang Mach-E', 'Jim Farley'],
    exactOnly: ['Ford']
  },
  GM: { ticker: 'GM', names: ['General Motors', 'Chevy', 'Chevrolet', 'Cadillac', 'GMC', 'Mary Barra'] },
  
  // ============ CRYPTO & FINTECH ============
  COIN: { 
    ticker: 'COIN', 
    names: [
      'Coinbase', 'Brian Armstrong'
    ] 
  },
  MSTR: { ticker: 'MSTR', names: ['MicroStrategy', 'Michael Saylor', 'Saylor'] },
  MARA: { ticker: 'MARA', names: ['Marathon Digital', 'Marathon Holdings'] },
  RIOT: { ticker: 'RIOT', names: ['Riot Platforms', 'Riot Blockchain'] },
  HOOD: { ticker: 'HOOD', names: ['Robinhood', 'Vlad Tenev'] },
  SQ: { 
    ticker: 'SQ', 
    names: ['Square', 'Cash App', 'Jack Dorsey'],
    exactOnly: ['Block']
  },
  PYPL: { ticker: 'PYPL', names: ['PayPal', 'Venmo'] },
  AFRM: { ticker: 'AFRM', names: ['Affirm', 'Max Levchin'] },
  SOFI: { ticker: 'SOFI', names: ['SoFi', 'Social Finance'] },
  NU: { ticker: 'NU', names: ['Nubank', 'Nu Holdings'] },
  
  // ============ SOCIAL MEDIA & ENTERTAINMENT ============
  NFLX: { ticker: 'NFLX', names: ['Netflix', 'Reed Hastings', 'Ted Sarandos'] },
  DIS: { ticker: 'DIS', names: ['Disney', 'Bob Iger', 'Pixar', 'Marvel', 'Star Wars', 'Hulu', 'ESPN', 'Disney+'] },
  SNAP: { 
    ticker: 'SNAP', 
    names: ['Snapchat', 'Evan Spiegel'],
    exactOnly: ['Snap Inc']
  },
  TWTR: { ticker: 'TWTR', names: ['Twitter'] },
  X: { ticker: 'X', names: ['X Corp', 'Twitter/X'] },
  PINS: { ticker: 'PINS', names: ['Pinterest'] },
  RDDT: { ticker: 'RDDT', names: ['Reddit'] },
  SPOT: { ticker: 'SPOT', names: ['Spotify', 'Daniel Ek'] },
  RBLX: { ticker: 'RBLX', names: ['Roblox'] },
  TTWO: { ticker: 'TTWO', names: ['Take-Two', 'Rockstar Games', 'GTA', 'Grand Theft Auto'] },
  EA: { ticker: 'EA', names: ['Electronic Arts', 'EA Sports', 'FIFA', 'Madden'] },
  ATVI: { ticker: 'ATVI', names: ['Activision', 'Blizzard', 'Call of Duty', 'World of Warcraft'] },
  SONY: { ticker: 'SONY', names: ['Sony', 'PlayStation', 'PS5'] },
  
  // ============ CLOUD & ENTERPRISE SOFTWARE ============
  CRM: { ticker: 'CRM', names: ['Salesforce', 'Marc Benioff', 'Slack'] },
  ORCL: { 
    ticker: 'ORCL', 
    names: ['Larry Ellison', 'Oracle Cloud'],
    exactOnly: ['Oracle']
  },
  NOW: { ticker: 'NOW', names: ['ServiceNow'] },
  SNOW: { ticker: 'SNOW', names: ['Snowflake'] },
  DDOG: { ticker: 'DDOG', names: ['Datadog'] },
  NET: { ticker: 'NET', names: ['Cloudflare'] },
  ZS: { ticker: 'ZS', names: ['Zscaler'] },
  CRWD: { ticker: 'CRWD', names: ['CrowdStrike', 'George Kurtz'] },
  PANW: { ticker: 'PANW', names: ['Palo Alto Networks'] },
  OKTA: { ticker: 'OKTA', names: ['Okta'] },
  MDB: { ticker: 'MDB', names: ['MongoDB'] },
  PLTR: { ticker: 'PLTR', names: ['Palantir', 'Peter Thiel', 'Alex Karp'] },
  ZM: { 
    ticker: 'ZM', 
    names: ['Zoom Video', 'Eric Yuan'],
    exactOnly: ['Zoom']
  },
  DOCU: { ticker: 'DOCU', names: ['DocuSign'] },
  TWLO: { ticker: 'TWLO', names: ['Twilio'] },
  U: { ticker: 'U', names: ['Unity Software', 'Unity Engine'] },
  
  // ============ E-COMMERCE & RETAIL ============
  SHOP: { ticker: 'SHOP', names: ['Shopify', 'Tobi Lutke'] },
  BABA: { ticker: 'BABA', names: ['Alibaba', 'Jack Ma', 'Taobao', 'Tmall', 'AliExpress'] },
  JD: { ticker: 'JD', names: ['JD.com', 'JingDong'] },
  PDD: { ticker: 'PDD', names: ['Pinduoduo', 'Temu'] },
  MELI: { ticker: 'MELI', names: ['MercadoLibre', 'Mercado Libre'] },
  SE: { ticker: 'SE', names: ['Sea Limited', 'Shopee', 'Garena'] },
  WMT: { ticker: 'WMT', names: ['Walmart', 'Doug McMillon'] },
  TGT: { 
    ticker: 'TGT', 
    names: ['Target Corporation'],
    exactOnly: ['Target']
  },
  COST: { ticker: 'COST', names: ['Costco'] },
  HD: { ticker: 'HD', names: ['Home Depot'] },
  LOW: { ticker: 'LOW', names: ["Lowe's", 'Lowes'] },
  ABNB: { ticker: 'ABNB', names: ['Airbnb', 'Brian Chesky'] },
  BKNG: { ticker: 'BKNG', names: ['Booking.com', 'Booking Holdings', 'Priceline'] },
  UBER: { ticker: 'UBER', names: ['Uber', 'Dara Khosrowshahi', 'Uber Eats'] },
  LYFT: { ticker: 'LYFT', names: ['Lyft'] },
  DASH: { ticker: 'DASH', names: ['DoorDash', 'Tony Xu'] },
  
  // ============ AEROSPACE & DEFENSE ============
  BA: { ticker: 'BA', names: ['Boeing', 'Dave Calhoun', '737 MAX', '787 Dreamliner'] },
  LMT: { ticker: 'LMT', names: ['Lockheed Martin', 'Lockheed', 'F-35', 'F-22'] },
  RTX: { ticker: 'RTX', names: ['Raytheon', 'RTX Corporation', 'Pratt & Whitney'] },
  NOC: { ticker: 'NOC', names: ['Northrop Grumman', 'B-21 Raider'] },
  GD: { ticker: 'GD', names: ['General Dynamics', 'Gulfstream'] },
  
  // ============ FINANCE & BANKING ============
  JPM: { ticker: 'JPM', names: ['JPMorgan', 'JP Morgan', 'Jamie Dimon', 'Chase'] },
  GS: { ticker: 'GS', names: ['Goldman Sachs', 'David Solomon'] },
  MS: { ticker: 'MS', names: ['Morgan Stanley', 'James Gorman'] },
  BAC: { ticker: 'BAC', names: ['Bank of America', 'BofA', 'Brian Moynihan'] },
  C: { ticker: 'C', names: ['Citigroup', 'Citi', 'Citibank', 'Jane Fraser'] },
  WFC: { ticker: 'WFC', names: ['Wells Fargo', 'Charlie Scharf'] },
  BRK: { ticker: 'BRK.B', names: ['Berkshire Hathaway', 'Warren Buffett', 'Buffett', 'Charlie Munger'] },
  V: { ticker: 'V', names: ['Visa'] },
  MA: { ticker: 'MA', names: ['Mastercard'] },
  AXP: { ticker: 'AXP', names: ['American Express', 'Amex'] },
  BLK: { ticker: 'BLK', names: ['BlackRock', 'Larry Fink'] },
  
  // ============ HEALTHCARE & PHARMA ============
  PFE: { ticker: 'PFE', names: ['Pfizer', 'Albert Bourla'] },
  MRNA: { ticker: 'MRNA', names: ['Moderna', 'Stéphane Bancel'] },
  BNTX: { ticker: 'BNTX', names: ['BioNTech'] },
  JNJ: { ticker: 'JNJ', names: ['Johnson & Johnson', 'Johnson and Johnson', 'J&J'] },
  UNH: { ticker: 'UNH', names: ['UnitedHealth', 'United Healthcare'] },
  LLY: { ticker: 'LLY', names: ['Eli Lilly', 'Mounjaro', 'Zepbound'] },
  NVO: { ticker: 'NVO', names: ['Novo Nordisk', 'Ozempic', 'Wegovy'] },
  ABBV: { ticker: 'ABBV', names: ['AbbVie', 'Humira'] },
  MRK: { ticker: 'MRK', names: ['Merck', 'Keytruda'] },
  BMY: { ticker: 'BMY', names: ['Bristol-Myers Squibb', 'Bristol Myers'] },
  
  // ============ ENERGY ============
  XOM: { ticker: 'XOM', names: ['Exxon', 'ExxonMobil', 'Exxon Mobil'] },
  CVX: { ticker: 'CVX', names: ['Chevron'] },
  COP: { ticker: 'COP', names: ['ConocoPhillips'] },
  OXY: { ticker: 'OXY', names: ['Occidental Petroleum', 'Occidental'] },
  SLB: { ticker: 'SLB', names: ['Schlumberger'] },
  
  // ============ CONSUMER BRANDS ============
  KO: { ticker: 'KO', names: ['Coca-Cola', 'Coca Cola', 'Coke'] },
  PEP: { ticker: 'PEP', names: ['Pepsi', 'PepsiCo', 'Frito-Lay', 'Gatorade'] },
  NKE: { ticker: 'NKE', names: ['Nike', 'Jordan Brand', 'Phil Knight'] },
  SBUX: { ticker: 'SBUX', names: ['Starbucks', 'Howard Schultz'] },
  MCD: { ticker: 'MCD', names: ["McDonald's", 'McDonalds', 'Big Mac'] },
  CMG: { ticker: 'CMG', names: ['Chipotle', 'Chipotle Mexican Grill'] },
  LULU: { ticker: 'LULU', names: ['Lululemon'] },
  
  // ============ TELECOM ============
  T: { ticker: 'T', names: ['AT&T', 'ATT'] },
  VZ: { ticker: 'VZ', names: ['Verizon'] },
  TMUS: { ticker: 'TMUS', names: ['T-Mobile', 'TMobile'] },
  
  // ============ AI COMPANIES ============
  AI: { ticker: 'AI', names: ['C3.ai', 'C3 AI'] },
  UPST: { ticker: 'UPST', names: ['Upstart'] },
  PATH: { ticker: 'PATH', names: ['UiPath'] },
  
  // ============ MISC TECH ============
  IBM: { ticker: 'IBM', names: ['IBM', 'Arvind Krishna', 'Red Hat'] },
  HPQ: { ticker: 'HPQ', names: ['HP', 'Hewlett-Packard'] },
  DELL: { ticker: 'DELL', names: ['Dell', 'Michael Dell'] },
  ROKU: { ticker: 'ROKU', names: ['Roku', 'Anthony Wood'] },
  
  // ============ CHINA TECH ============
  BIDU: { ticker: 'BIDU', names: ['Baidu', 'Robin Li'] },
  NTES: { ticker: 'NTES', names: ['NetEase'] },
  TME: { ticker: 'TME', names: ['Tencent Music'] },
  BILI: { ticker: 'BILI', names: ['Bilibili'] },
  DIDI: { ticker: 'DIDI', names: ['DiDi', 'Didi Global', 'Didi Chuxing'] },
  
  // ============ SPECIAL / MEME STOCKS ============
  GME: { ticker: 'GME', names: ['GameStop', 'Ryan Cohen', 'Roaring Kitty', 'Keith Gill'] },
  AMC: { ticker: 'AMC', names: ['AMC Entertainment', 'Adam Aron', 'AMC Theatres'] },
  BBBY: { ticker: 'BBBY', names: ['Bed Bath & Beyond', 'Bed Bath and Beyond'] },
};

// ============ Topic Extraction ============

// Keywords for each topic category (order matters - first match wins)
const TOPIC_KEYWORDS: { topic: EventTopic; keywords: string[] }[] = [
  { 
    topic: 'regulatory', 
    keywords: [
      'tariff', 'ban', 'illegal', 'regulation', 'law', 'legislation', 'congress',
      'senate', 'bill', 'act', 'antitrust', 'ftc', 'sec', 'doj', 'sanction',
      'import', 'export', 'trade war', 'trade deal', 'customs', 'duty', 'quota'
    ]
  },
  { 
    topic: 'safety_incident', 
    keywords: [
      'emergency', 'crash', 'accident', 'incident', 'disaster', 'explosion',
      'fire', 'death', 'injury', 'recall', 'defect', 'malfunction', 'grounded',
      'landing', 'collision', 'derail'
    ]
  },
  { 
    topic: 'legal', 
    keywords: [
      'lawsuit', 'sue', 'court', 'judge', 'trial', 'verdict', 'settlement',
      'indictment', 'arrest', 'guilty', 'convicted', 'appeal', 'ruling',
      'prison', 'jail', 'fine', 'penalty', 'charge', 'allegation'
    ]
  },
  { 
    topic: 'geopolitical', 
    keywords: [
      'war', 'invasion', 'military', 'ceasefire', 'peace', 'conflict', 'nato',
      'ukraine', 'russia', 'china', 'taiwan', 'israel', 'iran', 'missile',
      'nuclear', 'troops', 'intervention', 'sanctions'
    ]
  },
  { 
    topic: 'election', 
    keywords: [
      'election', 'vote', 'ballot', 'poll', 'candidate', 'president', 'governor',
      'senator', 'congress', 'democrat', 'republican', 'primary', 'nominee',
      'campaign', 'electoral'
    ]
  },
  { 
    topic: 'product_launch', 
    keywords: [
      'launch', 'release', 'unveil', 'announce', 'debut', 'rollout', 'preview',
      'reveal', 'introduce', 'ship', 'available', 'beta', 'update', 'version'
    ]
  },
  { 
    topic: 'executive', 
    keywords: [
      'ceo', 'cto', 'cfo', 'executive', 'founder', 'chairman', 'board',
      'resign', 'fired', 'hired', 'step down', 'appointment'
    ]
  },
  { 
    topic: 'social_media', 
    keywords: [
      'tweet', 'post', 'instagram', 'tiktok', 'youtube', 'facebook', 'twitter',
      'x.com', 'follow', 'unfollow', 'viral', 'trending', 'account', 'profile'
    ]
  },
  { 
    topic: 'crypto', 
    keywords: [
      'bitcoin', 'ethereum', 'crypto', 'blockchain', 'token', 'nft', 'defi',
      'exchange', 'wallet', 'mining', 'halving', 'etf', 'coinbase', 'binance',
      'solana', 'dogecoin', 'memecoin'
    ]
  },
  { 
    topic: 'ai_tech', 
    keywords: [
      'ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'gpt',
      'openai', 'gemini', 'claude', 'llm', 'neural', 'model', 'training',
      'inference', 'chip', 'gpu', 'nvidia', 'semiconductor'
    ]
  },
  { 
    topic: 'financial', 
    keywords: [
      'earnings', 'revenue', 'profit', 'loss', 'ipo', 'stock', 'share',
      'dividend', 'buyback', 'market cap', 'valuation', 'funding', 'round',
      'investment', 'acquisition', 'merger', 'bankruptcy', 'debt'
    ]
  },
  { 
    topic: 'entertainment', 
    keywords: [
      'movie', 'film', 'box office', 'album', 'song', 'concert', 'award',
      'grammy', 'oscar', 'emmy', 'celebrity', 'star', 'actor', 'actress',
      'sports', 'nba', 'nfl', 'mlb', 'championship', 'super bowl'
    ]
  },
];

/**
 * Extract topic from event title and description
 */
function extractTopic(title: string, description: string): EventTopic {
  const text = `${title} ${description}`.toLowerCase();
  
  for (const { topic, keywords } of TOPIC_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return topic;
      }
    }
  }
  
  return 'other';
}

// ============ Thematic/Sector Matching ============

// Map topics to related stocks (for broader correlation)
const TOPIC_STOCK_MAPPINGS: Record<EventTopic, { stocks: string[]; reason: string }> = {
  regulatory: {
    stocks: ['META', 'GOOGL', 'AMZN', 'AAPL', 'MSFT', 'NVDA', 'TSLA'],
    reason: 'Regulatory changes impact large tech and market leaders'
  },
  safety_incident: {
    stocks: ['BA', 'LMT', 'RTX', 'GD', 'NOC', 'AAL', 'UAL', 'DAL'],
    reason: 'Safety incidents affect aerospace and defense sector'
  },
  legal: {
    stocks: ['META', 'GOOGL', 'AMZN', 'AAPL', 'MSFT', 'TSLA'],
    reason: 'Legal matters frequently involve major tech companies'
  },
  geopolitical: {
    stocks: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'XOM', 'CVX', 'OXY', 'TSM', 'INTC'],
    reason: 'Geopolitical events affect defense, energy, and semiconductor supply chains'
  },
  election: {
    stocks: ['SPY', 'QQQ', 'DIA', 'TSLA', 'META', 'GOOGL', 'XOM', 'CVX'],
    reason: 'Elections impact market sentiment and specific policy-sensitive sectors'
  },
  product_launch: {
    stocks: ['AAPL', 'GOOGL', 'MSFT', 'META', 'NVDA', 'AMD', 'TSLA'],
    reason: 'Product launches drive tech sector movements'
  },
  executive: {
    stocks: ['TSLA', 'META', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'],
    reason: 'Executive changes affect major companies'
  },
  social_media: {
    stocks: ['META', 'SNAP', 'PINS', 'RDDT', 'GOOGL', 'TWTR'],
    reason: 'Social media events impact the sector'
  },
  crypto: {
    stocks: ['COIN', 'MSTR', 'MARA', 'RIOT', 'SQ', 'HOOD', 'PYPL'],
    reason: 'Crypto events affect crypto-related equities'
  },
  ai_tech: {
    stocks: ['NVDA', 'AMD', 'GOOGL', 'MSFT', 'META', 'AMZN', 'TSM', 'AVGO', 'INTC'],
    reason: 'AI developments impact the semiconductor and tech sector'
  },
  financial: {
    stocks: ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC', 'BRK.B', 'V', 'MA'],
    reason: 'Financial events affect banking and payment sectors'
  },
  entertainment: {
    stocks: ['DIS', 'NFLX', 'WBD', 'PARA', 'CMCSA', 'SPOT'],
    reason: 'Entertainment events impact media companies'
  },
  other: {
    stocks: [],
    reason: 'General market event'
  }
};

// High-impact keywords that should ALWAYS match to certain stocks
const HIGH_IMPACT_KEYWORDS: { keywords: string[]; stocks: string[]; reason: string }[] = [
  {
    keywords: ['trump', 'biden', 'white house', 'president', 'potus'],
    stocks: ['SPY', 'QQQ', 'TSLA', 'META', 'XOM', 'LMT'],
    reason: 'Presidential politics affects broad market'
  },
  {
    keywords: ['fed', 'interest rate', 'powell', 'fomc', 'federal reserve'],
    stocks: ['SPY', 'QQQ', 'JPM', 'BAC', 'GS', 'AAPL', 'MSFT'],
    reason: 'Fed policy affects all markets'
  },
  {
    keywords: ['china', 'chinese', 'beijing', 'ccp'],
    stocks: ['TSM', 'AAPL', 'NVDA', 'NIO', 'BABA', 'JD', 'PDD'],
    reason: 'China-related events affect supply chains and Chinese equities'
  },
  {
    keywords: ['tiktok', 'bytedance'],
    stocks: ['META', 'SNAP', 'GOOGL', 'PINS'],
    reason: 'TikTok events benefit competitors'
  },
  {
    keywords: ['ukraine', 'russia', 'putin', 'zelensky', 'nato', 'war'],
    stocks: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'XOM', 'CVX', 'HAL'],
    reason: 'Ukraine conflict affects defense and energy'
  },
  {
    keywords: ['taiwan', 'tsmc', 'chip', 'semiconductor'],
    stocks: ['TSM', 'NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'ASML', 'MU'],
    reason: 'Taiwan/chip events affect semiconductor sector'
  },
  {
    keywords: ['bitcoin', 'btc', 'crypto', 'ethereum', 'eth'],
    stocks: ['COIN', 'MSTR', 'MARA', 'RIOT', 'SQ', 'HOOD'],
    reason: 'Crypto price movements affect crypto stocks'
  },
  {
    keywords: ['openai', 'chatgpt', 'gpt-4', 'gpt-5', 'ai model', 'large language'],
    stocks: ['MSFT', 'NVDA', 'GOOGL', 'META', 'AMD'],
    reason: 'AI developments affect tech and chip stocks'
  },
  {
    keywords: ['apple', 'iphone', 'ipad', 'tim cook', 'wwdc'],
    stocks: ['AAPL', 'QCOM', 'TSM', 'AVGO'],
    reason: 'Apple events affect supply chain'
  },
  {
    keywords: ['elon', 'musk', 'spacex', 'starlink', 'neuralink'],
    stocks: ['TSLA', 'TWTR'],
    reason: 'Musk activities affect his companies'
  },
  {
    keywords: ['zuckerberg', 'meta', 'facebook', 'instagram', 'whatsapp', 'threads'],
    stocks: ['META', 'SNAP', 'PINS'],
    reason: 'Meta events affect social media sector'
  }
];

// ============ Polymarket API ============

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

async function fetchResolvedEvents(yearsBack: number = 3): Promise<ResolvedEvent[]> {
  const today = new Date();
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
  
  console.log(`Fetching events that resolved between ${cutoffDate.toISOString().split('T')[0]} and ${today.toISOString().split('T')[0]}...`);
  console.log(`(Including all past events up to ${yearsBack} years back)`);
  
  const allEvents: ResolvedEvent[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  let debugCount = 0;
  let skippedFuture = 0;
  let skippedTooOld = 0;
  
  while (hasMore) {
    try {
      // Fetch closed events
      const url = `${GAMMA_API_BASE}/events?closed=true&limit=${limit}&offset=${offset}`;
      
      if (offset % 500 === 0) {
        console.log(`  Fetching batch at offset ${offset}...`);
      }
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        console.error(`API error: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const event of data) {
        const dateStr = event.endDate || event.resolutionDate || '';
        const eventDate = dateStr ? new Date(dateStr) : null;
        
        // Skip events with no date
        if (!eventDate || isNaN(eventDate.getTime())) {
          continue;
        }
        
        // Skip future events (not yet resolved)
        if (eventDate > today) {
          skippedFuture++;
          continue;
        }
        
        // Skip if older than our cutoff
        if (eventDate < cutoffDate) {
          skippedTooOld++;
          continue;
        }
        
        // Debug: show first few valid events
        if (debugCount < 10) {
          console.log(`    ✓ Found: "${event.title?.slice(0, 50)}..." resolved=${eventDate.toISOString().split('T')[0]}`);
          debugCount++;
        }
        
        // Determine outcome from markets
        let outcome: 'YES' | 'NO' | 'UNKNOWN' = 'UNKNOWN';
        let finalProbability: number | null = null;
        
        if (event.markets && Array.isArray(event.markets) && event.markets.length > 0) {
          const market = event.markets[0];
          const prices = market.outcomePrices;
          
          if (prices) {
            let parsedPrices: number[];
            if (typeof prices === 'string') {
              try {
                parsedPrices = JSON.parse(prices);
              } catch {
                parsedPrices = [];
              }
            } else if (Array.isArray(prices)) {
              parsedPrices = prices.map(Number);
            } else {
              parsedPrices = [];
            }
            
            if (parsedPrices.length >= 1) {
              finalProbability = parsedPrices[0];
              if (finalProbability > 0.95) outcome = 'YES';
              else if (finalProbability < 0.05) outcome = 'NO';
            }
          }
        }
        
        // Extract topic for semantic matching
        const topic = extractTopic(event.title || '', event.description || '');
        
        allEvents.push({
          eventId: event.id || '',
          title: event.title || '',
          slug: event.slug || '',
          description: event.description || '',
          resolutionDate: dateStr,
          outcome,
          finalProbability,
          topic,
        });
      }
      
      offset += limit;
      await sleep(150);
      
      // Progress update
      if (offset % 1000 === 0) {
        console.log(`    Progress: scanned ${offset} events, found ${allEvents.length} valid, skipped ${skippedFuture} future, ${skippedTooOld} too old`);
      }
      
      // Stop after finding enough or scanning enough
      if (offset > 10000 || allEvents.length > 500 || data.length < limit) {
        hasMore = false;
      }
      
    } catch (error) {
      console.error('Error fetching events:', error);
      hasMore = false;
    }
  }
  
  console.log(`  Found ${allEvents.length} events that resolved in the last ${yearsBack} years`);
  console.log(`  (Skipped ${skippedFuture} future, ${skippedTooOld} too old)`);
  return allEvents;
}


// ============ Stock Matching ============

function matchEventToStocks(event: ResolvedEvent): { ticker: string; companyName: string; matchReason: string }[] {
  const matches: { ticker: string; companyName: string; matchReason: string }[] = [];
  const matchedTickers = new Set<string>();
  const title = event.title || '';
  const desc = event.description || '';
  const titleLower = title.toLowerCase();
  const descLower = desc.toLowerCase();
  const fullText = `${titleLower} ${descLower}`;
  
  // === PHASE 1: Direct company name matching (highest priority) ===
  for (const [ticker, mapping] of Object.entries(COMPANY_MAPPINGS)) {
    const { names, exactOnly } = mapping;
    let matched = false;
    
    // First check exactOnly patterns (require word boundaries)
    if (exactOnly && exactOnly.length > 0) {
      for (const exactWord of exactOnly) {
        const exactLower = exactWord.toLowerCase();
        
        // Check title
        const titleIdx = titleLower.indexOf(exactLower);
        if (titleIdx !== -1 && isValidMatch(title, exactWord, titleIdx)) {
          matches.push({
            ticker,
            companyName: exactWord,
            matchReason: `Direct mention: "${exactWord}"`,
          });
          matchedTickers.add(ticker);
          matched = true;
          break;
        }
        
        // Check description
        const descIdx = descLower.indexOf(exactLower);
        if (descIdx !== -1 && isValidMatch(desc, exactWord, descIdx)) {
          matches.push({
            ticker,
            companyName: exactWord,
            matchReason: `Direct mention: "${exactWord}"`,
          });
          matchedTickers.add(ticker);
          matched = true;
          break;
        }
      }
    }
    
    // Then check regular names (if not already matched)
    if (!matched) {
      for (const name of names) {
        const nameLower = name.toLowerCase();
        
        // Skip very short names that might cause false positives
        if (name.length < 3) continue;
        
        // Check title first (stronger match)
        const titleIdx = titleLower.indexOf(nameLower);
        if (titleIdx !== -1 && isValidMatch(title, name, titleIdx)) {
          matches.push({
            ticker,
            companyName: name,
            matchReason: `Direct mention: "${name}"`,
          });
          matchedTickers.add(ticker);
          matched = true;
          break;
        }
        
        // Check description
        const descIdx = descLower.indexOf(nameLower);
        if (descIdx !== -1 && isValidMatch(desc, name, descIdx)) {
          matches.push({
            ticker,
            companyName: name,
            matchReason: `Direct mention: "${name}"`,
          });
          matchedTickers.add(ticker);
          matched = true;
          break;
        }
      }
    }
  }
  
  // === PHASE 2: High-impact keyword matching ===
  for (const { keywords, stocks, reason } of HIGH_IMPACT_KEYWORDS) {
    for (const keyword of keywords) {
      if (fullText.includes(keyword.toLowerCase())) {
        // Add stocks that aren't already matched
        for (const ticker of stocks) {
          if (!matchedTickers.has(ticker)) {
            matches.push({
              ticker,
              companyName: keyword,
              matchReason: `Keyword correlation: ${reason}`,
            });
            matchedTickers.add(ticker);
          }
        }
        break; // Only match first keyword in group
      }
    }
  }
  
  // === PHASE 3: Topic-based sector matching (if few matches) ===
  if (matches.length < 3 && event.topic !== 'other') {
    const topicMapping = TOPIC_STOCK_MAPPINGS[event.topic];
    if (topicMapping && topicMapping.stocks.length > 0) {
      // Add up to 3 sector-related stocks
      let added = 0;
      for (const ticker of topicMapping.stocks) {
        if (!matchedTickers.has(ticker) && added < 3) {
          matches.push({
            ticker,
            companyName: event.topic,
            matchReason: `Sector correlation: ${topicMapping.reason}`,
          });
          matchedTickers.add(ticker);
          added++;
        }
      }
    }
  }
  
  return matches;
}

// ============ Yahoo Finance ============

async function fetchStockPrice(ticker: string, date: string): Promise<number | null> {
  try {
    const targetDate = new Date(date);
    // Get a range around the target date (in case of weekends/holidays)
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 5);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!response.ok) {
      console.error(`  Yahoo Finance error for ${ticker}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    const result = data.chart?.result?.[0];
    if (!result) {
      return null;
    }
    
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    
    // Find the closest date to our target
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
    let closestIdx = 0;
    let closestDiff = Infinity;
    
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - targetTimestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = i;
      }
    }
    
    const price = closes[closestIdx];
    return typeof price === 'number' ? Math.round(price * 100) / 100 : null;
    
  } catch (error) {
    console.error(`  Error fetching price for ${ticker}:`, error);
    return null;
  }
}

// ============ Utilities ============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Main Script ============

async function main() {
  console.log('='.repeat(60));
  console.log('Polymarket Resolution Backfill Script');
  console.log('='.repeat(60));
  console.log('');
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data/ directory');
  }
  
  // Step 1: Fetch resolved events (3 years back)
  console.log('\n[Step 1/4] Fetching resolved Polymarket events...');
  const events = await fetchResolvedEvents(3);
  
  if (events.length === 0) {
    console.log('No events found. Exiting.');
    return;
  }
  
  // Step 2: Match events to stocks
  console.log('\n[Step 2/4] Matching events to stocks...');
  const matchedPairs: EventStockPair[] = [];
  let matchCount = 0;
  
  for (const event of events) {
    const stockMatches = matchEventToStocks(event);
    
    if (stockMatches.length > 0) {
      matchCount++;
      matchedPairs.push({
        event,
        matchedStocks: stockMatches.map(m => ({
          ticker: m.ticker,
          companyName: m.companyName,
          priceOnResolution: null, // Will be filled in next step
          resolutionDate: event.resolutionDate,
        })),
        matchReason: stockMatches.map(m => m.matchReason).join('; '),
      });
    }
  }
  
  console.log(`  Matched ${matchCount} events to stocks out of ${events.length} total`);
  
  // Step 3: Fetch stock prices
  console.log('\n[Step 3/4] Fetching stock prices on resolution dates...');
  let pricesFetched = 0;
  
  for (const pair of matchedPairs) {
    for (const stock of pair.matchedStocks) {
      console.log(`  Fetching ${stock.ticker} price for ${stock.resolutionDate.split('T')[0]}...`);
      
      const price = await fetchStockPrice(stock.ticker, stock.resolutionDate);
      stock.priceOnResolution = price;
      
      if (price !== null) {
        pricesFetched++;
        console.log(`    → $${price}`);
      } else {
        console.log(`    → Price not found`);
      }
      
      // Rate limiting
      await sleep(300);
    }
  }
  
  console.log(`  Fetched ${pricesFetched} stock prices`);
  
  // Step 4: Save to JSON
  console.log('\n[Step 4/4] Saving to data/resolutions.json...');
  
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  
  const backfillData: BackfillData = {
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    totalMatches: matchedPairs.length,
    dateRange: {
      from: threeYearsAgo.toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    },
    pairs: matchedPairs,
  };
  
  const outputPath = path.join(dataDir, 'resolutions.json');
  fs.writeFileSync(outputPath, JSON.stringify(backfillData, null, 2));
  
  console.log(`  Saved to ${outputPath}`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total resolved events fetched: ${events.length}`);
  console.log(`Events matched to stocks: ${matchedPairs.length}`);
  console.log(`Stock prices fetched: ${pricesFetched}`);
  console.log(`Output file: ${outputPath}`);
  console.log('='.repeat(60));
}

// Run the script
main().catch(console.error);
