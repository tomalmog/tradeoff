"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PortfolioItem, StockInfo } from "@/app/page";

interface PortfolioInputProps {
  portfolio: PortfolioItem[];
  setPortfolio: React.Dispatch<React.SetStateAction<PortfolioItem[]>>;
  setStockInfo?: React.Dispatch<React.SetStateAction<Record<string, StockInfo>>>;
  compact?: boolean;
}

// Generate a simple user ID for this session
function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Sample portfolio loaded from assets/portfolio.csv
const SAMPLE_PORTFOLIO = [
  { ticker: "AAPL", shares: 1 },
  { ticker: "AGCO", shares: 1 },
  { ticker: "BA", shares: 2 },
  { ticker: "BG", shares: 4 },
  { ticker: "CALM", shares: 5 },
  { ticker: "CAT", shares: 1 },
  { ticker: "CSCO", shares: 5 },
  { ticker: "CVX", shares: 2 },
  { ticker: "DDOG", shares: 5 },
  { ticker: "DE", shares: 4 },
  { ticker: "GRWG", shares: 2 },
  { ticker: "HUM", shares: 1 },
  { ticker: "IBKR", shares: 1 },
  { ticker: "IEX", shares: 5 },
  { ticker: "JPM", shares: 5 },
  { ticker: "KO", shares: 5 },
  { ticker: "LMT", shares: 5 },
  { ticker: "MS", shares: 1 },
  { ticker: "MSCI", shares: 1 },
  { ticker: "MSFT", shares: 3 },
  { ticker: "NFLX", shares: 1 },
  { ticker: "OSK", shares: 3 },
  { ticker: "PFE", shares: 2 },
  { ticker: "PG", shares: 2 },
  { ticker: "SPY", shares: 3 },
  { ticker: "TMUS", shares: 5 },
];

// Placeholder stock info with realistic prices and sectors (displayed immediately while real data loads)
const SAMPLE_STOCK_INFO: Record<string, StockInfo> = {
  AAPL: { ticker: "AAPL", name: "Apple Inc.", price: 255.50, sector: "Technology", industry: "Consumer Electronics" },
  AGCO: { ticker: "AGCO", name: "AGCO Corporation", price: 111.35, sector: "Industrials", industry: "Industrial" },
  BA: { ticker: "BA", name: "Boeing Company (The)", price: 247.68, sector: "Industrials", industry: "Industrial" },
  BG: { ticker: "BG", name: "Bunge Limited", price: 107.81, sector: "Consumer Defensive", industry: "Consumer Goods" },
  CALM: { ticker: "CALM", name: "Cal-Maine Foods, Inc.", price: 77.92, sector: "Consumer Defensive", industry: "Consumer Goods" },
  CAT: { ticker: "CAT", name: "Caterpillar, Inc.", price: 646.89, sector: "Industrials", industry: "Industrial" },
  CSCO: { ticker: "CSCO", name: "Cisco Systems, Inc.", price: 75.19, sector: "Technology", industry: "Software" },
  CVX: { ticker: "CVX", name: "Chevron Corporation", price: 166.26, sector: "Energy", industry: "Oil & Gas" },
  DDOG: { ticker: "DDOG", name: "Datadog, Inc.", price: 119.02, sector: "Technology", industry: "Software" },
  DE: { ticker: "DE", name: "Deere & Company", price: 514.40, sector: "Industrials", industry: "Industrial" },
  GRWG: { ticker: "GRWG", name: "GrowGeneration Corp.", price: 1.49, sector: "Consumer Cyclical", industry: "Retail" },
  HUM: { ticker: "HUM", name: "Humana Inc.", price: 273.28, sector: "Healthcare", industry: "Healthcare" },
  IBKR: { ticker: "IBKR", name: "Interactive Brokers Group, Inc.", price: 73.36, sector: "Financial Services", industry: "Financial" },
  IEX: { ticker: "IEX", name: "IDEX Corporation", price: 196.93, sector: "Industrials", industry: "Industrial" },
  JPM: { ticker: "JPM", name: "JP Morgan Chase & Co.", price: 312.47, sector: "Financial Services", industry: "Financial" },
  KO: { ticker: "KO", name: "Coca-Cola Company (The)", price: 70.44, sector: "Consumer Defensive", industry: "Consumer Goods" },
  LMT: { ticker: "LMT", name: "Lockheed Martin Corporation", price: 582.43, sector: "Industrials", industry: "Industrial" },
  MS: { ticker: "MS", name: "Morgan Stanley", price: 189.09, sector: "Financial Services", industry: "Financial" },
  MSCI: { ticker: "MSCI", name: "MSCI Inc.", price: 602.58, sector: "Financial Services", industry: "Financial" },
  MSFT: { ticker: "MSFT", name: "Microsoft Corporation", price: 459.86, sector: "Technology", industry: "Software" },
  NFLX: { ticker: "NFLX", name: "Netflix, Inc.", price: 88.00, sector: "Communication Services", industry: "Media" },
  OSK: { ticker: "OSK", name: "Oshkosh Corporation", price: 152.25, sector: "Industrials", industry: "Industrial" },
  PFE: { ticker: "PFE", name: "Pfizer, Inc.", price: 25.65, sector: "Healthcare", industry: "Healthcare" },
  PG: { ticker: "PG", name: "Procter & Gamble Company (The)", price: 144.53, sector: "Consumer Defensive", industry: "Consumer Goods" },
  SPY: { ticker: "SPY", name: "SPDR S&P 500", price: 691.66, sector: "Financial Services", industry: "Financial" },
  TMUS: { ticker: "TMUS", name: "T-Mobile US, Inc.", price: 186.32, sector: "Communication Services", industry: "Media" },
};

