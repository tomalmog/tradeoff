"use client";

import { useState } from "react";
import { ExternalLink, Sparkles, History, TrendingUp, X, ChevronRight, Calendar, DollarSign, CheckCircle2, XCircle } from "lucide-react";
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
  portfolioValue?: number;
  correlationInsight?: CorrelationInsight;
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
      <div className="relative bg-[#1c2026] border border-[#2d3139] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3139] bg-gradient-to-r from-[#1a1f2e] to-[#1c2026] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center ${
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
            className="p-2 hover:bg-[#2d3139] transition-colors"
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
            <span className="text-xs px-2 py-1 bg-[#3fb950]/20 text-[#3fb950] font-mono">
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
            <span className="text-[10px] px-2 py-0.5 text-[#3fb950] bg-[#3fb950]/10">
              AI Matched
            </span>
          </div>
          
          {correlationInsight.matchedEvents.length === 0 ? (
            <p className="text-sm text-[#858687] text-center py-8">No historical events to display</p>
          ) : (
            correlationInsight.matchedEvents.map((event, idx) => (
              <div 
                key={idx}
                className="bg-[#12161c] border border-[#2d3139] p-4 hover:border-[#3d4149] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Outcome Icon */}
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${
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
                        <span className="px-1.5 py-0.5 bg-[#252932] font-mono">
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

export function HedgeCard({ recommendation, stockInfo = {}, portfolioValue = 50000, onBetSelect, correlationInsight }: HedgeCardProps) {
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  
  const {
    market,
    marketUrl,
    probability,
    position,
    reasoning,
    suggestedAllocation,
    affectedStocks,
    hedgesAgainst,
    confidence,
  } = recommendation;

  const currentOdds = Math.round(probability * 100);

  // Calculate potential payoff
  const entryPrice = position === "YES" ? probability : (1 - probability);
  const potentialPayout = suggestedAllocation * (1 / entryPrice);
  const potentialReturn = ((potentialPayout / suggestedAllocation - 1) * 100).toFixed(0);
  const portfolioPercentage = ((suggestedAllocation / portfolioValue) * 100).toFixed(1);

  return (
    <div className="bg-[#1c2026] border border-[#2d3139] p-6">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-lg flex-1">{market}</h3>
          <div className={`px-3 py-1 text-xs ml-4 border font-medium ${
            confidence === "high" 
              ? "border-[#3fb950] text-[#3fb950]" 
              : "border-[#fbbf24] text-[#fbbf24]"
          }`}>
            {confidence.toUpperCase()}
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-[#858687] mb-1">CURRENT PROBABILITY</div>
            <div className="text-2xl font-semibold mono">
              {currentOdds}% {position}
            </div>
          </div>
          <div className="h-8 w-[1px] bg-[#2d3139]" />
          <div>
            <div className="text-xs text-[#858687] mb-1">RECOMMENDED POSITION</div>
            <div className={`text-lg font-semibold mono ${position === "YES" ? "text-[#3fb950]" : "text-[#f85149]"}`}>
              BET {position}
            </div>
          </div>
          <div className="h-8 w-[1px] bg-[#2d3139]" />
          <div>
            <div className="text-xs text-[#858687] mb-1">ALLOCATION</div>
            <div className="text-lg font-semibold mono">${suggestedAllocation.toLocaleString()}</div>
            <div className="text-xs text-[#858687] mono">
              {portfolioPercentage}% of portfolio
            </div>
          </div>
          <div className="h-8 w-[1px] bg-[#2d3139]" />
          <div>
            <div className="text-xs text-[#858687] mb-1">POTENTIAL PAYOUT</div>
            <div className="text-lg font-semibold mono text-[#3fb950]">
              ${Math.round(potentialPayout).toLocaleString()}
            </div>
            <div className="text-xs text-[#858687] mono">
              {potentialReturn}% return
            </div>
          </div>
        </div>
      </div>

      {/* Details Box */}
      <div className="bg-[#0d1117] border border-[#2d3139] border-l-2 border-l-[#3fb950] p-4 mb-4">
        <div className="mb-3">
          <div className="text-xs text-[#858687] mb-1">HEDGES AGAINST</div>
          <div className="text-sm font-semibold">{hedgesAgainst}</div>
        </div>
        <div className="mb-3">
          <div className="text-xs text-[#858687] mb-1">AFFECTED STOCKS</div>
          <div className="flex gap-2">
            {affectedStocks.map((ticker) => (
              <span key={ticker} className="mono text-sm bg-[#1c2026] px-2 py-1 border border-[#2d3139]">
                {ticker}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#858687] mb-1">REASONING</div>
          <div className="text-sm text-[#858687]">{reasoning}</div>
        </div>
      </div>

      {/* Historical Correlation Badge - Clickable (Wood Wide AI) */}
      {correlationInsight?.hasHistoricalData && (
        <>
          <button
            onClick={() => setShowHistoricalModal(true)}
            className="w-full text-left bg-gradient-to-r from-[#1a1f2e] to-[#12161c] border border-[#3fb950]/30 border-l-2 border-l-[#3fb950] p-3 hover:border-[#3fb950]/60 hover:from-[#1a2030] transition-all cursor-pointer group mb-4"
          >
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 bg-[#3fb950]/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#3fb950]/30 transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-[#3fb950]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#3fb950]">
                      AI Matched
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 font-mono bg-[#3fb950]/20 text-[#3fb950]">
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

      {/* Action Button */}
      <a
        href={marketUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-transparent border border-[#3fb950] text-[#3fb950] px-4 py-2 text-sm font-medium hover:bg-[#3fb950] hover:text-white transition-all"
      >
        View on Polymarket
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
