import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Publicly served brand assets with fallback to bundled defaults */
const FALLBACKS: Record<string, string | null> = {
  storeLogo: "/icon.png",
  visaLogo: "/visa.svg",
  humoLogo: "/humo.svg",
  favicon: "/icon.png",
  // Nav icons have no file fallback — client falls back to emoji on 404
  navHome: null,
  navOrders: null,
  navAdmin: null,
  // Category card logos — emoji fallback client-side
  catStars: null,
  catPremium: null,
  catGift: null,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!(key in FALLBACKS)) {
    return NextResponse.json({ error: "Unknown asset" }, { status: 404 });
  }

  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, `asset:${key}`))
    .limit(1);

  if (row?.value) {
    try {
      const { data, mime } = JSON.parse(row.value) as {
        data: string;
        mime: string;
      };
      const buf = Buffer.from(data, "base64");
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          // no-cache → browser revalidates each load, so a freshly uploaded
          // logo shows up immediately everywhere in the app.
          "Cache-Control": "no-cache",
        },
      });
    } catch {
      // fall through to default
    }
  }
  const fallback = FALLBACKS[key];
  if (!fallback) {
    return NextResponse.json({ error: "Not set" }, { status: 404 });
  }
  return NextResponse.redirect(new URL(fallback, req.nextUrl.origin));
}
