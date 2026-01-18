"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, History, TrendingUp, Sparkles, X, ChevronRight, Calendar, DollarSign, CheckCircle2, XCircle } from "lucide-react";
import type { HedgeRecommendation, StockInfo } from "@/app/page";

// Topic categories for semantic matching
type EventTopic = 
  | 'regulatory' | 'safety_incident' | 'product_launch' | 'executive'
  | 'legal' | 'financial' | 'geopolitical' | 'social_media'
  | 'crypto' | 'entertainment' | 'ai_tech' | 'election' | 'other';

export interface CorrelationInsight {
  hasHistoricalData: boolean;
  matchCount: number;
  matchedEvents: {
    title: string;
    outcome: "YES" | "NO";
    ticker: string;
    priceOnResolution: number | null;
    resolutionDate: string;
  }[];
  confidenceBoost: number;
  insight: string;
  avgOutcome?: "YES" | "NO";
  yesCount: number;
  noCount: number;
  matchType?: 'topic' | 'ticker_only' | 'none';
  detectedTopic?: EventTopic;
  woodWidePrediction?: {
    prediction: number;
    confidence: number;
  };
}

interface HedgeCardProps {
  recommendation: HedgeRecommendation;
  stockInfo?: Record<string, StockInfo>;
  onBetSelect?: (bet: HedgeRecommendation | null) => void;
  correlationInsight?: CorrelationInsight;
}

// Format topic for display
function formatTopic(topic?: EventTopic): string {
  const topicLabels: Record<EventTopic, string> = {
    regulatory: 'regulatory/trade',
    safety_incident: 'safety',
    product_launch: 'product launch',
    executive: 'executive action',
    legal: 'legal',
    financial: 'financial',
    geopolitical: 'geopolitical',
    social_media: 'social media',
    crypto: 'crypto',
    entertainment: 'entertainment',
    ai_tech: 'AI/tech',
    election: 'election',
    other: 'general',
  };
  return topic ? topicLabels[topic] : 'general';
}

