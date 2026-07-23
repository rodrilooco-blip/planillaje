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

async function buscarCarpetaPorNombre(anio, mesNum) {
  const drive = await getDriveClient();
  const nombres = meses.buscarNombreCarpetaVariaciones(anio, mesNum);
  for (const nombreCarpeta of nombres) {
    const escaped = nombreCarpeta.replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and '${config.googleDriveFolderId}' in parents and trashed=false`,
        fields: 'files(id,name,parents)',
        pageSize: 5,
      });
      const files = res.data.files || [];
      if (files.length > 0) return files[0];
    } catch (e) { /* ignore */ }
  }
  // Fallback: buscar en todo el Drive visible
  for (const nombreCarpeta of nombres) {
    const escaped = nombreCarpeta.replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`,
        fields: 'files(id,name,parents)',
        pageSize: 5,
      });
      const files = res.data.files || [];
      if (files.length > 0) return files[0];
    } catch (e) { /* ignore */ }
  }
  return null;
}

async function buscarSpreadsheetPorNombre(tipo, anio, mesNum, carpetaId) {
  if (!carpetaId) return null;
  const drive = await getDriveClient();
  const nombres = meses.buscarNombreArchivoVariaciones(tipo, anio, mesNum);

  // Primero probar búsqueda exacta por nombre
  for (const nombreArchivo of nombres) {
    const escaped = nombreArchivo.replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.spreadsheet' and name='${escaped}' and '${carpetaId}' in parents and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 10,
      });
      const files = res.data.files || [];
      if (files.length > 0) {
        console.log('[DriveManager] Spreadsheet encontrado por nombre "' + nombreArchivo + '"');
        return files[0];
      }
    } catch (e) { /* ignore */ }
  }

  // Fallback: listar todos los spreadsheets en la carpeta y matchear por tipo
  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and '${carpetaId}' in parents and trashed=false`,
      fields: 'files(id,name)',
      pageSize: 50,
    });
    const files = res.data.files || [];
    const t = tipo === 'hospitalizacion' ? 'HOSPITALIZACION' : 'EMERGENCIA';
    for (const f of files) {
      const name = f.name.toUpperCase();
      if (name.includes(t)) {
        console.log('[DriveManager] Spreadsheet encontrado por listado en carpeta: "' + f.name + '"');
        return f;
      }
    }
    // Si solo hay un spreadsheet en la carpeta, asumir que es de este tipo
    if (files.length === 1) {
      console.log('[DriveManager] Unico spreadsheet en carpeta: "' + files[0].name + '"');
      return files[0];
    }
  } catch (e) { /* ignore */ }

  return null;
}

async function crearMes(anio, mesNum) {
  const codigo = meses.generarCodigo(anio, mesNum);
  const nombreCarpeta = meses.generarNombreCarpeta(anio, mesNum);

  const existente = storage.obtenerMes(codigo);
  if (existente) {
    console.log('[DriveManager] Mes ya existe: ' + codigo + ' - devolviendo existente');
    return existente;
  }

  let carpetaId = null;
  try {
    const carpetaExistente = await buscarCarpetaPorNombre(anio, mesNum);
    if (carpetaExistente) {
      carpetaId = carpetaExistente.id;
      console.log('[DriveManager] Carpeta ya existe: "' + carpetaExistente.name + '" [' + carpetaId + ']');
    } else {
      console.log('[DriveManager] Creando carpeta: ' + nombreCarpeta);
      carpetaId = await crearCarpeta(nombreCarpeta);
    }
  } catch (e) {
    console.warn('[DriveManager] Error con carpeta Drive: ' + e.message);
  }

  // Guardar mes en SQLITE aunque Drive falle — luego se puede enlazar manualmente
  const result = { codigo, nombre: nombreCarpeta, anio, mes: mesNum, carpetaId: carpetaId || '' };
  storage.guardarMes(result);

  const tipos = ['hospitalizacion', 'emergencia'];
  for (const tipo of tipos) {
    let sheetId = null;
    try {
      const nombreArchivo = meses.generarNombreArchivo(tipo, anio, mesNum);
      const spreadsheetExistente = await buscarSpreadsheetPorNombre(tipo, anio, mesNum, carpetaId);
      if (spreadsheetExistente) {
        sheetId = spreadsheetExistente.id;
        console.log('[DriveManager] Spreadsheet existe: "' + spreadsheetExistente.name + '" [' + sheetId + ']');
      } else if (carpetaId) {
        console.log('[DriveManager] Creando spreadsheet: ' + nombreArchivo);
        sheetId = await crearSpreadsheet(nombreArchivo, carpetaId);
      } else {
        console.warn('[DriveManager] Sin carpetaId, no se crea spreadsheet');
      }

      if (sheetId) {
        const tabs = meses.obtenerNombresTabs(tipo);
        await agregarTabs(sheetId, tabs);

        // Copiar encabezados
        const mesAnterior = storage.obtenerMesAnterior(tipo);
        if (mesAnterior && mesAnterior[tipo === 'hospitalizacion' ? 'hosp_sheet_id' : 'emerg_sheet_id']) {
          const sourceId = mesAnterior[tipo === 'hospitalizacion' ? 'hosp_sheet_id' : 'emerg_sheet_id'];
          const encabPrev = storage.obtenerEncabezados(tipo, tabs[0]);
          if (encabPrev && encabPrev.length > 0) {
            const sheetsClient = await getSheetsClient();
            for (const tab of tabs) {
              await sheetsClient.spreadsheets.values.update({
                spreadsheetId: sheetId, range: tab + '!A1',
                valueInputOption: 'USER_ENTERED', requestBody: { values: [encabPrev] },
              });
            }
          } else {
            await copiarEncabezados(sourceId, tabs[0], sheetId, tabs);
            const encFromGs = await sheets.leerEncabezados(sourceId, tabs[0]);
            if (encFromGs && encFromGs.length > 0) storage.guardarEncabezados(tipo, tabs[0], encFromGs);
          }
        } else {
          const templateId = tipo === 'hospitalizacion' ? config.sheets.hospitalizacion : config.sheets.emergencia;
          if (templateId) {
            const nomEnc = await sheets.leerEncabezados(templateId, tabs[0]);
            if (nomEnc && nomEnc.length > 0) {
              const sheetsClient = await getSheetsClient();
              for (const tab of tabs) {
                await sheetsClient.spreadsheets.values.update({
                  spreadsheetId: sheetId, range: tab + '!A1',
                  valueInputOption: 'USER_ENTERED', requestBody: { values: [nomEnc] },
                });
              }
              storage.guardarEncabezados(tipo, tabs[0], nomEnc);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[DriveManager] Error con spreadsheet ' + tipo + ': ' + e.message);
    }

    if (tipo === 'hospitalizacion') result.hosp_sheet_id = sheetId || '';
    else result.emerg_sheet_id = sheetId || '';

    storage.guardarMes(result);
  }

  return result;
}

async function listarArchivosEnCarpeta(folderId) {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,parents)',
    pageSize: 50,
  });
  return res.data.files || [];
}

module.exports = {
  crearMes,
  getServiceAccountEmail,
  listarArchivosSADrive,
  listarArchivosEnCarpeta,
  limpiarSADrive,
};
