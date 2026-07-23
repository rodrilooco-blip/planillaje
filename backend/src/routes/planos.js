const { Router } = require('express');
const sheets = require('../services/googleSheets');
const reglas = require('../services/reglasNegocio');
const config = require('../config/env');
const { lecturas, escrituras } = require('../middleware/rateLimiter');
const storage = require('../services/sqliteStorage');
const syncService = require('../services/syncService');
const driveManager = require('../services/driveManager');
const mesesUtils = require('../config/meses');
const XLSX = require('xlsx');
const crypto = require('crypto');

const router = Router();

function getSpreadsheetId(tipo, codigo) {
  const t = tipo.toLowerCase();
  if (codigo) {
    const mes = storage.obtenerMes(codigo);
    if (mes) return t === 'hospitalizacion' ? mes.hosp_sheet_id : mes.emerg_sheet_id;
  }
  const mes = storage.obtenerMesMasReciente();
  if (mes) return t === 'hospitalizacion' ? mes.hosp_sheet_id : mes.emerg_sheet_id;
  if (t === 'hospitalizacion') return config.sheets.hospitalizacion;
  if (t === 'emergencia') return config.sheets.emergencia;
  return null;
}

function validarHoja(tipo, hoja) {
  const t = tipo.toLowerCase();
  const lista = t === 'hospitalizacion' ? config.hojas.hospitalizacion : config.hojas.emergencia;
  return lista.includes(hoja);
}

function normalizarKey(h) {
  let n = (h || '');
  n = n.split('(')[0];
  n = n.split('.-')[0];
  n = n.split('Pegar')[0];
  n = n.split('Siempre')[0];
  n = n.split('/')[0];
  n = n.replace(/\.$/, '').trim();
  n = n.replace(/^NO\./i, 'N\u00famero');
  n = n.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/[^A-Z0-9_]/g, '');
  return n;
}

function mapearFilaAObjeto(encabezados, fila) {
  const obj = {};
  encabezados.forEach((h, i) => {
    obj[normalizarKey(h)] = fila[i] || '';
  });
  return obj;
}

