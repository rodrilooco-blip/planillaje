const { google } = require('googleapis');
const path = require('path');
const config = require('../config/env');

let sheetsClient = null;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const keyFilePath = path.resolve(config.serviceAccountPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function leerSheet(sheetId, rango) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: rango,
  });
  return res.data.values || [];
}

async function leerEncabezados(sheetId, hoja) {
  const filas = await leerSheet(sheetId, `${hoja}!1:1`);
  return filas[0] || [];
}

function columnToLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

async function agregarFila(sheetId, rango, valores) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: rango,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [valores] },
  });
  return res.data;
}

async function agregarFilas(sheetId, rango, filasValores) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: rango,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: filasValores },
  });
  return res.data;
}

async function actualizarFila(sheetId, hoja, numeroFila, valores) {
  const client = await getSheetsClient();
  const ultimaColumna = columnToLetter(valores.length || 26);
  const rango = `${hoja}!A${numeroFila}:${ultimaColumna}${numeroFila}`;
  const res = await client.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: rango,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [valores] },
  });
  return res.data;
}

async function eliminarFila(sheetId, hoja, numeroFila) {
  const client = await getSheetsClient();
  const gSheetId = await getSheetId(sheetId, hoja);
  if (gSheetId === null || gSheetId === undefined) {
    throw new Error(`Hoja "${hoja}" no encontrada`);
  }
  await client.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: gSheetId,
            dimension: 'ROWS',
            startIndex: numeroFila - 1,
            endIndex: numeroFila,
          },
        },
      }],
    },
  });
}

async function getSheetId(sheetId, hojaNombre) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = res.data.sheets.find(s => s.properties.title === hojaNombre);
  return sheet ? sheet.properties.sheetId : null;
}

async function getUltimoNumeroPaciente(sheetId, hoja) {
  const datos = await leerSheet(sheetId, `${hoja}!A:A`);
  if (datos.length <= 1) return 0;
  let max = 0;
  for (let i = 1; i < datos.length; i++) {
    const n = parseInt(datos[i][0], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

async function getColumnasSheet(sheetId, hoja) {
  const encabezados = await leerEncabezados(sheetId, hoja);
  return encabezados.map((nombre, i) => ({
    index: i,
    nombre: nombre || '',
    tipo: 'texto',
  }));
}

async function leerFila(sheetId, hoja, numeroFila) {
  const datos = await leerSheet(sheetId, `${hoja}!A${numeroFila}:ZZZ${numeroFila}`);
  return datos[0] || [];
}

module.exports = {
  getSheetsClient,
  leerSheet,
  leerEncabezados,
  agregarFila,
  agregarFilas,
  actualizarFila,
  eliminarFila,
  getSheetId,
  leerRango: leerSheet,
  getUltimoNumeroPaciente,
  getColumnasSheet,
  leerFila,
};
