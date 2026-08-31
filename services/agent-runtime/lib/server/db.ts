/**
 * Database connection factory.
 *
 * Returns a PGlite instance (embedded Postgres, zero-config) when DATABASE_URL
 * is not set, or a pg.Pool when it is. Both satisfy the same Queryable interface.
 */
import { createLogger } from '@/lib/logger';
import { resolveAgentRuntimeDataDir } from '@/lib/server/data-root';

const log = createLogger('Database');

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

interface DatabaseSingletons {
  pglite?: Promise<Queryable>;
  pgPool?: Promise<Queryable>;
}

// Next.js dev mode replaces server modules during Fast Refresh. A module-local
// PGlite singleton opens the same data directory again after every replacement,
// eventually aborting all lesson/session queries. Keep initialization promises
// on globalThis so both concurrent requests and hot module generations share one
// database handle. Production gets the same single-instance behavior.
const globalDatabase = globalThis as typeof globalThis & {
  __aiseceduAgentRuntimeDatabase?: DatabaseSingletons;
};
const databaseSingletons = (globalDatabase.__aiseceduAgentRuntimeDatabase ??= {});

/**
 * Get the database connection. Auto-selects PGlite (embedded) or pg.Pool (external).
 * Call ensureAppSchema() on first use to create tables.
 */
export async function getDb(): Promise<Queryable> {
  // External Postgres via DATABASE_URL
  if (process.env.DATABASE_URL) {
    if (!databaseSingletons.pgPool) {
      databaseSingletons.pgPool = (async () => {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const queryable: Queryable = {
          async query(text: string, params?: unknown[]) {
            const res = await pool.query(text, params as never);
            return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount ?? 0 };
          },
        };
        log.info('Connected to external Postgres via DATABASE_URL');
        return queryable;
      })().catch((error) => {
        databaseSingletons.pgPool = undefined;
        throw error;
      });
    }
    return databaseSingletons.pgPool;
  }

  // Embedded PGlite is only a runtime cache; 玄甲 remains authoritative.
  if (!databaseSingletons.pglite) {
    databaseSingletons.pglite = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const fs = await import('fs');
      const path = await import('path');
      const root = resolveAgentRuntimeDataDir();
      const dataDir = path.join(root, 'agent-runtime.pgdata');
      const legacyDataDir = path.join(root, 'openmaic.pgdata');
      if (fs.existsSync(legacyDataDir) && !fs.existsSync(dataDir)) {
        fs.renameSync(legacyDataDir, dataDir);
      }
      fs.mkdirSync(path.dirname(dataDir), { recursive: true });
      const pglite = new PGlite(dataDir);
      await pglite.waitReady;
      const queryable: Queryable = {
        async query(text: string, params?: unknown[]) {
          const res = await pglite.query(text, params);
          return { rows: res.rows as Record<string, unknown>[], rowCount: res.rows?.length ?? 0 };
        },
      };
      log.info('Initialized embedded PGlite at', dataDir);
      return queryable;
    })().catch((error) => {
      databaseSingletons.pglite = undefined;
      throw error;
    });
  }
  return databaseSingletons.pglite;
}

/** Execute multiple statements (one at a time for PGlite compatibility). */
export async function execSql(db: Queryable, statements: string[]): Promise<void> {
  for (const stmt of statements) {
    await db.query(stmt);
  }
}
