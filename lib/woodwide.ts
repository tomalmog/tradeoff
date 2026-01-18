/**
 * Wood Wide AI API Client
 *
 * Provides anomaly detection, prediction, and clustering capabilities
 * for portfolio risk analysis.
 *
 * API Docs: https://docs.woodwide.ai
 */

import {
  getReferenceDataForTraining,
  classifyPortfolio,
} from "./reference-portfolios";

const WOOD_WIDE_BASE_URL = "https://beta.woodwide.ai";

interface DatasetSchema {
  columns: {
    name: string;
    type: string;
    values?: unknown[];
  }[];
}

interface DatasetResponse {
  id: string;
  name: string;
  num_rows: number;
  file_size_bytes: number;
  dataset_schema: DatasetSchema;
}

interface ModelResponse {
  id: string;
  type: string;
  training_status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  name: string;
  created_at: string;
  updated_at: string;
  input_schema?: DatasetSchema;
  label_schema?: DatasetSchema;
}

interface AnomalyResult {
  row_index: number;
  anomaly_score: number;
  is_anomaly: boolean;
  contributing_factors?: string[];
}

interface ClusterResult {
  row_index: number;
  cluster_id: number;
  cluster_label?: string;
  distance_to_centroid?: number;
}

interface PredictionResult {
  row_index: number;
  prediction: number | string;
  confidence?: number;
}

export interface PortfolioDataRow {
  ticker: string;
  shares: number;
  value: number;
  weight: number;
  sector: string;
  industry: string;
}

export interface WoodWideInsight {
  type: "anomaly" | "classification" | "pattern" | "risk_profile";
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  details: Record<string, unknown>;
  recommendation?: string;
}

export interface WoodWideAnalysisResult {
  enabled: boolean;
  insights: WoodWideInsight[];
  portfolioClassification?: {
    profile: "conservative" | "moderate" | "aggressive" | "speculative";
    confidence: number;
    similarTo: string[];
    warnings: string[];
  };
  anomalies?: {
    ticker: string;
    score: number;
    isAnomaly: boolean;
    reason?: string;
  }[];
  riskScore?: number;
  error?: string;
}

class WoodWideClient {
  private apiKey: string;
  private baseUrl: string;
  private referenceDatasetId: string | null = null;
  private anomalyModelId: string | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = WOOD_WIDE_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Wood Wide API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Verify API key and get account info
   */
  async verifyAuth(): Promise<{ valid: boolean; credits?: number }> {
    try {
      console.log("[Wood Wide AI] 🔐 Authenticating with Wood Wide API...");
      const startTime = Date.now();

      const response = await this.request<{ wwai_credits?: number }>(
        "/auth/me",
      );

      const elapsed = Date.now() - startTime;
      console.log(`[Wood Wide AI] ✅ Authentication successful (${elapsed}ms)`);
      console.log(`[Wood Wide AI] 💳 Available credits: ${response.wwai_credits || 'unlimited'}`);

      return { valid: true, credits: response.wwai_credits };
    } catch (error) {
      console.log("[Wood Wide AI] ⚠️  Authentication failed, using fallback analysis");
      return { valid: false };
    }
  }

  /**
   * Upload a dataset (generic CSV format)
   */
  private async uploadDatasetCSV(
    name: string,
    csvContent: string,
    overwrite = true,
  ): Promise<DatasetResponse> {
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, `${name}.csv`);
    formData.append("name", name);
    formData.append("overwrite", String(overwrite));