// Common column names for ticker/symbol
const TICKER_COLUMNS = [
  "symbol",
  "ticker",
  "stock",
  "name",
  "security",
  "holding",
  "asset",
];
// Common column names for quantity/shares
const SHARES_COLUMNS = [
  "shares",
  "quantity",
  "qty",
  "units",
  "amount",
  "position",
  "holdings",
];

function parsePortfolioData(text: string): PortfolioItem[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const items: PortfolioItem[] = [];

  // Detect delimiter (comma, tab, or multiple spaces)
  const firstLine = lines[0];
  let delimiter: string | RegExp = ",";
  if (firstLine.includes("\t")) {
    delimiter = "\t";
  } else if (!firstLine.includes(",") && firstLine.includes("  ")) {
    delimiter = /\s{2,}/;
  }

  // Split all lines
  const rows = lines.map((line) => {
    if (typeof delimiter === "string") {
      return line
        .split(delimiter)
        .map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
    }
    return line
      .split(delimiter)
      .map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
  });

  // Try to detect header row and column indices
  let tickerCol = -1;
  let sharesCol = -1;
  let startRow = 0;

  // Check if first row is a header
  const headerRow = rows[0].map((h) => h.toLowerCase());

  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i];
    if (tickerCol === -1 && TICKER_COLUMNS.some((t) => header.includes(t))) {
      tickerCol = i;
    }
    if (sharesCol === -1 && SHARES_COLUMNS.some((s) => header.includes(s))) {
      sharesCol = i;
    }
  }

  // If we found headers, skip the header row
  if (tickerCol !== -1 || sharesCol !== -1) {
    startRow = 1;
  }

  // If no headers detected, assume first column is ticker, second is shares
  if (tickerCol === -1) tickerCol = 0;
  if (sharesCol === -1) sharesCol = 1;

  // Parse data rows
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const ticker = row[tickerCol]?.toUpperCase().replace(/[^A-Z]/g, "");
    const sharesStr = row[sharesCol]?.replace(/[,$]/g, "");
    const shares = parseFloat(sharesStr);

    // Validate: ticker should be 1-5 uppercase letters, shares should be positive
    if (
      ticker &&
      ticker.length >= 1 &&
      ticker.length <= 5 &&
      !isNaN(shares) &&
      shares > 0
    ) {
      // Keep fractional shares for accurate value calculations
      items.push({ ticker, shares });
    }
  }

  // Deduplicate by ticker (sum shares)
  const deduped = new Map<string, number>();
  for (const item of items) {
    deduped.set(item.ticker, (deduped.get(item.ticker) || 0) + item.shares);
  }

  return Array.from(deduped.entries()).map(([ticker, shares]) => ({
    ticker,
    shares,
  }));
}

