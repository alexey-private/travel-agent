import { Pool, QueryResult, QueryResultRow } from 'pg';

/**
 * Abstract base class for all repositories.
 * Provides a thin wrapper around the pg Pool with typed query execution.
 */
export abstract class BaseRepository {
  constructor(protected pool: Pool) {}

  /**
   * Executes a parameterized SQL query and returns typed rows.
   *
   * @param sql - The SQL query string with $1, $2, ... placeholders
   * @param params - Optional array of parameter values
   * @returns Array of typed result rows
   */
  protected async query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
    const result: QueryResult<T> = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  /**
   * Executes a query and returns a single row, or null if not found.
   */
  protected async queryOne<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Executes a query that does not return rows (INSERT, UPDATE, DELETE).
   */
  protected async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.query(sql, params);
  }
}
