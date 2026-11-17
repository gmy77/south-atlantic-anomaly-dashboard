// D1 finto sopra node:sqlite, solo per le prove locali (test.mjs, dev.mjs).
// Implementa la parte dell'API D1 usata dal Worker: prepare/bind/first/all/
// raw/run e batch.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function createD1(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8"));

  class Stmt {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Stmt(this.sql, args);
    }
    _s() {
      return db.prepare(this.sql);
    }
    async first(col) {
      const r = this._s().get(...this.args) ?? null;
      return r && col ? r[col] : r ? { ...r } : null;
    }
    async all() {
      return { success: true, results: this._s().all(...this.args).map((r) => ({ ...r })) };
    }
    async raw() {
      const s = this._s();
      s.setReturnArrays(true);
      return s.all(...this.args);
    }
    async run() {
      const r = this._s().run(...this.args);
      return { success: true, meta: { changes: r.changes } };
    }
    _exec() {
      const s = this._s();
      if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { success: true, results: s.all(...this.args).map((r) => ({ ...r })) };
      s.run(...this.args);
      return { success: true, results: [] };
    }
  }

  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s._exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
