const sheets = require('./googleSheets');
const storage = require('./sqliteStorage');
const config = require('../config/env');

let syncing = false;

function getSpreadsheetId(tipo) {
  const t = tipo.toLowerCase();
  const mes = storage.obtenerMesMasReciente();
  if (mes) {
    return t === 'hospitalizacion' ? mes.hosp_sheet_id : mes.emerg_sheet_id;
  }
  if (t === 'hospitalizacion') return config.sheets.hospitalizacion;
  if (t === 'emergencia') return config.sheets.emergencia;
  return null;
}

async function pushPendientes() {
  if (syncing) return;
  syncing = true;
  try {
    const pendientes = storage.obtenerPendientesSync(50);
    if (pendientes.length === 0) return;

    for (const reg of pendientes) {
      try {
        const sheetId = getSpreadsheetId(reg.tipo);
        if (!sheetId) continue;

        const encabezados = await sheets.leerEncabezados(sheetId, reg.hoja);
        const datos = JSON.parse(reg.datos);

        const filaValores = encabezados.map(h => {
          const hl = storage.normalizarKey(h);
          if (datos[hl]) return datos[hl];
          const matchKey = Object.keys(datos).find(k => hl.includes(k) || k.includes(hl));
          return matchKey ? datos[matchKey] : '';
        });

        const filaNum = await sheets.getUltimoNumeroPaciente(sheetId, reg.hoja);
        const colNoPaciente = encabezados.findIndex(h => {
          const r = (h || '').toUpperCase();
          return r.includes('NO. PACIENTE') || r.includes('NO PACIENTE') || r.startsWith('NO.');
        });
        if (colNoPaciente >= 0 && !filaValores[colNoPaciente]) {
          filaValores[colNoPaciente] = String(filaNum + 1);
        }

        await sheets.agregarFila(sheetId, `${reg.hoja}!A:Z`, filaValores);
        storage.marcarSynced(reg.id, filaNum + 1);
      } catch (err) {
        console.error(`[SYNC] Error push registro ${reg.id}:`, err.message);
      }
    }
    if (pendientes.length > 0) console.log(`[SYNC] ${pendientes.length} registross sincronizados a Google Sheets`);
  } finally {
    syncing = false;
  }
}

async function pullHoja(tipo, hoja) {
  try {
    const sheetId = getSpreadsheetId(tipo);
    if (!sheetId) return 0;

    const datos = await sheets.leerSheet(sheetId, `${hoja}!A:ZZZ`);
    if (datos.length <= 1) return 0;

    const encabezados = datos[0];
    storage.guardarEncabezados(tipo, hoja, encabezados);

    let count = 0;
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const obj = {};
      encabezados.forEach((h, idx) => {
        obj[storage.normalizarKey(h)] = fila[idx] || '';
      });
      storage.upsertPorFilaGs(tipo, hoja, i + 1, obj);
      count++;
    }
    return count;
  } catch (err) {
    console.error(`[SYNC] Error pull ${tipo}/${hoja}:`, err.message);
    return 0;
  }
}

async function pullTodo() {
  let total = 0;
  for (const hoja of config.hojas.emergencia) {
    total += await pullHoja('emergencia', hoja);
  }
  for (const hoja of config.hojas.hospitalizacion) {
    total += await pullHoja('hospitalizacion', hoja);
  }
  return total;
}

let intervalId = null;

function iniciarSyncAutomatico(intervaloMs = 60000) {
  if (intervalId) return;
  intervalId = setInterval(() => {
    pushPendientes().catch(err => console.error('[SYNC] Error auto-push:', err.message));
  }, intervaloMs);
  console.log(`[SYNC] Sincronización automática activa cada ${intervaloMs / 1000}s`);
}

function detenerSyncAutomatico() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function contarPendientes() {
  return storage.contarPendientesSync();
}

module.exports = {
  pushPendientes,
  pullHoja,
  pullTodo,
  iniciarSyncAutomatico,
  detenerSyncAutomatico,
  contarPendientes,
};
