import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Reachable without a session: login, the scheduler endpoint (/api/cron, which
  // checks its own secret), the GitHub workflows' endpoint
  // (/api/integrations/github, same idea), the public request form
  // (/solicitar), guest tracking links (/acompanhar/<token>) and public
  // images (favicon, login artwork).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/cron|api/integrations/github|login|solicitar(?:/|$)|acompanhar(?:/|$)|.*\\.(?:png|jpe?g|svg|webp|ico)$).*)",
  ],
};
