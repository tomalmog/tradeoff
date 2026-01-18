"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { HedgeRecommendations } from "@/components/HedgeRecommendations";
import type { PortfolioItem, StockInfo, AnalysisResult, HedgeRecommendation } from "@/app/page";

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

  // No portfolio - prompt to add one
  if (portfolio.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <span className="text-2xl">📊</span>
        </div>
        <h2 className="text-xl font-semibold mb-2">No Portfolio Yet</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Add stocks to your portfolio first, then come back here to find Polymarket bets that hedge your positions.
        </p>
        <p className="text-sm text-muted-foreground">
          Go to the <span className="text-accent font-medium">Portfolio</span> tab to get started.
        </p>
      </div>
    );
  }

  // Calculate total portfolio value
  const totalValue = portfolio.reduce((sum, p) => {
    const info = stockInfo[p.ticker];
    return sum + (info?.price || 0) * p.shares;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Analyzing Portfolio</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-semibold">
                {portfolio.length} stock{portfolio.length !== 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="font-mono">
                ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          {analysisResult && !isAnalyzing && (
            <Button
              onClick={handleAnalyze}
              variant="outline"
              size="sm"
            >
              Re-analyze
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            onClick={handleAnalyze}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">Finding hedges for your portfolio...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Analyzing {portfolio.length} stocks against Polymarket events
          </p>
        </div>
      )}

      {/* Results */}
      {analysisResult && !isAnalyzing && (
        <>
          <HedgeRecommendations
            summary={analysisResult.summary}
            recommendations={analysisResult.recommendations}
            stocksWithoutHedges={analysisResult.stocksWithoutHedges}
            stockInfo={stockInfo}
            onBetSelect={(bet) => {
              if (onBetSelect) onBetSelect(bet);
              if (onGoToNews) onGoToNews();
            }}
          />

        </>
      )}
    </div>
  );
}
