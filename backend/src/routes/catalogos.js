const { Router } = require('express');
const catalogoCache = require('../services/catalogoCache');
const { lecturas, escrituras } = require('../middleware/rateLimiter');

const router = Router();

router.post('/actualizar', escrituras, async (req, res) => {
  try {
    const nombres = ['Procedimientos', 'Diagnosticos', 'Medicamentos', 'Beneficiario', 'Dependencia', 'TipoExamen', 'Intrahospital'];
    const resultado = await catalogoCache.actualizarCatalogos(nombres);
    res.json({ exito: true, ...resultado });
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron actualizar los catálogos: ' + err.message });
  }
});

router.get('/:nombre/completo', lecturas, async (req, res) => {
  const { nombre } = req.params;
  let catalogo = catalogoCache.obtenerCatalogo(nombre);
  if (!catalogo || catalogo.length === 0) {
    catalogo = await catalogoCache.cargarCatalogo(nombre);
  }
  res.json({ datos: catalogo, total: catalogo.length });
});

router.get('/:nombre', lecturas, async (req, res) => {
  const { nombre } = req.params;
  const { q, limite } = req.query;

  let catalogo = catalogoCache.obtenerCatalogo(nombre);
  if (!catalogo || catalogo.length === 0) {
    catalogo = await catalogoCache.cargarCatalogo(nombre);
  }
  if (!catalogo || catalogo.length === 0) {
    return res.json({ datos: [], total: 0 });
  }

  if (q && q.trim()) {
    const max = Math.min(parseInt(limite, 10) || 5, 20);
    const resultados = catalogoCache.buscar(nombre, q.trim(), max);
    return res.json({ datos: resultados, total: resultados.length });
  }

  const max = parseInt(limite, 10) || 50;
  const datos = catalogo.slice(0, max);
  res.json({ datos, total: datos.length });
});

module.exports = router;
