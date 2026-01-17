/**
 * SnapTrade Integration Library
 * 
 * Uses the official SnapTrade TypeScript SDK for reliable API communication.
 * Documentation: https://docs.snaptrade.com/
 */

import { Snaptrade } from 'snaptrade-typescript-sdk';
import type {
  SnapTradeUser,
  SnapTradeConnection,
  SnapTradeAccount,
  SnapTradePosition,
  SnapTradeBrokerage,
  ConnectBrokerageResponse,
  PortfolioHolding,
  BrokerageError,
  BrokerageErrorCode,
} from './types/brokerage';

// ============================================================================
// SDK Initialization
// ============================================================================

let snaptradeClient: Snaptrade | null = null;

function getClient(): Snaptrade {
  if (!snaptradeClient) {
    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

    if (!clientId || !consumerKey) {
      throw new SnapTradeError(
        'INVALID_CREDENTIALS',
        'SnapTrade credentials not configured. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY environment variables.'
      );
    }

    snaptradeClient = new Snaptrade({
      clientId,
      consumerKey,
    });
  }
  return snaptradeClient;
}

// ============================================================================
// Error Handling
// ============================================================================

export class SnapTradeError extends Error implements BrokerageError {
  code: BrokerageErrorCode;
  details?: Record<string, unknown>;

  constructor(code: BrokerageErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SnapTradeError';
    this.code = code;
    this.details = details;
  }
}

