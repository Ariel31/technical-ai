import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

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
