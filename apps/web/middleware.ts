import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/research/chat" && !request.headers.get("authorization")) {
    const anonymous = request.nextUrl.clone();
    anonymous.pathname = "/api/research/anonymous-chat";
    return NextResponse.rewrite(anonymous);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/research/chat"]
};
