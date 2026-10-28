import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "composio";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = form.get("password");
  const fromRaw = form.get("from");
  const from = typeof fromRaw === "string" && fromRaw.startsWith("/") ? fromRaw : "/";

  if (password !== SITE_PASSWORD) {
    const url = req.nextUrl.clone();
    url.pathname = "/unlock";
    url.search = "";
    url.searchParams.set("from", from);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const url = req.nextUrl.clone();
  url.pathname = from;
  url.search = "";
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set("site_access", "granted", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
