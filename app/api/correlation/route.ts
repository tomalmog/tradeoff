import { NextRequest, NextResponse } from "next/server";
import { 
  getCorrelationInsights, 
  findHistoricalMatches,
  getResolutionStats,
  type CorrelationInsight 
} from "@/lib/correlation-model";

export interface CorrelationResponse extends CorrelationInsight {
  woodWidePrediction?: {
    prediction: number;
    confidence: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { betTitle, betDescription, affectedTickers } = body;

    if (!betTitle) {
      return NextResponse.json(
        { error: "betTitle is required" },
        { status: 400 }
      );
    }

    // Get correlation insights (includes both historical matches and optional Wood Wide prediction)
    const insights = await getCorrelationInsights(
      betTitle,
      betDescription || "",
      affectedTickers || []
    );

    return NextResponse.json(insights);
  } catch (error) {
    console.error("Correlation API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Correlation analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for stats and quick lookups
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "stats") {
      // Return overall stats about the resolution data
      const stats = getResolutionStats();
      return NextResponse.json(stats);
    }

    if (action === "quick-match") {
      // Quick match without Wood Wide API call
      const title = searchParams.get("title") || "";
      const tickers = searchParams.get("tickers")?.split(",") || [];
      
      const matches = findHistoricalMatches(title, "", tickers);
      return NextResponse.json(matches);
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'stats' or 'quick-match'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Correlation GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