    return this.request<DatasetResponse>("/api/datasets", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Convert data rows to CSV string
   */
  private toCSV<T extends Record<string, unknown>>(data: T[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (
              typeof val === "string" &&
              (val.includes(",") || val.includes('"'))
            ) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val ?? "");
          })
          .join(","),
      ),
    ];
    return rows.join("\n");
  }

  /**
   * Train an anomaly detection model
   */
  async trainAnomalyModel(
    modelName: string,
    datasetId: string,
    inputColumns?: string[],
  ): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model_name: modelName,
      dataset_id: datasetId,
      overwrite: true,
    };

    if (inputColumns) {
      body.input_columns = inputColumns;
    }

    return this.request<ModelResponse>("/api/models/anomaly/train", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Train a prediction model
   */
  async trainPredictionModel(
    modelName: string,
    datasetId: string,
    targetColumn: string,
    inputColumns?: string[],
  ): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model_name: modelName,
      dataset_id: datasetId,
      target_column: targetColumn,
      overwrite: true,
    };

    if (inputColumns) {
      body.input_columns = inputColumns;
    }

    return this.request<ModelResponse>("/api/models/prediction/train", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Train a clustering model
   */
  async trainClusteringModel(
    modelName: string,
    datasetId: string,
    inputColumns?: string[],
    numClusters?: number,
  ): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model_name: modelName,
      dataset_id: datasetId,
      overwrite: true,
    };

    if (inputColumns) {
      body.input_columns = inputColumns;
    }
    if (numClusters) {
      body.hyperparameters = JSON.stringify({ n_clusters: numClusters });
    }

    return this.request<ModelResponse>("/api/models/clustering/train", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Get model status
   */
  async getModelStatus(modelId: string): Promise<ModelResponse> {
    return this.request<ModelResponse>(`/api/models/${modelId}`);
  }

  /**
   * Wait for model training to complete
   */
  async waitForModel(
    modelId: string,
    maxWaitMs = 60000,
    pollIntervalMs = 2000,
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const model = await this.getModelStatus(modelId);

      if (model.training_status === "COMPLETE") {
        return model;
      }

      if (model.training_status === "FAILED") {
        throw new Error("Model training failed");
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("Model training timed out");
  }

  /**
   * Run anomaly detection inference
   */
  async detectAnomalies(
    modelId: string,
    datasetId: string,
  ): Promise<AnomalyResult[]> {
    return this.request<AnomalyResult[]>(
      `/api/models/anomaly/${modelId}/infer?dataset_id=${datasetId}`,
      { method: "POST" },
    );
  }

  /**
   * Run prediction inference
   */
  async predict(
    modelId: string,
    datasetId: string,
  ): Promise<PredictionResult[]> {
    return this.request<PredictionResult[]>(
      `/api/models/prediction/${modelId}/infer?dataset_id=${datasetId}`,
      { method: "POST" },
    );
  }

  /**
   * Run clustering inference
   */
  async cluster(modelId: string, datasetId: string): Promise<ClusterResult[]> {
    return this.request<ClusterResult[]>(
      `/api/models/clustering/${modelId}/infer?dataset_id=${datasetId}`,
      { method: "POST" },
    );
  }

  /**
   * Initialize reference dataset and models for portfolio comparison
   * This trains Wood Wide on typical portfolio patterns
   */
  async initializeReferenceModels(): Promise<void> {
    const referenceData = getReferenceDataForTraining();
    const csvContent = this.toCSV(referenceData);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Wood Wide AI] 📊 Initializing reference models");
    console.log("[Wood Wide AI] 📤 Uploading reference portfolio dataset...");
    const uploadStart = Date.now();

    const dataset = await this.uploadDatasetCSV(
      "reference_portfolios",
      csvContent,
      true,
    );
    this.referenceDatasetId = dataset.id;

    const uploadTime = Date.now() - uploadStart;
    console.log(
      `[Wood Wide AI] ✅ Dataset uploaded: ${dataset.id} (${dataset.num_rows} rows, ${uploadTime}ms)`,
    );

    // Train anomaly model on reference data
    console.log(
      "[Wood Wide AI] 🧠 Training anomaly detection model...",
    );
    const trainStart = Date.now();

    const anomalyModel = await this.trainAnomalyModel(
      "portfolio_anomaly_detector",
      dataset.id,
      [
        "weight",
        "sector_concentration",
        "top_holding_weight",
        "num_holdings",
        "tech_exposure",
        "risk_score",
      ],
    );

    const trainedModel = await this.waitForModel(anomalyModel.id, 60000);
    this.anomalyModelId = trainedModel.id;

    const trainTime = Date.now() - trainStart;
    console.log(`[Wood Wide AI] ✅ Model trained: ${trainedModel.id} (${trainTime}ms)`);
    console.log("[Wood Wide AI] 🎯 Ready for portfolio analysis");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  /**
   * Main analysis function - comprehensive portfolio analysis using Wood Wide
   */
  async analyzePortfolio(
    holdings: PortfolioDataRow[],
    portfolioMetrics: {
      totalValue: number;
      sectorWeights: Record<string, number>;
      largestPosition: { ticker: string; weight: number };
    },
  ): Promise<WoodWideAnalysisResult> {
    const analysisStartTime = Date.now();
    const insights: WoodWideInsight[] = [];

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Wood Wide AI] 🔍 Starting portfolio analysis");
    console.log(`[Wood Wide AI] 📈 Portfolio: ${holdings.length} holdings, $${portfolioMetrics.totalValue.toLocaleString()}`);

    try {
      // Step 1: Classify portfolio using our reference data
      console.log("[Wood Wide AI] 🏷️  Step 1: Portfolio Classification");
      const classifyStart = Date.now();

      const topSectorWeight = Math.max(
        ...Object.values(portfolioMetrics.sectorWeights),
      );
      const techExposure = portfolioMetrics.sectorWeights["Technology"] || 0;

      const classification = classifyPortfolio({
        sector_concentration: topSectorWeight,
        top_holding_weight: portfolioMetrics.largestPosition.weight,
        num_holdings: holdings.length,
        tech_exposure: techExposure,
      });

      const classifyTime = Date.now() - classifyStart;
      console.log(`[Wood Wide AI] ✅ Classification: ${classification.profile} (${classification.confidence}% confidence, ${classifyTime}ms)`);

      // Add classification insight
      insights.push({
        type: "classification",
        title: `Portfolio Profile: ${classification.profile.charAt(0).toUpperCase() + classification.profile.slice(1)}`,
        description: `Your portfolio most closely matches a ${classification.profile} investment profile with ${classification.confidence}% confidence.`,
        severity:
          classification.profile === "speculative"
            ? "critical"
            : classification.profile === "aggressive"
              ? "warning"
              : "info",
        details: {
          profile: classification.profile,
          confidence: classification.confidence,
          similarProfiles: classification.similar_to,
        },
        recommendation:
          classification.profile === "speculative"
            ? "This portfolio carries significant risk. Consider diversifying or reducing concentrated positions."
            : classification.profile === "aggressive"
              ? "High growth potential but vulnerable to market corrections. Ensure this aligns with your risk tolerance."
              : undefined,
      });

      // Add warning insights from classification
      for (const warning of classification.warnings) {
        insights.push({
          type: "risk_profile",
          title: "Risk Warning",
          description: warning,
          severity: "warning",
          details: { source: "classification" },
        });
      }

      // Step 2: Initialize Wood Wide models if needed and run anomaly detection
      console.log("[Wood Wide AI] 🔬 Step 2: Anomaly Detection");
      let anomalyResults: {
        ticker: string;
        score: number;
        isAnomaly: boolean;
        reason?: string;
      }[] = [];

      try {
        // Ensure reference models are initialized
        if (!this.anomalyModelId) {
          await this.initializeReferenceModels();
        }

        // Prepare user portfolio data for comparison
        const anomalyStart = Date.now();
        console.log("[Wood Wide AI] 📊 Preparing portfolio data for anomaly detection...");

        const userPortfolioData = holdings.map((h) => ({
          ticker: h.ticker,
          weight: h.weight,
          sector: h.sector,
          sector_concentration: topSectorWeight,
          top_holding_weight: portfolioMetrics.largestPosition.weight,
          num_holdings: holdings.length,
          tech_exposure: techExposure,
          risk_score:
            classification.profile === "speculative"
              ? 10
              : classification.profile === "aggressive"
                ? 7
                : classification.profile === "moderate"
                  ? 5
                  : 3,
          volatility:
            classification.profile === "speculative"
              ? 3
              : classification.profile === "aggressive"
                ? 3
                : classification.profile === "moderate"
                  ? 2
                  : 1,
        }));

        // Upload user portfolio
        console.log("[Wood Wide AI] 📤 Uploading user portfolio for analysis...");
        const csvContent = this.toCSV(userPortfolioData);
        const userDataset = await this.uploadDatasetCSV(
          `user_portfolio_${Date.now()}`,
          csvContent,
          true,
        );

        // Run anomaly detection
        if (this.anomalyModelId) {
          console.log(
            "[Wood Wide AI] 🎯 Running anomaly detection inference...",
          );
          const anomalies = await this.detectAnomalies(
            this.anomalyModelId,
            userDataset.id,
          );

          anomalyResults = anomalies.map((a, idx) => {
            const holding = holdings[idx];
            return {
              ticker: holding?.ticker || `Position ${idx}`,
              score: a.anomaly_score,
              isAnomaly: a.is_anomaly,
              reason: a.is_anomaly
                ? `This position deviates from typical portfolio patterns${a.contributing_factors ? `: ${a.contributing_factors.join(", ")}` : ""}`
                : undefined,
            };
          });

          const anomalyTime = Date.now() - anomalyStart;
          const anomalousCount = anomalyResults.filter((a) => a.isAnomaly).length;
          console.log(`[Wood Wide AI] ✅ Anomaly detection complete: ${anomalousCount} anomalies found (${anomalyTime}ms)`);

          // Add insights for detected anomalies
          const anomalousPositions = anomalyResults.filter((a) => a.isAnomaly);
          if (anomalousPositions.length > 0) {
            insights.push({
              type: "anomaly",
              title: `${anomalousPositions.length} Unusual Position${anomalousPositions.length > 1 ? "s" : ""} Detected`,
              description: `Wood Wide AI identified positions that deviate significantly from typical investor portfolios: ${anomalousPositions.map((a) => a.ticker).join(", ")}`,
              severity: anomalousPositions.length > 2 ? "critical" : "warning",
              details: {
                positions: anomalousPositions,
              },
              recommendation:
                "Review these positions to ensure the allocation aligns with your investment strategy.",
            });
          }
        }
      } catch (woodWideError) {
        console.error("[Wood Wide AI] ❌ Model analysis error:", woodWideError);
        // Continue with classification-only results
        insights.push({
          type: "pattern",
          title: "Limited Analysis Available",
          description:
            "Full Wood Wide AI analysis was not available. Showing classification-based insights only.",
          severity: "info",
          details: { error: String(woodWideError) },
        });
      }

      // Step 3: Pattern-based insights
      console.log("[Wood Wide AI] 🔍 Step 3: Pattern Analysis");

      // Check for common risky patterns
      if (techExposure > 50 && holdings.length < 10) {
        insights.push({
          type: "pattern",
          title: "Concentrated Tech Bet",
          description: `Your portfolio is ${techExposure.toFixed(0)}% technology with only ${holdings.length} holdings. This resembles speculative tech portfolios that saw 50%+ drawdowns in 2022.`,
          severity: "warning",
          details: {
            techExposure,
            holdingCount: holdings.length,
            historicalDrawdown: "50%+",
          },
          recommendation:
            "Consider adding non-tech positions to reduce correlation risk.",
        });
      }

      if (portfolioMetrics.largestPosition.weight > 30) {
        insights.push({
          type: "pattern",
          title: "Single Stock Dominance",
          description: `${portfolioMetrics.largestPosition.ticker} represents ${portfolioMetrics.largestPosition.weight.toFixed(1)}% of your portfolio. This exceeds typical institutional limits of 10-15%.`,
          severity:
            portfolioMetrics.largestPosition.weight > 50
              ? "critical"
              : "warning",
          details: {
            ticker: portfolioMetrics.largestPosition.ticker,
            weight: portfolioMetrics.largestPosition.weight,
            institutionalLimit: "10-15%",
          },
          recommendation:
            "Consider trimming this position or hedging with put options.",
        });
      }

      // Calculate overall risk score (1-100)
      let riskScore = 30; // base
      riskScore += Math.min(30, techExposure * 0.4);
      riskScore += Math.min(20, portfolioMetrics.largestPosition.weight * 0.4);
      riskScore += Math.min(15, Math.max(0, 15 - holdings.length) * 1.5);
      riskScore = Math.min(100, Math.round(riskScore));

      const totalTime = Date.now() - analysisStartTime;
      console.log(`[Wood Wide AI] ✅ Analysis complete: ${insights.length} insights, risk score ${riskScore}/100 (${totalTime}ms)`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return {
        enabled: true,
        insights,
        portfolioClassification: {
          profile: classification.profile,
          confidence: classification.confidence,
          similarTo: classification.similar_to,
          warnings: classification.warnings,
        },
        anomalies: anomalyResults,
        riskScore,
      };
    } catch (error) {
      console.error("[Wood Wide AI] ❌ Analysis error:", error);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return {
        enabled: true,
        insights,
        error: error instanceof Error ? error.message : "Analysis failed",
      };
    }
  }
}

// Singleton instance
let client: WoodWideClient | null = null;

export function getWoodWideClient(): WoodWideClient | null {
  const apiKey = process.env.WOOD_WIDE_API_KEY;

  if (!apiKey) {
    console.log("[Wood Wide AI] ⚠️  No API key configured (WOOD_WIDE_API_KEY)");
    console.log("[Wood Wide AI] 📊 Using fallback classification and pattern analysis");
    return null;
  }

  if (!client) {
    console.log("[Wood Wide AI] 🚀 Initializing Wood Wide AI client");
    client = new WoodWideClient(apiKey);
  }

  return client;
}

export { WoodWideClient };
