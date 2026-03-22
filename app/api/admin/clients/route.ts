import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null;
  return session;
}

export async function GET() {
  if (!await requireAdmin()) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rows = await sql`
      SELECT id, email, name, image, created_at, last_seen
      FROM users
      ORDER BY created_at DESC
    `;
    return Response.json(rows);
  } catch (err) {
    console.error("[admin/clients] GET failed:", err);
    return Response.json({ error: "DB error — did you create the users table?" }, { status: 500 });
  }
}
