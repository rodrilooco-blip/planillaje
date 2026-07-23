const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const meses = require('../config/meses');
const sheets = require('./googleSheets');
const storage = require('./sqliteStorage');

let authClient = null;
let serviceAccountEmail = '';

async function getAuth() {
  if (authClient) return authClient;
  const keyFilePath = path.resolve(config.serviceAccountPath);
  if (fs.existsSync(keyFilePath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
      serviceAccountEmail = creds.client_email || '(desconocido)';
    } catch (e) { /* ignore */ }
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  authClient = await auth.getClient();
  return authClient;
}

function getServiceAccountEmail() { return serviceAccountEmail; }

async function getDriveClient() {
  const auth = await getAuth();
  return google.drive({ version: 'v3', auth });
}

async function getSheetsClient() {
  const auth = await getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function listarArchivosSADrive() {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    pageSize: 100,
    fields: 'files(id,name,mimeType,parents,size,createdTime,trashed)',
    q: "trashed=false",
  });
  return res.data.files || [];
}

async function limpiarSADrive(secoId = null, todo = false) {
  const drive = await getDriveClient();
  const archivos = secoId ? [{ id: secoId }] : await listarArchivosSADrive();
  const eliminados = [];
  const noEliminados = [];
  for (const f of archivos) {
    // Saltar el folder principal compartido (no lo borramos!)
    if (f.id === config.googleDriveFolderId) continue;
    // Saltar archivos dentro de la carpeta compartida a menos que se indique borrar todo
    if (!todo && f.parents && f.parents.includes(config.googleDriveFolderId)) continue;
    // Saltar tambien archivos compartidos hacia el SA por el usuario (no creados por SA, no se pueden eliminar)
    try {
      await drive.files.delete({ fileId: f.id });
      eliminados.push({ id: f.id, name: f.name, mimeType: f.mimeType });
    } catch (e) {
      noEliminados.push({ id: f.id, name: f.name, error: e.message });
    }
  }
  return { eliminados: eliminados.length, noEliminados, total: archivos.length };
}

async function crearCarpeta(nombre) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [config.googleDriveFolderId],
    },
    fields: 'id',
  });
  return res.data.id;
}async function crearSpreadsheet(nombre, folderId) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    },
    fields: 'id',
  });
  return res.data.id;
}

async function agregarTabs(sheetId, nombresTabs) {
  const sheetsClient = await getSheetsClient();
  const spreadsheet = await sheetsClient.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' });
  const existingTabs = spreadsheet.data.sheets.map(s => s.properties.title);
  const requests = [];

  // Renombrar la primera tab (Sheet1) al primer nombre de la lista si existe
  if (existingTabs.length > 0 && existingTabs[0] === 'Sheet1' && nombresTabs.length > 0) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: spreadsheet.data.sheets[0].properties.sheetId, title: nombresTabs[0] },
        fields: 'title',
      },
    });
    nombresTabs = nombresTabs.slice(1);
  }

  // Agregar tabs faltantes
  for (const nombre of nombresTabs) {
    if (!existingTabs.includes(nombre)) {
      requests.push({
        addSheet: { properties: { title: nombre } },
      });
    }
  }

  if (requests.length > 0) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests },
    });
  }
}

async function copiarEncabezados(origenSheetId, origenTab, destinoSheetId, destTabs) {
  const sheetsClient = await getSheetsClient();
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: origenSheetId,
      range: origenTab + '!1:1',
    });
    const encabezados = res.data.values ? res.data.values[0] : [];
    if (encabezados.length === 0) return;

    for (const tab of destTabs) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: destinoSheetId,
        range: tab + '!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [encabezados] },
      });
    }
  } catch (err) {
    console.warn('[DriveManager] No se pudieron copiar encabezados de ' + origenTab + ':', err.message);
  }
}

async function buscarCarpetaPorNombre(nombreCarpeta) {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${nombreCarpeta.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id,name,parents)',
    pageSize: 5,
  });
  return res.data.files || [];
}

async function buscarSpreadsheetPorNombre(nombreArchivo, carpetaId) {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.spreadsheet' and name='${nombreArchivo.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id,name,parents)',
    pageSize: 10,
  });
  const all = res.data.files || [];
  if (carpetaId) return all.filter(f => f.parents && f.parents.includes(carpetaId));
  return all;
}

