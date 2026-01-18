"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PortfolioInput } from "@/components/PortfolioInput";
import type { PortfolioItem, StockInfo } from "@/app/page";

// Color palette for sectors
const SECTOR_COLORS = [
  "#3fb950", // green
  "#58a6ff", // blue
  "#f85149", // red
  "#fb8500", // orange
  "#fbbf24", // yellow
  "#a371f7", // purple
  "#56d4dd", // cyan
  "#f778ba", // pink
  "#7ee787", // light green
  "#79c0ff", // light blue
];

interface PortfolioViewProps {
  portfolio: PortfolioItem[];
  setPortfolio: React.Dispatch<React.SetStateAction<PortfolioItem[]>>;
  stockInfo: Record<string, StockInfo>;
  setStockInfo: React.Dispatch<React.SetStateAction<Record<string, StockInfo>>>;
}

export function PortfolioView({
  portfolio,
  setPortfolio,
  stockInfo,
  setStockInfo,
}: PortfolioViewProps) {
  const [isLoadingStocks, setIsLoadingStocks] = useState(false);

  // Fetch stock data when portfolio changes
  const fetchStockData = useCallback(
    async (tickers: string[]) => {
      if (tickers.length === 0) return;

      const newTickers = tickers.filter((t) => !stockInfo[t]);
      if (newTickers.length === 0) return;

      setIsLoadingStocks(true);
      try {
        const response = await fetch(
          `/api/stocks?tickers=${newTickers.join(",")}`
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
      } finally {
        setIsLoadingStocks(false);
      }
    },
    [stockInfo, setStockInfo]
  );

  useEffect(() => {
    const tickers = portfolio.map((p) => p.ticker);
    fetchStockData(tickers);
  }, [portfolio, fetchStockData]);

  const handleRemove = (ticker: string) => {
    setPortfolio((prev) => prev.filter((p) => p.ticker !== ticker));
  };

  // Calculate total value
  const totalValue = portfolio.reduce((sum, p) => {
    const info = stockInfo[p.ticker];
    return sum + (info?.price || 0) * p.shares;
  }, 0);

  // Calculate sector breakdown
  const sectorBreakdown = portfolio.reduce((acc, p) => {
    const info = stockInfo[p.ticker];
    if (info) {
      const value = info.price * p.shares;
      const sector = info.sector || "Unknown";
      acc[sector] = (acc[sector] || 0) + value;
    }
    return acc;
  }, {} as Record<string, number>);

  // Prepare data for pie chart
  const pieData = Object.entries(sectorBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, value], index) => ({
      name: sector,
      value,
      percentage: (value / totalValue) * 100,
      color: SECTOR_COLORS[index % SECTOR_COLORS.length],
    }));

  if (portfolio.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="bg-[#1c2026] border border-[#2d3139] p-6">
          <h2 className="font-semibold mb-6">Add Your Portfolio</h2>
          <PortfolioInput
            portfolio={portfolio}
            setPortfolio={setPortfolio}
            setStockInfo={setStockInfo}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Summary Header */}
      <div className="bg-[#1c2026] border border-[#2d3139] p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm text-[#858687] mb-1">TOTAL PORTFOLIO VALUE</h2>
            <div className="text-3xl font-semibold mono">
              ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-sm text-[#858687] mb-1">HOLDINGS</h2>
            <div className="text-3xl font-semibold mono">{portfolio.length}</div>
          </div>
        </div>
      </div>

      {/* Sector Breakdown & Top Holdings */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Sector Breakdown - Centered Pie Chart */}
        {Object.keys(sectorBreakdown).length > 0 && (
          <div className="bg-[#1c2026] border border-[#2d3139] p-6">
            <h3 className="font-semibold mb-2">Sector Breakdown</h3>
            {/* Centered Pie Chart */}
            <div className="flex justify-center">
              <div className="w-56 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#0d1117" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#1c2026] border border-[#2d3139] px-3 py-2 text-sm">
                              <p className="font-medium">{data.name}</p>
                              <p className="text-[#858687]">{data.percentage.toFixed(1)}%</p>
                              <p className="mono text-xs">${data.value.toLocaleString()}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Legend at bottom with smaller text */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
              {pieData.map((sector) => (
                <div key={sector.name} className="flex items-center gap-1.5">
                  <div 
                    className="w-2 h-2 shrink-0" 
                    style={{ backgroundColor: sector.color }}
                  />
                  <span className="text-xs text-[#858687]">{sector.name}</span>
                  <span className="text-xs mono text-[#585858]">{sector.percentage.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Holdings */}
        <div className="bg-[#1c2026] border border-[#2d3139] p-6">
          <h3 className="font-semibold mb-4">Top Holdings</h3>
          <div className="space-y-3">
            {portfolio
              .map((item) => {
                const info = stockInfo[item.ticker];
                const value = (info?.price || 0) * item.shares;
                const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
                return { ...item, info, value, percentage };
              })
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((item, index) => {
                // Format percentage to show at least 1 significant digit
                const formatPercentage = (pct: number) => {
                  if (pct === 0) return "0%";
                  if (pct >= 0.1) return `${pct.toFixed(1)}%`;
                  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
                  return `${pct.toFixed(3)}%`;
                };
                
                return (
                  <div key={item.ticker}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#858687] w-4">{index + 1}</span>
                        <span className="font-semibold mono">{item.ticker}</span>
                        <span className="text-sm text-[#858687]">
                          {item.info?.name || ""}
                        </span>
                      </div>
                      <span className="text-sm mono shrink-0 ml-2">{formatPercentage(item.percentage)}</span>
                    </div>
                    <div className="h-2 bg-[#0d1117] border border-[#2d3139] ml-7">
                      <div
                        className="h-full bg-[#3fb950]"
                        style={{ width: `${Math.max(item.percentage, 0.5)}%` }}
                      />
                    </div>
                    <div className="text-xs text-[#858687] mt-0.5 ml-7 mono">
                      ${item.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Add Stock */}
      <div className="bg-[#1c2026] border border-[#2d3139] p-6 mb-6">
        <h3 className="font-semibold mb-4">Add Stock</h3>
        <PortfolioInput
          portfolio={portfolio}
          setPortfolio={setPortfolio}
          setStockInfo={setStockInfo}
          compact
        />
      </div>

      {/* Holdings Table */}
      <div className="bg-[#1c2026] border border-[#2d3139] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Holdings</h3>
          <button
            onClick={() => setPortfolio([])}
            className="text-sm text-[#858687] hover:text-white transition-colors"
          >
            Clear all
          </button>
        </div>
        <table className="table-sharp">
          <thead>
            <tr>
              <th>TICKER</th>
              <th>NAME</th>
              <th className="text-right">SHARES</th>
              <th className="text-right">PRICE</th>
              <th className="text-right">VALUE</th>
              <th className="text-right">% OF PORTFOLIO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {portfolio.map((item) => {
              const info = stockInfo[item.ticker];
              const value = (info?.price || 0) * item.shares;
              const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
              
              // Format percentage to show at least 1 significant digit
              const formatPct = (pct: number) => {
                if (pct === 0) return "0%";
                if (pct >= 0.1) return `${pct.toFixed(1)}%`;
                if (pct >= 0.01) return `${pct.toFixed(2)}%`;
                return `${pct.toFixed(3)}%`;
              };
              
              return (
                <tr key={item.ticker}>
                  <td className="font-semibold mono">{item.ticker}</td>
                  <td className="text-[#858687]">
                    {isLoadingStocks && !info ? (
                      <span className="animate-pulse">Loading...</span>
                    ) : (
                      info?.name || "Unknown"
                    )}
                  </td>
                  <td className="text-right mono">
                    {Number.isInteger(item.shares) 
                      ? item.shares.toLocaleString() 
                      : item.shares.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </td>
                  <td className="text-right mono">
                    {info ? `$${info.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="text-right mono">
                    ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right mono">{formatPct(percentage)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => handleRemove(item.ticker)}
                      className="text-[#858687] hover:text-[#f85149] transition-colors p-1"
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
