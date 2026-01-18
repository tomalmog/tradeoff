"use client";

import { useState, useEffect, useCallback } from "react";
import { TabNav, type TabType } from "@/components/TabNav";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { HedgeView } from "@/components/hedge/HedgeView";
import { RiskView } from "@/components/risk/RiskView";
import { NewsView } from "@/components/news/NewsView";
import { GreeksView } from "@/components/greeks/GreeksView";
import type { NewsArticle } from "@/app/api/news/route";

// Shared types - exported for use in other components
export interface PortfolioItem {
  ticker: string;
  shares: number;
}

export interface StockInfo {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
}

export interface HedgeRecommendation {
  market: string;
  marketUrl: string;
  outcome: string;
  probability: number;
  position: "YES" | "NO";
  reasoning: string;
  hedgesAgainst: string;
  suggestedAllocation: number;
  affectedStocks: string[];
  confidence: "high" | "medium";
}

export interface AnalysisResult {
  summary: string;
  recommendations: HedgeRecommendation[];
  stocksWithoutHedges: string[];
  compression: {
    originalTokens: number;
    compressedTokens: number;
    savings: number;
  };
}

// Risk analysis result type (matches API response and RiskView component)
// Using 'any' for alerts to match the API response structure
export interface RiskAnalysisResult {
  summary: string;
  alerts: any[]; // RiskAlert[] from lib/risk-factors, but API may return different structure
  portfolioStats: {
    totalValue: number;
    holdingCount: number;
    sectorWeights: Record<string, number>;
    largestPosition: { ticker: string; weight: number };
  };
  benchmarkComparison: Array<{
    metric: string;
    yourValue: string;
    typical: string;
    assessment: "better" | "worse" | "similar";
  }>;
  woodWideAnalysis?: {
    enabled: boolean;
    anomalies?: Array<{
      ticker: string;
      anomalyScore: number;
      isAnomaly: boolean;
      reason?: string;
    }>;
    error?: string;
  };
  analysisTimestamp: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("portfolio");
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, StockInfo>>({});
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [riskAnalysisResult, setRiskAnalysisResult] = useState<RiskAnalysisResult | null>(null);
  const [selectedBet, setSelectedBet] = useState<HedgeRecommendation | null>(
    null,
  );
  const [cachedArticles, setCachedArticles] = useState<NewsArticle[]>([]);

  const handleBetSelect = (bet: HedgeRecommendation | null) => {
    setSelectedBet(bet);
  };

  const handleArticlesUpdate = (articles: NewsArticle[]) => {
    setCachedArticles(articles);
  };

  // Fetch stock data when portfolio changes
  const fetchStockData = useCallback(
    async (tickers: string[]) => {
      if (tickers.length === 0) return;

      const newTickers = tickers.filter((t) => !stockInfo[t]);
      if (newTickers.length === 0) return;

      try {
        const response = await fetch(
          `/api/stocks?tickers=${newTickers.join(",")}`,
        );
        if (response.ok) {
          const data = await response.json();
          const newInfo: Record<string, StockInfo> = {};
          for (const stock of data.stocks) {
            newInfo[stock.ticker] = stock;
          }
          setStockInfo((prev) => ({ ...prev, ...newInfo }));
        }
      } catch (err) {
        console.error("Failed to fetch stock data:", err);
      }
    },
    [], // Remove stockInfo from dependencies to prevent infinite loop
  );

  useEffect(() => {
    const tickers = portfolio.map((p) => p.ticker);
    fetchStockData(tickers);
  }, [portfolio, fetchStockData]);

