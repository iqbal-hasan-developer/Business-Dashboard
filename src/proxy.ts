import { NextResponse, type NextRequest } from "next/server";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (resolveBusinessDataProvider() === "mock") return NextResponse.next();

  const { response, user } = await updateSupabaseSession(request);
  const publicRoute = request.nextUrl.pathname === "/login";
  if (!user && !publicRoute) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (user && publicRoute) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    dashboard.search = "";
    return NextResponse.redirect(dashboard);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
