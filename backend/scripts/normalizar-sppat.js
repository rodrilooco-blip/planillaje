require('dotenv').config();

const sheets = require('../src/services/googleSheets');
const config = require('../src/config/env');
const storage = require('../src/services/sqliteStorage');

async function actualizarEncabezado(id, hoja, encabezados) {
  const client = await sheets.getSheetsClient();
  await client.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${hoja}!A1:BB1`,
    valueInputOption: 'RAW',
    resource: { values: [encabezados] },
  });
  storage.guardarEncabezados(hoja.includes('EMERG') ? 'emergencia' : 'hospitalizacion', hoja, encabezados);
}

async function main() {
  const encabezados = await sheets.leerEncabezados(config.sheets.emergencia, 'SPPAT-EMERG');
  if (encabezados.length !== 54) throw new Error('La estructura SPPAT debe tener 54 columnas.');

  const mesActual = storage.obtenerMesMasReciente();
  const destinos = [
    [config.sheets.emergencia, 'SPPAT-EMERG'],
    [config.sheets.hospitalizacion, 'SPPAT-HOS'],
    [mesActual?.emerg_sheet_id, 'SPPAT-EMERG'],
    [mesActual?.hosp_sheet_id, 'SPPAT-HOS'],
  ].filter(([id]) => id);

  for (const [id, hoja] of destinos) {
    await actualizarEncabezado(id, hoja, encabezados);
    console.log(`${hoja}: encabezado normalizado`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
