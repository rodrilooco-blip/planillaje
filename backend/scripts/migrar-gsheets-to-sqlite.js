/**
 * Script de migración: Google Sheets → SQLite
 * Uso: npm run migrar
 * Lee todas las hojas de EMERGENCIA y HOSPITALIZACION desde Google Sheets
 * y las guarda en la base de datos SQLite local.
 */
const sheets = require('../src/services/googleSheets');
const storage = require('../src/services/sqliteStorage');
const config = require('../src/config/env');

function getSpreadsheetId(tipo) {
  const t = tipo.toLowerCase();
  if (t === 'hospitalizacion') return config.sheets.hospitalizacion;
  if (t === 'emergencia') return config.sheets.emergencia;
  return null;
}

async function migrarHoja(tipo, hoja) {
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) {
    console.warn(`  [SKIP] Sin spreadsheetId para tipo ${tipo}`);
    return 0;
  }
  try {
    const datos = await sheets.leerSheet(sheetId, `${hoja}!A:ZZZ`);
    if (!datos || datos.length <= 1) {
      console.log(`  [SKIP] Hoja ${hoja} vacía`);
      storage.guardarEncabezados(tipo, hoja, datos && datos[0] ? datos[0] : []);
      return 0;
    }
    const encabezados = datos[0];
    storage.guardarEncabezados(tipo, hoja, encabezados);
    let count = 0;
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const obj = {};
      encabezados.forEach((h, idx) => { obj[storage.normalizarKey(h)] = fila[idx] || ''; });
      storage.upsertPorFilaGs(tipo, hoja, i + 1, obj);
      count++;
    }
    console.log(`  [OK] ${hoja}: ${count} registros migrados`);
    return count;
  } catch (err) {
    console.error(`  [ERR] ${hoja}:`, err.message);
    return 0;
  }
}

async function main() {
  console.log('=== Migración Google Sheets → SQLite ===');
  console.log('');

  let total = 0;
  console.log('Migrando EMERGENCIA...');
  for (const hoja of config.hojas.emergencia) {
    total += await migrarHoja('emergencia', hoja);
  }
  console.log('Migrando HOSPITALIZACIÓN...');
  for (const hoja of config.hojas.hospitalizacion) {
    total += await migrarHoja('hospitalizacion', hoja);
  }

  console.log('');
  console.log(`=== Migración completada: ${total} registros ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
