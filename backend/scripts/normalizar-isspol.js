require('dotenv').config();

const sheets = require('../src/services/googleSheets');
const config = require('../src/config/env');
const storage = require('../src/services/sqliteStorage');

const encabezados = [
  'CODIGO DE DEPENDENCIA (Ver Instructivo)',
  "NO. PACIENTE. Pegar la Formula: =SI(E3=E2;B2;N(B2+1)) en la celda B3, luego que en la celda B2 se ponga ''1''",
  'FECHA ATENCION (dd/mm/aaaa) / (Pestana: Fecha corta)',
  'TIPO BENEFICIARIO (Ver Instructivo)',
  "IDENTIFICACION BENEFICIARIO (Pestana: Texto para conservar el ''0'' al incio de la cedula)",
  'APELLIDOS Y NOMBRES DEL BENEFICIARIO (sin tildes ni N)',
  'PORCENTAJE (Es el porcentaje del beneficiario que sale en Core Salud)',
  "SEXO (''M'' de Masculino, ''F'' de Femenino, \"I\" de Indeterminado)",
  'FECHA NACIMIENTO (dd/mm/aaaa) / (Pestana: Fecha corta)',
  'EDAD (solo en anos cumplidos). Pegar la Formula: =SIFECHA(I2;C2;"Y") en la celda J2',
  'TIPO EXAMEN (Ver Instructivo)',
  'CODIGO DE PROCEDIMIENTO (Tomados Tarifario 2014, Ver MAESTRO DE PROCEDIMIENTOS) / (En Medicamentos NO anotar el codigo)',
  "NOMBRE DEL PROCEDIMIENTO (Copiar y pegar del MAESTRO DE PROCEDIMIENTOS) / (En Medicamentos Ver MAESTRO MEDICAMENTOS, copiar y pegar la descripcion seguido ''X'' el volumen del medicamento/peso de la PRESENTACION",
  'DIAGNOSTICO PRINCIPAL (Anotar el CIE-10 sin "X" al final, y que este CIE-10 sea el principal que justifique el Procedimiento)',
  'DG. S – 1',
  'CANTIDAD (de cuatos procedimientos se le hizo al usuario, cuantos medicamentos o insumos se descargo)',
  'VALOR UNITARIO', 'VALOR TOTAL', "MARCA FINAL.- Siempre ''F'' de FIN",
  'UNIDAD OPERATIVA', 'APELLIDO Y NOMBRE DEL PROFESIONAL',
];

async function actualizarHoja(id, hoja) {
  const client = await sheets.getSheetsClient();
  const encabezadosActuales = await sheets.leerEncabezados(id, hoja);
  const data = [{ range: `${hoja}!A1:U1`, values: [encabezados] }];
  if (encabezadosActuales.length > 21) {
    data.push({ range: `${hoja}!V1:AJ1`, values: [Array(15).fill('')] });
  }
  await client.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    resource: {
      valueInputOption: 'RAW',
      data,
    },
  });
  storage.guardarEncabezados(hoja.includes('EMERG') ? 'emergencia' : 'hospitalizacion', hoja, encabezados);
}

async function main() {
  if (encabezados.length !== 21) throw new Error('La estructura ISSPOL debe tener 21 columnas.');
  const mesActual = storage.obtenerMesMasReciente();
  const destinos = [
    [config.sheets.emergencia, 'ISSPOL-EMERG'],
    [config.sheets.hospitalizacion, 'ISSPOL-HOS'],
    [mesActual?.emerg_sheet_id, 'ISSPOL-EMERG'],
    [mesActual?.hosp_sheet_id, 'ISSPOL-HOS'],
  ].filter(([id]) => id);
  for (const [id, hoja] of destinos) {
    await actualizarHoja(id, hoja);
    console.log(`${hoja}: encabezado normalizado`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
