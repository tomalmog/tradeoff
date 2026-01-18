import { NextRequest, NextResponse } from "next/server";

const WOOD_WIDE_BASE_URL = "https://beta.woodwide.ai";

export async function POST(request: NextRequest) {
  const apiKey = process.env.WOOD_WIDE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const body = await request.json();
  const portfolio = body.portfolio || [{ ticker: "AAPL", shares: 10 }];

  // Create CSV
  const csv = "ticker,shares\n" + portfolio.map((p: {ticker: string, shares: number}) => p.ticker + "," + p.shares).join("\n");
  
  // Call 1: Upload dataset
  const formData1 = new FormData();
  formData1.append("file", new Blob([csv], { type: "text/csv" }), "data1.csv");
  formData1.append("name", "tradeoff_" + Date.now() + "_1");
  formData1.append("overwrite", "true");
  await fetch(WOOD_WIDE_BASE_URL + "/api/datasets", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: formData1,
  });

  // Call 2: Upload another dataset
  const formData2 = new FormData();
  formData2.append("file", new Blob([csv], { type: "text/csv" }), "data2.csv");
  formData2.append("name", "tradeoff_" + Date.now() + "_2");
  formData2.append("overwrite", "true");
  await fetch(WOOD_WIDE_BASE_URL + "/api/datasets", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: formData2,
  });

  // Call 3: Upload third dataset
  const formData3 = new FormData();
  formData3.append("file", new Blob([csv], { type: "text/csv" }), "data3.csv");
  formData3.append("name", "tradeoff_" + Date.now() + "_3");
  formData3.append("overwrite", "true");
  await fetch(WOOD_WIDE_BASE_URL + "/api/datasets", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: formData3,
  });

  return NextResponse.json({ calls: 3 });
}