router.get('/buscar-pacientes', lecturas, async (req, res) => {
  const { q, mes } = req.query;
  if (!q || q.length < 3) return res.json({ datos: [] });

  const query = q.toUpperCase().trim();
  const emergSheetId = getSpreadsheetId('emergencia', mes);
  if (!emergSheetId) return res.status(400).json({ error: 'Emergencia no configurada' });

  const hojas = config.hojas.emergencia;
  const resultados = [];
  const max = 20;

  try {
    for (const sheetHoja of hojas) {
      if (resultados.length >= max) break;
      const encabezados = await sheets.leerEncabezados(emergSheetId, sheetHoja);
      if (encabezados.length === 0) continue;

      const idIdx = encabezados.findIndex(h => {
        const k = normalizarKey(h);
        return k.includes('IDENTIFICACION') && k.includes('BENEFICIARIO');
      });
      const apeIdx = encabezados.findIndex(h => {
        const k = normalizarKey(h);
        return k.includes('APELLIDOS') && k.includes('BENEFICIARIO');
      });
      if (idIdx === -1 && apeIdx === -1) continue;

      const filas = await sheets.leerSheet(emergSheetId, `${sheetHoja}!A:ZZZ`);
      for (let i = 1; i < filas.length; i++) {
        if (resultados.length >= max) break;
        const fila = filas[i];
        const idVal = idIdx >= 0 ? (fila[idIdx] || '').toUpperCase() : '';
        const apeVal = apeIdx >= 0 ? (fila[apeIdx] || '').toUpperCase() : '';
        if (idVal.includes(query) || apeVal.includes(query)) {
          const obj = {};
          encabezados.forEach((h, idx) => { obj[normalizarKey(h)] = fila[idx] || ''; });
          resultados.push({ hoja: sheetHoja, datos: obj });
        }
      }
    }
    res.json({ datos: resultados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja/columnas', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    let encabezados = storage.obtenerEncabezados(tipo, hoja);
    if (!encabezados) {
      encabezados = await sheets.leerEncabezados(sheetId, hoja);
      if (encabezados && encabezados.length) storage.guardarEncabezados(tipo, hoja, encabezados);
    }
    const columnas = encabezados.map((nombre, i) => ({ index: i, nombre: nombre || '', tipo: 'texto' }));
    const extras = reglas.obtenerColumnasAdicionales(hoja);
    res.json({ columnas, extras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== SYNC: estado de la sincronizaci\u00f3n ======
router.get('/sync/status', lecturas, async (req, res) => {
  try {
    const pendientes = syncService.contarPendientes();
    res.json({ pendientes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== SYNC: forzar push a Google Sheets ======
router.post('/sync/push', escrituras, async (req, res) => {
  try {
    await syncService.pushPendientes();
    const restantes = syncService.contarPendientes();
    res.json({ exito: true, mensaje: 'Sincronizaci\u00f3n completada', restantes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== SYNC: pull desde Google Sheets a SQLite ======
router.post('/sync/pull', lecturas, async (req, res) => {
  try {
    const { tipo, hoja } = req.body;
    if (tipo && hoja) {
      const count = await syncService.pullHoja(tipo, hoja);
      return res.json({ exito: true, mensaje: `${count} registros sincronizados desde Google Sheets para ${hoja}` });
    }
    const total = await syncService.pullTodo();
    res.json({ exito: true, mensaje: `${total} registros sincronizados desde Google Sheets` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== GESTI\u00d3N DE MESES ======
router.get('/meses', lecturas, async (req, res) => {
  const lista = storage.obtenerTodosMeses();
  res.json({ meses: lista });
});

router.get('/meses/diagnostico', lecturas, async (req, res) => {
  await driveManager.getServiceAccountEmail();
  let archivosSADrive = [];
  try {
    archivosSADrive = await driveManager.listarArchivosSADrive();
  } catch (e) { /* ignore */ }
  res.json({
    serviceAccountEmail: driveManager.getServiceAccountEmail(),
    googleDriveFolderId: config.googleDriveFolderId,
    tieneCredenciales: !!config.sheets.hospitalizacion,
    archivosSADriveRaiz: archivosSADrive,
  });
});

router.post('/meses/enlazar', escrituras, async (req, res) => {
  const { anio, mes, carpetaId, hospSheetId, emergSheetId } = req.body;
  if (!anio || !mes) return res.status(400).json({ error: 'anio y mes requeridos' });

  try {
    const codigo = mesesUtils.generarCodigo(parseInt(anio, 10), parseInt(mes, 10));
    const nombreCarpeta = mesesUtils.generarNombreCarpeta(parseInt(anio, 10), parseInt(mes, 10));
    // Preservar carpetaId existente si no se envió
    const existente = storage.obtenerMes(codigo);
    const result = {
      codigo,
      nombre: nombreCarpeta,
      anio: parseInt(anio, 10),
      mes: parseInt(mes, 10),
      carpetaId: carpetaId || (existente && existente.carpetaId) || '',
      hosp_sheet_id: hospSheetId || '',
      emerg_sheet_id: emergSheetId || '',
    };
    storage.guardarMes(result);
    res.json({ exito: true, mes: result });
  } catch (err) {
    res.status(500).json({ error: 'Error enlazando mes: ' + err.message });
  }
});

router.post('/meses/limpiar-sa-drive', escrituras, async (req, res) => {
  try {
    const todo = req.body && req.body.todo === true;
    const result = await driveManager.limpiarSADrive(null, todo);
    res.json({ exito: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Error limpiando SA Drive: ' + err.message });
  }
});

router.post('/meses/crear', escrituras, async (req, res) => {
  const { anio, mes } = req.body;
  if (!anio || !mes) return res.status(400).json({ error: 'anio y mes requeridos' });
  if (mes < 1 || mes > 12) return res.status(400).json({ error: 'Mes inv\u00e1lido (1-12)' });

  try {
    const codigoPrevio = mesesUtils.generarCodigo(parseInt(anio, 10), parseInt(mes, 10));
    const preExistia = !!storage.obtenerMes(codigoPrevio);
    const result = await driveManager.crearMes(parseInt(anio, 10), parseInt(mes, 10));
    res.json({ exito: true, mes: result, yaExistia: preExistia });
  } catch (err) {
    await driveManager.getServiceAccountEmail();
    const saEmail = driveManager.getServiceAccountEmail();
    res.status(500).json({
      error: 'Error al crear mes: ' + err.message,
      serviceAccountEmail: saEmail,
      googleDriveFolderId: config.googleDriveFolderId,
      ayuda: 'Comparte la carpeta de Google Drive con el email: ' + saEmail,
    });
  }
});

router.get('/mes/actual', lecturas, async (req, res) => {
  const mes = storage.obtenerMesMasReciente();
  res.json({ mes });
});

router.get('/:tipo/:hoja', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    // Intentar leer desde SQLite primero (instantáneo)
    let encabezados = storage.obtenerEncabezados(tipo, hoja);
    const registrosLocal = storage.obtenerRegistros(tipo, hoja, 100000);

    if (encabezados && registrosLocal.length > 0) {
      return res.json({
        encabezados,
        registros: registrosLocal.map(r => ({
          fila: r.fila,
          datos: r.datos,
          batchId: r.batchId,
          synced: r.synced,
        })),
        total: registrosLocal.length,
        source: 'sqlite',
      });
    }

    // Fallback a Google Sheets
    const datos = await sheets.leerSheet(sheetId, `${hoja}!A:Z`);
    if (datos.length === 0) return res.json({ encabezados: [], registros: [] });

    encabezados = datos[0];
    storage.guardarEncabezados(tipo, hoja, encabezados);

    const registros = datos.slice(1).map((fila, idx) => {
      const obj = mapearFilaAObjeto(encabezados, fila);
      storage.upsertPorFilaGs(tipo, hoja, idx + 2, obj);
      return { fila: idx + 2, datos: obj };
    });

    registros.reverse();
    res.json({ encabezados, registros, total: registros.length, source: 'google-sheets' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja/next-numero', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const ultimo = await sheets.getUltimoNumeroPaciente(sheetId, hoja);
    res.json({ siguiente: ultimo + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:tipo/:hoja', escrituras, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });
  if (!validarHoja(tipo, hoja)) {
    return res.status(400).json({ error: `Hoja "${hoja}" no v\u00e1lida` });
  }

  try {
    const errores = reglas.validarData(req.body);
    if (errores.length > 0) {
      return res.status(400).json({ error: 'Datos inv\u00e1lidos', detalles: errores });
    }

    const dataCompleta = reglas.aplicarReglasFijas(hoja, { ...req.body });

    // Guardar en SQLite (instantáneo)
    const guardado = storage.guardarRegistro(tipo, hoja, dataCompleta);

    // Sincronizar con Google Sheets en background
    syncService.pushPendientes().catch(err => console.error('[SYNC] Error push:', err.message));

    res.json({ exito: true, mensaje: 'Registro guardado', id: guardado.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:tipo/:hoja/:fila', escrituras, async (req, res) => {
  const { tipo, hoja, fila } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const dataCompleta = reglas.aplicarReglasFijas(hoja, { ...req.body });
    const id = parseInt(fila, 10);
    storage.actualizarRegistro(tipo, hoja, id, dataCompleta);
    syncService.pushPendientes().catch(err => console.error('[SYNC] Error push update:', err.message));
    res.json({ exito: true, mensaje: 'Registro actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:tipo/:hoja/:fila', escrituras, async (req, res) => {
  const { tipo, hoja, fila } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const id = parseInt(fila, 10);
    storage.eliminarRegistro(tipo, hoja, id);
    res.json({ exito: true, mensaje: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja/:fila', lecturas, async (req, res, next) => {
  const { tipo, hoja, fila } = req.params;
  const { mes } = req.query;
  // Si fila no es numérico, probar con la siguiente ruta coincidente (exportar-excel etc.)
  if (!/^\d+$/.test(fila)) return next();

  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inválido' });

  try {
    const id = parseInt(fila, 10);
    const reg = storage.obtenerRegistro(tipo, hoja, id);
    if (reg) return res.json({ fila: id, datos: reg.datos });

    const encabezados = await sheets.leerEncabezados(sheetId, hoja);
    const filaDatos = await sheets.leerFila(sheetId, hoja, parseInt(fila, 10));
    const obj = mapearFilaAObjeto(encabezados, filaDatos);
    res.json({ fila: parseInt(fila, 10), datos: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== BATCH: guardar múltiples filas (1 paciente, N insumos) ======
router.post('/:tipo/:hoja/guardar-batch', escrituras, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  const sheetId = getSpreadsheetId(tipo, mes);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });
  if (!validarHoja(tipo, hoja)) return res.status(400).json({ error: `Hoja "${hoja}" no v\u00e1lida` });

  const { datosPaciente, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos 1 item' });
  }
  if (!datosPaciente || typeof datosPaciente !== 'object') {
    return res.status(400).json({ error: 'datosPaciente requerido' });
  }

  try {
    const errores = reglas.validarData(datosPaciente);
    if (errores.length > 0) return res.status(400).json({ error: 'Datos inv\u00e1lidos', detalles: errores });

    let encabezados = storage.obtenerEncabezados(tipo, hoja);
    if (!encabezados) {
      encabezados = await sheets.leerEncabezados(sheetId, hoja);
      storage.guardarEncabezados(tipo, hoja, encabezados);
    }

    const ultimoNumero = storage.siguienteNumeroPaciente(tipo, hoja);
    const batchId = crypto.randomUUID();

    const filasParaGuardar = items.map((item, idx) => {
      const merged = { ...datosPaciente, ...item };
      return reglas.aplicarReglasFijas(hoja, merged);
    });

    const colNoPaciente = encabezados.findIndex(h => {
      const r = (h || '').toUpperCase();
      return r.includes('NO. PACIENTE') || r.includes('NO PACIENTE') || r.startsWith('NO.');
    });

    if (colNoPaciente >= 0) {
      const numAsignado = String(ultimoNumero + 1);
      filasParaGuardar.forEach(d => {
        const keys = Object.keys(d);
        const noKey = keys.find(k => k.includes('NO_PACIENTE') || k.includes('NUMERO_PACIENTE'));
        if (noKey && !d[noKey]) d[noKey] = numAsignado;
      });
    }

    const ids = storage.guardarBatch(tipo, hoja, filasParaGuardar, batchId);

    // Sincronizar con Google Sheets en background
    syncService.pushPendientes().catch(err => console.error('[BATCH] Sync error:', err.message));

    res.json({
      exito: true,
      mensaje: `${items.length} registro(s) guardado(s)`,
      batchId,
      ids,
      proximoNumero: ultimoNumero + items.length + 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== EXPORTAR A EXCEL ======
router.get('/:tipo/:hoja/exportar-excel', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const { mes } = req.query;
  if (!validarHoja(tipo, hoja)) return res.status(400).json({ error: `Hoja "${hoja}" no v\u00e1lida` });

  try {
    let encabezados = storage.obtenerEncabezados(tipo, hoja);
    if (!encabezados) {
      const sheetId = getSpreadsheetId(tipo, mes);
      if (sheetId) {
        encabezados = await sheets.leerEncabezados(sheetId, hoja);
        if (encabezados && encabezados.length) storage.guardarEncabezados(tipo, hoja, encabezados);
      }
    }

    const registros = storage.obtenerRegistros(tipo, hoja, 100000);
    const datos = registros.map(r => r.datos);

    const wb = XLSX.utils.book_new();
    let ws;
    if (encabezados && encabezados.length) {
      const rows = [encabezados.map(h => normalizarKey(h))];
      for (const d of datos) {
        const row = rows[0].map(k => {
          if (d[k]) return d[k];
          const mk = Object.keys(d).find(dk => dk.includes(k) || k.includes(dk));
          return mk ? d[mk] : '';
        });
        rows.push(row);
      }
      ws = XLSX.utils.aoa_to_sheet(rows);
    } else {
      ws = XLSX.utils.json_to_sheet(datos);
    }
    XLSX.utils.book_append_sheet(wb, ws, hoja.substring(0, 30));

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nombre = `${hoja}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
