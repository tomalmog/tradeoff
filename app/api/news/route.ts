import { NextRequest, NextResponse } from "next/server";
import { getStockData } from "@/lib/stocks";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
  "llama-3.1-8b-instant",
];

interface PortfolioItem {
  ticker: string;
  shares: number;
}

export interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  relevance: string;
  relatedStocks: string[];
}

const NEWS_SYSTEM_PROMPT = `You are a financial news analyst. Your task is to analyze real news articles and provide relevance context.

Given a list of real news articles with titles, summaries, and URLs, analyze them for relevance to the portfolio stocks.

Return a JSON array with enhanced relevance information:
[
  {
    "relevance": "Why this article is relevant to the portfolio. Provide 2-4 sentences explaining the connection, potential impact on stock prices, and why portfolio holders should care. Be specific and detailed.",
    "relatedStocks": ["TICKER1", "TICKER2"],
    "keyPoints": ["Key point 1", "Key point 2"],
    "isRelevant": true,
    "betRelevanceScore": 0-10
  }
]

RELEVANCE FILTERING RULES:
- Mark articles as relevant (isRelevant: true) if there is a connection to the portfolio stocks
- When a specific Polymarket bet is mentioned in the context, be STRICT about relevance:
  - betRelevanceScore 8-10: Article directly discusses the bet topic (revenue forecasts, specific predictions, etc.)
  - betRelevanceScore 5-7: Article is related to factors that could influence the bet outcome
  - betRelevanceScore 1-4: Article mentions the stock but doesn't relate to the bet topic
  - betRelevanceScore 0: Article is unrelated to both the stock and the bet
- For bet-specific analysis, mark isRelevant: false if betRelevanceScore < 3
- If an article doesn't relate to the specific bet topic, say so clearly in the relevance field

IMPORTANT:
- Return ONLY valid JSON, no markdown or extra text
- Match the order of articles provided exactly
- Focus on how each article affects the specific stocks
- Be specific about why it matters for the portfolio
- Write detailed relevance explanations (2-4 sentences, not truncated)
- When analyzing for a bet, prioritize articles that directly address the bet's subject matter
- DO NOT force connections between unrelated articles and bets - be honest when there's no direct connection`;

// Filter news to only include articles from the past week
function filterToLastWeek(articles: any[]): any[] {
  const oneWeekAgo = Date.now() / 1000 - (7 * 24 * 60 * 60); // 7 days in seconds
  
  return articles.filter(article => {
    const publishTime = article.providerPublishTime || article.pubDate;
    if (!publishTime) return true; // Keep articles without dates
    
    // Handle both seconds and milliseconds timestamps
    const timeInSeconds = publishTime > 1e12 ? publishTime / 1000 : publishTime;
    return timeInSeconds >= oneWeekAgo;
  });
}

