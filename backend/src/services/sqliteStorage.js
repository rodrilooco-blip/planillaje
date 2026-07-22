const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '../../data/planillaje.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      hoja TEXT NOT NULL,
      batch_id TEXT,
      fila_gs INTEGER,
      datos TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now')),
      actualizado_en TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_registros_tipo_hoja ON registros(tipo, hoja);
    CREATE INDEX IF NOT EXISTS idx_registros_batch ON registros(batch_id);
    CREATE INDEX IF NOT EXISTS idx_registros_synced ON registros(synced);

    CREATE TABLE IF NOT EXISTS columnas_hojas (
      tipo TEXT NOT NULL,
      hoja TEXT NOT NULL,
      encabezados TEXT NOT NULL,
      actualizado_en TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (tipo, hoja)
    );
  `);

  return db;
}

function normalizarKey(h) {
  let n = (h || '');
  n = n.split('(')[0];
  n = n.split('.-')[0];
  n = n.split('Pegar')[0];
  n = n.split('Siempre')[0];
  n = n.split('/')[0];
  n = n.replace(/\.$/, '').trim();
  n = n.replace(/^NO\./i, 'Número');
  n = n.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/[^A-Z0-9_]/g, '');
  return n;
}

function guardarEncabezados(tipo, hoja, encabezados) {
  const d = getDb();
  d.prepare(`INSERT INTO columnas_hojas (tipo, hoja, encabezados, actualizado_en)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(tipo, hoja) DO UPDATE SET encabezados=excluded.encabezados, actualizado_en=datetime('now')`)
    .run(tipo, hoja, JSON.stringify(encabezados));
}

function obtenerEncabezados(tipo, hoja) {
  const d = getDb();
  const row = d.prepare('SELECT encabezados FROM columnas_hojas WHERE tipo=? AND hoja=?').get(tipo, hoja);
  if (!row) return null;
  try { return JSON.parse(row.encabezados); } catch { return null; }
}

function guardarRegistro(tipo, hoja, datos, batchId = null) {
  const d = getDb();
  const info = d.prepare(`INSERT INTO registros (tipo, hoja, batch_id, datos, synced)
                          VALUES (?, ?, ?, ?, 0)`)
    .run(tipo, hoja, batchId, JSON.stringify(datos));
  return { id: info.lastInsertRowid, batchId };
}

function guardarBatch(tipo, hoja, filasDatos, batchId = null) {
  const d = getDb();
  const tx = d.transaction((filas) => {
    const ids = [];
    for (const datos of filas) {
      const info = d.prepare(`INSERT INTO registros (tipo, hoja, batch_id, datos, synced)
                              VALUES (?, ?, ?, ?, 0)`)
        .run(tipo, hoja, batchId, JSON.stringify(datos));
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });
  return tx(filasDatos);
}

function obtenerRegistros(tipo, hoja, limite = 50) {
  const d = getDb();
  const rows = d.prepare(`SELECT id, batch_id, fila_gs, datos, creado_en, synced
                          FROM registros WHERE tipo=? AND hoja=?
                          ORDER BY id DESC LIMIT ?`)
    .all(tipo, hoja, limite);
  return rows.map(r => ({
    id: r.id,
    fila: r.fila_gs || r.id,
    batchId: r.batch_id,
    datos: JSON.parse(r.datos),
    creadoEn: r.creado_en,
    synced: r.synced,
  }));
}

function obtenerRegistro(tipo, hoja, id) {
  const d = getDb();
  const r = d.prepare('SELECT id, batch_id, fila_gs, datos, synced FROM registros WHERE tipo=? AND hoja=? AND id=?')
    .get(tipo, hoja, id);
  if (!r) return null;
  return {
    id: r.id,
    fila: r.fila_gs || r.id,
    batchId: r.batch_id,
    datos: JSON.parse(r.datos),
    synced: r.synced,
  };
}

function actualizarRegistro(tipo, hoja, id, datos) {
  const d = getDb();
  d.prepare(`UPDATE registros SET datos=?, actualizado_en=datetime('now'), synced=0 WHERE tipo=? AND hoja=? AND id=?`)
    .run(JSON.stringify(datos), tipo, hoja, id);
  return { id };
}

function eliminarRegistro(tipo, hoja, id) {
  const d = getDb();
  d.prepare('DELETE FROM registros WHERE tipo=? AND hoja=? AND id=?').run(tipo, hoja, id);
  return { id };
}

function obtenerPendientesSync(limite = 100) {
  const d = getDb();
  return d.prepare(`SELECT id, tipo, hoja, batch_id, datos FROM registros WHERE synced=0 ORDER BY id LIMIT ?`)
    .all(limite);
}

function contarPendientesSync() {
  const d = getDb();
  const r = d.prepare('SELECT COUNT(*) as total FROM registros WHERE synced=0').get();
  return r ? r.total : 0;
}

function marcarSynced(id, filaGs) {
  const d = getDb();
  d.prepare('UPDATE registros SET synced=1, fila_gs=? WHERE id=?').run(filaGs || null, id);
}

function upsertPorFilaGs(tipo, hoja, filaGs, datos) {
  const d = getDb();
  const exist = d.prepare('SELECT id FROM registros WHERE tipo=? AND hoja=? AND fila_gs=?').get(tipo, hoja, filaGs);
  if (exist) {
    d.prepare(`UPDATE registros SET datos=?, actualizado_en=datetime('now'), synced=1 WHERE id=?`)
      .run(JSON.stringify(datos), exist.id);
    return exist.id;
  }
  const info = d.prepare(`INSERT INTO registros (tipo, hoja, fila_gs, datos, synced)
                          VALUES (?, ?, ?, ?, 1)`)
    .run(tipo, hoja, filaGs, JSON.stringify(datos));
  return info.lastInsertRowid;
}

function contarRegistros(tipo, hoja) {
  const d = getDb();
  const r = d.prepare('SELECT COUNT(*) as total FROM registros WHERE tipo=? AND hoja=?').get(tipo, hoja);
  return r ? r.total : 0;
}

function siguienteNumeroPaciente(tipo, hoja) {
  const d = getDb();
  const rows = d.prepare(`SELECT datos FROM registros WHERE tipo=? AND hoja=?`).all(tipo, hoja);
  let max = 0;
  for (const r of rows) {
    try {
      const datos = JSON.parse(r.datos);
      const keys = Object.keys(datos);
      for (const k of keys) {
        if (k.includes('NO_PACIENTE') || k.includes('NUMERO_PACIENTE') || k === 'NO') {
          const n = parseInt(datos[k], 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
    } catch {}
  }
  return max;
}

module.exports = {
  getDb,
  normalizarKey,
  guardarEncabezados,
  obtenerEncabezados,
  guardarRegistro,
  guardarBatch,
  obtenerRegistros,
  obtenerRegistro,
  actualizarRegistro,
  eliminarRegistro,
  obtenerPendientesSync,
  marcarSynced,
  upsertPorFilaGs,
  contarRegistros,
  siguienteNumeroPaciente,
  contarPendientesSync,
};
