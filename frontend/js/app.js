const App = {
  initialized: false,
  userType: 'medico',
  meses: [],

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupEventListeners();
    this.setUserType(this.userType);
    Autocomplete.init();
    await Promise.all([
      this.checkConnection(),
      this.loadMeses(),
      Menu.init((tipo, hoja) => this.onSelectHoja(tipo, hoja)),
    ]);
  },

  setUserType(tipo) {
    this.userType = tipo;
    document.querySelectorAll('.user-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.user === tipo);
    });
    if (FormBuilder.currentHoja) {
      FormBuilder.aplicarVisibilidadMedico(tipo === 'medico');
      FormBuilder.aplicarPerfilHoja();
    }
  },

  generarCodigoMesActual() {
    const now = new Date();
    const anio = now.getFullYear();
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    return `${anio}_${mes}`;
  },

  async loadMeses() {
    try {
      const resp = await API.getMeses();
      this.meses = resp.meses || [];
      const select = document.getElementById('monthSelect');
      select.innerHTML = '<option value="">-- Seleccionar mes --</option>';

      if (this.meses.length > 0) {
        this.meses.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.codigo;
          opt.textContent = m.nombre || m.codigo;
          select.appendChild(opt);
        });
        // Priorizar el mes calendario actual, incluso si quedó otro mes guardado
        // en el navegador. Si todavía no existe, respetar la selección guardada.
        const codigoActual = this.generarCodigoMesActual();
        const mesActual = this.meses.find(m => m.codigo === codigoActual);
        const guardado = localStorage.getItem('planillaje.mes');
        const mesGuardado = this.meses.find(m => m.codigo === guardado);
        const preseleccionado = mesActual?.codigo || mesGuardado?.codigo || this.meses[0].codigo;
        select.value = preseleccionado;
        this.switchMes(preseleccionado);
      } else {
        select.innerHTML += '<option value="" disabled>No hay meses creados</option>';
        // Intentar obtener el mes actual desde el backend por si warmCache lo creo
        try {
          const actual = await API.getMesActual();
          if (actual && actual.codigo) {
            window.mesActual = actual.codigo;
          }
        } catch (e) { /* ignore */ }
      }
      // Reemplazar el manejador evita acumular eventos cada vez que se recarga la lista.
      select.onchange = () => this.switchMes(select.value);
    } catch (err) {
      console.error('Error cargando meses:', err);
    }
  },

  switchMes(codigo) {
    window.mesActual = codigo || '';
    if (codigo) localStorage.setItem('planillaje.mes', codigo);
    const mes = this.meses.find(m => m.codigo === codigo);
    document.getElementById('monthSelect').value = codigo || '';
    this.actualizarIndicadorDrive(mes);
    if (FormBuilder.currentHoja) {
      this.onSelectHoja(FormBuilder.currentTipo, FormBuilder.currentHoja);
    } else {
      // Refrescar tabla de recientes si esta visible, con el nuevo mes
      const tableContainer = document.getElementById('recentTableContainer');
      if (tableContainer && tableContainer.style.display !== 'none' && RecentTable.currentHoja) {
        RecentTable.cargar(RecentTable.currentTipo, RecentTable.currentHoja);
      }
    }
  },

  actualizarIndicadorDrive(mes) {
    let indicator = document.getElementById('driveIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'driveIndicator';
      indicator.className = 'drive-indicator';
      const header = document.querySelector('.header-center');
      if (header) header.appendChild(indicator);
    }
    if (mes) {
      const hId = mes.hosp_sheet_id ? `<a href="https://docs.google.com/spreadsheets/d/${mes.hosp_sheet_id}/edit" target="_blank" title="Hospitalización">Hosp</a>` : '-';
      const eId = mes.emerg_sheet_id ? `<a href="https://docs.google.com/spreadsheets/d/${mes.emerg_sheet_id}/edit" target="_blank" title="Emergencia">Emerg</a>` : '-';
      const carpeta = mes.carpeta_id ? `<a href="https://drive.google.com/drive/folders/${mes.carpeta_id}" target="_blank" title="Carpeta mensual">&#x1F4C1;</a>` : '';
      indicator.innerHTML = `${carpeta} ${mes.nombre || mes.codigo} &nbsp; ${hId} ${eId}`;
      indicator.title = `Carpeta: ${mes.carpeta_id || 'n/d'}\nHosp: ${mes.hosp_sheet_id || 'n/d'}\nEmerg: ${mes.emerg_sheet_id || 'n/d'}`;
    } else {
      indicator.innerHTML = '&#x1F4C1; Sin mes';
      indicator.title = 'Sin mes creado';
    }
    // Mostrar sheet activo en el formulario si hay
    this.actualizarSheetActivo(mes);
  },

  actualizarSheetActivo(mes) {
    let info = document.getElementById('activeSheetInfo');
    const formContainer = document.getElementById('formContainer');
    if (!formContainer) return;
    if (!info) {
      info = document.createElement('div');
      info.id = 'activeSheetInfo';
      info.className = 'active-sheet-info';
      const formHeader = formContainer.querySelector('.form-header');
      if (formHeader) formHeader.appendChild(info);
      else formContainer.insertBefore(info, formContainer.firstChild);
    }
    if (mes && FormBuilder.currentTipo) {
      const tipo = FormBuilder.currentTipo === 'hospitalizacion' ? 'HOSPITALIZACIÓN' : 'EMERGENCIA';
      const sheetId = FormBuilder.currentTipo === 'hospitalizacion' ? mes.hosp_sheet_id : mes.emerg_sheet_id;
      const hoja = FormBuilder.currentHoja || '';
      info.innerHTML = `&#x1F4CA; ${mes.nombre || mes.codigo} — ${tipo} / ${hoja}` +
        (sheetId ? ` <a href="https://docs.google.com/spreadsheets/d/${sheetId}/edit" target="_blank" style="font-size:10px;color:#a0e9b8;">(Abrir en Drive)</a>` : '');
      Utils.show(info);
    } else {
      Utils.hide(info);
    }
  },

  async crearNuevoMes() {
    const now = new Date();
    const anio = prompt('A\u00f1o:', now.getFullYear());
    if (!anio || isNaN(anio)) return;
    const mes = prompt('Mes (1-12):', now.getMonth() + 1);
    if (!mes || isNaN(mes) || mes < 1 || mes > 12) return;
    try {
      const btn = document.getElementById('btnNuevoMes');
      if (btn) { btn.disabled = true; btn.textContent = '...'; }
      const resp = await API.crearMes(parseInt(anio, 10), parseInt(mes, 10));
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Mes creado: ' + (resp.mes?.codigo || ''));
      await this.loadMeses();
      if (resp.mes?.codigo) {
        this.switchMes(resp.mes.codigo);
        const faltante = !(resp.mes.hosp_sheet_id || resp.mes.hospSheetId) ? 'hospitalizacion' :
          (!(resp.mes.emerg_sheet_id || resp.mes.emergSheetId) ? 'emergencia' : '');
        if (faltante) await this.abrirArchivosMes(resp.mes.codigo, faltante);
      }
      if (btn) { btn.disabled = false; btn.textContent = '+'; }
    } catch (err) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error al crear mes: ' + err.message);
      const btn = document.getElementById('btnNuevoMes');
      if (btn) { btn.disabled = false; btn.textContent = '+'; }
    }
  },

  async checkConnection() {
    try {
      const h = await API.getHealth();
      document.getElementById('statusDot').className = 'status-dot online';
      document.getElementById('statusText').textContent = 'Conectado';
    } catch {
      document.getElementById('statusDot').className = 'status-dot offline';
      document.getElementById('statusText').textContent = 'Sin conexi\u00f3n';
    }
  },

  setupEventListeners() {
    document.getElementById('btnVolver').addEventListener('click', () => this.volverInicio());
    document.getElementById('btnLimpiar').addEventListener('click', () => this.limpiarFormulario());
    document.getElementById('btnUserGeneral').addEventListener('click', () => this.setUserType('general'));
    document.getElementById('btnUserMedico').addEventListener('click', () => this.setUserType('medico'));
    document.getElementById('btnExportarExcel')?.addEventListener('click', () => this.exportarExcel());
    document.getElementById('btnNuevoMes')?.addEventListener('click', () => this.crearNuevoMes());
    document.getElementById('btnArchivosMes')?.addEventListener('click', () => this.abrirArchivosMes(window.mesActual));
    document.getElementById('btnCerrarArchivos')?.addEventListener('click', () => document.getElementById('monthFilesDialog')?.close());
    document.getElementById('btnGuardarArchivoMes')?.addEventListener('click', () => this.guardarArchivoMes());
    document.getElementById('monthFileType')?.addEventListener('change', () => {
      document.getElementById('monthFileExisting').value = '';
      document.getElementById('btnGuardarArchivoMes').textContent = 'Guardar archivo';
      this.sugerirNombreArchivoMes();
    });
    document.getElementById('monthFileExisting')?.addEventListener('change', () => {
      const button = document.getElementById('btnGuardarArchivoMes');
      button.textContent = document.getElementById('monthFileExisting').value ? 'Usar archivo seleccionado' : 'Guardar archivo';
    });
    document.getElementById('btnRedescubrir')?.addEventListener('click', () => this.redescubrirMeses());
    document.getElementById('btnActualizarCatalogos')?.addEventListener('click', () => this.actualizarCatalogos());
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter' && FormBuilder.currentHoja) {
        e.preventDefault();
        document.getElementById('btnGuardarContinuar')?.click();
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        document.getElementById('btnAgregarFila')?.click();
      }
    });
  },

  async actualizarCatalogos() {
    const btn = document.getElementById('btnActualizarCatalogos');
    const status = document.getElementById('statusText');
    try {
      if (btn) { btn.disabled = true; btn.classList.add('rotating'); }
      if (status) status.textContent = 'Actualizando catálogos...';
      const resultado = await API.actualizarCatalogos();
      Autocomplete.limpiarCache();
      if (status) status.textContent = `${resultado.total || 0} datos actualizados`;
      setTimeout(() => { if (status) status.textContent = 'Conectado'; }, 3500);
    } catch (err) {
      if (status) status.textContent = 'Error al actualizar catálogos';
      setTimeout(() => this.checkConnection(), 3500);
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('rotating'); }
    }
  },

  async redescubrirMeses() {
    const btn = document.getElementById('btnRedescubrir');
    try {
      if (btn) { btn.disabled = true; btn.textContent = '\u23F3'; }
      const resp = await API.redescubrirMeses();
      const nuevos = resp.descubiertos || 0;
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success',
        `${nuevos} mes(es) encontrado(s) en Drive`);
      await this.loadMeses();
    } catch (err) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error al redescubrir: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F50D;'; }
    }
  },

  sugerirNombreArchivoMes() {
    const input = document.getElementById('monthFileName');
    const mes = this.meses.find(m => m.codigo === document.getElementById('monthFilesDialog')?.dataset.mes);
    if (!input || !mes || input.dataset.edited === 'true') return;
    const tipo = document.getElementById('monthFileType').value;
    const tipoNombre = tipo === 'hospitalizacion' ? 'HOSPITALIZACION' : 'EMERGENCIA';
    const nombreMes = (mes.nombre || mes.codigo).replace(/^\d{2,4}[_\-\s]+/, '').toUpperCase();
    input.value = `${tipoNombre}_${nombreMes}_${mes.anio}`;
  },

  async abrirArchivosMes(codigo, tipoInicial) {
    const dialog = document.getElementById('monthFilesDialog');
    const mes = this.meses.find(m => m.codigo === codigo);
    const message = document.getElementById('monthFilesMessage');
    if (!dialog || !mes) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Selecciona primero un mes válido.');
      return;
    }
    dialog.dataset.mes = codigo;
    document.getElementById('monthFilesDescription').textContent = `Mes: ${mes.nombre || mes.codigo}. Selecciona una hoja existente en su carpeta o crea una nueva.`;
    document.getElementById('monthFileType').value = tipoInicial ||
      (!mes.hosp_sheet_id ? 'hospitalizacion' : (!mes.emerg_sheet_id ? 'emergencia' : 'hospitalizacion'));
    const nameInput = document.getElementById('monthFileName');
    nameInput.dataset.edited = 'false';
    nameInput.oninput = () => { nameInput.dataset.edited = 'true'; };
    document.getElementById('monthFileExisting').innerHTML = '<option value="">Cargando archivos...</option>';
    document.getElementById('monthFileId').value = '';
    message.textContent = '';
    this.sugerirNombreArchivoMes();
    dialog.showModal();
    try {
      const resp = await API.listarArchivosMes(codigo);
      const select = document.getElementById('monthFileExisting');
      select.innerHTML = '<option value="">-- Elegir archivo de Drive --</option>';
      (resp.archivos || []).forEach(archivo => {
        const option = document.createElement('option');
        option.value = archivo.id;
        option.textContent = archivo.nombre;
        select.appendChild(option);
      });
      if (!resp.archivos?.length) select.innerHTML = '<option value="">No hay archivos en la carpeta</option>';
      const hojaActual = document.getElementById('monthFileType').value === 'hospitalizacion'
        ? (mes.hosp_sheet_id || mes.hospSheetId) : (mes.emerg_sheet_id || mes.emergSheetId);
      if (hojaActual && [...select.options].some(option => option.value === hojaActual)) select.value = hojaActual;
    } catch (err) {
      document.getElementById('monthFileExisting').innerHTML = '<option value="">No se pudieron listar archivos</option>';
      message.textContent = err.message;
    }
  },

  async guardarArchivoMes() {
    const dialog = document.getElementById('monthFilesDialog');
    const codigo = dialog?.dataset.mes;
    const archivoId = document.getElementById('monthFileExisting').value;
    const archivoPegado = document.getElementById('monthFileId').value.trim();
    const nombre = document.getElementById('monthFileName').value.trim();
    const tipo = document.getElementById('monthFileType').value;
    const message = document.getElementById('monthFilesMessage');
    const idPegadoMatch = archivoPegado.match(/\/spreadsheets\/d\/([\w-]+)/);
    const idElegido = archivoId || (idPegadoMatch ? idPegadoMatch[1] : archivoPegado);
    if (!idElegido && !nombre) {
      message.textContent = 'Elige una hoja, pega su enlace o escribe el nombre para crearla.';
      return;
    }
    const button = document.getElementById('btnGuardarArchivoMes');
    try {
      button.disabled = true;
      button.textContent = nombre && !idElegido ? 'Creando...' : 'Enlazando...';
      await API.enlazarArchivoMes(codigo, { tipo, archivoId: idElegido, nombre: idElegido ? undefined : nombre });
      dialog.close();
      await this.loadMeses();
      this.switchMes(codigo);
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Archivo del mes enlazado correctamente.');
    } catch (err) {
      message.textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Guardar archivo';
    }
  },

  async exportarExcel() {
    if (!FormBuilder.currentTipo || !FormBuilder.currentHoja) return;
    try {
      const btn = document.getElementById('btnExportarExcel');
      if (btn) { btn.disabled = true; btn.textContent = 'Exportando...'; }
      await API.exportarExcel(FormBuilder.currentTipo, FormBuilder.currentHoja);
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Excel exportado correctamente');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4C4; Exportar Excel'; }
    } catch (err) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error al exportar: ' + err.message);
      const btn = document.getElementById('btnExportarExcel');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4C4; Exportar Excel'; }
    }
  },

  async onSelectHoja(tipo, hoja) {
    Utils.hide(document.getElementById('welcomeScreen'));
    FormBuilder.editFila = null;
    FormBuilder.currentTipo = tipo;
    FormBuilder.currentHoja = hoja;
    try {
      await FormBuilder.build(tipo, hoja);
    } catch (e) {
      console.error('Error building form:', e);
    }
    // Refrescar tabla incluso si build fallo
    RecentTable.cargar(tipo, hoja);
    const mes = this.meses.find(m => m.codigo === window.mesActual);
    this.actualizarSheetActivo(mes);
  },

  volverInicio() {
    Utils.hide(document.getElementById('formContainer'));
    Utils.hide(document.getElementById('recentTableContainer'));
    Utils.show(document.getElementById('welcomeScreen'));
    document.querySelectorAll('.menu-submodulo-item').forEach(el => el.classList.remove('active'));
  },

  limpiarFormulario() {
    document.getElementById('mainForm')?.reset();
    if (FormBuilder.currentHoja) Reglas.aplicarValoresFijos(FormBuilder.currentHoja);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
