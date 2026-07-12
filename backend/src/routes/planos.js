const { Router } = require('express');
const sheets = require('../services/googleSheets');
const reglas = require('../services/reglasNegocio');
const config = require('../config/env');
const { lecturas, escrituras } = require('../middleware/rateLimiter');

const router = Router();

function getSpreadsheetId(tipo) {
  const t = tipo.toLowerCase();
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
  const { q } = req.query;
  if (!q || q.length < 3) return res.json({ datos: [] });

  const query = q.toUpperCase().trim();
  const emergSheetId = getSpreadsheetId('emergencia');
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
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const columnas = await sheets.getColumnasSheet(sheetId, hoja);
    const extras = reglas.obtenerColumnasAdicionales(hoja);
    res.json({ columnas, extras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const datos = await sheets.leerSheet(sheetId, `${hoja}!A:Z`);
    if (datos.length === 0) return res.json({ encabezados: [], registros: [] });

    const encabezados = datos[0];
    const registros = datos.slice(1).map((fila, idx) => ({
      fila: idx + 2,
      datos: mapearFilaAObjeto(encabezados, fila),
    }));

    registros.reverse();
    res.json({ encabezados, registros, total: registros.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja/next-numero', lecturas, async (req, res) => {
  const { tipo, hoja } = req.params;
  const sheetId = getSpreadsheetId(tipo);
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
  const sheetId = getSpreadsheetId(tipo);
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
    const encabezados = await sheets.leerEncabezados(sheetId, hoja);

    const filaValores = encabezados.map(h => {
      const hl = normalizarKey(h);
      if (dataCompleta[hl]) return dataCompleta[hl];
      return Object.keys(dataCompleta).find(k => hl.includes(k) || k.includes(hl))
        ? dataCompleta[Object.keys(dataCompleta).find(k => hl.includes(k) || k.includes(hl))]
        : '';
    });

    const ultimoNumero = await sheets.getUltimoNumeroPaciente(sheetId, hoja);
    const colNoPaciente = encabezados.findIndex(h => {
      const r = (h || '').toUpperCase();
      return r.includes('NO. PACIENTE') || r.includes('NO PACIENTE') || r.startsWith('NO.');
    });
    if (colNoPaciente >= 0 && !filaValores[colNoPaciente]) {
      filaValores[colNoPaciente] = String(ultimoNumero + 1);
    }

    await sheets.agregarFila(sheetId, `${hoja}!A:Z`, filaValores);
    res.json({ exito: true, mensaje: 'Registro guardado', fila: ultimoNumero + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:tipo/:hoja/:fila', escrituras, async (req, res) => {
  const { tipo, hoja, fila } = req.params;
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const dataCompleta = reglas.aplicarReglasFijas(hoja, { ...req.body });
    const encabezados = await sheets.leerEncabezados(sheetId, hoja);

    const filaValores = encabezados.map(h => {
      const hl = normalizarKey(h);
      return dataCompleta[hl] || Object.keys(dataCompleta).find(k => hl.includes(k) || k.includes(hl))
        ? dataCompleta[Object.keys(dataCompleta).find(k => hl.includes(k) || k.includes(hl))] : '';
    });

    await sheets.actualizarFila(sheetId, hoja, parseInt(fila, 10), filaValores);
    res.json({ exito: true, mensaje: 'Registro actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:tipo/:hoja/:fila', escrituras, async (req, res) => {
  const { tipo, hoja, fila } = req.params;
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const gSheetId = await sheets.getSheetId(sheetId, hoja);
    if (gSheetId === null || gSheetId === undefined) {
      return res.status(404).json({ error: 'Hoja no encontrada' });
    }

    const client = await sheets.getSheetsClient();
    await client.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: gSheetId,
              dimension: 'ROWS',
              startIndex: parseInt(fila, 10) - 1,
              endIndex: parseInt(fila, 10),
            },
          },
        }],
      },
    });

    res.json({ exito: true, mensaje: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:tipo/:hoja/:fila', lecturas, async (req, res) => {
  const { tipo, hoja, fila } = req.params;
  const sheetId = getSpreadsheetId(tipo);
  if (!sheetId) return res.status(400).json({ error: 'Tipo inv\u00e1lido' });

  try {
    const encabezados = await sheets.leerEncabezados(sheetId, hoja);
    const filaDatos = await sheets.leerFila(sheetId, hoja, parseInt(fila, 10));
    const obj = mapearFilaAObjeto(encabezados, filaDatos);
    res.json({ fila: parseInt(fila, 10), datos: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
