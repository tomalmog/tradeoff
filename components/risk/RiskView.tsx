"use client";

import { useState, useEffect, useRef } from "react";
import { RiskCard } from "./RiskCard";
import {
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import type { PortfolioItem, StockInfo, HedgeRecommendation } from "@/app/page";
import type { RiskAlert } from "@/lib/risk-factors";

interface BenchmarkComparison {
  metric: string;
  yourValue: string;
  typical: string;
  assessment: "better" | "worse" | "similar";
}

interface PortfolioStats {
  totalValue: number;
  holdingCount: number;
  sectorWeights: Record<string, number>;
  largestPosition: { ticker: string; weight: number };
}

interface WoodWideAnalysis {
  enabled: boolean;
  anomalies?: {
    ticker: string;
    anomalyScore: number;
    isAnomaly: boolean;
    reason?: string;
  }[];
  error?: string;
}

interface RiskAnalysisResult {
  summary: string;
  alerts: RiskAlert[];
  portfolioStats: PortfolioStats;
  benchmarkComparison: BenchmarkComparison[];
  woodWideAnalysis?: WoodWideAnalysis;
  analysisTimestamp: string;
}

interface RiskViewProps {
  portfolio: PortfolioItem[];
  stockInfo: Record<string, StockInfo>;
  hedges?: HedgeRecommendation[];
  onGoToHedges?: () => void;
  preloadedResult?: RiskAnalysisResult | null;
}

export function RiskView({
  portfolio,
  stockInfo,
  hedges = [],
  onGoToHedges,
  preloadedResult,
}: RiskViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskAnalysisResult | null>(preloadedResult || null);
  const hasAutoAnalyzed = useRef(false);

  const handleAnalyze = async () => {
    if (portfolio.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/risk-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Risk analysis failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update result when preloaded result changes
  useEffect(() => {
    if (preloadedResult) {
      setResult(preloadedResult);
      hasAutoAnalyzed.current = true;
    }
  }, [preloadedResult]);

  // Auto-analyze when entering tab with portfolio but no results (only if not preloaded)
  useEffect(() => {
    if (
      portfolio.length > 0 &&
      !result &&
      !isAnalyzing &&
      !hasAutoAnalyzed.current &&
      !preloadedResult
    ) {
      hasAutoAnalyzed.current = true;
      handleAnalyze();
    }
  }, [portfolio.length, result, isAnalyzing, preloadedResult]);

  // Reset when portfolio changes
  useEffect(() => {
    if (result && portfolio.length > 0) {
      const currentTickers = new Set(portfolio.map((p) => p.ticker));
      const analyzedCount = result.portfolioStats.holdingCount;

      if (currentTickers.size !== analyzedCount) {
        hasAutoAnalyzed.current = false;
        setResult(null);
      }
    }
  }, [portfolio, result]);

  // No portfolio state
  if (portfolio.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Portfolio Yet</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Add stocks to your portfolio first, then come back here for a
          comprehensive risk analysis.
        </p>
        <p className="text-sm text-muted-foreground">
          Go to the <span className="text-accent font-medium">Portfolio</span>{" "}
          tab to get started.
        </p>
      </div>
    );
  }

  const totalValue = portfolio.reduce((sum, p) => {
    const info = stockInfo[p.ticker];
    return sum + (info?.price || 0) * p.shares;
  }, 0);

  // Count alerts by severity
  const alertCounts = result
    ? {
      critical: result.alerts.filter((a) => a.severity === "critical").length,
      high: result.alerts.filter((a) => a.severity === "high").length,
      medium: result.alerts.filter((a) => a.severity === "medium").length,
      low: result.alerts.filter((a) => a.severity === "low").length,
    }
    : { critical: 0, high: 0, medium: 0, low: 0 };

  const getAssessmentIcon = (assessment: "better" | "worse" | "similar") => {
    switch (assessment) {
      case "better":
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case "worse":
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      case "similar":
        return <Minus className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getAssessmentColor = (assessment: "better" | "worse" | "similar") => {
    switch (assessment) {
      case "better":
        return "text-green-400";
      case "worse":
        return "text-red-400";
      case "similar":
        return "text-yellow-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-accent" />
              <p className="text-sm text-muted-foreground">
                Wood Wide Risk Analysis
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-semibold">
                {portfolio.length} stock{portfolio.length !== 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="font-mono">
                $
                {totalValue.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          </div>
          {result && !isAnalyzing && (
            <button
              onClick={handleAnalyze}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary/50 transition-colors"
            >
              Re-analyze
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={handleAnalyze}
            className="mt-2 px-3 py-1.5 text-sm rounded-md border border-destructive/30 hover:bg-destructive/10 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading */}
      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">Analyzing portfolio risks...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Running Wood Wide AI analysis on {portfolio.length} stocks
          </p>
        </div>
      )}

      {/* Results */}
      {result && !isAnalyzing && (
        <>
          {/* Summary */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="font-semibold mb-2">Analysis Summary</h3>
            <p className="text-muted-foreground">{result.summary}</p>

            {/* Alert Count Badges */}
            {(alertCounts.critical > 0 ||
              alertCounts.high > 0 ||
              alertCounts.medium > 0) && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {alertCounts.critical > 0 && (
                    <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm font-medium">
                      {alertCounts.critical} Critical
                    </span>
                  )}
                  {alertCounts.high > 0 && (
                    <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-sm font-medium">
                      {alertCounts.high} High
                    </span>
                  )}
                  {alertCounts.medium > 0 && (
                    <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-medium">
                      {alertCounts.medium} Moderate
                    </span>
                  )}
                  {alertCounts.low > 0 && (
                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium">
                      {alertCounts.low} Low
                    </span>
                  )}
                </div>
              )}

            {/* Wood Wide AI Status */}
            {result.woodWideAnalysis && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${result.woodWideAnalysis.error
                        ? "bg-red-400"
                        : result.woodWideAnalysis.enabled
                          ? "bg-green-400"
                          : "bg-gray-400"
                      }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    Wood Wide AI:{" "}
                    {result.woodWideAnalysis.error
                      ? "Error"
                      : result.woodWideAnalysis.enabled
                        ? `Active (${result.woodWideAnalysis.anomalies?.length || 0} anomalies detected)`
                        : "Disabled"}
                  </span>
                </div>
                {result.woodWideAnalysis.error && (
                  <p className="text-xs text-red-400 mt-1 ml-4">
                    {result.woodWideAnalysis.error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Benchmark Comparison */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="font-semibold mb-4">
              Compared to Typical Portfolios
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {result.benchmarkComparison.map((comp) => (
                <div
                  key={comp.metric}
                  className="bg-secondary/30 rounded-lg p-3"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {getAssessmentIcon(comp.assessment)}
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {comp.metric}
                    </p>
                  </div>
                  <p
                    className={`text-lg font-mono font-semibold ${getAssessmentColor(comp.assessment)}`}
                  >
                    {comp.yourValue}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Typical: {comp.typical}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Alerts */}
          {result.alerts.length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                Risk Alerts ({result.alerts.length})
              </h3>
              <div className="space-y-4">
                {result.alerts.map((alert, idx) => (
                  <RiskCard
                    key={`${alert.riskFactor.id}-${idx}`}
                    alert={alert}
                    stockInfo={stockInfo}
                    hedges={hedges}
                    onViewHedge={
                      onGoToHedges ? () => onGoToHedges() : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
              <Shield className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-green-400 mb-2">
                No Major Risks Detected
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your portfolio shows good diversification. No risk
                concentrations exceed warning thresholds.
              </p>
            </div>
          )}

          {/* Link to Hedges */}
          {result.alerts.length > 0 && onGoToHedges && (
            <button
              onClick={onGoToHedges}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">View Hedge Recommendations</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
