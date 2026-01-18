import { ExternalLink, Database, TrendingUp, Calendar, Zap } from "lucide-react";

interface WoodWideAttributionProps {
  variant?: "badge" | "inline" | "footer" | "stats";
  showIcon?: boolean;
}

// Training data stats (from our backfill)
const TRAINING_STATS = {
  totalBets: 439,
  stockCorrelations: 2110,
  verifiedPrices: 2015,
  uniqueStocks: 41,
  dateRange: "2023-2026",
  accuracy: 95.5, // % with price data
};

export function WoodWideAttribution({ 
  variant = "badge", 
  showIcon = true 
}: WoodWideAttributionProps) {
  
  // Stats banner variant - shows impressive numbers
  if (variant === "stats") {
    return (
      <div className="bg-gradient-to-r from-[#1a1f2e] to-[#12161c] border border-[#2d3139] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-[#3fb950]/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#3fb950]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Wood Wide AI Correlation Engine</h3>
            <p className="text-[10px] text-[#858687]">Historical bet analysis for hedge recommendations</p>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-[#0d1117] rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Database className="w-3 h-3 text-[#58a6ff]" />
            </div>
            <p className="text-lg font-bold text-white">{TRAINING_STATS.totalBets}</p>
            <p className="text-[9px] text-[#858687]">Historical Bets</p>
          </div>
          <div className="text-center p-2 bg-[#0d1117] rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-[#3fb950]" />
            </div>
            <p className="text-lg font-bold text-white">{(TRAINING_STATS.stockCorrelations / 1000).toFixed(1)}K</p>
            <p className="text-[9px] text-[#858687]">Correlations</p>
          </div>
          <div className="text-center p-2 bg-[#0d1117] rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-[10px]">📈</span>
            </div>
            <p className="text-lg font-bold text-white">{TRAINING_STATS.uniqueStocks}</p>
            <p className="text-[9px] text-[#858687]">Stocks Tracked</p>
          </div>
          <div className="text-center p-2 bg-[#0d1117] rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="w-3 h-3 text-[#f0883e]" />
            </div>
            <p className="text-lg font-bold text-white">3yr</p>
            <p className="text-[9px] text-[#858687]">Data Range</p>
          </div>
        </div>
        
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-[#3fb950] bg-[#3fb950]/10 px-2 py-0.5 rounded-full">
            {TRAINING_STATS.accuracy}% verified price data
          </span>
          <a
            href="https://docs.woodwide.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#58a6ff] hover:underline flex items-center gap-1"
          >
            Powered by Wood Wide AI
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    );
  }
  
  if (variant === "footer") {
    return (
      <a
        href="https://docs.woodwide.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        Wood Wide AI
        {showIcon && <ExternalLink className="h-3 w-3" />}
      </a>
    );
  }

  if (variant === "inline") {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        Powered by{" "}
        <a
          href="https://docs.woodwide.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:underline inline-flex items-center gap-0.5"
        >
          Wood Wide AI
          {showIcon && <ExternalLink className="h-3 w-3" />}
        </a>
      </span>
    );
  }

  // badge variant (default)
  return (
    <a
      href="https://docs.woodwide.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3fb950]/10 text-[#3fb950] text-xs font-medium hover:bg-[#3fb950]/20 transition-colors border border-[#3fb950]/20"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
        <polyline points="7.5 19.79 7.5 14.6 3 12" />
        <polyline points="21 12 16.5 14.6 16.5 19.79" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
      Powered by Wood Wide AI
      {showIcon && <ExternalLink className="h-3 w-3" />}
    </a>
  );
}
