const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./src/config/env');
const { lecturas } = require('./src/middleware/rateLimiter');
const catalogoCache = require('./src/services/catalogoCache');
const catalogosRouter = require('./src/routes/catalogos');
const planosRouter = require('./src/routes/planos');
const syncService = require('./src/services/syncService');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, '../frontend')));

app.get('/api/health', lecturas, (req, res) => {
  res.json({
    estado: 'ok',
    catalogoActualizado: catalogoCache.getLastUpdated(),
    version: '2.0.0',
  });
});

app.get('/api/hojas', (req, res) => {
  res.json({
    hospitalizacion: config.hojas.hospitalizacion,
    emergencia: config.hojas.emergencia,
  });
});

app.use('/api/catalogos', catalogosRouter);
app.use('/api/planos', planosRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function preCargarCatalogos() {
  const nombres = config.hojas.catalogos;
  console.log(`Precargando ${nombres.length} cat\u00e1logos...`);
  for (const nombre of nombres) {
    try {
      const datos = await catalogoCache.cargarCatalogo(nombre);
      console.log(`  [OK] ${nombre}: ${datos.length} registros`);
    } catch (err) {
      console.warn(`  [ERR] ${nombre}: ${err.message}`);
    }
  }
  console.log('Precarga de cat\u00e1logos completada');
}

app.listen(config.port, async () => {
  console.log(`Servidor iniciado en puerto ${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
  await preCargarCatalogos();
  // Google Sheets es primario — cargar cache al inicio
  try {
    await syncService.warmCache();
  } catch (e) {
    console.warn('[CACHE] Error en warm cache inicial:', e.message);
  }
  syncService.iniciarCacheRefresh(300000); // refrescar cache cada 5 min
});
