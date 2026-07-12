const Reglas = {
  fieldMap: {},

  setFieldMapDirect(inputs) {
    this.fieldMap = {};
    inputs.forEach(el => {
      if (el.name) this.fieldMap[el.name] = el;
    });
  },

  getField(clave) {
    const c = clave.toUpperCase();
    const key = Object.keys(this.fieldMap).find(k => k.includes(c));
    return key ? this.fieldMap[key] : null;
  },

  getValue(clave) {
    const f = this.getField(clave);
    return f ? f.value : '';
  },

  setValue(clave, val) {
    const f = this.getField(clave);
    if (f) { f.value = val; f.dispatchEvent(new Event('input', { bubbles: true })); }
  },

  calcularEdad() {
    const nac = this.getValue('FECHA_NACIMIENTO');
    const ing = this.getValue('FECHA_INGRESO') || this.getValue('FECHA_ATENCION');
    if (!nac || !ing) return;
    const a = new Date(nac), b = new Date(ing);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return;
    let e = b.getFullYear() - a.getFullYear();
    if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) e--;
    this.setValue('EDAD', String(e));
  },

  copiarDatosTitular() {
    const p = this.getValue('PARENTESCO').toUpperCase();
    const fm = this.fieldMap;

    if (p === 'T' || p === 'TITULAR') {
      const idBenKey = Object.keys(fm).find(k => k.includes('IDENTIFICACION') && k.includes('BENEFICIARIO'));
      const idAfiKey = Object.keys(fm).find(k => k.includes('IDENTIFICACION') && (k.includes('AFILIADO') || k.includes('IDENTIFICACION')) && !k.includes('BENEFICIARIO'));
      if (idBenKey && idAfiKey) {
        fm[idAfiKey].value = fm[idBenKey].value;
        fm[idAfiKey].readOnly = true;
      }

      const apBenKey = Object.keys(fm).find(k => k.includes('APELLIDOS') && k.includes('BENEFICIARIO'));
      const apTitKey = Object.keys(fm).find(k => k.includes('APELLIDOS') && k.includes('TITULAR'));
      if (apBenKey && apTitKey) {
        fm[apTitKey].value = fm[apBenKey].value;
        fm[apTitKey].readOnly = true;
      }
    } else {
      Object.values(fm).forEach(el => el.readOnly = false);
    }
  },

  setupEventListeners() {
    const nac = this.getField('FECHA_NACIMIENTO');
    const ing = this.getField('FECHA_INGRESO');
    const ate = this.getField('FECHA_ATENCION');
    const par = this.getField('PARENTESCO');
    if (nac) { nac.addEventListener('change', () => this.calcularEdad()); nac.addEventListener('input', () => this.calcularEdad()); }
    if (ing) { ing.addEventListener('change', () => this.calcularEdad()); ing.addEventListener('input', () => this.calcularEdad()); }
    if (ate) { ate.addEventListener('change', () => this.calcularEdad()); ate.addEventListener('input', () => this.calcularEdad()); }
    if (par) par.addEventListener('change', () => this.copiarDatosTitular());
  },

  aplicarValoresFijos(hoja) {
    const uo = this.getField('UNIDAD_OPERATIVA');
    if (uo) { uo.value = 'HOSPITAL MIGUEL LEON BERMEO CHUNCHI'; uo.disabled = true; }
    const mf = this.getField('MARCA_FINAL');
    if (mf) { mf.value = 'F'; mf.disabled = true; }

    const secKey = Object.keys(this.fieldMap).find(k => k.includes('SECUENCIAL') && k.includes('DERIVACION'));
    if (secKey) this.fieldMap[secKey].value = 'SIN';

    const contKey = Object.keys(this.fieldMap).find(k => k.includes('CONTINGENCIA'));
    if (contKey) this.fieldMap[contKey].value = (hoja || '').toUpperCase().startsWith('SPPAT') ? '6' : '1';

    const dgKey = Object.keys(this.fieldMap).find(k => k.includes('DEFINITIVO') && k.includes('PRESUNTIVO'));
    if (dgKey) this.fieldMap[dgKey].value = 'D';

    if (hoja.toUpperCase().startsWith('SPPAT')) {
      this.setValue('DEPENDENCIA', '9999999998');
      this.setValue('TIPO_BENEFICIARIO', 'VA');
      const d = this.getField('DEPENDENCIA'); if (d) d.disabled = true;
      const t = this.getField('TIPO_BENEFICIARIO'); if (t) t.disabled = true;
      this.setValue('PROVINCIA', 'H');
      this.setValue('UNICODIGO', '471');
      this.setValue('ARCHIVO', 'HCU_008_');
      this.setValue('PAGINA', '1');
    }
  },
};
