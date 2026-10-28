import { NextRequest, NextResponse } from "next/server";

// Soft access gate for a take-home demo link — not real security (the
// password is shared openly), just keeps the URL from being stumbled into.

const PUBLIC_PATHS = ["/unlock", "/api/unlock"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (req.cookies.get("site_access")?.value === "granted") {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico)$).*)",
  ],
};