// Historical Events Modal Component
function HistoricalEventsModal({ 
  isOpen, 
  onClose, 
  correlationInsight,
  hedgeTitle 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  correlationInsight: CorrelationInsight;
  hedgeTitle: string;
}) {
  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#1c2026] border border-[#2d3139] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3139] bg-gradient-to-r from-[#1a1f2e] to-[#1c2026] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              correlationInsight.matchType === 'topic' 
                ? 'bg-[#3fb950]/20' 
                : 'bg-[#f0883e]/20'
            }`}>
              <Sparkles className={`w-5 h-5 ${
                correlationInsight.matchType === 'topic' 
                  ? 'text-[#3fb950]' 
                  : 'text-[#f0883e]'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Wood Wide AI Analysis
              </h3>
              <p className="text-xs text-[#858687]">
                Semantically similar historical bets with price data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#2d3139] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#858687]" />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="p-4 bg-[#12161c] border-b border-[#2d3139] shrink-0">
          <p className="text-sm text-[#a0a0a0] mb-3 line-clamp-2">
            Backing for: <span className="text-white font-medium">{hedgeTitle}</span>
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{correlationInsight.matchCount}</p>
              <p className="text-xs text-[#858687]">Past Bets</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#3fb950]">{correlationInsight.yesCount}</p>
              <p className="text-xs text-[#858687]">Resolved YES</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#f85149]">{correlationInsight.noCount}</p>
              <p className="text-xs text-[#858687]">Resolved NO</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-xs px-2 py-1 rounded bg-[#3fb950]/20 text-[#3fb950] font-mono">
              +{correlationInsight.confidenceBoost}% confidence boost
            </span>
          </div>
        </div>

        {/* Events List - Scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0 p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-[#858687]">
              Semantically Similar Bets
            </h4>
            <span className="text-[10px] px-2 py-0.5 rounded text-[#3fb950] bg-[#3fb950]/10">
              AI Matched
            </span>
          </div>
          
          {correlationInsight.matchedEvents.length === 0 ? (
            <p className="text-sm text-[#858687] text-center py-8">No historical events to display</p>
          ) : (
            correlationInsight.matchedEvents.map((event, idx) => (
              <div 
                key={idx}
                className="bg-[#12161c] border border-[#2d3139] rounded-lg p-4 hover:border-[#3d4149] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Outcome Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    event.outcome === "YES" 
                      ? "bg-[#3fb950]/20" 
                      : "bg-[#f85149]/20"
                  }`}>
                    {event.outcome === "YES" ? (
                      <CheckCircle2 className="w-4 h-4 text-[#3fb950]" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#f85149]" />
                    )}
                  </div>
                  
                  {/* Event Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-tight mb-2">
                      {event.title}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {/* Outcome */}
                      <span className={`font-semibold ${
                        event.outcome === "YES" ? "text-[#3fb950]" : "text-[#f85149]"
                      }`}>
                        Resolved: {event.outcome}
                      </span>
                      
                      {/* Ticker */}
                      <span className="flex items-center gap-1 text-[#58a6ff]">
                        <span className="px-1.5 py-0.5 bg-[#252932] rounded font-mono">
                          {event.ticker}
                        </span>
                      </span>
                      
                      {/* Date */}
                      <span className="flex items-center gap-1 text-[#858687]">
                        <Calendar className="w-3 h-3" />
                        {formatDate(event.resolutionDate)}
                      </span>
                      
                      {/* Price */}
                      {event.priceOnResolution !== null && (
                        <span className="flex items-center gap-1 text-[#858687]">
                          <DollarSign className="w-3 h-3" />
                          ${event.priceOnResolution.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2d3139] bg-[#12161c] shrink-0">
          <p className="text-xs text-[#858687] text-center">
            These are past Polymarket bets about the same companies (by ticker) in your portfolio.
            <br />
            <span className="text-[#58a6ff]">Higher confidence</span> when more historical data shows consistent outcomes.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HedgeCard({ recommendation, stockInfo = {}, onBetSelect, correlationInsight }: HedgeCardProps) {
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const {
    market,
    marketUrl,
    outcome,
    probability,
    position,
    reasoning,
    suggestedAllocation,
    affectedStocks,
  } = recommendation;

  const stockCount = affectedStocks.length;
  const currentOdds = Math.round(probability * 100);

  const handleNewsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBetSelect) {
      onBetSelect(recommendation);
    }
  };

  // Calculate potential payoff
  const entryPrice = position === "YES" ? probability : (1 - probability);
  const maxProfit = suggestedAllocation * ((1 - entryPrice) / entryPrice);
  const maxLoss = suggestedAllocation;

  return (
    <Card className="bg-[#1c2026] border-[#2d3139] hover:border-[#3d4149] transition-colors">
      <CardContent className="p-5 space-y-4">
        {/* Market Title & Probability */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <a
              href={marketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-[#3fb950] transition-colors font-medium inline-flex items-start gap-1"
            >
              <span className="line-clamp-2">{market}</span>
              <span className="text-[#858687] hover:text-[#3fb950] shrink-0 text-sm">↗</span>
            </a>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl font-bold text-white">{currentOdds}%</span>
            <p className="text-xs text-[#858687]">chance</p>
          </div>
        </div>

        {/* Yes/No Buttons - Polymarket Style */}
        <div className="flex gap-2">
          <button
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              position === "YES"
                ? "bg-[rgba(63,185,80,0.2)] text-[#3fb950] border-2 border-[#3fb950]"
                : "bg-[rgba(63,185,80,0.1)] text-[#3fb950] border border-[rgba(63,185,80,0.3)] opacity-50"
            }`}
          >
            Yes {Math.round(probability * 100)}¢
          </button>
          <button
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              position === "NO"
                ? "bg-[rgba(248,81,73,0.2)] text-[#f85149] border-2 border-[#f85149]"
                : "bg-[rgba(248,81,73,0.1)] text-[#f85149] border border-[rgba(248,81,73,0.3)] opacity-50"
            }`}
          >
            No {Math.round((1 - probability) * 100)}¢
          </button>
        </div>

        {/* Payoff Summary */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-[#12161c] rounded-lg">
          <div>
            <p className="text-xs text-[#858687]">Position</p>
            <p className="font-mono font-semibold text-white">${suggestedAllocation}</p>
          </div>
          <div>
            <p className="text-xs text-[#858687]">If Win</p>
            <p className="font-mono font-semibold text-[#3fb950]">+${maxProfit.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-[#858687]">If Lose</p>
            <p className="font-mono font-semibold text-[#f85149]">-${maxLoss}</p>
          </div>
        </div>

        {/* Affected Stocks */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#858687]">Hedges:</span>
          {affectedStocks.map((ticker) => {
            const info = stockInfo[ticker];
            return (
              <div key={ticker} className="group relative">
                <span className="px-2 py-0.5 rounded bg-[#252932] text-[#58a6ff] font-mono text-xs border border-[#2d3139]">
                  {ticker}
                </span>
                {info && (
                  <span className="absolute hidden group-hover:block bottom-full left-0 mb-1 px-2 py-1 bg-[#1c2026] border border-[#2d3139] rounded text-xs whitespace-nowrap z-10 text-white">
                    {info.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Historical Correlation Badge - Clickable */}
        {correlationInsight?.hasHistoricalData && (
          <>
            <button
              onClick={() => setShowHistoricalModal(true)}
              className="w-full text-left bg-gradient-to-r from-[#1a1f2e] to-[#12161c] border border-[#3fb950]/30 rounded-lg p-3 hover:border-[#3fb950]/60 hover:from-[#1a2030] transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-[#3fb950]/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#3fb950]/30 transition-colors">
                  <Sparkles className="w-3.5 h-3.5 text-[#3fb950]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${
                        'text-[#3fb950]'
                      }`}>
                        AI Matched
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#3fb950]/20 text-[#3fb950]">
                        +{correlationInsight.confidenceBoost}% confidence
                      </span>
                    </div>
                    <ChevronRight className={`w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ${
                      correlationInsight.matchType === 'topic' 
                        ? 'text-[#3fb950]' 
                        : 'text-[#f0883e]'
                    }`} />
                  </div>
                  <p className="text-xs text-[#a0a0a0] mt-1">
                    {correlationInsight.insight}
                  </p>
                  {correlationInsight.matchCount > 0 && (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <History className="w-3 h-3 text-[#858687]" />
                        <span className="text-[10px] text-[#858687]">
                          {correlationInsight.matchCount} similar bet{correlationInsight.matchCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-[#3fb950]">{correlationInsight.yesCount} YES</span>
                        <span className="text-[#858687]">|</span>
                        <span className="text-[#f85149]">{correlationInsight.noCount} NO</span>
                      </div>
                    </div>
                  )}
                  {correlationInsight.woodWidePrediction && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#2d3139]">
                      <TrendingUp className="w-3 h-3 text-[#58a6ff]" />
                      <span className="text-[10px] text-[#58a6ff]">
                        Wood Wide AI: {Math.round(correlationInsight.woodWidePrediction.prediction * 100)}% likely YES
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[#3fb950]/60 mt-2 text-center group-hover:text-[#3fb950] transition-colors">
                Click to view historical events →
              </p>
            </button>

            {/* Historical Events Modal */}
            <HistoricalEventsModal
              isOpen={showHistoricalModal}
              onClose={() => setShowHistoricalModal(false)}
              correlationInsight={correlationInsight}
              hedgeTitle={market}
            />
          </>
        )}

        {/* Reasoning + News Link */}
        <div className="flex items-end justify-between gap-4 pt-2 border-t border-[#2d3139]">
          <p className="text-sm text-[#858687] flex-1">{reasoning}</p>
          {onBetSelect && (
            <button
              onClick={handleNewsClick}
              className="text-xs text-[#858687] hover:text-[#3fb950] transition-colors flex items-center gap-1 shrink-0"
            >
              <Newspaper className="w-3 h-3" />
              <span>News</span>
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
