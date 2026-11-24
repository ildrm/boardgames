import { EventEmitter } from 'node:events';
import { Pool, type PoolClient } from 'pg';

export interface Transaction {
  now(): Promise<number>;
  read<T>(collection: string, id: string): Promise<T | undefined>;
  put(collection: string, id: string, value: unknown, due?: number): Promise<void>;
  claim(collection: string, id: string, value: unknown): Promise<boolean>;
  remove(collection: string, id: string): Promise<void>;
  removePrefix(collection: string, prefix: string): Promise<void>;
  emit(roomId: string): Promise<void>;
}

export interface Store {
  transaction<T>(scope: string, run: (tx: Transaction) => Promise<T>): Promise<T>;
  due(collection: string, limit: number): Promise<string[]>;
  listen(onRoom: (roomId: string) => void, onRecovery: () => void): void;
  publishOutbox(): Promise<void>;
  pruneEvents(): Promise<void>;
  healthy(): Promise<void>;
  close(): Promise<void>;
}

interface RecordEntry {
  value: unknown;
  due?: number;
}

const recordKey = (collection: string, id: string) => collection + ':' + id;

export class MemoryStore implements Store {
  private readonly state = new Map<string, RecordEntry>();
  private readonly changes = new EventEmitter();
  private tail = Promise.resolve();

  constructor(private readonly clock = Date.now) {}

  async transaction<T>(_scope: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    const saved = new Map<string, RecordEntry | undefined>();
    const events = new Set<string>();
    const capture = (key: string) => {
      if (!saved.has(key)) saved.set(key, this.state.get(key));
    };
    try {
      const result = await run({
        now: async () => this.clock(),
        read: async <V>(c: string, id: string) => structuredClone(this.state.get(recordKey(c, id))?.value) as V | undefined,
        put: async (c, id, value, due) => {
          const key = recordKey(c, id);
          capture(key);
          this.state.set(key, { value: structuredClone(value), due });
        },
        claim: async (c, id, value) => {
          const key = recordKey(c, id);
          if (this.state.has(key)) return false;
          capture(key);
          this.state.set(key, { value: structuredClone(value) });
          return true;
        },
        remove: async (c, id) => {
          const key = recordKey(c, id);
          capture(key);
          this.state.delete(key);
        },
        removePrefix: async (collection, prefix) => {
          for (const key of this.state.keys()) {
            if (!key.startsWith(recordKey(collection, prefix))) continue;
            capture(key);
            this.state.delete(key);
          }
        },
        emit: async (roomId) => { events.add(roomId); }
      });
      queueMicrotask(() => {
        for (const roomId of events) this.changes.emit('room', roomId);
      });
      return result;
    } catch (error) {
      for (const [key, entry] of saved) {
        if (entry) this.state.set(key, entry);
        else this.state.delete(key);
      }
      throw error;
    } finally {
      release();
    }
  }

  async due(collection: string, limit: number): Promise<string[]> {
    await this.tail;
    const now = this.clock();
    return [...this.state.entries()]
      .filter(([key, entry]) => key.startsWith(collection + ':') && entry.due !== undefined && entry.due <= now)
      .sort((a, b) => a[1].due! - b[1].due!)
      .slice(0, limit).map(([key]) => key.slice(collection.length + 1));
  }

  listen(onRoom: (roomId: string) => void): void { this.changes.on('room', onRoom); }
  async publishOutbox(): Promise<void> {}
  async pruneEvents(): Promise<void> {}
  async healthy(): Promise<void> {}
  async close(): Promise<void> { this.changes.removeAllListeners(); }
}

