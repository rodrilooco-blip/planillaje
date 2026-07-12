const fs = require('fs');
const path = require('path');
const sheets = require('./googleSheets');
const config = require('../config/env');

const cache = new Map();
const loading = new Map();
const CACHE_DIR = path.resolve(__dirname, '../../cache');
let lastUpdated = null;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(nombre) {
  return path.join(CACHE_DIR, `${nombre.toLowerCase()}.json`);
}

function cargarDeArchivo(nombre) {
  const file = cachePath(nombre);
  if (fs.existsSync(file)) {
    try {
      const datos = JSON.parse(fs.readFileSync(file, 'utf8'));
      const key = nombre.toLowerCase();
      cache.set(key, datos);
      console.log(`Cache "${nombre}": ${datos.length} registros (desde archivo)`);
      return datos;
    } catch (e) {
      console.warn(`Error leyendo cache de "${nombre}":`, e.message);
    }
  }
  return null;
}

function guardarEnArchivo(nombre, datos) {
  try {
    fs.writeFileSync(cachePath(nombre), JSON.stringify(datos), 'utf8');
  } catch (e) {
    console.warn(`Error guardando cache de "${nombre}":`, e.message);
  }
}

async function cargarCatalogo(nombre) {
  const key = nombre.toLowerCase();

  const desdeArchivo = cargarDeArchivo(nombre);
  if (desdeArchivo) return desdeArchivo;

  if (loading.has(key)) return loading.get(key);

  const promise = (async () => {
    try {
      const filas = await sheets.leerSheet(config.sheets.catalogos, `${nombre}!A:Z`);
      if (filas.length < 2) {
        cache.set(key, []);
        return [];
      }

      const encabezados = filas[0].map(h => (h || '').toLowerCase());
      const datos = filas.slice(1).map(fila => {
        const obj = {};
        encabezados.forEach((h, i) => { obj[h] = fila[i] || ''; });
        return obj;
      });

      cache.set(key, datos);
      guardarEnArchivo(nombre, datos);
      console.log(`Catálogo "${nombre}": ${datos.length} registros (desde Google Sheets)`);
      return datos;
    } catch (err) {
      cache.set(key, []);
      return [];
    }
  })();

  loading.set(key, promise);
  const result = await promise;
  loading.delete(key);
  lastUpdated = new Date();
  return result;
}

function buscar(nombreCatalogo, query, limite = 5) {
  const key = nombreCatalogo.toLowerCase();
  const datos = cache.get(key);
  if (!datos || !query) return [];

  const q = query.toLowerCase();
  const resultados = [];

  for (let i = 0; i < datos.length; i++) {
    if (resultados.length >= limite) break;
    const item = datos[i];
    const codigo = (item.codigo || item.cod || item.código || '').toLowerCase();
    const descripcion = (item.descripcion || item.descripción || item.nombre || item.desc || '').toLowerCase();
    if (codigo.includes(q) || descripcion.includes(q)) {
      resultados.push(item);
    }
  }
  return resultados;
}

function obtenerCatalogo(nombreCatalogo) {
  return cache.get(nombreCatalogo.toLowerCase()) || [];
}

function getLastUpdated() {
  return lastUpdated;
}

module.exports = {
  cargarCatalogo,
  buscar,
  obtenerCatalogo,
  getLastUpdated,
};
