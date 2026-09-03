require('dotenv').config();

const sheets = require('../src/services/googleSheets');
const config = require('../src/config/env');
const storage = require('../src/services/sqliteStorage');

const encabezadosIessG = [
  'CODIGO DE DEPENDENCIA',
  'NO. PACIENTE.',
  'FECHA DE INGRESO',
  'TIPO BENEFICIARIO',
  'CEDULA DE IDENTIDAD DEL BENEFICIARIO',
  'APELLIDOS Y NOMBRES DEL BENEFICIARIO (sin tildes ni ñ)',
  'SEXO (M de Masculino, F de Femenino)',
  'FECHA NACIMIENTO (dd/mm/aaaa) / (Pestaña: Fecha corta)',
  'EDAD (solo en años)',
  'TIPO EXAMEN',
  'CODIGO DE PROCEDIMIENTO (Tomados Tarifario 2014, Ver MAESTRO DE PROCEDIMIENTOS) / (En Medicamentos NO anotar el código )',
  'NOMBRE DEL PROCEDIMIENTO (Copiar y pegar del MAESTRO DE PROCEDIMIENTOS) / (En Medicamentos Ver MAESTRO MEDICAMENTOS, copiar y pegar la desrcipcion seguido x el volumen del medicamento/peso de la PRESENTACIÓN',
  'DIAGNOSTICO PRINCIPAL (Anotar el CIE-10 sin "X" al final, y que este CIE-10 sea el principal que justifique el Procedimiento)',
  'DG. S – 1', 'DG. S – 2',
  'CANTIDAD (de cuatos procedimientos se le hizo al usuario, cuantos medicamentos o insumos despachados)',
  'VALOR UNITARIO', 'VALOR TOTAL', 'DURACIÓN',
  'PARENTESCO DEL BENEFICIARIO CON EL TITULAR',
  'IDENTIFICACION AFILIADO (TITULAR) / (Pestaña: Texto para conservar el 0 al incio de la cédula)',
  'APELLIDOS Y NOMBRES DEL TITULAR (sin tildes ni ñ)',
  'CODIGO DE DERIVACION',
  "NUMERO SECUENCIAL DERIVACION.- Siempre: ''SIN'' = SIN CÓDIGO DE VALIDACIÓN",
  "CONTINGENCIA CUBIERTA.- ''1'' = Enfermedad; ''2'' = Maternidad; ''3'' = Enfermedad Profesional; ''4'' = Accidente del Trabajo; ''5'' = Reposo Prenatal; ''6'' = Accidente de Tránsito; y ''7'' = Enfermedad Catastrofica",
  "DG. ''D'' de DEFINITIVO Y ''P'' de PRESUNTIVO", 'TIEMPO ANESTESIA',
  'DG. S – 3', 'DG. S – 4', 'DG. S – 5', 'PORCENTAJE IVA',
  'VALOR IVA UNITARIO', "MARCA FINAL.- Siempre ''F'' de FIN",
  'UNIDAD OPERATIVA', 'APELLIDO Y NOMBRE DEL PROFESIONAL',
];

function reordenarEmergenciaAnterior(fila) {
  const destino = Array(encabezadosIessG.length).fill('');
  const mapeo = [
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8],
    [9, 9], [10, 10], [11, 11], [12, 12], [13, 13], [14, 14], [15, 15], [16, 16],
    [31, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23],
    [23, 24], [24, 25], [25, 26], [26, 27], [27, 28], [28, 29], [29, 30],
    [30, 31], [32, 32], [33, 33], [34, 34],
  ];
  mapeo.forEach(([origen, destinoIndex]) => { destino[destinoIndex] = fila[origen] || ''; });
  return destino;
}

async function actualizarHoja({ id, hoja, migrarEmergencia }) {
  const valores = await sheets.leerSheet(id, `${hoja}!A:AI`);
  const encabezadosActuales = valores[0] || [];
  const requiereReordenar = migrarEmergencia && encabezadosActuales.some(encabezado =>
    String(encabezado).toUpperCase().includes('FECHA ATENCIÓN'));
  const filas = valores.slice(1);
  const salida = [encabezadosIessG];
  for (const fila of filas) salida.push(requiereReordenar ? reordenarEmergenciaAnterior(fila) : fila.slice(0, encabezadosIessG.length));

  const client = await sheets.getSheetsClient();
  await client.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${hoja}!A1:AI${salida.length}`,
    valueInputOption: 'RAW',
    resource: { values: salida },
  });
  storage.guardarEncabezados(hoja.includes('EMERG') ? 'emergencia' : 'hospitalizacion', hoja, encabezadosIessG);
  console.log(`${hoja}: ${filas.length} registro(s) conservado(s)${requiereReordenar ? ' y reordenado(s)' : ''}`);
}

async function main() {
  if (encabezadosIessG.length !== 35) throw new Error('La estructura IESS-G debe tener 35 columnas.');
  const mesActual = storage.obtenerMesMasReciente();
  const destinos = ['IESS-G', 'IESS-C'].flatMap(codigo => [
    { id: config.sheets.emergencia, hoja: `${codigo}-EMERG`, migrarEmergencia: false },
    { id: config.sheets.hospitalizacion, hoja: `${codigo}-HOS`, migrarEmergencia: false },
    { id: mesActual?.emerg_sheet_id, hoja: `${codigo}-EMERG`, migrarEmergencia: true },
    { id: mesActual?.hosp_sheet_id, hoja: `${codigo}-HOS`, migrarEmergencia: false },
  ]).filter(item => item.id);

  for (const destino of destinos) await actualizarHoja(destino);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
