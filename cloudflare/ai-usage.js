import { decide } from '../server/ai-limits.ts';

export class AiUsage {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
    const sql = this.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS counters (id TEXT PRIMARY KEY, value TEXT, expiry INTEGER)');
    sql.exec('CREATE INDEX IF NOT EXISTS expired ON counters(expiry)');
    this.db = {
      read: key => JSON.parse(sql.exec('SELECT value FROM counters WHERE id=?',key).toArray()[0]?.value ?? '[]'),
      write: (key, values, expiry) => sql.exec('INSERT OR REPLACE INTO counters VALUES(?,?,?)',key,JSON.stringify(values),expiry),
    };
  }
  async fetch(request) {
    const op = await request.json(), now = Date.now();
    return Response.json(this.storage.transactionSync(() => {
      this.storage.sql.exec('DELETE FROM counters WHERE expiry<=?',now);
      return decide(this.db,this.env,op,now);
    }));
  }
}
