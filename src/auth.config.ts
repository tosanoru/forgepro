import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/approve") ||
        nextUrl.pathname.startsWith("/api/approval") ||
        nextUrl.pathname.startsWith("/api/mux/webhook") ||
        nextUrl.pathname.startsWith("/api/billing/webhook") ||
        nextUrl.pathname.startsWith("/api/cron") ||
        nextUrl.pathname.startsWith("/api/mcp");
      if (isPublicPath) return true;
      return isLoggedIn;
    },
  },
  // Providers are added in auth.ts (they pull in the Drizzle adapter, DB
  // client, and bcrypt — kept out of this file so the middleware bundle
  // stays edge-safe and light).
  providers: [],
} satisfies NextAuthConfig;
