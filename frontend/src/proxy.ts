import NextAuth from "next-auth"
import { authConfig } from "./auth"

export default NextAuth(authConfig).auth

export const config = {
  matcher: [
    "/assess/:path*", 
    "/questions/:path*", 
    "/results/:path*", 
    "/dashboard/:path*"
  ],
}
