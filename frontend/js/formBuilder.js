const FormBuilder = {
  currentTipo: null,
  currentHoja: null,
  fieldMap: {},

  secciones: [
    { id: 'paciente', titulo: 'Datos del Paciente', keywords: ['IDENTIFICACION', 'APELLIDOS', 'FECHA NACIMIENTO', 'EDAD', 'SEXO', 'PARENTESCO', 'TIPO BENEFICIARIO', 'DEPENDENCIA', 'NO. PACIENTE', 'NO PACIENTE'] },
    { id: 'fechas', titulo: 'Fechas', keywords: ['FECHA ATENCION', 'FECHA DE INGRESO', 'FECHA DE EGRESO', 'FECHA INGRESO', 'FECHA EGRESO'] },
    { id: 'procedimiento', titulo: 'Procedimiento / Medicamento', keywords: ['PROCEDIMIENTO', 'CANTIDAD', 'VALOR UNITARIO', 'VALOR TOTAL', 'DURACION', 'TIEMPO', 'ANESTESIA'] },
    { id: 'diagnostico', titulo: 'Diagn\u00f3stico', keywords: ['DIAGN\u00d3STICO', 'DIAGNOSTICO', 'DG.', 'CIE'] },
    { id: 'examen', titulo: 'Examen', keywords: ['EXAMEN'] },
    { id: 'titular', titulo: 'Titular / Afiliado', keywords: ['AFILIADO', 'TITULAR'] },
    { id: 'derivacion', titulo: 'Derivaci\u00f3n', keywords: ['DERIVACION', 'SECUENCIAL', 'CONTINGENCIA'] },
    { id: 'accidente', titulo: 'Datos del Accidente (SPPAT)', keywords: ['ACCIDENTE', 'VEH\u00cdCULO', 'VEHICULO', 'PLACA', 'PROVINCIA', 'CANT\u00d3N', 'CANTON', 'UNICODIGO', 'EVIDENCIA'] },
    { id: 'cobertura', titulo: 'Cobertura', keywords: ['COBERTURA', 'PRESTACION', 'DISCAPACIDAD', 'MEDICO', 'OBSERVACION'] },
    { id: 'otros', titulo: 'Otros Datos', keywords: [] },
  ],

  limpiarNombreColumna(nombre) {
    let n = nombre || '';
    n = n.split('(')[0];
    n = n.split('.-')[0];
    n = n.split('Pegar')[0];
    n = n.split('Siempre')[0];
    n = n.split('/')[0];
    n = n.replace(/\.$/, '').trim();
    n = n.replace(/^NO\./i, 'N\u00famero');
    return n.trim();
  },

  formatearLabel(nombre) {
    const limpio = this.limpiarNombreColumna(nombre);
    return limpio
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\bDel\b/g, 'del').replace(/\bDe\b/g, 'de')
      .replace(/\bLa\b/g, 'la').replace(/\bLos\b/g, 'los')
      .replace(/\bY\b/g, 'y').replace(/\bEn\b/g, 'en')
      .replace(/\bPara\b/g, 'para').replace(/\bPor\b/g, 'por')
      .replace(/\bUn\b/g, 'un').replace(/\bUna\b/g, 'una')
      .replace(/\bAl\b/g, 'al').replace(/\bCon\b/g, 'con')
      .trim();
  },

  getKey(nombre) {
    const limpio = this.limpiarNombreColumna(nombre);
    return limpio.toUpperCase().trim().replace(/\s+/g, '_').replace(/\./g, '').replace(/[^A-Z0-9_]/g, '');
  },

  getSeccionId(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    for (const s of this.secciones) {
      for (const kw of s.keywords) {
        if (n.includes(kw.toUpperCase())) return s.id;
      }
    }
    return 'otros';
  },

  async build(tipo, hoja, editFila) {
    this.currentTipo = tipo;
    this.currentHoja = hoja;

    document.getElementById('formTitle').textContent =
      (tipo === 'emergencia' ? 'Emergencia' : 'Hospitalizaci\u00f3n') + ' - ' + hoja +
      (editFila ? ' (Editando)' : '');

    Utils.show(document.getElementById('formContainer'));
    Utils.hide(document.getElementById('welcomeScreen'));
    Utils.show(document.getElementById('formLoader'));
    Utils.hide(document.getElementById('mainForm'));

    try {
      const res = await API.getColumnas(tipo, hoja);
      this.renderForm(res.columnas, editFila);
    } catch (err) {
      document.getElementById('formLoader').textContent = 'Error: ' + err.message;
    }
  },

  async renderForm(columnas, editFila) {
    const container = document.getElementById('formFields');
    const form = document.getElementById('mainForm');
    this.fieldMap = {};

    const seccionesHtml = {};
    for (const s of this.secciones) seccionesHtml[s.id] = '';

    columnas.forEach(col => {
      const nombre = col.nombre;
      if (!nombre) return;

      const key = this.getKey(nombre);
      const labelText = this.formatearLabel(nombre);
      const seccionId = this.getSeccionId(nombre);
      let inputHtml;

      if (this.esCampoBloqueado(nombre)) {
        inputHtml = `<input type="text" id="f-${key}" name="${key}" value="${this.getValorFijo(nombre)}" disabled>`;
      } else if (this.esCampoFecha(nombre)) {
        const val = Utils.getFechaHoy();
        inputHtml = `<input type="date" id="f-${key}" name="${key}" value="${val}" placeholder="${labelText}">`;
      } else if (this.esCampoSelect(nombre)) {
        const nSel = this.limpiarNombreColumna(nombre).toUpperCase();
        const esParentesco = nSel.includes('PARENTESCO');
        const esCanton = nSel.includes('CANTON') || nSel.includes('CANTÓN');
        const esVehiculo = (nSel.includes('VEHICULO') || nSel.includes('VEHÍCULO')) && nSel.includes('TIPO');
        let optionsHtml;
        if (esParentesco) {
          optionsHtml = [
            '<option value="">Seleccione...</option>',
            '<option value="T">T = Titular</option>',
            '<option value="C">C = Conyuge</option>',
            '<option value="H">H = Hijo/a</option>',
            '<option value="X">X = Pariente</option>',
          ].join('');
        } else if (esCanton) {
          optionsHtml = [
            '<option value="">Seleccione cant\u00f3n...</option>',
            '<option value="601">601 = Riobamba</option>',
            '<option value="602">602 = Alausi</option>',
            '<option value="603">603 = Colta</option>',
            '<option value="604">604 = Chambo</option>',
            '<option value="605">605 = Chunchi</option>',
            '<option value="606">606 = Guamote</option>',
            '<option value="607">607 = Guano</option>',
          ].join('');
        } else if (esVehiculo) {
          optionsHtml = [
            '<option value="">Seleccione tipo...</option>',
            '<option value="A">A = Automovil o camioneta</option>',
            '<option value="B">B = Motocicleta excepto electrica</option>',
            '<option value="C">C = Camion</option>',
            '<option value="D">D = Especial (Ambulancia, blindado, concretera, grua, motobomba, recolector, wincha)</option>',
            '<option value="E">E = Bus</option>',
            '<option value="F">F = Tanquero</option>',
            '<option value="G">G = Trailer</option>',
            '<option value="H">H = Volqueta</option>',
            '<option value="Z">Z = Desconocido</option>',
          ].join('');
        } else {
          optionsHtml = '<option value="">Seleccione dependencia...</option>';
        }
        inputHtml = `<select id="f-${key}" name="${key}">${optionsHtml}</select>`;
      } else if (this.esCampoNombreLargo(nombre)) {
        inputHtml = `<textarea id="f-${key}" name="${key}" rows="4" placeholder="${labelText}"></textarea>`;
      } else if (this.esCampoCatalogo(nombre)) {
        const catalogo = this.getCatalogoNombre(nombre);
        inputHtml = `<div class="input-wrapper"><input type="text" id="f-${key}" name="${key}" data-catalogo="${catalogo}" data-colcodigo="codigo" data-coldesc="descripcion" placeholder="${labelText}"></div>`;
      } else if (this.esCampoNumero(nombre)) {
        const val = '';
        inputHtml = `<input type="number" id="f-${key}" name="${key}" value="${val}" placeholder="${labelText}">`;
      } else {
        inputHtml = `<input type="text" id="f-${key}" name="${key}" placeholder="${labelText}">`;
      }

      const esNombreLargo = this.esCampoNombreLargo(nombre);
      seccionesHtml[seccionId] += `<div class="form-group${esNombreLargo ? ' full-width' : ''}"><label for="f-${key}">${labelText}</label>${inputHtml}</div>`;
      this.fieldMap[key] = nombre;
    });

    let html = '';
    for (const s of this.secciones) {
      if (seccionesHtml[s.id]) {
        html += `<div class="form-section"><div class="form-section-title">${s.titulo}</div><div class="form-grid">${seccionesHtml[s.id]}</div></div>`;
      }
    }

    container.innerHTML = html;

    document.querySelectorAll('#formFields input[name*="CODIGO"], #formFields input[name*="CODIGO"]').forEach(inp => {
      const targetKey = Object.keys(this.fieldMap).find(k =>
        (k.includes('NOMBRE_DEL_PROCEDIMIENTO') || k.includes('NOMBRE_PROCEDIMIENTO') || k.includes('NOMBRE_DEL_DIAGNOSTICO'))
      );
      if (targetKey) inp.dataset.targetdesc = targetKey;
    });

    document.getElementById('formLoader').style.display = 'none';
    form.style.display = '';

    document.querySelectorAll('#formFields input[data-catalogo]').forEach(input => {
      Autocomplete.configurar(input, input.dataset.catalogo, 'codigo', 'descripcion');
    });

    Reglas.setFieldMapDirect(document.querySelectorAll('#formFields input, #formFields select'));

    await this.cargarSelectDependencia();

    Reglas.aplicarValoresFijos(this.currentHoja);
    Reglas.setupEventListeners();
    this.setupSubmitHandler(editFila);
    RecentTable.cargar(this.currentTipo, this.currentHoja);
    this.aplicarVisibilidadMedico(App.userType === 'medico');
    if (this.currentTipo === 'hospitalizacion' && !editFila) {
      this.agregarBuscadorPacientes();
    }
  },

  esCampoMedico(key) {
    const k = key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const ocultos = [
      'NMERO_PACIENTE', 'NO_PACIENTE',
      'VALOR_UNITARIO', 'VALOR_TOTAL', 'DURACIN',
      'CODIGO_DE_DERIVACION', 'TIEMPO_ANESTESIA',
      'PORCENTAJE_IVA', 'VALOR_IVA_UNITARIO',
      'DISCAPACIDAD_CERTIFICADA', 'GASTOS_DE_GESTION',
      'COBERTURA_COMPARTIDA', 'TIPO_DE_COBERTURA',
    ];
    return ocultos.some(o => k.includes(o));
  },

  aplicarVisibilidadMedico(esMedico) {
    document.querySelectorAll('#formFields .form-group').forEach(el => {
      const input = el.querySelector('input, select');
      if (input && input.name && this.esCampoMedico(input.name)) {
        el.classList.toggle('hidden-field', esMedico);
      }
    });
  },

  esCampoSelect(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    const esVehiculo = (n.includes('VEHICULO') || n.includes('VEHÍCULO')) && n.includes('TIPO');
    return n.includes('DEPENDENCIA') || n.includes('PARENTESCO') ||
           n.includes('CANTON') || n.includes('CANTÓN') || esVehiculo;
  },

  async cargarSelectDependencia() {
    try {
      const res = await API.getCatalogoCompleto('dependencia');
      const select = document.querySelector('#formFields select[name*="DEPENDENCIA"]');
      if (!select) return;
      (res.datos || []).forEach(item => {
        const cod = (item.codigo || item.código || '').toUpperCase();
        const desc = item.descripcion || item.descripción || '';
        const opt = document.createElement('option');
        opt.value = cod;
        opt.textContent = cod + ' - ' + desc;
        select.appendChild(opt);
      });
      const optExtra = document.createElement('option');
      optExtra.value = '9999999998';
      optExtra.textContent = '9999999998 - (SPPAT fijo)';
      select.appendChild(optExtra);
    } catch (err) {
      console.error('Error cargando dependencias:', err);
    }
  },

  agregarBuscadorPacientes() {
    const container = document.getElementById('formContainer');
    const existing = document.getElementById('buscadorPacientes');
    if (existing) existing.remove();

    const html = `
      <div id="buscadorPacientes" class="buscador-pacientes">
        <strong>Buscar paciente desde Emergencia</strong>
        <div class="buscador-row">
          <input type="text" id="inputBuscarPaciente" placeholder="C\u00e9dula o nombres...">
          <button id="btnBuscarPaciente" class="btn-buscar">Buscar</button>
        </div>
        <div id="resultadosBusqueda" class="resultados-busqueda"></div>
      </div>`;
    container.insertAdjacentHTML('afterbegin', html);

    const input = document.getElementById('inputBuscarPaciente');
    const btn = document.getElementById('btnBuscarPaciente');
    const resultsDiv = document.getElementById('resultadosBusqueda');

    const buscar = async () => {
      const q = input.value.trim();
      if (q.length < 3) { resultsDiv.style.display = 'none'; return; }
      resultsDiv.innerHTML = '<div class="result-msg">Buscando...</div>';
      resultsDiv.style.display = 'block';
      try {
        const res = await API.buscarPacientes(q);
        if (!res.datos || res.datos.length === 0) {
          resultsDiv.innerHTML = '<div class="result-msg">Sin resultados</div>';
          return;
        }
        let listHtml = '';
        res.datos.forEach((item, idx) => {
          const id = item.datos.IDENTIFICACION_BENEFICIARIO || item.datos.IDENTIFICACION_AFILIADO || '';
          const apell = item.datos.APELLIDOS_BENEFICIARIO || item.datos.APELLIDOS || '';
          const nombres = item.datos.NOMBRES || item.datos.NOMBRE || '';
          listHtml += `<div class="result-item" data-idx="${idx}">
            <span class="result-id">${id}</span>
            <span class="result-name">${apell} ${nombres}</span>
            <span class="result-hoja">${item.hoja}</span>
          </div>`;
        });
        resultsDiv.innerHTML = listHtml;
        resultsDiv.querySelectorAll('.result-item').forEach(el => {
          el.addEventListener('click', () => {
            const datos = res.datos[parseInt(el.dataset.idx)].datos;
            this.llenarFormularioConDatos(datos);
            resultsDiv.style.display = 'none';
            input.value = '';
            Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Paciente cargado desde Emergencia');
          });

        });
      } catch (err) {
        resultsDiv.innerHTML = '<div class="result-msg" style="color:#d00">Error: ' + err.message + '</div>';
      }
    };

    btn.addEventListener('click', buscar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
  },

  llenarFormularioConDatos(datos) {
    const inputs = document.querySelectorAll('#formFields input, #formFields select');
    const formKeys = {};
    inputs.forEach(inp => { if (inp.name) formKeys[inp.name] = inp; });

    Object.keys(datos).forEach(dk => {
      const val = datos[dk];
      if (!val) return;
      // find matching form field
      const matchKey = Object.keys(formKeys).find(fk =>
        fk === dk || fk.includes(dk) || dk.includes(fk)
      );
      if (matchKey) {
        const el = formKeys[matchKey];
        if (!el.disabled) el.value = val;
      }
    });

    Reglas.calcularEdad();
    Reglas.copiarDatosTitular();
  },

  esCampoFecha(nombre) {
    return this.limpiarNombreColumna(nombre).toUpperCase().includes('FECHA');
  },

  esFechaIngreso(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n.includes('FECHA') && (n.includes('INGRESO') || n.includes('EGRESO'));
  },

  esCampoBloqueado(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    if (n.includes('MARCA FINAL') || n.includes('UNIDAD OPERATIVA')) return true;
    if (n.includes('PROVINCIA') || n.includes('UNICODIGO') || n.includes('PAGINA') || n.includes('PÁGINA') || n.includes('ARCHIVO')) return true;
    return false;
  },

  esNoPaciente(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n.includes('NO. PACIENTE') || n.includes('NO PACIENTE') || n.startsWith('NO.');
  },

  esCampoNombreLargo(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n.includes('NOMBRE_DEL_PROCEDIMIENTO') || n.includes('NOMBRE_PROCEDIMIENTO') ||
           n.includes('NOMBRE_DEL_MEDICAMENTO') || n.includes('NOMBRE_MEDICAMENTO');
  },

  esCampoNumero(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n === 'EDAD' || n.includes('%') || n === 'PORCENTAJE' || n === 'CANTIDAD' || n.includes('VALOR') || this.esNoPaciente(nombre);
  },

  esCampoCatalogo(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n.includes('PROCEDIMIENTO') || n.includes('DIAGN\u00d3STICO') || n.includes('DIAGNOSTICO') ||
           n.includes('MEDICAMENTO') || n.includes('EXAMEN') ||
           n.includes('INTRAHOSPITAL') || n.includes('BENEFICIARIO') ||
           n.startsWith('DG.') || n.startsWith('DG ');
  },

  getCatalogoNombre(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    if (n.includes('PROCEDIMIENTO')) return 'procedimientos,medicamentos';
    if (n.includes('DIAGN\u00d3STICO') || n.includes('DIAGNOSTICO')) return 'diagnosticos';
    if (n.startsWith('DG.') || n.startsWith('DG ')) return 'diagnosticos';
    if (n.includes('MEDICAMENTO')) return 'medicamentos';
    if (n.includes('EXAMEN')) return 'tipoexamen';
    if (n.includes('INTRAHOSPITAL')) return 'intrahospital';
    if (n.includes('BENEFICIARIO')) return 'beneficiario';
    return 'procedimientos,medicamentos';
  },

  getValorFijo(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    if (n.includes('MARCA FINAL')) return 'F';
    if (n.includes('UNIDAD OPERATIVA')) return 'HOSPITAL MIGUEL LEON BERMEO CHUNCHI';
    if (n.includes('PROVINCIA')) return 'H';
    if (n.includes('UNICODIGO')) return '471';
    if (n.includes('PAGINA') || n.includes('PÁGINA')) return '1';
    if (n.includes('ARCHIVO')) return 'HCU_008_';
    return '';
  },

  setupSubmitHandler(editFila) {
    const form = document.getElementById('mainForm');
    const btn = document.getElementById('btnGuardar');

    const limpiarErrores = () => {
      document.querySelectorAll('#formFields .field-error').forEach(el => el.classList.remove('field-error'));
      document.querySelectorAll('#formFields .label-error').forEach(el => el.classList.remove('label-error'));
    };

    const validarFormulario = () => {
      limpiarErrores();
      const campos = document.querySelectorAll('#formFields input:not([disabled]), #formFields select:not([disabled])');
      const nombresCampos = {};
      campos.forEach(el => { if (el.name) nombresCampos[el.name] = el; });

      const required = ['IDENTIFICACION_BENEFICIARIO', 'APELLIDOS', 'FECHA_INGRESO'];
      const faltantes = [];

      required.forEach(r => {
        const matchKey = Object.keys(nombresCampos).find(k =>
          k.includes(r) || (r === 'APELLIDOS' && (k.includes('APELLIDOS_BENEFICIARIO') || k === 'APELLIDOS'))
        );
        if (matchKey) {
          const el = nombresCampos[matchKey];
          if (!el.value || !el.value.trim()) {
            faltantes.push(matchKey);
            el.classList.add('field-error');
            const label = el.closest('.form-group')?.querySelector('label');
            if (label) label.classList.add('label-error');
          }
        }
      });

      // Find which date field to check: prefer FECHA_INGRESO, fallback FECHA_ATENCION
      const fechaKeys = Object.keys(nombresCampos).filter(k => k.includes('FECHA_INGRESO'));
      if (fechaKeys.length === 0) {
        // No FECHA_INGRESO in this sheet, check FECHA_ATENCION instead
        const fechaAtencionKeys = Object.keys(nombresCampos).filter(k => k.includes('FECHA_ATENCION'));
        fechaAtencionKeys.forEach(fk => {
          const el = nombresCampos[fk];
          if (!el.value || !el.value.trim()) {
            faltantes.push(fk);
            el.classList.add('field-error');
            const label = el.closest('.form-group')?.querySelector('label');
            if (label) label.classList.add('label-error');
          }
        });
        // Remove FECHA_INGRESO from faltantes if present (it's not in this sheet)
        const ingresoIdx = faltantes.findIndex(f => f.includes('FECHA_INGRESO'));
        if (ingresoIdx >= 0) faltantes.splice(ingresoIdx, 1);
      } else {
        // Has FECHA_INGRESO, check if FECHA_ATENCION can satisfy instead
        const fechaIngresoEl = nombresCampos[fechaKeys[0]];
        if (!fechaIngresoEl.value || !fechaIngresoEl.value.trim()) {
          const fechaAtencionKey = Object.keys(nombresCampos).find(k => k.includes('FECHA_ATENCION'));
          if (fechaAtencionKey && nombresCampos[fechaAtencionKey].value) {
            fechaIngresoEl.classList.remove('field-error');
            const label = fechaIngresoEl.closest('.form-group')?.querySelector('label');
            if (label) label.classList.remove('label-error');
            const idx = faltantes.indexOf(fechaKeys[0]);
            if (idx >= 0) faltantes.splice(idx, 1);
          }
        }
      }

      return faltantes;
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Guardando...';

      const errores = validarFormulario();
      if (errores.length > 0) {
        Utils.mostrarAlerta(document.getElementById('formMessages'), 'error',
          'Campos obligatorios vac\u00edos: ' + errores.join(', '));
        btn.disabled = false;
        btn.textContent = editFila ? '\u270F\uFE0F Actualizar' : '\u{1F4BE} Guardar';
        return;
      }

      const data = {};
      document.querySelectorAll('#formFields input, #formFields select').forEach(el => {
        if (el.name) data[el.name] = (el.value || '').toUpperCase();
      });

      try {
        if (editFila) {
          await API.actualizarRegistro(this.currentTipo, this.currentHoja, editFila, data);
        } else {
          await API.guardarRegistro(this.currentTipo, this.currentHoja, data);
        }
        Utils.mostrarAlerta(document.getElementById('formMessages'), 'success',
          editFila ? 'Registro actualizado' : 'Registro guardado');

        form.reset();
        Reglas.aplicarValoresFijos(this.currentHoja);
        limpiarErrores();

        RecentTable.cargar(this.currentTipo, this.currentHoja);
        delete this.editFila;
      } catch (err) {
        Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = editFila ? '\u270F\uFE0F Actualizar' : '\u{1F4BE} Guardar';
      }
    };
  },
};
