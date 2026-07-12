function calcularEdad(fechaNacimiento, fechaReferencia) {
  if (!fechaNacimiento || !fechaReferencia) return '';
  const nac = new Date(fechaNacimiento);
  const ref = new Date(fechaReferencia);
  if (isNaN(nac.getTime()) || isNaN(ref.getTime())) return '';
  let edad = ref.getFullYear() - nac.getFullYear();
  const mes = ref.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && ref.getDate() < nac.getDate())) edad--;
  return String(edad);
}

function buscarKey(data, palabra) {
  const p = palabra.toUpperCase();
  const keys = Object.keys(data);
  for (const key of keys) {
    if (key.toUpperCase().includes(p)) return key;
  }
  return null;
}

function buscarKeys(data, ...palabras) {
  const ps = palabras.map(s => s.toUpperCase());
  const keys = Object.keys(data);
  for (const key of keys) {
    const ku = key.toUpperCase();
    if (ps.every(p => ku.includes(p))) return key;
  }
  return null;
}

function esHojaSPPAT(nombreHoja) {
  return nombreHoja.toUpperCase().startsWith('SPPAT');
}

function aplicarReglasFijas(hoja, data) {
  const r = { ...data };
  const hojaUp = hoja.toUpperCase();

  r['MARCA_FINAL'] = 'F';
  r['UNIDAD_OPERATIVA'] = 'HOSPITAL MIGUEL LEON BERMEO CHUNCHI';

  if (esHojaSPPAT(hojaUp)) {
    const depKey = buscarKey(r, 'DEPENDENCIA');
    if (depKey) r[depKey] = '9999999998';

    const tipoKey = buscarKey(r, 'TIPO_BENEFICIARIO');
    if (tipoKey) r[tipoKey] = 'VA';

    const provKey = buscarKey(r, 'PROVINCIA');
    if (provKey) r[provKey] = 'H';

    const uniKey = buscarKey(r, 'UNICODIGO');
    if (uniKey) r[uniKey] = '471';

    const archKey = buscarKey(r, 'ARCHIVO');
    if (archKey) r[archKey] = 'HCU_008_';

    const pagKey = buscarKey(r, 'PAGINA');
    if (pagKey) r[pagKey] = '1';
  }

  const parentescoKey = buscarKey(r, 'PARENTESCO');
  if (parentescoKey) {
    const pVal = (r[parentescoKey] || '').toUpperCase();
    if (pVal === 'T' || pVal === 'TITULAR') {
      const identBenKey = buscarKeys(r, 'IDENTIFICACION', 'BENEFICIARIO');
      const afiliadoKey = buscarKeys(r, 'IDENTIFICACION', 'AFILIADO') || buscarKeys(r, 'IDENTIFICACION', 'TITULAR');
      if (identBenKey && afiliadoKey) r[afiliadoKey] = r[identBenKey];

      const apellKey = buscarKeys(r, 'APELLIDOS', 'BENEFICIARIO') || buscarKey(r, 'APELLIDOS');
      const titularKey = buscarKeys(r, 'APELLIDOS', 'TITULAR');
      if (apellKey && titularKey) r[titularKey] = r[apellKey];
    }
  }

  const fechaNacKey = buscarKey(r, 'FECHA_NACIMIENTO');
  const fechaIngKey = buscarKey(r, 'FECHA_INGRESO') || buscarKey(r, 'FECHA_ATENCION');
  const edadKey = buscarKey(r, 'EDAD');

  if (fechaNacKey && fechaIngKey && edadKey) {
    r[edadKey] = calcularEdad(r[fechaNacKey], r[fechaIngKey]);
  }

  const secKey = buscarKeys(r, 'SECUENCIAL', 'DERIVACION');
  if (secKey) r[secKey] = 'SIN';
  const contKey = buscarKey(r, 'CONTINGENCIA');
  if (contKey) r[contKey] = esHojaSPPAT(hojaUp) ? '6' : '1';
  const dgKey = buscarKeys(r, 'DEFINITIVO', 'PRESUNTIVO') || buscarKey(r, 'DEFINITIVO');
  if (dgKey) r[dgKey] = 'D';

  Object.keys(r).forEach(k => {
    if (typeof r[k] === 'string') r[k] = r[k].toUpperCase();
  });

  return r;
}

function validarData(data) {
  const errores = [];
  const idKey = buscarKey(data, 'IDENTIFICACION_BENEFICIARIO');
  if (!idKey || !data[idKey]) errores.push('IDENTIFICACION es requerido');
  const apeKey = buscarKey(data, 'APELLIDOS');
  if (!apeKey || !data[apeKey]) errores.push('APELLIDOS es requerido');
  const fecKey = buscarKey(data, 'FECHA_INGRESO') || buscarKey(data, 'FECHA_ATENCION');
  if (!fecKey || !data[fecKey]) errores.push('FECHA DE INGRESO/ATENCION es requerida');
  return errores;
}

function obtenerColumnasAdicionales(hoja) {
  const hojaUp = hoja.toUpperCase();
  const extras = [];
  if (hojaUp.startsWith('SPPAT')) {
    extras.push('FECHA INGRESO', 'FECHA EGRESO', 'MOTIVO EGRESO', 'COBERTURA', 'TIPO PRESTACION', 'DATOS ACCIDENTE');
  }
  if (hojaUp.startsWith('ISSPOL')) {
    extras.push('PORCENTAJE');
  }
  return extras;
}

module.exports = {
  calcularEdad,
  aplicarReglasFijas,
  validarData,
  obtenerColumnasAdicionales,
};
