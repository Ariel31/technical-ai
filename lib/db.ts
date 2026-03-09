import postgres from "postgres";

// Single connection pool — reused across all server-side requests
const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",       // Supabase requires SSL
  max: 5,
  prepare: false,       // required for Supabase transaction-mode pooler (PgBouncer)
});

export default sql;
