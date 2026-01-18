export interface HedgeRecommendation {
  market: string;
  marketUrl: string;
  outcome: string; // The specific outcome being bet on (e.g., "$50B-$100B", "Before March 2025")
  probability: number;
  position: "YES" | "NO";
  reasoning: string;
  hedgesAgainst: string;
  suggestedAllocation: number;
  affectedStocks: string[]; 
  confidence: "high" | "medium";
  endDate?: string;
}

export interface AnalysisResponse {
  summary: string;
  recommendations: HedgeRecommendation[];
  stocksWithoutHedges: string[];
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct",
  "qwen/qwen3-32b",
  "llama-3.1-8b-instant",
];

const SYSTEM_PROMPT = `You are a hedge analyst finding Polymarket bets to hedge stocks.

YOUR TASK:
Find Polymarket events that DIRECTLY affect stocks in the portfolio. Group stocks that share the same hedge.

RULES:
1. Only recommend hedges with DIRECT connections to the companies
2. If one market affects multiple stocks, LIST ALL AFFECTED STOCKS together
3. Quality over quantity - only genuinely relevant hedges
4. Only use markets from the provided list
5. ALWAYS specify the EXACT outcome being bet on

GROUPING EXAMPLE:
If "Will US tariffs exceed $250B?" affects AAPL, TSLA, and NVDA - list them all together, don't create 3 separate entries.

WHAT MAKES A GOOD HEDGE:
✅ HIGH confidence: Directly mentions company, CEO, or core product
   - "Will Elon Musk..." → TSLA
   - "NVIDIA chip exports" → NVDA
   
✅ MEDIUM confidence: Directly affects core business
   - "US tariffs" → AAPL, TSLA, NVDA (all have China exposure)
   - "AI regulation" → NVDA, MSFT, GOOGL, META (all have AI products)

❌ SKIP - Too generic:
   - "Recession" - affects everything
   - "Interest rates" - too macro

Respond with JSON:
{
  "summary": "Brief summary of hedges found",
  "recommendations": [
    {
      "market": "EXACT title from the list",
      "outcome": "The specific outcome to bet on (e.g., '$50B-$100B', 'Before Q2 2025', 'Yes it will happen', '<500 layoffs')",
      "probability": 0.52,
      "position": "YES",
      "reasoning": "Why this affects these specific stocks",
      "hedgesAgainst": "The shared risk",
      "suggestedAllocation": 500,
      "affectedStocks": ["AAPL", "TSLA", "NVDA"],
      "confidence": "medium"
    }
  ],
  "stocksWithoutHedges": ["JNJ"]
}

CRITICAL - About "outcome":
- For range markets (e.g., "Tesla market cap?"), specify the EXACT range: "$500B-$750B"
- For date markets (e.g., "When will X launch?"), specify the timeframe: "Q1 2025" or "Before March"
- For yes/no markets, just say "Yes" or "No" matching your position
- This tells users WHAT they're betting on, not just the probability

IMPORTANT: 
- Don't repeat the same market multiple times
- Group all affected stocks into one recommendation
- Put hedges that affect MORE stocks first in your list`;

async function tryModel(
  model: string,
  context: string,
  apiKey: string
): Promise<AnalysisResponse | null> {
  try {
    console.log(`Trying model: ${model}`);
    
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Find hedges for this portfolio. Group stocks that share the same hedge:\n\n${context}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2500,
      }),
    });

    if (response.status === 429) {
      console.log(`Model ${model} rate limited`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq API error for ${model}:`, response.status, errorText);
      
      if (response.status === 400 || response.status === 404) {
        return null;
      }
      
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in Groq response");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from Groq response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    console.log(`Success with model: ${model}`);
    
    // Parse and deduplicate recommendations
    const recommendations = (parsed.recommendations || []).map((rec: Record<string, unknown>) => ({
      market: String(rec.market || ""),
      marketUrl: "",
      outcome: String(rec.outcome || rec.position || "Yes"), // Fallback to position if no outcome specified
      probability: Number(rec.probability) || 0.5,
      position: rec.position === "NO" ? "NO" : "YES",
      reasoning: String(rec.reasoning || ""),
      hedgesAgainst: String(rec.hedgesAgainst || ""),
      suggestedAllocation: Number(rec.suggestedAllocation) || 100,
      affectedStocks: Array.isArray(rec.affectedStocks) 
        ? rec.affectedStocks.map(String).filter(Boolean)
        : [],
      confidence: rec.confidence === "medium" ? "medium" : "high",
    }));

    // Sort by number of affected stocks (descending)
    recommendations.sort((a: HedgeRecommendation, b: HedgeRecommendation) => 
      b.affectedStocks.length - a.affectedStocks.length
    );

    return {
      summary: parsed.summary || "Analysis complete.",
      recommendations,
      stocksWithoutHedges: Array.isArray(parsed.stocksWithoutHedges) 
        ? parsed.stocksWithoutHedges.map(String)
        : [],
    };
  } catch (error) {
    console.error(`Error with model ${model}:`, error);
    return null;
  }
}

export async function analyzeWithGroq(
  context: string,
  apiKey: string
): Promise<AnalysisResponse> {
  for (const model of GROQ_MODELS) {
    const result = await tryModel(model, context, apiKey);
    if (result) {
      return result;
    }
  }

  throw new Error("All models failed or rate limited. Please try again later.");
}

export const analyzeWithGrok = analyzeWithGroq;
