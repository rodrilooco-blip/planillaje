const FormBuilder = {
  currentTipo: null,
  currentHoja: null,
  fieldMap: {},

  ordenSecciones: [
    { id: 'paciente', titulo: '1. Datos del Paciente', campos: [
      { keywords: ['DEPENDENCIA'] },
      { keywords: ['TIPO_BENEFICIARIO'] },
      { keywords: ['IDENTIFICACION', 'BENEFICIARIO'] },
      { keywords: ['APELLIDOS', 'BENEFICIARIO'] },
      { keywords: ['SEXO'] },
      { keywords: ['FECHA_NACIMIENTO'] },
      { keywords: ['EDAD'] },
      { keywords: ['PARENTESCO'] },
      { keywords: ['IDENTIFICACION', 'AFILIADO'] },
      { keywords: ['APELLIDOS', 'TITULAR'] },
      { keywords: ['NOMBRES', 'TITULAR'] },
      { keywords: ['IDENTIFICACION', 'TITULAR'] },
      { keywords: ['NOMBRES'] },
    ]},
    { id: 'fechas', titulo: '2. Fechas', campos: [
      { keywords: ['FECHA_ATENCION'] },
      { keywords: ['FECHA_INGRESO'] },
      { keywords: ['FECHA_EGRESO'] },
      { keywords: ['FECHA'] },
    ]},
    { id: 'diagnostico', titulo: '3. Diagn\u00f3stico', campos: [
      { keywords: ['NO_PACIENTE', 'NUMERO_PACIENTE'] },
      { keywords: ['DIAGNOSTICO', 'PRINCIPAL'] },
      { keywords: ['TIPO_DIAGNOSTICO'] },
      { keywords: ['DIAGNOSTICO', 'SECUNDARIO'] },
      { keywords: ['DG_S_1', 'DG_S - 1', 'DG. S - 1', 'DG_S_1'] },
      { keywords: ['DG_S_2', 'DG_S - 2', 'DG. S - 2', 'DG_S_2'] },
      { keywords: ['DG_S_3', 'DG_S - 3', 'DG. S - 3', 'DG_S_3'] },
      { keywords: ['DG_S_4', 'DG_S - 4', 'DG. S - 4', 'DG_S_4'] },
      { keywords: ['DG_S_5', 'DG_S - 5', 'DG. S - 5', 'DG_S_5'] },
      { keywords: ['CIE'] },
    ]},
    { id: 'examen', titulo: 'Examen', campos: [] },
    { id: 'procedimiento', titulo: '4. Procedimientos / Insumos (1 fila por insumo)', campos: [] },
    { id: 'derivacion', titulo: '5. Derivaci\u00f3n', campos: [
      { keywords: ['CODIGO_DERIVACION'] },
      { keywords: ['SECUENCIAL', 'DERIVACION'] },
      { keywords: ['CONTINGENCIA'] },
    ]},
    { id: 'accidente', titulo: 'Datos del Accidente (SPPAT)', campos: [
      { keywords: ['ACCIDENTE'] },
      { keywords: ['VEHICULO'] },
      { keywords: ['PLACA'] },
      { keywords: ['PROVINCIA'] },
      { keywords: ['CANTON'] },
      { keywords: ['UNICODIGO'] },
      { keywords: ['EVIDENCIA'] },
    ]},
    { id: 'cobertura', titulo: 'Cobertura', campos: [
      { keywords: ['COBERTURA'] },
      { keywords: ['PRESTACION'] },
      { keywords: ['DISCAPACIDAD'] },
      { keywords: ['OBSERVACION'] },
    ]},
    { id: 'otros', titulo: '6. Otros Datos', campos: [
      { keywords: ['DURACION'] },
      { keywords: ['PORCENTAJE', 'IVA'] },
      { keywords: ['VALOR', 'IVA'] },
      { keywords: ['VALOR_UNITARIO'] },
      { keywords: ['VALOR_TOTAL'] },
      { keywords: ['CANTIDAD'] },
      { keywords: ['MARCA_FINAL'] },
      { keywords: ['UNIDAD_OPERATIVA'] },
      { keywords: ['PROFESIONAL'] },
      { keywords: ['MEDICO'] },
      { keywords: ['ARCHIVO'] },
      { keywords: ['PAGINA'] },
      { keywords: ['ANESTESIA'] },
      { keywords: ['TIEMPO'] },
    ]},
  ],

  getKeySimple(str) {
    return str.toUpperCase().trim().replace(/\s+/g, '_').replace(/\./g, '').replace(/[^A-Z0-9_]/g, '');
  },

  normalizarPatronKeyword(str) {
    return str.toUpperCase().trim().replace(/\s+/g, '_').replace(/\./g, '').replace(/[^A-Z0-9_]/g, '');
  },

  encontrarColumna(columnas, patrones, usadas) {
    for (const col of columnas) {
      if (usadas.has(col)) continue;
      const key = this.getKey(col.nombre);
      for (const patron of patrones) {
        const p = this.normalizarPatronKeyword(patron);
        if (key.includes(p)) return col;
      }
    }
    return null;
  },

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
    this.camposRepetibles = [];

    let html = '';
    const usadas = new Set();
    const repetiblesPorSeccion = {};

    for (const seccion of this.ordenSecciones) {
      if (seccion.campos.length === 0 && seccion.id !== 'procedimiento') continue;
      if (seccion.id === 'procedimiento') {
        // Collect repeated fields from all remaining columns
        columnas.forEach(col => {
          if (usadas.has(col)) return;
          if (!col.nombre) return;
          if (this.esCampoRepetible(col.nombre)) {
            const key = this.getKey(col.nombre);
            const labelText = this.formatearLabel(col.nombre);
            this.camposRepetibles.push({ key, labelText, nombre: col.nombre });
            usadas.add(col);
          }
        });
        continue;
      }

      let seccionHtml = '';
      for (const campo of seccion.campos) {
        const col = this.encontrarColumna(columnas, campo.keywords, usadas);
        if (!col) continue;
        usadas.add(col);
        seccionHtml += this.renderCampoUnico(col);
      }

      if (seccionHtml) {
        html += `<div class="form-section"><div class="form-section-title">${seccion.titulo}</div><div class="form-grid">${seccionHtml}</div></div>`;
      }
    }

    // Render unmatched columns at the end
    const restantes = columnas.filter(col => !usadas.has(col) && col.nombre);
    if (restantes.length > 0) {
      let restHtml = '';
      for (const col of restantes) {
        if (this.esCampoRepetible(col.nombre)) {
          const key = this.getKey(col.nombre);
          const labelText = this.formatearLabel(col.nombre);
          this.camposRepetibles.push({ key, labelText, nombre: col.nombre });
        } else {
          restHtml += this.renderCampoUnico(col);
        }
      }
      if (restHtml) {
        html += `<div class="form-section"><div class="form-section-title">Otros Datos</div><div class="form-grid">${restHtml}</div></div>`;
      }
    }

    if (this.camposRepetibles.length > 0) {
      html += this.renderTablaInsumos();
    }

    container.innerHTML = html;

    // Auto-fill targetdesc: si un campo catálogo del header tiene un campo NOMBRE correspondiente, linkearlo
    const headerCatalogoInputs = document.querySelectorAll('#formFields > .form-section input[data-catalogo]');
    headerCatalogoInputs.forEach(input => {
      const inputKey = input.name;
      const nombreKey = Object.keys(this.fieldMap).find(k =>
        (k.includes('NOMBRE') && (
          (inputKey.includes('PROCEDIMIENTO') && k.includes('PROCEDIMIENTO') && !k.includes('CODIGO')) ||
          (inputKey.includes('DIAGNOSTICO') && k.includes('DIAGNOSTICO') && !k.includes('DG')) ||
          (inputKey.includes('MEDICAMENTO') && k.includes('MEDICAMENTO') && !k.includes('CODIGO'))
        ))
      );
      if (nombreKey) input.dataset.targetdesc = nombreKey;
    });

    if (this.camposRepetibles.length > 0) {
      this.configurarTablaInsumos();
    }

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

    // Verificar estado de sincronizaci�n al cargar
    this.verificarSyncStatus();
  },

  renderCampoUnico(col) {
    const nombre = col.nombre;
    const key = this.getKey(nombre);
    const labelText = this.formatearLabel(nombre);
    let inputHtml;

    if (this.esCampoBloqueado(nombre)) {
      inputHtml = `<input type="text" id="f-${key}" name="${key}" value="${this.getValorFijo(nombre)}" disabled>`;
    } else if (this.esCampoFecha(nombre)) {
      const val = Utils.getFechaHoy();
      inputHtml = `<input type="date" id="f-${key}" name="${key}" value="${val}" placeholder="${labelText}">`;
    } else if (this.esCampoSelect(nombre)) {
      const nSel = this.limpiarNombreColumna(nombre).toUpperCase();
      const esParentesco = nSel.includes('PARENTESCO');
      const esCanton = nSel.includes('CANTON') || nSel.includes('CANT\u00d3N');
      const esVehiculo = (nSel.includes('VEHICULO') || nSel.includes('VEH\u00cdCULO')) && nSel.includes('TIPO');
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
      } else if (nSel === 'SEXO') {
        optionsHtml = [
          '<option value="">Seleccione...</option>',
          '<option value="M">M = Masculino</option>',
          '<option value="F">F = Femenino</option>',
        ].join('');
      } else if (nSel.includes('CONTINGENCIA')) {
        optionsHtml = [
          '<option value="">Seleccione...</option>',
          '<option value="1">1 = Enfermedad</option>',
          '<option value="2">2 = Maternidad</option>',
          '<option value="3">3 = Enfermedad Profesional</option>',
          '<option value="4">4 = Accidente del Trabajo</option>',
          '<option value="5">5 = Reposo Prenatal</option>',
          '<option value="6">6 = Accidente de Tránsito</option>',
          '<option value="7">7 = Enfermedad Catastrófica</option>',
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
      inputHtml = `<input type="number" id="f-${key}" name="${key}" value="" placeholder="${labelText}">`;
    } else {
      inputHtml = `<input type="text" id="f-${key}" name="${key}" placeholder="${labelText}">`;
    }

    const esNombreLargo = this.esCampoNombreLargo(nombre);
    this.fieldMap[key] = nombre;
    return `<div class="form-group${esNombreLargo ? ' full-width' : ''}"><label for="f-${key}">${labelText}</label>${inputHtml}</div>`;
  },

  async verificarSyncStatus() {
    try {
      const status = await API.checkSyncStatus();
      const section = document.getElementById('formSyncStatus');
      if (!section) return;
      if (status.pendientes > 0) {
        section.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;margin-top:-12px;margin-bottom:12px;background:#fef3cd;border:1px solid #ffc107;border-radius:4px;font-size:12px">
          <span>&#x26A0;</span>
          <span>${status.pendientes} registro(s) pendientes de sincronizar a Google Sheets</span>
          <button type="button" id="btnForzarSync" style="margin-left:auto;padding:4px 12px;background:#ffc107;border:none;border-radius:4px;cursor:pointer;font-weight:600">Sincronizar ahora</button>
        </div>`;
        document.getElementById('btnForzarSync')?.addEventListener('click', async () => {
          const btn = document.getElementById('btnForzarSync');
          btn.disabled = true; btn.textContent = 'Sincronizando...';
          try {
            const r = await API.forceSync();
          } catch (e) { /* ignore */ }
          this.verificarSyncStatus();
        });
      } else {
        section.innerHTML = '';
      }
    } catch (e) { /* no hay servidor */ }
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
           n.includes('CANTON') || n.includes('CANTÓN') || esVehiculo ||
           n === 'SEXO' || n.includes('CONTINGENCIA');
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

      const datosPaciente = {};
      document.querySelectorAll('#formFields input, #formFields select, #formFields textarea').forEach(el => {
        if (el.name && !el.dataset.itemKey) datosPaciente[el.name] = (el.value || '').toUpperCase();
      });

      const items = this.obtenerItemsInsumos();

      try {
        if (items.length > 0 && !editFila) {
          const res = await API.guardarBatch(this.currentTipo, this.currentHoja, datosPaciente, items);
          const status = await API.checkSyncStatus().catch(() => ({ pendientes: '?' }));
          Utils.mostrarAlerta(document.getElementById('formMessages'), 'success',
            `${items.length} registro(s) guardado(s)` + (status.pendientes > 0 ? ` (sync pendiente: ${status.pendientes})` : ' (sincronizado)'));
        } else if (editFila) {
          await API.actualizarRegistro(this.currentTipo, this.currentHoja, editFila, datosPaciente);
          Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Registro actualizado');
        } else {
          await API.guardarRegistro(this.currentTipo, this.currentHoja, datosPaciente);
          Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Registro guardado');
        }

        form.reset();
        Reglas.aplicarValoresFijos(this.currentHoja);
        limpiarErrores();

        if (this.camposRepetibles.length > 0 && !editFila) {
          const tbody = document.getElementById('itemsTableBody');
          if (tbody) tbody.innerHTML = '';
          this.agregarFilaInsumo();
        }

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

  // ====== SECCIÓN REPETIBLE: Tabla de Insumos / Procedimientos ======
  camposRepetibles: [],

  esCampoRepetible(nombre) {
    const n = this.limpiarNombreColumna(nombre).toUpperCase();
    return n.includes('PROCEDIMIENTO') || n.includes('MEDICAMENTO') ||
           n.includes('CANTIDAD') || n.includes('VALOR_UNITARIO') ||
           n.includes('VALOR_TOTAL') || n.includes('DURACION') ||
           n.includes('TIEMPO_ANESTESIA') || n.includes('ANESTESIA') ||
           n.includes('TIPO EXAMEN') || n.includes('TIPO_EXAMEN') ||
           n === 'DURACION' || n === 'TIEMPO_ANESTESIA' || n === 'ANESTESIA';
  },

  renderTablaInsumos() {
    const campos = this.camposRepetibles;
    const tipoExamenKey = campos.find(c => c.key.includes('TIPO_EXAMEN'))?.key || '';
    const codigoKey = campos.find(c => c.nombre.toUpperCase().includes('CODIGO') || c.key.includes('CODIGO'))?.key || '';
    const nombreKey = campos.find(c => c.key.includes('NOMBRE'))?.key || '';
    const cantidadKey = campos.find(c => c.key.includes('CANTIDAD'))?.key || '';

    const colVisibility = [
      { key: tipoExamenKey, label: 'Tipo Examen', type: 'catalogo', catalogo: 'tipoexamen', targetDesc: codigoKey },
      { key: codigoKey, label: 'C\u00f3digo', type: 'codigo-readonly' },
      { key: nombreKey, label: 'Nombre', type: 'nombre-buscable', catalogo: 'procedimientos,medicamentos', targetCode: codigoKey },
      { key: cantidadKey, label: 'Cantidad', type: 'number' },
    ].filter(c => c.key);

    const thHtml = colVisibility.map(c => `<th>${c.label}</th>`).join('');

    const html = `
      <div class="form-section">
        <div class="form-section-title">Procedimientos / Insumos (1 fila por insumo)</div>
        <div class="items-table-wrapper">
          <table class="items-table" id="itemsTable">
            <thead><tr>
              <th>#</th>${thHtml}<th class="col-accion">Acci\u00f3n</th>
            </tr></thead>
            <tbody id="itemsTableBody"></tbody>
          </table>
        </div>
        <button type="button" class="btn btn-secondary btn-agregar-fila" id="btnAgregarFila">+ Agregar fila</button>
      </div>`;

    this._colVisibility = colVisibility;
    return html;
  },

  configurarTablaInsumos() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    document.getElementById('btnAgregarFila')?.addEventListener('click', () => this.agregarFilaInsumo());

    this.agregarFilaInsumo();
  },

    agregarFilaInsumo() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;
    const idx = tbody.children.length + 1;
    const colVisibility = this._colVisibility || [];

    const tdsHtml = colVisibility.map(col => {
      const rowIdx = tbody.children.length;
      const id = `it-${col.key}-${rowIdx}`;

      if (col.type === 'codigo-readonly') {
        return `<td class="td-codigo"><input type="text" id="${id}" data-item-key="${col.key}" placeholder="C\u00f3digo auto" readonly></td>`;
      }

      if (col.type === 'nombre-buscable') {
        const invertAttr = col.targetCode ? ' data-invert="1"' : '';
        const targetAttr = col.targetCode ? ` data-targetcode="${col.targetCode}"` : '';
        return `<td class="td-nombre"><div class="input-wrapper"><input type="text" id="${id}" data-item-key="${col.key}" data-catalogo="${col.catalogo}" data-colcodigo="codigo" data-coldesc="descripcion"${targetAttr}${invertAttr} placeholder="Buscar descripci\u00f3n..." autocomplete="off"></div></td>`;
      }

      if (col.type === 'catalogo') {
        const placeholder = col.label === 'Tipo Examen' ? 'Tipo examen...' : 'Buscar...';
        return `<td class="td-codigo"><div class="input-wrapper"><input type="text" id="${id}" data-item-key="${col.key}" data-catalogo="${col.catalogo}" data-colcodigo="codigo" data-coldesc="descripcion" placeholder="${placeholder}" autocomplete="off"></div></td>`;
      }

      if (col.type === 'textarea') {
        return `<td class="td-nombre"><textarea id="${id}" data-item-key="${col.key}" rows="1" placeholder="Descripci\u00f3n..." readonly></textarea></td>`;
      }

      if (col.type === 'number') {
        return `<td><input type="number" id="${id}" data-item-key="${col.key}" step="0.01" value="0"></td>`;
      }

      return `<td><input type="text" id="${id}" data-item-key="${col.key}"></td>`;
    }).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="td-num">${idx}</td>${tdsHtml}<td class="td-accion"><button type="button" class="btn-quitar-fila" title="Quitar fila">X</button></td>`;
    tbody.appendChild(tr);

    const catalogoInputs = tr.querySelectorAll('input[data-catalogo]');
    catalogoInputs.forEach(inp => {
      Autocomplete.configurar(inp, inp.dataset.catalogo, 'codigo', 'descripcion');
    });

    tr.querySelector('.btn-quitar-fila')?.addEventListener('click', () => {
      tr.remove();
      this.renumerarFilas();
    });
  },

  renumerarFilas() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;
    [...tbody.children].forEach((tr, i) => {
      const numCell = tr.querySelector('.td-num');
      if (numCell) numCell.textContent = i + 1;
    });
  },

  obtenerItemsInsumos() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return [];
    const items = [];
    const colVisibility = this._colVisibility || [];

    for (const tr of tbody.children) {
      const item = {};
      let codigo = '';
      for (const col of colVisibility) {
        const input = tr.querySelector(`[data-item-key="${col.key}"]`);
        const val = input ? (input.value || '').toUpperCase().trim() : '';
        item[col.key] = val;
        if (col.type === 'catalogo') codigo = val;
      }
      // Verificar que la fila tenga al menos un código
      if (codigo) items.push(item);
    }
    return items;
  },
};
