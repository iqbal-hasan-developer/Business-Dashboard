import { NextResponse, type NextRequest } from "next/server";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const publicRoute = request.nextUrl.pathname === "/login";
  try {
    if (resolveBusinessDataProvider() === "mock") {
      if (process.env.VERCEL) {
        const hasSession = request.cookies.get("demo_auth_session")?.value === "active";
        if (!hasSession && !publicRoute) {
          const login = request.nextUrl.clone();
          login.pathname = "/login";
          login.search = "";
          login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
          return NextResponse.redirect(login);
        }
        if (hasSession && publicRoute) {
          const dashboard = request.nextUrl.clone();
          dashboard.pathname = "/dashboard";
          dashboard.search = "";
          return NextResponse.redirect(dashboard);
        }
      }
      return NextResponse.next();
    }
  } catch {
    if (publicRoute) return NextResponse.next();
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    login.searchParams.set("reason", "configuration");
    return NextResponse.redirect(login);
  }

  let session;
  try {
    session = await updateSupabaseSession(request);
  } catch {
    if (publicRoute) return NextResponse.next();
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    login.searchParams.set("reason", "configuration");
    return NextResponse.redirect(login);
  }
  const { response, user } = session;
  if (!user && !publicRoute) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
