import NextAuth, { DefaultSession, NextAuthConfig } from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "./lib/mongodb";

// Providers
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import FacebookProvider from "next-auth/providers/facebook";
import LinkedInProvider from "next-auth/providers/linkedin";
import CredentialsProvider from "next-auth/providers/credentials";

// Extend NextAuth types to include our custom fields
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      hasCompletedAssessment: boolean;
      provider?: string;
      providerAccountId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    hasCompletedAssessment?: boolean;
    provider?: string;
    providerAccountId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    hasCompletedAssessment: boolean;
    provider?: string;
    providerAccountId?: string;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "dummy",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy",
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "dummy",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "dummy",
    }),
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID || "dummy",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "dummy",
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "dummy"}/v2.0`,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || "dummy",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "dummy",
    }),
    LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID || "dummy",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "dummy",
    }),
    CredentialsProvider({
      name: "Local Test User",
      credentials: {},
      async authorize() {
        // Return a mock user for local development testing
        return {
          id: "local-test-user-id",
          name: "Test User",
          email: "test@example.com",
          role: "user",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id!;
        // Default values for new users
        token.role = user.role || "user";
        token.hasCompletedAssessment = user.hasCompletedAssessment || false;
      }

      if (account) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;
        console.log(`[auth] signed in with provider=${account.provider}`);
      }

      // Allow updating session values (e.g., after completing assessment)
      if (trigger === "update" && session) {
        if (session.hasCompletedAssessment !== undefined) {
          token.hasCompletedAssessment = session.hasCompletedAssessment;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.hasCompletedAssessment = token.hasCompletedAssessment;
        session.user.provider = token.provider;
        session.user.providerAccountId = token.providerAccountId;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
