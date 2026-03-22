import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import sql from "@/lib/db";

// Extend the built-in session type so session.user.id is available everywhere
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    // Save/update user in DB on every sign-in
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id && user.email) {
        try {
          await sql`
            INSERT INTO users (id, email, name, image)
            VALUES (${user.id}, ${user.email}, ${user.name ?? null}, ${user.image ?? null})
            ON CONFLICT (id) DO UPDATE SET
              email     = EXCLUDED.email,
              name      = EXCLUDED.name,
              image     = EXCLUDED.image,
              last_seen = now()
          `;
        } catch { /* non-fatal — don't block sign-in */ }
      }
      return true;
    },
    // Persist the Google sub (user ID) in the JWT token
    jwt({ token }) {
      return token;
    },
    // Expose user.id on the session object (reads from token.sub)
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
