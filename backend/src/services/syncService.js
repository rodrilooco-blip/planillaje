const sheets = require('./googleSheets');
const storage = require('./sqliteStorage');
const config = require('../config/env');
const driveManager = require('./driveManager');
const mesesUtils = require('../config/meses');

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

// Solo para reparación manual — Google Sheets es primario ahora
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
    if (pendientes.length > 0) console.log(`[SYNC] ${pendientes.length} registros sincronizados a Google Sheets`);
  } finally {
    syncing = false;
  }
}

async function pullHoja(tipo, hoja) {
  try {
    const sheetId = getSpreadsheetId(tipo);
    if (!sheetId) return 0;
    return await pullHojaPorSheetId(tipo, hoja, sheetId);
  } catch (err) {
    console.error(`[SYNC] Error pull ${tipo}/${hoja}:`, err.message);
    return 0;
  }
}

async function pullHojaPorSheetId(tipo, hoja, sheetId) {
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
}

async function pullTodo() {
  let total = 0;
  const meses = storage.obtenerTodosMeses();
  if (meses.length === 0) return 0;
  for (const mes of meses) {
    for (const tipo of ['emergencia', 'hospitalizacion']) {
      for (const hoja of config.hojas[tipo]) {
        total += await pullHojaMes(tipo, hoja, mes.codigo);
      }
    }
  }
  return total;
}

async function pullHojaMes(tipo, hoja, codigoMes) {
  try {
    const sheetId = getSpreadsheetId(tipo, codigoMes);
    if (!sheetId) return 0;
    return await pullHojaPorSheetId(tipo, hoja, sheetId);
  } catch (err) {
    console.error(`[SYNC] Error pull ${tipo}/${hoja} (mes ${codigoMes}):`, err.message);
    return 0;
  }
}

// Descubre meses existentes en Drive y los upsert ea SQLite.
// Siempre corre: detecta meses nuevos sin borrar los ya conocidos.
async function descubrirMesesDrive() {
  const archivos = await driveManager.listarArchivosSADrive();
  const carpetas = archivos.filter(f =>
    f.mimeType === 'application/vnd.google-apps.folder' &&
    f.parents && f.parents.includes(config.googleDriveFolderId)
  );
  console.log('[DISCOVER] Encontradas ' + carpetas.length + ' carpetas en Drive');
  const nombresMeses = mesesUtils.nombresMeses();
  let descubiertos = 0;
  for (const carp of carpetas) {
    const normalizado = carp.name.trim().toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const match = normalizado.match(/^(\d{2,4})[_\-\s]+([A-Z]+)$/);
    if (!match) continue;
    let anio = parseInt(match[1], 10);
    if (anio < 100) anio += 2000;
    const mesNombre = match[2];
    const mesNum = nombresMeses.findIndex(n => n.toUpperCase() === mesNombre) + 1;
    if (mesNum <= 0) {
      console.log('[DISCOVER] Carpeta ignorada (mes no reconocido): ' + carp.name);
      continue;
    }
    const codigo = mesesUtils.generarCodigo(anio, mesNum);

    let hospSheetId = '', emergSheetId = '';
    try {
      const hijos = await driveManager.listarArchivosEnCarpeta(carp.id);
      for (const h of hijos) {
        if (h.mimeType !== 'application/vnd.google-apps.spreadsheet') continue;
        const nameUp = h.name.toUpperCase();
        if (nameUp.includes('HOSPITALIZACION') || nameUp.includes('HOSP')) hospSheetId = h.id;
        else if (nameUp.includes('EMERGENCIA') || nameUp.includes('EMERG')) emergSheetId = h.id;
      }
    } catch (e) { /* ignore */ }

    const existente = storage.obtenerMes(codigo);
    storage.guardarMes({
      codigo, nombre: carp.name, anio, mes: mesNum,
      carpetaId: carp.id,
      hosp_sheet_id: hospSheetId || (existente && existente.hosp_sheet_id) || null,
      emerg_sheet_id: emergSheetId || (existente && existente.emerg_sheet_id) || null,
    });
    console.log('[DISCOVER] Mes registrado: ' + codigo + ' ' + carp.name +
      ' hosp=' + (hospSheetId || (existente && existente.hosp_sheet_id) || 'N/A') +
      ' emerg=' + (emergSheetId || (existente && existente.emerg_sheet_id) || 'N/A'));
    descubiertos++;
  }
  return descubiertos;
}

// Warm cache al inicio: carga todos los datos de Google Sheets a SQLite
async function warmCache() {
  if (syncing) return;
  syncing = true;
  try {
    console.log('[CACHE] Cargando datos desde Google Sheets...');

    // Siempre redescubrir meses desde Drive (detecta los creados manualmente)
    try {
      await descubrirMesesDrive();
    } catch (e) {
      console.warn('[CACHE] Error descubriendo meses desde Drive:', e.message);
    }

    const meses = storage.obtenerTodosMeses();

    let total = 0;
    for (const mes of meses) {
      for (const tipo of ['hospitalizacion', 'emergencia']) {
        const sheetId = tipo === 'hospitalizacion' ? mes.hosp_sheet_id : mes.emerg_sheet_id;
        if (!sheetId) continue;
        for (const hoja of (tipo === 'hospitalizacion' ? config.hojas.hospitalizacion : config.hojas.emergencia)) {
          try {
            const datos = await sheets.leerSheet(sheetId, `${hoja}!A:ZZZ`);
            if (datos.length <= 1) continue;
            const encabezados = datos[0];
            storage.guardarEncabezados(tipo, hoja, encabezados);
            for (let i = 1; i < datos.length; i++) {
              const obj = {};
              encabezados.forEach((h, idx) => {
                obj[storage.normalizarKey(h)] = datos[i][idx] || '';
              });
              storage.upsertPorFilaGs(tipo, hoja, i + 1, obj);
              total++;
            }
          } catch (e) { /* hoja puede no existir aun */ }
        }
      }
    }
    console.log(`[CACHE] Cache calentado: ${total} registros cargados desde Sheets`);
  } finally {
    syncing = false;
  }
}

let intervalId = null;

function iniciarCacheRefresh(intervaloMs = 300000) {
  if (intervalId) return;
  intervalId = setInterval(() => {
    pullTodo().catch(err => console.error('[CACHE] Error refresh:', err.message));
  }, intervaloMs);
  console.log(`[CACHE] Refresco automático cada ${intervaloMs / 1000}s`);
}

function contarPendientes() {
  return storage.contarPendientesSync();
}

module.exports = {
  pushPendientes,
  pullHoja,
  pullTodo,
  warmCache,
  iniciarCacheRefresh,
  contarPendientes,
  descubrirMesesDrive,
};