async function fetchYahooFinanceNews(tickers: string[]): Promise<any[]> {
  const allNews: any[] = [];

  // Fetch news for each ticker using Yahoo Finance's public API
  // Increased newsCount from 5 to 10 for better coverage
  for (const ticker of tickers) {
    try {
      // Use Yahoo Finance's quoteSummary with news module
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&quotesCount=1&newsCount=10`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.news && Array.isArray(data.news)) {
        allNews.push(
          ...data.news.map((item: any) => ({
            title: item.title,
            summary:
              item.summary ||
              item.description ||
              item.excerpt ||
              item.snippet ||
              item.text ||
              "",
            link: item.link,
            url: item.link,
            providerPublishTime: item.providerPublishTime,
            pubDate: item.providerPublishTime,
            publisher: item.publisher || item.source,
            source: item.publisher || item.source,
            uuid: item.uuid,
            relatedTicker: ticker,
            rawData: item, // Keep raw data for debugging
          })),
        );
      }
    } catch (error) {
      console.error(`Error fetching news for ${ticker}:`, error);
      // Try alternative endpoint
      try {
        const altResponse = await fetch(
          `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          },
        );

        if (altResponse.ok) {
          const text = await altResponse.text();
          // Parse RSS (simplified - you might want to use an RSS parser)
          // For now, we'll skip RSS and continue
        }
      } catch (altError) {
        console.error(`Alternative fetch also failed for ${ticker}:`, altError);
      }
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = allNews.filter(item => {
    const url = item.link || item.url;
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  
  // Filter to only include articles from the past week
  return filterToLastWeek(deduplicated);
}

// Extract the main subject/entity from a bet market question
function extractBetSubject(betMarket: string): string {
  // Common patterns to extract the main subject
  const patterns = [
    /Will\s+(\w+(?:\s+\w+)?)\s+/i,  // "Will OpenAI launch..."
    /(\w+(?:\s+\w+)?)\s+to\s+/i,    // "Bitcoin to reach..."
    /^(\w+(?:\s+\w+)?)\s+/i,        // Start with subject
  ];
  
  for (const pattern of patterns) {
    const match = betMarket.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Fallback: first 2-3 significant words
  const words = betMarket.replace(/[?'"]/g, '').split(' ').filter(w => 
    w.length > 3 && !['will', 'the', 'by', 'end', 'of', 'in', 'for', 'over'].includes(w.toLowerCase())
  );
  return words.slice(0, 2).join(' ');
}

// Search for news specifically related to a bet topic
async function fetchBetSpecificNews(
  betMarket: string,
  tickers: string[],
  apiKey: string
): Promise<any[]> {
  // Extract the main subject from the bet for better fallback
  const betSubject = extractBetSubject(betMarket);
  console.log(`Bet subject extracted: "${betSubject}" from "${betMarket}"`);
  
  // Extract key search terms from the bet market question
  const extractPrompt = `Given this Polymarket bet question: "${betMarket}"

Extract 2-3 specific search queries that would find news articles directly related to this bet.
Focus on the core topic, key numbers, dates, and entities mentioned.

Return JSON array of search queries:
["search query 1", "search query 2", "search query 3"]

Examples:
- "Will NVIDIA generate over $250b in 2025?" → ["NVIDIA revenue 2025", "NVIDIA $250 billion earnings", "NVIDIA financial forecast 2025"]
- "Will Bitcoin reach $100k by end of 2024?" → ["Bitcoin price prediction 2024", "Bitcoin $100000", "cryptocurrency market 2024"]
- "Will OpenAI launch a consumer hardware product by end of 2025?" → ["OpenAI hardware product", "OpenAI consumer device 2025", "OpenAI product launch"]

IMPORTANT: Return ONLY the JSON array, no other text.`;

  let searchQueries: string[] = [];
  
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: extractPrompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (response.status === 429) continue;
      if (!response.ok) continue;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        searchQueries = JSON.parse(jsonMatch[0]);
        console.log(`Extracted bet search queries: ${searchQueries.join(', ')}`);
        break;
      }
    } catch (error) {
      console.error(`Error extracting search queries with model ${model}:`, error);
      continue;
    }
  }

  // Fallback: use key words from the bet
  if (searchQueries.length === 0) {
    console.log("Groq failed to extract queries, using fallback");
    const words = betMarket.replace(/[?'"]/g, '').split(' ').filter(w => 
      w.length > 3 && !['will', 'the', 'by', 'end', 'of', 'in', 'for', 'over'].includes(w.toLowerCase())
    );
    searchQueries = [
      words.slice(0, 4).join(' '),
      betSubject + ' news',
      betSubject + ' 2025',
    ].filter(q => q.trim().length > 0);
  }

  const allNews: any[] = [];

  // Search Yahoo Finance for each query
  for (const query of searchQueries) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodedQuery}&quotesCount=0&newsCount=8`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        }
      );

      if (!response.ok) {
        console.log(`Yahoo search failed for query "${query}": ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.news && Array.isArray(data.news)) {
        console.log(`Found ${data.news.length} articles for query "${query}"`);
        allNews.push(...data.news.map((item: any) => ({
          title: item.title,
          summary: item.summary || item.description || item.excerpt || item.snippet || item.text || '',
          link: item.link,
          url: item.link,
          providerPublishTime: item.providerPublishTime,
          pubDate: item.providerPublishTime,
          publisher: item.publisher || item.source,
          source: item.publisher || item.source,
          uuid: item.uuid,
          relatedTicker: '', // Don't associate with portfolio tickers - this is bet-specific
          betSubject: betSubject, // Track the bet subject for fallback text
          searchQuery: query, // Track which query found this
          isBetSpecific: true, // Mark as bet-specific
          rawData: item,
        })));
      }
    } catch (error) {
      console.error(`Error fetching news for query "${query}":`, error);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated = allNews.filter(item => {
    const url = item.link || item.url;
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  // Filter to past week
  return filterToLastWeek(deduplicated);
}

async function fetchNewsViaGroqSearch(
  tickers: string[],
  portfolioContext: string,
  apiKey: string,
): Promise<any[]> {
  // Use Groq to find real news articles with proper search URLs
  const searchPrompt = `Find 10-15 recent, real news articles about these stocks: ${tickers.join(", ")}.

For each article, provide:
- A real, current article title
- The actual news source (Bloomberg, Reuters, WSJ, Yahoo Finance, etc.)
- A search URL that will find this article (e.g., Google News search URL or the actual article URL if you know it)
- A realistic recent date (within the last 7 days)

Return JSON array:
[
  {
    "title": "Real article headline",
    "summary": "Brief summary",
    "source": "Source name",
    "link": "https://www.google.com/search?q=article+title+site:bloomberg.com OR actual URL",
    "providerPublishTime": 1234567890,
    "publisher": "Source name",
    "relatedTicker": "TICKER"
  }
]

IMPORTANT: Use real, current news. Create search URLs that will find actual articles.`;

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: `${searchPrompt}\n\nPortfolio context:\n${portfolioContext}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2500,
        }),
      });

      if (response.status === 429) continue;

      if (!response.ok) continue;

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) continue;

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const articles = JSON.parse(jsonMatch[0]);
      return articles.map((article: any) => ({
        ...article,
        url: article.link || article.url,
      }));
    } catch (error) {
      console.error(`Error with model ${model} for news search:`, error);
      continue;
    }
  }

  return [];
}

async function enhanceNewsWithGroq(
  articles: any[],
  portfolioContext: string,
  apiKey: string,
): Promise<
  Array<{
    relevance: string;
    relatedStocks: string[];
    keyPoints: string[];
    isRelevant: boolean;
    betRelevanceScore?: number;
  }>
> {
  if (articles.length === 0) return [];

  const articlesContext = articles
    .map((article, idx) => {
      const summary =
        article.summary ||
        article.description ||
        article.excerpt ||
        article.snippet ||
        article.text ||
        "";
      return `${idx + 1}. "${article.title}"${summary ? ` - ${summary}` : ""}`;
    })
    .join("\n\n");

  for (const model of GROQ_MODELS) {
    try {
      console.log(`Enhancing news with model: ${model}`);

      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: NEWS_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Analyze these news articles for relevance to this portfolio:\n\n${portfolioContext}\n\nArticles:\n${articlesContext}\n\nReturn a JSON array matching the order of articles.`,
            },
          ],
          temperature: 0.5,
          max_tokens: 2000,
        }),
      });

      if (response.status === 429) {
        console.log(`Model ${model} rate limited`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Groq API error for ${model}:`,
          response.status,
          errorText,
        );

        if (response.status === 400 || response.status === 404) {
          continue;
        }

        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content in Groq response");
      }

      // Extract JSON from response - try multiple strategies
      let jsonMatch = content.match(/\[[\s\S]*\]/);

      // If no array found, try to find JSON object and wrap it
      if (!jsonMatch) {
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonMatch = [`[${objMatch[0]}]`];
        }
      }

      if (!jsonMatch) {
        throw new Error("Could not parse JSON array from Groq response");
      }

      let jsonString = jsonMatch[0];

      // Try to fix common JSON issues from LLMs
      const fixJson = (str: string): string => {
        // Remove trailing commas before closing brackets/braces
        str = str.replace(/,(\s*[}\]])/g, "$1");
        // Fix unescaped quotes in strings (common LLM mistake)
        str = str.replace(
          /: "([^"]*)"([^,}\]]*)"([^"]*)",/g,
          ': "$1\\"$2\\"$3",',
        );
        // Remove control characters
        str = str.replace(/[\x00-\x1F\x7F]/g, " ");
        // Fix missing commas between array elements
        str = str.replace(/\}(\s*)\{/g, "},$1{");
        return str;
      };

      let enhancements;
      try {
        enhancements = JSON.parse(fixJson(jsonString));
      } catch (parseError) {
        // Try to extract just the array part more carefully
        const arrayStart = jsonString.indexOf("[");
        const arrayEnd = jsonString.lastIndexOf("]");
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
          let extractedJson = jsonString.substring(arrayStart, arrayEnd + 1);
          try {
            enhancements = JSON.parse(fixJson(extractedJson));
          } catch (e) {
            // Try object-by-object parsing as last resort
            try {
              const objectMatches = extractedJson.match(/\{[^{}]*\}/g);
              if (objectMatches && objectMatches.length > 0) {
                enhancements = objectMatches.map((obj: string) => {
                  try {
                    return JSON.parse(fixJson(obj));
                  } catch {
                    return {
                      relevance: "Unable to parse",
                      relatedStocks: [],
                      keyPoints: [],
                      isRelevant: true,
                    };
                  }
                });
              } else {
                throw parseError;
              }
            } catch {
              console.warn(
                `Failed to parse JSON array for model ${model}, using fallback`,
              );
              throw parseError;
            }
          }
        } else {
          throw parseError;
        }
      }

      // Validate it's an array
      if (!Array.isArray(enhancements)) {
        throw new Error("Groq response is not a JSON array");
      }

      console.log(
        `Successfully enhanced ${enhancements.length} articles with model: ${model}`,
      );

      return enhancements;
    } catch (error) {
      console.error(`Error with model ${model}:`, error);
      continue;
    }
  }

  // Fallback: return basic enhancements
  return articles.map((article) => ({
    relevance: `News about ${article.relatedTicker || "the market"}`,
    relatedStocks: article.relatedTicker ? [article.relatedTicker] : [],
    keyPoints: [],
    isRelevant: true, // Default to true for fallback
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const portfolio: PortfolioItem[] = body.portfolio;
    const betMarket: string | undefined = body.betMarket; // Optional: specific bet to get news for

    if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
      return NextResponse.json(
        { error: "Portfolio is required" },
        { status: 400 },
      );
    }

    const groqApiKey =
      process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "";

    if (!groqApiKey) {
      return NextResponse.json(
        {
          error: "Groq API key not configured. Add GROQ_API_KEY to .env.local",
        },
        { status: 500 },
      );
    }

    // Fetch stock data
    const tickers = portfolio.map((p) => p.ticker);
    const stockData = await getStockData(tickers);

    // Build portfolio context
    const portfolioWithData = portfolio.map((p) => {
      const stock = stockData.find((s) => s.ticker === p.ticker.toUpperCase());
      return {
        ticker: p.ticker.toUpperCase(),
        shares: p.shares,
        name: stock?.name || p.ticker,
        sector: stock?.sector || "Unknown",
        industry: stock?.industry || "Unknown",
        price: stock?.price || 0,
      };
    });

    const portfolioContext = portfolioWithData
      .map(
        (p) =>
          `- ${p.ticker} (${p.name}): ${p.shares} shares, ${p.sector} sector, ${p.industry} industry`,
      )
      .join("\n");

    let context = `Portfolio stocks:\n${portfolioContext}`;

    // If specific bet market is provided, focus on that
    if (betMarket) {
      context += `\n\nIMPORTANT: Focus primarily on news directly related to this Polymarket bet: "${betMarket}"
      
When analyzing articles, prioritize:
1. Articles that directly discuss the specific topic of the bet
2. Articles with data, forecasts, or analysis relevant to the bet outcome
3. Articles that could influence the probability of the bet

Mark articles as NOT relevant if they only tangentially mention the stock but don't relate to the bet topic.`;
    }

    // Fetch real news from Yahoo Finance (stock-based)
    const yahooNews = await fetchYahooFinanceNews(tickers);
    
    // If a bet is selected, also fetch bet-specific news
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let betNews: any[] = [];
    if (betMarket) {
      console.log(`Fetching bet-specific news for: "${betMarket}"`);
      betNews = await fetchBetSpecificNews(betMarket, tickers, groqApiKey);
      console.log(`Found ${betNews.length} bet-specific articles`);
    }
    
    // Combine news sources, prioritizing bet-specific news
    let combinedNews = [...betNews, ...yahooNews];
    
    // Deduplicate by URL (bet-specific takes priority since it's first)
    const seenUrls = new Set<string>();
    combinedNews = combinedNews.filter(item => {
      const url = item.link || item.url;
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
    
    // If no news found, try a fallback approach
    if (combinedNews.length === 0) {
      console.log("No news found, trying alternative approach...");
      // Fallback: Use Groq to find real news articles with search URLs
      combinedNews = await fetchNewsViaGroqSearch(tickers, context, groqApiKey);
    }
    
    // Sort by date (most recent first) and limit
    // When bet is selected, keep more articles (20) for better filtering
    const articleLimit = betMarket ? 20 : 15;
    const recentNews = combinedNews
      .sort((a, b) => {
        const dateA = a.providerPublishTime || a.pubDate || Date.now() / 1000;
        const dateB = b.providerPublishTime || b.pubDate || Date.now() / 1000;
        return dateB - dateA;
      })
      .slice(0, articleLimit);

    // Extract bet subject for fallback text
    const betSubjectForFallback = betMarket ? extractBetSubject(betMarket) : null;
    
    // Extract keywords from bet for title-based filtering (fallback when Groq fails)
    const betKeywords = betMarket 
      ? betMarket
          .toLowerCase()
          .replace(/[?'"<>$]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !['will', 'the', 'by', 'end', 'of', 'in', 'for', 'over', 'this', 'that', 'with', 'from', 'have', 'been'].includes(w))
      : [];
    
    console.log(`Bet keywords for filtering: ${betKeywords.join(', ')}`);
    
    // Enhance with Groq for relevance
    let enhancements: Array<{ relevance: string; relatedStocks: string[]; keyPoints: string[]; isRelevant: boolean; betRelevanceScore?: number }> = [];
    try {
      enhancements = await enhanceNewsWithGroq(recentNews, context, groqApiKey);
    } catch (error) {
      console.error("Error enhancing news - using title-based filtering fallback:", error);
      // Use fallback enhancements WITH title-based filtering
      enhancements = recentNews.map((article) => {
        const subject = article.isBetSpecific 
          ? (article.betSubject || betSubjectForFallback || 'the bet topic')
          : (article.relatedTicker || 'the market');
        
        // Check if article title contains any bet keywords
        const titleLower = (article.title || '').toLowerCase();
        const titleMatchesBet = betMarket && betKeywords.some(keyword => titleLower.includes(keyword));
        
        // Also check if title matches portfolio tickers
        const titleMatchesTicker = tickers.some(ticker => 
          titleLower.includes(ticker.toLowerCase())
        );
        
        const isRelevantByTitle = titleMatchesBet || titleMatchesTicker;
        
        return {
          relevance: isRelevantByTitle 
            ? `News related to ${subject}. Groq analysis unavailable - relevance based on title keywords.`
            : `This article may not be directly related to ${subject}.`,
          relatedStocks: article.relatedTicker ? [article.relatedTicker] : [],
          keyPoints: [],
          isRelevant: isRelevantByTitle, // Filter based on title when Groq fails
          betRelevanceScore: isRelevantByTitle ? 6 : 1,
        };
      });
    }

    // Combine real news with enhancements and filter out irrelevant articles
    let articles: NewsArticle[] = recentNews
      .map((article, idx) => {
        const enhancement = enhancements[idx] || enhancements[0] || {
          relevance: "Financial news article",
          relatedStocks: article.relatedTicker ? [article.relatedTicker] : [],
          keyPoints: [],
          isRelevant: true,
          betRelevanceScore: 5,
        };

        // Check if article is marked as relevant
        // Only filter if explicitly marked as false, otherwise include it
        let isRelevant = enhancement.isRelevant !== false; // Default to true if not specified
        
        // When a bet is selected, use stricter filtering based on bet relevance score
        if (betMarket && enhancement.betRelevanceScore !== undefined) {
          // Filter out articles with low bet relevance (score < 3)
          if (enhancement.betRelevanceScore < 3) {
            isRelevant = false;
          }
        }
        
        // Only filter based on explicit "not really relevant" or "not relevant" phrases
        // Don't filter on weaker indicators like "maybe" or "possibly" as those might still be useful
        const relevanceText = (enhancement.relevance || "").toLowerCase();
        const strongNegativeIndicators = [
          'not really relevant',
          'not relevant',
          'not particularly relevant',
          'not especially relevant',
          'not directly relevant',
          'no clear connection',
          'unrelated',
          'no direct mention',
          'does not discuss',
          'doesn\'t discuss',
        ];

        const hasStrongNegative = strongNegativeIndicators.some((indicator) =>
          relevanceText.includes(indicator),
        );
        
        // When bet is selected, be stricter about negative indicators
        if (betMarket && hasStrongNegative) {
          isRelevant = false;
        } else if (!betMarket) {
          // For general portfolio news, only filter on strong negatives
          isRelevant = isRelevant && !hasStrongNegative;
        }

        return {
          article,
          enhancement,
          isRelevant,
          betScore: enhancement.betRelevanceScore || 5,
        };
      })
      .filter(({ isRelevant }) => isRelevant) // Filter out irrelevant articles
      // When bet is selected, sort by bet relevance score (highest first)
      .sort((a, b) => betMarket ? (b.betScore - a.betScore) : 0)
      .map(({ article, enhancement }) => {
        // Format date - Yahoo Finance uses Unix timestamp (seconds or milliseconds)
        let publishTime: number;
        if (article.providerPublishTime) {
          publishTime =
            article.providerPublishTime > 1e12
              ? article.providerPublishTime / 1000 // milliseconds to seconds
              : article.providerPublishTime;
        } else if (article.pubDate) {
          publishTime =
            article.pubDate > 1e12 ? article.pubDate / 1000 : article.pubDate;
        } else {
          publishTime = Date.now() / 1000; // Current time in seconds
        }

        const publishDate = new Date(publishTime * 1000);
        const formattedDate = publishDate.toISOString().split("T")[0];

        // Get URL - Yahoo Finance articles can have various URL fields
        let articleUrl = article.link || article.url || article.canonicalUrl;

        // If no URL found, try to construct one from UUID or use a search URL
        if (!articleUrl) {
          if (article.uuid) {
            articleUrl = `https://finance.yahoo.com/news/${article.uuid}`;
          } else {
            // Fallback: create a search URL for the article title
            const searchQuery = encodeURIComponent(article.title || "");
            articleUrl = `https://finance.yahoo.com/news?q=${searchQuery}`;
          }
        }

        // Ensure URL is absolute
        if (articleUrl && !articleUrl.startsWith("http")) {
          articleUrl = `https://${articleUrl}`;
        }

        // Extract summary from multiple possible fields
        let summary =
          article.summary ||
          article.description ||
          article.excerpt ||
          article.snippet ||
          article.text ||
          "";

        // If no summary, use title as a fallback summary
        if (!summary || summary.trim() === "") {
          summary = article.title
            ? `News article about ${article.title.toLowerCase()}. Click to read more.`
            : "Financial news article. Click to read more.";
        }

        return {
          title: article.title || "Untitled Article",
          summary: summary,
          source:
            article.publisher ||
            article.source ||
            article.provider?.name ||
            "Yahoo Finance",
          url: articleUrl,
          publishedAt: formattedDate,
          relevance: enhancement.relevance,
          relatedStocks:
            enhancement.relatedStocks.length > 0
              ? enhancement.relatedStocks
              : article.relatedTicker
                ? [article.relatedTicker]
                : [],
        };
      });

    // Safety check: if filtering removed all articles, return at least the top 5 most recent
    // This prevents showing no articles when filtering is too aggressive
    if (articles.length === 0 && recentNews.length > 0) {
      console.warn(
        "All articles were filtered out, returning top 5 most recent articles",
      );
      articles = recentNews.slice(0, 5).map((article) => {
        const publishTime = article.providerPublishTime || article.pubDate || Date.now() / 1000;
        const publishDate = new Date((publishTime > 1e12 ? publishTime / 1000 : publishTime) * 1000);
        const formattedDate = publishDate.toISOString().split('T')[0];
        const articleUrl = article.link || article.url || `https://finance.yahoo.com/news/${article.uuid || ''}`;
        const summary = article.summary || article.description || article.excerpt || '';
        
        // Use bet subject for bet-specific articles, otherwise use ticker
        const subject = article.isBetSpecific 
          ? (article.betSubject || betSubjectForFallback || 'the bet topic')
          : (article.relatedTicker || 'the market');
        
        return {
          title: article.title || "Untitled Article",
          summary: summary || `News article potentially related to ${subject}`,
          source: article.publisher || article.source || "Yahoo Finance",
          url: articleUrl,
          publishedAt: formattedDate,
          relevance: `Recent news potentially related to ${subject}. Assess relevance by reading the full article.`,
          relatedStocks: article.relatedTicker ? [article.relatedTicker] : [],
        };
      });
    }

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("News fetch error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch news",
      },
      { status: 500 },
    );
  }
}
