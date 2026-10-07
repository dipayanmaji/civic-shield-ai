import { NextResponse } from "next/server";

import { parseLatitude, parseLongitude, parseRadiusKm } from "@/lib/geo/coordinates";
import { getNearbyPublicReports, getPublicReports } from "@/lib/supabase/reports";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Public tracking is not configured." }, { status: 503 });

  const url = new URL(request.url);
  // Missing coordinates must list recent reports, not search around 0,0 (Number(null) is 0).
  const latitude = parseLatitude(url.searchParams.get("lat"));
  const longitude = parseLongitude(url.searchParams.get("lon"));
  const radiusKm = parseRadiusKm(url.searchParams.get("radiusKm"), 10);

  try {
    const reports = latitude !== null && longitude !== null
      ? await getNearbyPublicReports(latitude, longitude, radiusKm)
      : await getPublicReports();
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reports could not be loaded." }, { status: 500 });
  }
}