export class PostgresStore implements Store {
  private readonly pool: Pool;
  private listener?: PoolClient;
  private stopping = false;
  private retryListen?: NodeJS.Timeout;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 12), connectionTimeoutMillis: 3_000 });
    this.pool.on('error', () => console.error('database pool connection lost'));
  }

  async transaction<T>(scope: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scope]);
        const tx: Transaction = {
          now: async () => Number((await client.query('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) AS ms')).rows[0].ms),
          read: async <V>(collection: string, id: string) =>
            (await client.query<{ value: V }>('SELECT value FROM tablemate_records WHERE collection=$1 AND id=$2', [collection, id])).rows[0]?.value,
          put: async (c, id, v, due) => {
            await client.query(
              'INSERT INTO tablemate_records (collection,id,value,due_ms) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (collection,id) DO UPDATE SET value=EXCLUDED.value,due_ms=EXCLUDED.due_ms',
              [c, id, JSON.stringify(v), due ?? null]
            );
          },
          claim: async (c, id, v) => Boolean((await client.query(
            'INSERT INTO tablemate_records (collection,id,value) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING', [c, id, JSON.stringify(v)]
          )).rowCount),
          remove: async (c, id) => { await client.query('DELETE FROM tablemate_records WHERE collection=$1 AND id=$2', [c, id]); },
          removePrefix: async (c, prefix) => {
            await client.query('DELETE FROM tablemate_records WHERE collection=$1 AND starts_with(id,$2)', [c, prefix]);
          },
          emit: async (roomId) => {
            await client.query('INSERT INTO tablemate_outbox(room_id) VALUES ($1)', [roomId]);
            await client.query("SELECT pg_notify('tablemate_updates', $1)", [roomId]);
          }
        };
        const result = await run(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = (error as { code?: string }).code;
        if (attempt >= 2 || !['40001', '40P01', '55P03'].includes(code ?? '')) throw error;
      } finally {
        client.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 40));
    }
  }

  async due(collection: string, limit: number): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM tablemate_records WHERE collection=$1 AND due_ms <= floor(extract(epoch FROM clock_timestamp()) * 1000) ORDER BY due_ms,id LIMIT $2',
      [collection, limit]
    );
    return result.rows.map(({ id }) => id);
  }

  listen(onRoom: (roomId: string) => void, onRecovery: () => void): void {
    const connect = async () => {
      if (this.stopping) return;
      try {
        const client = await this.pool.connect();
        if (this.stopping) { client.release(); return; }
        this.listener = client;
        const lost = (error: Error) => {
          if (this.listener !== client) return;
          this.listener = undefined;
          client.release(error);
          if (!this.stopping) this.retryListen = setTimeout(() => { void connect(); }, 1_000);
        };
        client.once('error', lost);
        client.on('notification', (message) => { if (message.payload) onRoom(message.payload); });
        try {
          await client.query('LISTEN tablemate_updates');
          onRecovery();
        } catch {
          lost(new Error('Database event subscription unavailable'));
        }
      } catch {
        if (!this.stopping) this.retryListen = setTimeout(() => { void connect(); }, 1_000);
      }
    };
    void connect();
  }

  async publishOutbox(): Promise<void> {
    // Notification and completion commit in one PostgreSQL transaction. A failed statement leaves the batch pending.
    await this.pool.query(`
      WITH claimed AS (
        SELECT event_id FROM tablemate_outbox WHERE published_at IS NULL
        ORDER BY event_id LIMIT 128 FOR UPDATE SKIP LOCKED
      ), completed AS (
        UPDATE tablemate_outbox AS event SET published_at = clock_timestamp()
        FROM claimed WHERE event.event_id = claimed.event_id RETURNING event.room_id
      )
      SELECT pg_notify('tablemate_updates', room_id) FROM (SELECT DISTINCT room_id FROM completed) AS rooms
    `);
  }
  async pruneEvents(): Promise<void> {
    await this.pool.query("DELETE FROM tablemate_outbox WHERE event_id IN (SELECT event_id FROM tablemate_outbox WHERE published_at IS NOT NULL AND created_at < clock_timestamp() - interval '7 days' ORDER BY created_at LIMIT 1000)");
  }
  async healthy(): Promise<void> { await this.pool.query('SELECT 1 FROM tablemate_records LIMIT 1'); }
  async close(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.retryListen);
    this.listener?.release();
    this.listener = undefined;
    await this.pool.end();
  }
}

export function openStore(): Store {
  const connection = process.env.DATABASE_URL;
  if (connection) return new PostgresStore(connection);
  if (process.env.TABLEMATE_STORAGE === 'memory' && process.env.NODE_ENV !== 'production') {
    return new MemoryStore();
  }
  throw new Error('Configure DATABASE_URL, or use TABLEMATE_STORAGE=memory for an isolated development fixture');
}
