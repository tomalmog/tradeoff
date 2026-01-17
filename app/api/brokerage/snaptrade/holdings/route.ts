import { NextRequest, NextResponse } from "next/server";
import {
  getAllHoldings,
  getAccountHoldings,
  refreshHoldings,
  SnapTradeError,
} from "@/lib/snaptrade";

/**
 * GET /api/brokerage/snaptrade/holdings
 * 
 * Get portfolio holdings from connected brokerages.
 * 
 * Headers required:
 * - x-snaptrade-user-id: SnapTrade user ID
 * - x-snaptrade-user-secret: SnapTrade user secret
 * 
 * Query params (optional):
 * - accountId: Fetch holdings for a specific account only
 * 
 * Response:
 * - holdings: Array of portfolio holdings (aggregated by ticker)
 * - accounts: Array of accounts with their individual holdings
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-snaptrade-user-id");
    const userSecret = request.headers.get("x-snaptrade-user-secret");

    if (!userId || !userSecret) {
      return NextResponse.json(
        { error: "Missing SnapTrade credentials in headers" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (accountId) {
      // Fetch holdings for specific account
      const positions = await getAccountHoldings(userId, userSecret, accountId);
      
      // Convert positions to simplified holdings format
      const holdings = positions.map(pos => ({
        ticker: pos.symbol,
        shares: pos.units,
        currentValue: pos.marketValue,
        averagePrice: pos.averagePurchasePrice,
        currency: pos.currency,
      }));

      return NextResponse.json({ holdings, accountId });
    }

    // Fetch all holdings across all accounts
    const { holdings, accounts } = await getAllHoldings(userId, userSecret);

    // Clean up holdings to ensure only primitive values (no nested objects)
    const cleanHoldings = holdings.map(h => ({
      ticker: String(h.ticker || 'UNKNOWN'),
      shares: Number(h.shares) || 0,
      currentValue: Number(h.currentValue) || 0,
      averagePrice: h.averagePrice ? Number(h.averagePrice) : undefined,
      currency: String(h.currency || 'USD'),
    }));

    // Clean up accounts to remove complex nested objects
    const cleanAccounts = accounts.map(acc => ({
      id: String(acc.id),
      name: String(acc.name),
      number: String(acc.number),
      type: String(acc.type),
      currency: String(acc.currency),
      balance: Number(acc.balance) || 0,
      holdingsCount: acc.holdings?.length || 0,
    }));

    console.log('[API] Returning holdings:', cleanHoldings);

    return NextResponse.json({
      holdings: cleanHoldings,
      accounts: cleanAccounts,
      lastSynced: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    
    if (error instanceof SnapTradeError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch holdings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/brokerage/snaptrade/holdings
 * 
 * Force refresh holdings from brokerages.
 * Use this when user wants to sync latest data.
 * 
 * Headers required:
 * - x-snaptrade-user-id: SnapTrade user ID
 * - x-snaptrade-user-secret: SnapTrade user secret
 * 
 * Body (optional):
 * - accountId: Refresh specific account only
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("x-snaptrade-user-id");
    const userSecret = request.headers.get("x-snaptrade-user-secret");

    if (!userId || !userSecret) {
      return NextResponse.json(
        { error: "Missing SnapTrade credentials in headers" },
        { status: 401 }
      );
    }

    let accountId: string | undefined;
    try {
      const body = await request.json();
      accountId = body.accountId;
    } catch {
      // No body provided, refresh all
    }

    // Trigger refresh
    await refreshHoldings(userId, userSecret, accountId);

    // Wait a moment for sync to complete, then fetch updated holdings
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch refreshed holdings
    const { holdings, accounts } = await getAllHoldings(userId, userSecret);

    return NextResponse.json({
      holdings,
      accounts,
      lastSynced: new Date().toISOString(),
      refreshed: true,
    });
  } catch (error) {
    console.error("Failed to refresh holdings:", error);
    
    if (error instanceof SnapTradeError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to refresh holdings" },
      { status: 500 }
    );
  }
}
