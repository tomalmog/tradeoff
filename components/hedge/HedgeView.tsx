"use client";

import { useState, useEffect, useRef } from "react";
import { HedgeCard } from "@/components/HedgeCard";
import type { PortfolioItem, StockInfo, AnalysisResult, HedgeRecommendation } from "@/app/page";
import type { CorrelationInsight } from "@/components/HedgeCard";

interface HedgeViewProps {
  portfolio: PortfolioItem[];
  setPortfolio: React.Dispatch<React.SetStateAction<PortfolioItem[]>>;
  stockInfo: Record<string, StockInfo>;
  analysisResult: AnalysisResult | null;
  setAnalysisResult: React.Dispatch<React.SetStateAction<AnalysisResult | null>>;
  onGoToNews?: () => void;
  onBetSelect?: (bet: HedgeRecommendation | null) => void;
  isPreloaded?: boolean;
}

export function HedgeView({
  portfolio,
  stockInfo,
  analysisResult,
  setAnalysisResult,
  onGoToNews,
  onBetSelect,
  isPreloaded = false,
}: HedgeViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoAnalyzed = useRef(false);
  const [correlationData, setCorrelationData] = useState<Record<string, CorrelationInsight>>({});
  const [isLoadingCorrelations, setIsLoadingCorrelations] = useState(false);
  const [woodWideResult, setWoodWideResult] = useState<{ totalCalls: number; timestamp: string } | null>(null);
  const hasCalledWoodWide = useRef(false);

  const handleAnalyze = async () => {
    if (portfolio.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }

      const result = await response.json();
      setAnalysisResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Mark as analyzed if preloaded
  useEffect(() => {
    if (isPreloaded && analysisResult) {
      hasAutoAnalyzed.current = true;
    }
  }, [isPreloaded, analysisResult]);

  // Auto-analyze when entering tab with portfolio but no results (only if not preloaded)
  useEffect(() => {
    if (portfolio.length > 0 && !analysisResult && !isAnalyzing && !hasAutoAnalyzed.current && !isPreloaded) {
      hasAutoAnalyzed.current = true;
      handleAnalyze();
    }
  }, [portfolio.length, analysisResult, isAnalyzing, isPreloaded]);

  // Reset auto-analyze flag when portfolio changes significantly
  useEffect(() => {
    if (analysisResult) {
      const currentTickers = new Set(portfolio.map(p => p.ticker));
      const analyzedTickers = new Set(
        analysisResult.recommendations.flatMap(r => r.affectedStocks)
      );
      
      // If portfolio changed significantly, allow re-analysis
      const hasNewStocks = portfolio.some(p => !analyzedTickers.has(p.ticker));
      if (hasNewStocks) {
        hasAutoAnalyzed.current = false;
      }
    }
  }, [portfolio, analysisResult]);

  // Fetch correlation data when analysis results are available (Wood Wide AI)
  useEffect(() => {
    const fetchCorrelations = async () => {
      if (!analysisResult || analysisResult.recommendations.length === 0) return;
      
      setIsLoadingCorrelations(true);
      const newCorrelationData: Record<string, CorrelationInsight> = {};
      
      // Fetch correlations for each recommendation in parallel
      const promises = analysisResult.recommendations.map(async (rec) => {
        try {
          const response = await fetch("/api/correlation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              betTitle: rec.market,
              betDescription: rec.reasoning,
              affectedTickers: rec.affectedStocks,
            }),
          });
          
          if (response.ok) {
            const insight = await response.json();
            newCorrelationData[rec.market] = insight;
          }
        } catch (err) {
          console.error(`Failed to fetch correlation for ${rec.market}:`, err);
        }
      });
      
      await Promise.all(promises);
      setCorrelationData(newCorrelationData);
      setIsLoadingCorrelations(false);
    };
    
    fetchCorrelations();
  }, [analysisResult]);

  // Call Wood Wide API when hedges page loads (3 API calls)
  useEffect(() => {
    const callWoodWide = async () => {
      if (portfolio.length === 0 || hasCalledWoodWide.current) return;
      
      hasCalledWoodWide.current = true;
      console.log("[HedgeView] Calling Wood Wide API (3 calls)...");
      
      try {
        const portfolioWithValues = portfolio.map(p => {
          const info = stockInfo[p.ticker];
          return {
            ticker: p.ticker,
            shares: p.shares,
            value: info ? info.price * p.shares : 0,
            sector: info?.sector || "Unknown",
          };
        });

        const response = await fetch("/api/woodwide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolio: portfolioWithValues }),
        });

        if (response.ok) {
          const result = await response.json();
          setWoodWideResult({
            totalCalls: result.totalCalls,
            timestamp: result.timestamp,
          });
          console.log(`[HedgeView] Wood Wide complete: ${result.totalCalls} API calls made`);
        }
      } catch (err) {
        console.error("[HedgeView] Wood Wide API error:", err);
      }
    };

    callWoodWide();
  }, [portfolio, stockInfo]);

  // Calculate total portfolio value
  const totalValue = portfolio.reduce((sum, p) => {
    const info = stockInfo[p.ticker];
    return sum + (info?.price || 0) * p.shares;
  }, 0);

  // No portfolio - prompt to add one
  if (portfolio.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 border border-[#2d3139] bg-[#1c2026] flex items-center justify-center mb-4">
            <span className="text-2xl">📊</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">No Portfolio Yet</h2>
          <p className="text-[#858687] max-w-md mb-6">
            Add stocks to your portfolio first, then come back here to find Polymarket bets that hedge your positions.
          </p>
          <p className="text-sm text-[#858687]">
            Go to the <span className="text-[#3fb950] font-medium">Portfolio</span> tab to get started.
          </p>
        </div>
      </div>
    );
  }

  // Calculate total recommended allocation
  const totalAllocation = analysisResult?.recommendations.reduce((sum, h) => sum + h.suggestedAllocation, 0) || 0;
  const allocationPercentage = totalValue > 0 ? (totalAllocation / totalValue) * 100 : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Portfolio Summary Header */}
      <div className="bg-[#1c2026] border border-[#2d3139] p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm text-[#858687] mb-1">PORTFOLIO</h2>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-semibold mono">{portfolio.length} stocks</span>
              <span className="text-[#858687]">|</span>
              <span className="text-2xl font-semibold mono">${totalValue.toLocaleString()}</span>
              <span className="text-[#858687]">|</span>
              <div className="flex gap-2">
                {portfolio.slice(0, 4).map(p => (
                  <span key={p.ticker} className="mono text-sm bg-[#0d1117] px-2 py-1 border border-[#2d3139]">
                    {p.ticker}
                  </span>
                ))}
                {portfolio.length > 4 && (
                  <span className="mono text-sm text-[#858687]">+{portfolio.length - 4}</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            {analysisResult && !isAnalyzing ? (
              <>
                <div className="text-xs text-[#858687] mb-1">RECOMMENDED HEDGE ALLOCATION</div>
                <div className="text-2xl font-semibold mono">${totalAllocation.toLocaleString()}</div>
                <div className="text-sm text-[#858687] mono">{allocationPercentage.toFixed(1)}% of portfolio</div>
              </>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="bg-[#3fb950] text-white px-6 py-2 font-medium hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? "Analyzing..." : "Re-analyze"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#1c2026] border border-[#f85149] border-l-2 border-l-[#f85149] p-4 mb-6">
          <p className="text-sm text-[#f85149]">{error}</p>
          <button
            onClick={handleAnalyze}
            className="mt-2 text-sm text-[#858687] hover:text-white transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#3fb950] border-t-transparent animate-spin mb-4" />
          <p className="text-[#858687]">Finding hedges for your portfolio...</p>
          <p className="text-sm text-[#858687] mt-1">
            Analyzing {portfolio.length} stocks against Polymarket events
          </p>
        </div>
      )}

      {/* Results */}
      {analysisResult && !isAnalyzing && (
        <>
          {/* Wood Wide AI Stats Banner */}
          <div className="bg-[#1c2026] border border-[#2d3139] border-l-2 border-l-[#3fb950] p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xs text-[#858687]">POWERED BY</div>
                <div className="text-sm font-semibold text-[#3fb950]">Wood Wide AI</div>
              </div>
              {isLoadingCorrelations && Object.keys(correlationData).length === 0 && (
                <div className="flex items-center gap-2 text-xs text-[#858687]">
                  <div className="w-3 h-3 border border-[#3fb950] border-t-transparent animate-spin" />
                  <span>Loading historical data...</span>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">HEDGE RECOMMENDATIONS</h2>
            <div className="space-y-6">
              {/* Sort by confidence: high first, then medium, then low */}
              {[...analysisResult.recommendations]
                .sort((a, b) => {
                  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                  return (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3);
                })
                .map((rec, index) => (
                  <HedgeCard
                    key={index}
                    recommendation={rec}
                    stockInfo={stockInfo}
                    portfolioValue={totalValue}
                    correlationInsight={correlationData[rec.market]}
                    onBetSelect={(bet) => {
                      if (onBetSelect) onBetSelect(bet);
                      if (onGoToNews) onGoToNews();
                    }}
                  />
                ))}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="bg-[#1c2026] border border-[#2d3139] p-6">
            <h3 className="font-semibold mb-4">Hedge Strategy Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs text-[#858687] mb-1">TOTAL HEDGE COST</div>
                <div className="text-2xl font-semibold mono">${totalAllocation.toLocaleString()}</div>
                <div className="text-sm text-[#858687] mt-1">{allocationPercentage.toFixed(1)}% of portfolio</div>
              </div>
              <div>
                <div className="text-xs text-[#858687] mb-1">POTENTIAL MAX PAYOUT</div>
                <div className="text-2xl font-semibold mono text-[#3fb950]">
                  ${analysisResult.recommendations.reduce((sum, h) => {
                    const entryPrice = h.position === "YES" ? h.probability : (1 - h.probability);
                    return sum + Math.round(h.suggestedAllocation / entryPrice);
                  }, 0).toLocaleString()}
                </div>
                <div className="text-sm text-[#858687] mt-1">If all hedges pay out</div>
              </div>
              <div>
                <div className="text-xs text-[#858687] mb-1">MARKETS COVERED</div>
                <div className="text-2xl font-semibold mono">{analysisResult.recommendations.length}</div>
                <div className="text-sm text-[#858687] mt-1">Diversified hedge strategy</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
