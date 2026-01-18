import { NextRequest, NextResponse } from "next/server";

const WOOD_WIDE_BASE_URL = "https://beta.woodwide.ai";

export interface WoodWideAnalysisResult {
  calls: {
    auth: { success: boolean; credits?: number; userId?: string; error?: string };
    dataset: { success: boolean; datasetId?: string; numRows?: number; error?: string };
    inference: { success: boolean; results?: unknown[]; error?: string };
  };
  totalCalls: number;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.WOOD_WIDE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: "WOOD_WIDE_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { portfolio } = body;

    if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
      return NextResponse.json(
        { error: "Portfolio array is required" },
        { status: 400 }
      );
    }

    console.log("[Wood Wide API] Starting 3-call analysis...");
    const result: WoodWideAnalysisResult = {
      calls: {
        auth: { success: false },
        dataset: { success: false },
        inference: { success: false },
      },
      totalCalls: 0,
      timestamp: new Date().toISOString(),
    };

    // CALL 1: Auth check
    console.log("[Wood Wide API] Call 1/3: Auth check...");
    try {
      const authResponse = await fetch(`${WOOD_WIDE_BASE_URL}/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      result.totalCalls++;

      if (authResponse.ok) {
        const authData = await authResponse.json();
        result.calls.auth = {
          success: true,
          credits: authData.wwai_credits,
          userId: authData.user_id,
        };
        console.log("[Wood Wide API] Call 1/3: Auth OK");
      } else {
        result.calls.auth = {
          success: false,
          error: `Auth failed: ${authResponse.status}`,
        };
        console.log("[Wood Wide API] Call 1/3: Auth failed");
      }
    } catch (e) {
      result.calls.auth = {
        success: false,
        error: e instanceof Error ? e.message : "Auth error",
      };
    }

    // CALL 2: Dataset upload
    console.log("[Wood Wide API] Call 2/3: Dataset upload...");
    try {
      // Convert portfolio to CSV
      const headers = ["ticker", "shares", "value", "sector"];
      const rows = portfolio.map((p: { ticker: string; shares: number; value?: number; sector?: string }) =>
        `${p.ticker},${p.shares},${p.value || 0},${p.sector || "Unknown"}`
      );
      const csvContent = [headers.join(","), ...rows].join("\n");

      const formData = new FormData();
      const blob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", blob, "portfolio.csv");
      formData.append("name", `hedge_analysis_${Date.now()}`);
      formData.append("overwrite", "true");

      const datasetResponse = await fetch(`${WOOD_WIDE_BASE_URL}/api/datasets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      result.totalCalls++;

      if (datasetResponse.ok) {
        const datasetData = await datasetResponse.json();
        result.calls.dataset = {
          success: true,
          datasetId: datasetData.id,
          numRows: datasetData.num_rows,
        };
        console.log("[Wood Wide API] Call 2/3: Dataset upload OK");
      } else {
        const errorText = await datasetResponse.text();
        result.calls.dataset = {
          success: false,
          error: `Dataset upload failed: ${datasetResponse.status} - ${errorText}`,
        };
        console.log("[Wood Wide API] Call 2/3: Dataset upload failed");
      }
    } catch (e) {
      result.calls.dataset = {
        success: false,
        error: e instanceof Error ? e.message : "Dataset error",
      };
    }

    // CALL 3: Train and infer (if dataset uploaded)
    if (result.calls.dataset.success && result.calls.dataset.datasetId) {
      console.log("[Wood Wide API] Call 3/3: Training and inference...");
      try {
        const params = new URLSearchParams();
        params.append("model_name", `hedge_model_${Date.now()}`);
        params.append("overwrite", "true");

        const trainResponse = await fetch(
          `${WOOD_WIDE_BASE_URL}/api/models/anomaly/train?dataset_name=${result.calls.dataset.datasetId}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          }
        );

        result.totalCalls++;

        if (trainResponse.ok) {
          const modelData = await trainResponse.json();
          result.calls.inference = {
            success: true,
            results: [{ modelId: modelData.id, status: "training_started" }],
          };
          console.log("[Wood Wide API] Call 3/3: Training started OK");
        } else {
          const errorText = await trainResponse.text();
          result.calls.inference = {
            success: false,
            error: `Training failed: ${trainResponse.status} - ${errorText}`,
          };
          console.log("[Wood Wide API] Call 3/3: Training failed");
        }
      } catch (e) {
        result.calls.inference = {
          success: false,
          error: e instanceof Error ? e.message : "Inference error",
        };
      }
    } else {
      console.log("[Wood Wide API] Call 3/3: Skipped (no dataset)");
    }

    console.log(`[Wood Wide API] Complete: ${result.totalCalls} API calls made`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Wood Wide API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
