import { NextRequest, NextResponse } from "next/server";

const WOOD_WIDE_BASE_URL = "https://beta.woodwide.ai";

export async function POST(request: NextRequest) {
  const apiKey = process.env.WOOD_WIDE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  // Call 1
  await fetch(WOOD_WIDE_BASE_URL + "/auth/me", {
    headers: { Authorization: "Bearer " + apiKey },
  });

  // Call 2
  await fetch(WOOD_WIDE_BASE_URL + "/auth/me", {
    headers: { Authorization: "Bearer " + apiKey },
  });

  // Call 3
  await fetch(WOOD_WIDE_BASE_URL + "/auth/me", {
    headers: { Authorization: "Bearer " + apiKey },
  });

  return NextResponse.json({ calls: 3 });
}
