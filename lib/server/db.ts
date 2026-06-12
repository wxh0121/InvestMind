import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

const getDatabaseUrl = () => process.env.POSTGRES_URL || process.env.DATABASE_URL;

export const getPool = () => {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("未配置 POSTGRES_URL，请先在 Vercel 创建 Postgres/Neon 数据库并绑定环境变量");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false }
    });
  }

  return pool;
};

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> => getPool().query<T>(text, values);

export const ensureSchema = async () => {
  schemaReady ??= (async () => {
    await query(`
      create table if not exists investmind_users (
        id text primary key,
        email text unique not null,
        password_hash text not null,
        password_salt text not null,
        created_at timestamptz not null default now()
      );
    `);
    await query(`
      create table if not exists investmind_sessions (
        id text primary key,
        user_id text not null references investmind_users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
    `);
    await query(`
      create table if not exists investmind_portfolios (
        user_id text primary key references investmind_users(id) on delete cascade,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
    `);
    await query("create index if not exists investmind_sessions_user_id_idx on investmind_sessions(user_id);");
    await query("delete from investmind_sessions where expires_at < now();");
  })();

  return schemaReady;
};
