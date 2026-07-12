require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 10000,
  serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || '/etc/secrets/credentials.json',
  sheets: {
    catalogos: process.env.SHEET_CATALOGOS || '',
    hospitalizacion: process.env.SHEET_HOSPITALIZACION || '',
    emergencia: process.env.SHEET_EMERGENCIA || '',
  },
  hojas: {
    hospitalizacion: (process.env.SHEET_HOSP_HOJAS || 'IESS-G-HOS,IESS-C-HOS,SPPAT-HOS,ISSPOL-HOS,ISSFA-HOS').split(','),
    emergencia: (process.env.SHEET_EMERG_HOJAS || 'IESS-G-EMERG,IESS-C-EMERG,SPPAT-EMERG,ISSPOL-EMERG,ISSFA-EMERG').split(','),
    catalogos: (process.env.SHEET_CAT_HOJAS || 'Procedimientos,Diagnosticos,Medicamentos,Beneficiario,Dependencia,TipoExamen,Intrahospital').split(','),
  },
  cacheRefreshMinutos: parseInt(process.env.CACHE_REFRESH_MINUTOS || '30', 10),
};
