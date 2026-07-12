require('dotenv').config();

const required = [
  'PORT',
  'GOOGLE_SERVICE_ACCOUNT_PATH',
  'SHEET_CATALOGOS',
  'SHEET_HOSPITALIZACION',
  'SHEET_EMERGENCIA'
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Falta variable de entorno: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10),
  serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
  sheets: {
    catalogos: process.env.SHEET_CATALOGOS,
    hospitalizacion: process.env.SHEET_HOSPITALIZACION,
    emergencia: process.env.SHEET_EMERGENCIA,
  },
  hojas: {
    hospitalizacion: process.env.SHEET_HOSP_HOJAS.split(','),
    emergencia: process.env.SHEET_EMERG_HOJAS.split(','),
    catalogos: process.env.SHEET_CAT_HOJAS.split(','),
  },
  cacheRefreshMinutos: parseInt(process.env.CACHE_REFRESH_MINUTOS || '30', 10),
};