export function PortfolioInput({
  portfolio,
  setPortfolio,
  setStockInfo,
  compact = false,
}: PortfolioInputProps) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(!compact);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Broker connection state
  const [isConnectingBroker, setIsConnectingBroker] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [brokerConnected, setBrokerConnected] = useState(false);

  // Check for brokerage callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isCallback = params.get("brokerage_callback") === "true";
    const status = params.get("status")?.toLowerCase();

    if (isCallback) {
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);

      console.log("[Broker Callback] Status:", status);

      if (status === "success") {
        // Fetch holdings from connected broker
        fetchBrokerHoldings();
      } else {
        const error = params.get("error") || `Connection ${status || "failed"}`;
        setBrokerError(error);
      }
    }

    // Check if already connected
    const userId = localStorage.getItem("snaptrade_user_id");
    const userSecret = localStorage.getItem("snaptrade_user_secret");
    if (userId && userSecret) {
      setBrokerConnected(true);
    }
  }, []);

  const fetchBrokerHoldings = async () => {
    const userId = localStorage.getItem("snaptrade_user_id");
    const userSecret = localStorage.getItem("snaptrade_user_secret");

    if (!userId || !userSecret) {
      setBrokerError("Missing broker credentials");
      return;
    }

    try {
      setIsConnectingBroker(true);
      setBrokerError(null);

      const response = await fetch("/api/brokerage/snaptrade/holdings", {
        headers: {
          "x-snaptrade-user-id": userId,
          "x-snaptrade-user-secret": userSecret,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch holdings");
      }

      const data = await response.json();

      if (data.holdings && data.holdings.length > 0) {
        const portfolioItems: PortfolioItem[] = data.holdings.map(
          (h: { ticker: string; shares: number }) => ({
            ticker: h.ticker,
            shares: Math.round(h.shares),
          }),
        );
        setPortfolio(portfolioItems);
        setBrokerConnected(true);
      } else {
        setBrokerError("No holdings found in connected account");
      }
    } catch (err) {
      setBrokerError(
        err instanceof Error ? err.message : "Failed to fetch holdings",
      );
    } finally {
      setIsConnectingBroker(false);
    }
  };

  const handleConnectBroker = async (forceNew: boolean = false) => {
    try {
      setIsConnectingBroker(true);
      setBrokerError(null);

      // Check for existing credentials or generate new user ID
      let userId = forceNew ? null : localStorage.getItem("snaptrade_user_id");
      let userSecret = forceNew
        ? null
        : localStorage.getItem("snaptrade_user_secret");

      if (!userId) {
        // Clear any stale credentials
        localStorage.removeItem("snaptrade_user_id");
        localStorage.removeItem("snaptrade_user_secret");
        userId = generateUserId();
        userSecret = null;
      }

      const response = await fetch("/api/brokerage/snaptrade/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userSecret,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        // If credentials are invalid, clear them and retry with fresh registration
        if (data.code === "INVALID_CREDENTIALS" && !forceNew) {
          console.log("Stale credentials, retrying with fresh registration...");
          localStorage.removeItem("snaptrade_user_id");
          localStorage.removeItem("snaptrade_user_secret");
          return handleConnectBroker(true);
        }

        throw new Error(data.error || "Failed to initialize connection");
      }

      const data = await response.json();

      // Store credentials for after OAuth callback
      localStorage.setItem("snaptrade_user_id", data.userId);
      localStorage.setItem("snaptrade_user_secret", data.userSecret);

      // Redirect to SnapTrade OAuth
      window.location.href = data.redirectUrl;
    } catch (err) {
      setBrokerError(
        err instanceof Error ? err.message : "Failed to connect broker",
      );
      setIsConnectingBroker(false);
    }
  };

  const handleRefreshHoldings = async () => {
    await fetchBrokerHoldings();
  };

  const handleAdd = () => {
    if (!ticker.trim() || !shares.trim()) return;

    const tickerUpper = ticker.trim().toUpperCase();
    const sharesNum = parseFloat(shares);

    if (isNaN(sharesNum) || sharesNum <= 0) return;

    const existingIndex = portfolio.findIndex((p) => p.ticker === tickerUpper);
    if (existingIndex >= 0) {
      setPortfolio((prev) =>
        prev.map((p, i) =>
          i === existingIndex ? { ...p, shares: p.shares + sharesNum } : p,
        ),
      );
    } else {
      setPortfolio((prev) => [
        ...prev,
        { ticker: tickerUpper, shares: sharesNum },
      ]);
    }

    setTicker("");
    setShares("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const loadSamplePortfolio = () => {
    // Set placeholder stock info immediately for smooth UX
    if (setStockInfo) {
      setStockInfo(SAMPLE_STOCK_INFO);
    }
    setPortfolio(SAMPLE_PORTFOLIO);
  };

  const handleImport = () => {
    setImportError(null);
    const items = parsePortfolioData(importText);

    if (items.length === 0) {
      setImportError(
        "Could not parse any valid stocks. Make sure format is: TICKER, SHARES",
      );
      return;
    }

    setPortfolio(items);
    setImportText("");
    setShowImport(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportError(null);
        const items = parsePortfolioData(text);

        if (items.length === 0) {
          setImportError("Could not parse any valid stocks from file.");
          return;
        }

        setPortfolio(items);
        setShowImport(false);
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Compact mode - just show add form and import button (no analyze)
  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Ticker (e.g., AAPL)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border border-[#2d3139] px-3 py-2 text-sm mono uppercase focus:outline-none focus:border-[#3fb950]"
          />
          <input
            type="number"
            placeholder="Shares"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-32 bg-transparent border border-[#2d3139] px-3 py-2 text-sm mono focus:outline-none focus:border-[#3fb950]"
            min="1"
          />
          <button
            onClick={handleAdd}
            disabled={!ticker.trim() || !shares.trim()}
            className="bg-[#3fb950] text-white px-6 py-2 font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        <div className="flex gap-4 text-sm">
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-[#858687] hover:text-white transition-colors"
          >
            {showImport ? "Cancel import" : "Import CSV"}
          </button>
          {brokerConnected ? (
            <button
              onClick={handleRefreshHoldings}
              disabled={isConnectingBroker}
              className="text-[#858687] hover:text-white transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 bg-[#3fb950]" />
              {isConnectingBroker ? "Syncing..." : "Sync Broker"}
            </button>
          ) : (
            <button
              onClick={() => handleConnectBroker()}
              disabled={isConnectingBroker}
              className="text-[#858687] hover:text-white transition-colors"
            >
              {isConnectingBroker ? "Connecting..." : "Connect Broker"}
            </button>
          )}
        </div>
        {brokerError && (
          <p className="text-sm text-[#f85149]">{brokerError}</p>
        )}

        {/* Import Section - Inline */}
        {showImport && (
          <div className="space-y-4 p-4 bg-[#0d1117] border border-[#2d3139]">
            <p className="text-sm font-medium">
              Import Portfolio (replaces current)
            </p>

            {/* File Upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileUpload}
                className="hidden"
                id="portfolio-file-compact"
              />
              <label
                htmlFor="portfolio-file-compact"
                className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-[#2d3139] cursor-pointer hover:border-[#3fb950] transition-colors text-sm"
              >
                <span>Upload CSV</span>
                <span className="text-[#858687] text-xs">
                  (Fidelity, Schwab, Robinhood, etc.)
                </span>
              </label>
            </div>

            {/* Paste Area */}
            <div className="space-y-2">
              <p className="text-xs text-[#858687]">
                Or paste your holdings:
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Symbol, Shares
NVDA, 50
MSFT, 30`}
                className="w-full h-24 px-3 py-2 bg-transparent border border-[#2d3139] mono text-sm resize-none focus:outline-none focus:border-[#3fb950]"
              />
            </div>

            {importError && (
              <p className="text-sm text-[#f85149]">{importError}</p>
            )}

            <button
              onClick={handleImport}
              disabled={!importText.trim()}
              className="bg-[#3fb950] text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import & Replace
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connect Broker - Primary CTA */}
      {portfolio.length === 0 && (
        <div className="space-y-6">
          {/* Broker Connection */}
          <div className="p-6 bg-[#0d1117] border border-[#3fb950]/30 border-l-2 border-l-[#3fb950]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Connect Your Brokerage</p>
                <p className="text-sm text-[#858687]">
                  Import your real portfolio from Fidelity, Schwab, Robinhood & more
                </p>
              </div>
              <button
                onClick={() => handleConnectBroker()}
                disabled={isConnectingBroker}
                className="bg-[#3fb950] text-white px-6 py-2 font-medium hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isConnectingBroker ? "Connecting..." : "Connect Broker"}
              </button>
            </div>
            {brokerError && (
              <p className="text-sm text-[#f85149] mt-2">{brokerError}</p>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[#2d3139]" />
            <span className="text-xs text-[#858687]">or use sample data</span>
            <div className="flex-1 h-px bg-[#2d3139]" />
          </div>

          {/* Sample Portfolio */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadSamplePortfolio}
              className="px-4 py-2 border border-[#2d3139] text-sm hover:border-[#3fb950] transition-colors"
            >
              Load Sample Portfolio
            </button>
            <button
              onClick={() => setShowImport(!showImport)}
              className="px-4 py-2 border border-[#2d3139] text-sm hover:border-[#3fb950] transition-colors"
            >
              Import CSV
            </button>
          </div>
        </div>
      )}

      {/* Broker Refresh - When connected and has portfolio */}
      {portfolio.length > 0 && brokerConnected && (
        <div className="flex items-center gap-2 text-sm text-[#858687]">
          <span className="w-2 h-2 bg-[#3fb950]" />
          <span>Broker connected</span>
          <button
            onClick={handleRefreshHoldings}
            disabled={isConnectingBroker}
            className="text-[#858687] hover:text-white transition-colors text-xs"
          >
            {isConnectingBroker ? "Syncing..." : "Sync"}
          </button>
        </div>
      )}

      {/* Import Section */}
      {showImport && (
        <div className="space-y-4 p-4 bg-[#0d1117] border border-[#2d3139]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Import Portfolio</p>
            <button
              onClick={() => {
                setShowImport(false);
                setImportText("");
                setImportError(null);
              }}
              className="text-[#858687] hover:text-white"
            >
              ×
            </button>
          </div>

          {/* File Upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileUpload}
              className="hidden"
              id="portfolio-file"
            />
            <label
              htmlFor="portfolio-file"
              className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-[#2d3139] cursor-pointer hover:border-[#3fb950] transition-colors text-sm"
            >
              <span>Upload CSV</span>
              <span className="text-[#858687] text-xs">
                (from Fidelity, Schwab, Robinhood, etc.)
              </span>
            </label>
          </div>

          {/* Paste Area */}
          <div className="space-y-2">
            <p className="text-xs text-[#858687]">
              Or paste your holdings (supports most formats):
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Symbol, Shares
NVDA, 50
MSFT, 30
GOOGL, 20

Or paste directly from your broker...`}
              className="w-full h-32 px-3 py-2 bg-transparent border border-[#2d3139] mono text-sm resize-none focus:outline-none focus:border-[#3fb950]"
            />
          </div>

          {importError && (
            <p className="text-sm text-[#f85149]">{importError}</p>
          )}

          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            className="bg-[#3fb950] text-white px-4 py-2 text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      )}

      {/* Add Stock Form */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border border-[#2d3139] px-3 py-2 text-sm mono uppercase focus:outline-none focus:border-[#3fb950]"
        />
        <input
          type="number"
          placeholder="Shares"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 bg-transparent border border-[#2d3139] px-3 py-2 text-sm mono focus:outline-none focus:border-[#3fb950]"
          min="1"
        />
        <button
          onClick={handleAdd}
          disabled={!ticker.trim() || !shares.trim()}
          className="bg-[#3fb950] text-white px-6 py-2 font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}