async function crearMes(anio, mesNum) {
  const codigo = meses.generarCodigo(anio, mesNum);
  const nombreCarpeta = meses.generarNombreCarpeta(anio, mesNum);

  const existente = storage.obtenerMes(codigo);
  if (existente) {
    console.log('[DriveManager] Mes ya existe: ' + codigo + ' - devolviendo existente');
    return existente;
  }

  // 1) Buscar carpeta existente en Drive por nombre
  let carpetaId = null;
  const carpetas = await buscarCarpetaPorNombre(nombreCarpeta);
  if (carpetas.length > 0) {
    carpetaId = carpetas[0].id;
    console.log('[DriveManager] Carpeta ya existe en Drive: ' + nombreCarpeta + ' [' + carpetaId + ']');
  } else {
    console.log('[DriveManager] Creando carpeta: ' + nombreCarpeta);
    carpetaId = await crearCarpeta(nombreCarpeta);
  }

  const result = { codigo, nombre: nombreCarpeta, anio, mes: mesNum, carpetaId };

  const tipos = ['hospitalizacion', 'emergencia'];
  for (const tipo of tipos) {
    const nombreArchivo = meses.generarNombreArchivo(tipo, anio, mesNum);

    // 2) Buscar spreadsheet existente en la carpeta
    let sheetId = null;
    const existentes = await buscarSpreadsheetPorNombre(nombreArchivo, carpetaId);
    if (existentes.length > 0) {
      sheetId = existentes[0].id;
      console.log('[DriveManager] Spreadsheet ya existe: ' + nombreArchivo + ' [' + sheetId + ']');
    } else {
      console.log('[DriveManager] Creando spreadsheet: ' + nombreArchivo);
      sheetId = await crearSpreadsheet(nombreArchivo, carpetaId);
    }

    const tabs = meses.obtenerNombresTabs(tipo);
    await agregarTabs(sheetId, tabs);

    // Copiar encabezados del mes anterior o de la plantilla
    const mesAnterior = storage.obtenerMesAnterior(tipo);
    if (mesAnterior && mesAnterior[tipo === 'hospitalizacion' ? 'hosp_sheet_id' : 'emerg_sheet_id']) {
      const sourceId = mesAnterior[tipo === 'hospitalizacion' ? 'hosp_sheet_id' : 'emerg_sheet_id'];
      console.log('[DriveManager] Copiando encabezados desde mes anterior para ' + tipo);
      // Leer encabezados del mes anterior desde SQLite
      const encabPrev = storage.obtenerEncabezados(tipo, tabs[0]);
      if (encabPrev && encabPrev.length > 0) {
        const sheetsClient = await getSheetsClient();
        for (const tab of tabs) {
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: tab + '!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [encabPrev] },
          });
        }
      } else {
        // Fallback: copiar desde Google Sheets directamente
        await copiarEncabezados(sourceId, tabs[0], sheetId, tabs);
        // Guardar encabezados en SQLite para futuras copias
        const encFromGs = await sheets.leerEncabezados(sourceId, tabs[0]);
        if (encFromGs && encFromGs.length > 0) storage.guardarEncabezados(tipo, tabs[0], encFromGs);
      }
    } else {
      // Usar plantilla del .env (SHEET_HOSPITALIZACION o SHEET_EMERGENCIA)
      const templateId = tipo === 'hospitalizacion' ? config.sheets.hospitalizacion : config.sheets.emergencia;
      if (templateId) {
        const nomEnc = await sheets.leerEncabezados(templateId, tabs[0]);
        if (nomEnc && nomEnc.length > 0) {
          const sheetsClient = await getSheetsClient();
          for (const tab of tabs) {
            await sheetsClient.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: tab + '!A1',
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [nomEnc] },
            });
          }
          storage.guardarEncabezados(tipo, tabs[0], nomEnc);
        }
      }
    }

    if (tipo === 'hospitalizacion') result.hosp_sheet_id = sheetId;
    else result.emerg_sheet_id = sheetId;

    // Guardar en SQLite inmediatamente tras tener el sheetId (sin esperar copia encabezados)
    storage.guardarMes(result);
  }

  return result;
}

module.exports = {
  crearMes,
  getServiceAccountEmail,
  listarArchivosSADrive,
  limpiarSADrive,
};