function handleError(error: unknown): never {
  console.error('[SnapTrade] Error:', error);
  
  if (error instanceof SnapTradeError) {
    throw error;
  }
  
  const err = error as { status?: number; message?: string; response?: { data?: unknown } };
  const status = err.status || 500;
  const message = err.message || 'Unknown SnapTrade error';
  
  let code: BrokerageErrorCode = 'UNKNOWN_ERROR';
  if (status === 401 || status === 403) code = 'INVALID_CREDENTIALS';
  else if (status === 429) code = 'RATE_LIMITED';
  else if (status === 503) code = 'BROKER_UNAVAILABLE';
  
  throw new SnapTradeError(code, message, { originalError: err.response?.data || err });
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Register a new user with SnapTrade
 */
export async function registerUser(externalUserId: string): Promise<SnapTradeUser> {
  try {
    const client = getClient();
    const response = await client.authentication.registerSnapTradeUser({
      userId: externalUserId,
    });
    
    console.log('[SnapTrade] User registered:', response.data);
    
    return {
      userId: response.data.userId || externalUserId,
      userSecret: response.data.userSecret || '',
      createdAt: new Date(),
    };
  } catch (error) {
    handleError(error);
  }
}

/**
 * Delete a user and all their connections from SnapTrade
 */
export async function deleteUser(userId: string, userSecret: string): Promise<void> {
  try {
    const client = getClient();
    await client.authentication.deleteSnapTradeUser({ userId, userSecret });
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Brokerage Connection
// ============================================================================

/**
 * Get list of supported brokerages
 */
export async function getSupportedBrokerages(): Promise<SnapTradeBrokerage[]> {
  try {
    const client = getClient();
    const response = await client.referenceData.listBrokerages();
    
    return (response.data || []).map((b: {
      id?: string;
      name?: string;
      slug?: string;
      aws_s3_logo_url?: string;
      has_reporting?: boolean;
      allows_trading?: boolean;
    }) => ({
      id: b.id || '',
      name: b.name || '',
      slug: b.slug || '',
      logoUrl: b.aws_s3_logo_url,
      supportsHoldings: b.has_reporting ?? true,
      supportsOrders: b.allows_trading ?? false,
    }));
  } catch (error) {
    handleError(error);
  }
}

/**
 * Generate connection link for user to connect their brokerage
 */
export async function getConnectionLink(
  userId: string,
  userSecret: string,
  options?: {
    brokerageId?: string;
    redirectUri?: string;
    connectionType?: 'read' | 'trade';
  }
): Promise<ConnectBrokerageResponse> {
  try {
    const client = getClient();
    const response = await client.authentication.loginSnapTradeUser({
      userId,
      userSecret,
      broker: options?.brokerageId,
      immediateRedirect: true,
      customRedirect: options?.redirectUri,
      connectionType: options?.connectionType || 'read',
    });
    
    console.log('[SnapTrade] Login link generated:', response.data);
    
    return {
      redirectUrl: response.data.redirectURI || '',
      authorizationId: response.data.sessionId || '',
    };
  } catch (error) {
    handleError(error);
  }
}

/**
 * Get all connections for a user
 */
export async function getUserConnections(
  userId: string,
  userSecret: string
): Promise<SnapTradeConnection[]> {
  try {
    const client = getClient();
    const response = await client.connections.listBrokerageAuthorizations({
      userId,
      userSecret,
    });
    
    return (response.data || []).map((conn: {
      id?: string;
      brokerage?: { name?: string; slug?: string };
      disabled?: boolean;
      meta?: { last_synced?: string };
    }) => ({
      id: conn.id || '',
      brokerName: conn.brokerage?.name || 'Unknown',
      brokerSlug: conn.brokerage?.slug || '',
      status: conn.disabled ? 'disconnected' : 'connected',
      lastSynced: conn.meta?.last_synced ? new Date(conn.meta.last_synced) : null,
      accounts: [],
    }));
  } catch (error) {
    handleError(error);
  }
}

/**
 * Disconnect a brokerage connection
 */
export async function disconnectBrokerage(
  userId: string,
  userSecret: string,
  authorizationId: string
): Promise<void> {
  try {
    const client = getClient();
    await client.connections.removeBrokerageAuthorization({
      userId,
      userSecret,
      authorizationId,
    });
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Account & Holdings
// ============================================================================

/**
 * Get all accounts for a user across all connected brokerages
 */
export async function getAccounts(
  userId: string,
  userSecret: string
): Promise<SnapTradeAccount[]> {
  try {
    const client = getClient();
    const response = await client.accountInformation.listUserAccounts({
      userId,
      userSecret,
    });
    
    console.log('[SnapTrade] Accounts fetched:', response.data?.length || 0);
    
    return (response.data || []).map((acc: {
      id?: string;
      name?: string;
      number?: string;
      meta?: { type?: string };
      cash?: number;
      currency?: { code?: string };
    }) => ({
      id: acc.id || '',
      name: acc.name || 'Account',
      number: acc.number || '',
      type: mapAccountType(acc.meta?.type),
      currency: acc.currency?.code || 'USD',
      balance: acc.cash || 0,
      holdings: [],
    }));
  } catch (error) {
    handleError(error);
  }
}

function mapAccountType(type?: string): SnapTradeAccount['type'] {
  const typeMap: Record<string, SnapTradeAccount['type']> = {
    'individual': 'individual',
    'joint': 'joint',
    'ira': 'ira',
    'roth_ira': 'roth_ira',
    'roth ira': 'roth_ira',
    '401k': '401k',
    '401(k)': '401k',
  };
  return typeMap[type?.toLowerCase() || ''] || 'other';
}

/**
 * Get holdings for a specific account
 */
export async function getAccountHoldings(
  userId: string,
  userSecret: string,
  accountId: string
): Promise<SnapTradePosition[]> {
  try {
    const client = getClient();
    const response = await client.accountInformation.getUserAccountPositions({
      userId,
      userSecret,
      accountId,
    });
    
    console.log('[SnapTrade] Holdings fetched for account:', accountId, response.data?.length || 0);
    
    return (response.data || []).map((pos: {
      symbol?: { symbol?: string; raw_symbol?: string; description?: string; currency?: { code?: string } };
      units?: number;
      price?: number;
      open_pnl?: number;
      fractional_units?: number;
      average_purchase_price?: number;
    }) => {
      const units = (pos.units || 0) + (pos.fractional_units || 0);
      const price = pos.price || 0;
      // Extract the actual ticker symbol from the nested object
      const ticker = pos.symbol?.symbol || pos.symbol?.raw_symbol || 'UNKNOWN';
      const currency = pos.symbol?.currency?.code || 'USD';
      
      console.log('[SnapTrade] Parsed position:', ticker, units, 'shares @', price, currency);
      
      return {
        symbol: ticker,
        description: pos.symbol?.description || ticker,
        units,
        price,
        marketValue: units * price,
        currency,
        averagePurchasePrice: pos.average_purchase_price,
        percentOfPortfolio: 0,
      };
    });
  } catch (error) {
    handleError(error);
  }
}

/**
 * Get all holdings across all accounts for a user
 */
export async function getAllHoldings(
  userId: string,
  userSecret: string
): Promise<{
  holdings: PortfolioHolding[];
  accounts: SnapTradeAccount[];
}> {
  // Get all accounts
  const accounts = await getAccounts(userId, userSecret);
  
  // Get holdings for each account in parallel
  const holdingsPromises = accounts.map(async (account) => {
    try {
      const positions = await getAccountHoldings(userId, userSecret, account.id);
      account.holdings = positions;
      return positions;
    } catch (error) {
      console.error(`Failed to fetch holdings for account ${account.id}:`, error);
      return [];
    }
  });

  const allPositions = await Promise.all(holdingsPromises);
  const flatPositions = allPositions.flat();

  // Aggregate positions by symbol
  const aggregatedHoldings = aggregateHoldings(flatPositions);

  return {
    holdings: aggregatedHoldings,
    accounts,
  };
}

/**
 * Extract ticker string from symbol (handles both string and object formats)
 */
function extractTicker(symbol: unknown): string | null {
  if (typeof symbol === 'string') {
    return symbol;
  }
  if (symbol && typeof symbol === 'object') {
    const symObj = symbol as { symbol?: string; raw_symbol?: string };
    return symObj.symbol || symObj.raw_symbol || null;
  }
  return null;
}

/**
 * Extract currency from position (handles nested object)
 */
function extractCurrency(pos: SnapTradePosition): string {
  if (typeof pos.currency === 'string') {
    return pos.currency;
  }
  // Currency might be nested in symbol object
  const symbol = pos.symbol as unknown;
  if (symbol && typeof symbol === 'object') {
    const symObj = symbol as { currency?: { code?: string } };
    return symObj.currency?.code || 'USD';
  }
  return 'USD';
}

/**
 * Aggregate holdings by symbol
 */
function aggregateHoldings(positions: SnapTradePosition[]): PortfolioHolding[] {
  const holdingsMap = new Map<string, PortfolioHolding>();

  console.log('[SnapTrade] Aggregating positions:', positions.length);

  for (const pos of positions) {
    // Extract ticker - handle both string and object formats
    const ticker = extractTicker(pos.symbol);
    
    if (!ticker) {
      console.log('[SnapTrade] Skipping position with no ticker');
      continue;
    }

    const currency = extractCurrency(pos);
    
    console.log('[SnapTrade] Adding position:', ticker, pos.units, pos.marketValue, currency);

    const existing = holdingsMap.get(ticker);
    if (existing) {
      const totalUnits = existing.shares + pos.units;
      const totalValue = (existing.currentValue || 0) + pos.marketValue;
      const weightedAvgPrice = existing.averagePrice && pos.averagePurchasePrice
        ? ((existing.shares * existing.averagePrice) + (pos.units * pos.averagePurchasePrice)) / totalUnits
        : existing.averagePrice || pos.averagePurchasePrice;

      existing.shares = totalUnits;
      existing.currentValue = totalValue;
      existing.averagePrice = weightedAvgPrice;
    } else {
      holdingsMap.set(ticker, {
        ticker: ticker,
        shares: pos.units,
        currentValue: pos.marketValue,
        averagePrice: pos.averagePurchasePrice,
        currency: currency,
      });
    }
  }

  const result = Array.from(holdingsMap.values());
  console.log('[SnapTrade] Aggregated holdings:', result.length, result.map(h => h.ticker));
  return result;
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Force a refresh of holdings data
 */
export async function refreshHoldings(
  userId: string,
  userSecret: string,
  accountId?: string
): Promise<void> {
  try {
    const client = getClient();
    if (accountId) {
      await client.accountInformation.getUserAccountPositions({
        userId,
        userSecret,
        accountId,
      });
    } else {
      // Refresh all accounts
      const accounts = await getAccounts(userId, userSecret);
      await Promise.all(
        accounts.map((acc) =>
          client.accountInformation.getUserAccountPositions({
            userId,
            userSecret,
            accountId: acc.id,
          })
        )
      );
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Check if credentials are valid
 */
export async function validateConnection(
  userId: string,
  userSecret: string
): Promise<boolean> {
  try {
    await getAccounts(userId, userSecret);
    return true;
  } catch {
    return false;
  }
}
