const NOMBRES_MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

function ahora() {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

function generarCodigo(anio, mes) {
  return anio + '_' + String(mes).padStart(2, '0');
}

function generarNombre(anio, mes) {
  return anio + '_' + NOMBRES_MESES[(mes || 1) - 1];
}

function generarNombreCarpeta(anio, mes) {
  return String(anio) + '_' + NOMBRES_MESES[(mes || 1) - 1];
}

function generarNombreArchivo(tipo, anio, mes) {
  const nomMes = NOMBRES_MESES[(mes || 1) - 1];
  const t = tipo === 'hospitalizacion' ? 'HOSPITALIZACION' : 'EMERGENCIA';
  return t + '_' + nomMes + '_' + anio;
}

function obtenerNombresTabs(tipo) {
  if (tipo === 'hospitalizacion') return ['IESS-G-HOS', 'IESS-C-HOS', 'SPPAT-HOS', 'ISSPOL-HOS', 'ISSFA-HOS'];
  return ['IESS-G-EMERG', 'IESS-C-EMERG', 'SPPAT-EMERG', 'ISSPOL-EMERG', 'ISSFA-EMERG'];
}

function nombresMeses() { return NOMBRES_MESES; }

module.exports = {
  ahora,
  generarCodigo,
  generarNombre,
  generarNombreCarpeta,
  generarNombreArchivo,
  obtenerNombresTabs,
  nombresMeses,
};