  // Preload all tab data when portfolio is uploaded
  const preloadAllTabs = useCallback(async () => {
    if (portfolio.length === 0) return;

    // Check if we already have all data loaded
    const hasHedges = analysisResult !== null;
    const hasRisks = riskAnalysisResult !== null;
    const hasNews = cachedArticles.length > 0;

    // If all data is already loaded, skip
    if (hasHedges && hasRisks && hasNews) {
      return;
    }

    try {
      // Fetch all data in parallel
      const promises: Promise<void>[] = [];

      // Fetch hedges if not already loaded
      if (!hasHedges) {
        promises.push(
          fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portfolio }),
          })
            .then(async (response) => {
              if (response.ok) {
                const result = await response.json();
                setAnalysisResult(result);
              }
            })
            .catch((err) => {
              console.error("Failed to preload hedges:", err);
            })
        );
      }

      // Fetch risks if not already loaded
      if (!hasRisks) {
        promises.push(
          fetch("/api/risk-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portfolio }),
          })
            .then(async (response) => {
              if (response.ok) {
                const result = await response.json();
                setRiskAnalysisResult(result);
              }
            })
            .catch((err) => {
              console.error("Failed to preload risks:", err);
            })
        );
      }

      // Fetch news if not already loaded
      if (!hasNews) {
        promises.push(
          fetch("/api/news", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portfolio }),
          })
            .then(async (response) => {
              if (response.ok) {
                const data = await response.json();
                const articles = data.articles || [];
                setCachedArticles(articles);
              }
            })
            .catch((err) => {
              console.error("Failed to preload news:", err);
            })
        );
      }

      // Wait for all to complete (silently in background)
      await Promise.all(promises);
    } catch (error) {
      console.error("Error preloading tabs:", error);
    }
  }, [portfolio]); // Only depend on portfolio, not the state variables we're updating

  // Trigger preload when portfolio changes and has items
  useEffect(() => {
    if (portfolio.length > 0) {
      // Wait a bit for stock data to load first
      const timer = setTimeout(() => {
        preloadAllTabs();
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Clear all data when portfolio is empty
      setAnalysisResult(null);
      setRiskAnalysisResult(null);
      setCachedArticles([]);
    }
  }, [portfolio.length, preloadAllTabs]);

  // Clear analysis when portfolio changes significantly
  useEffect(() => {
    // Only clear if we have results and portfolio changed
    if (analysisResult) {
      const currentTickers = new Set(portfolio.map((p) => p.ticker));
      const analyzedTickers = new Set(
        analysisResult.recommendations.flatMap((r) => r.affectedStocks),
      );

      // Check if all analyzed stocks are still in portfolio
      const stillValid = [...analyzedTickers].every((t) =>
        currentTickers.has(t),
      );
      if (!stillValid && portfolio.length > 0) {
        // Clear and re-preload
        setAnalysisResult(null);
        setRiskAnalysisResult(null);
        setCachedArticles([]);
        preloadAllTabs();
      }
    }
  }, [portfolio, analysisResult, preloadAllTabs]);

  return (
    <div className="min-h-screen bg-[#12161c] flex flex-col">
      {/* Header */}
      <header className="bg-[#12161c] border-b border-[#2d3139]">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-[#3fb950]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <h1 className="text-xl font-bold">
                <span className="text-white">Trade</span>
                <span className="text-[#3fb950]">Off</span>
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-[#12161c] border-b border-[#2d3139] sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex justify-center">
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-6">
        {activeTab === "portfolio" && (
          <PortfolioView
            portfolio={portfolio}
            setPortfolio={setPortfolio}
            stockInfo={stockInfo}
            setStockInfo={setStockInfo}
          />
        )}
        {activeTab === "hedges" && (
          <HedgeView
            portfolio={portfolio}
            setPortfolio={setPortfolio}
            stockInfo={stockInfo}
            analysisResult={analysisResult}
            setAnalysisResult={setAnalysisResult}
            onGoToNews={() => setActiveTab("news")}
            onBetSelect={handleBetSelect}
            isPreloaded={analysisResult !== null}
          />
        )}
        {activeTab === "risks" && (
          <RiskView
            portfolio={portfolio}
            stockInfo={stockInfo}
            hedges={analysisResult?.recommendations || []}
            onGoToHedges={() => setActiveTab("hedges")}
            preloadedResult={riskAnalysisResult}
          />
        )}
        {activeTab === "news" && (
          <NewsView
            portfolio={portfolio}
            stockInfo={stockInfo}
            selectedBet={selectedBet}
            onBetSelect={handleBetSelect}
            cachedArticles={cachedArticles}
            onArticlesUpdate={handleArticlesUpdate}
            isPreloaded={cachedArticles.length > 0}
          />
        )}
        {activeTab === "greeks" && (
          <GreeksView
            recommendations={analysisResult?.recommendations || []}
            stockInfo={stockInfo}
            portfolioValue={
              portfolio.reduce((sum, p) => {
                const info = stockInfo[p.ticker];
                return sum + (info?.price || 0) * p.shares;
              }, 0) || 50000
            }
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2d3139] py-4 px-4 mt-auto">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between text-xs text-[#858687]">
          <span>Built for NexHacks 2026 · Powered by Polymarket, Groq & Wood Wide AI</span>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
