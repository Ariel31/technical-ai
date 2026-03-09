import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

await sql`
  CREATE TABLE IF NOT EXISTS analyses (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker      TEXT        NOT NULL,
    timeframe   TEXT        NOT NULL DEFAULT '1d',
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    bars        JSONB       NOT NULL,
    result      JSONB       NOT NULL,
    meta        JSONB       NOT NULL,
    UNIQUE (ticker, timeframe)
  )
`;

console.log("✓ analyses table ready");
await sql.end();
