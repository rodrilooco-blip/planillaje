const App = {
  initialized: false,
  userType: 'medico',
  meses: [],
  doctorName: '',
  currentView: 'home',

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupEventListeners();
    this.setUserType(this.userType);
    const doctorEntryName = document.getElementById('doctorEntryName');
    this.doctorName = sessionStorage.getItem('planillaje.medico') || '';
    if (doctorEntryName) doctorEntryName.value = this.doctorName;
    if (this.doctorName) document.getElementById('doctorEntryError').textContent = '';
    Autocomplete.init();
    await Promise.all([
      this.checkConnection(),
      this.loadMeses(),
      Menu.init((tipo, hoja) => this.onSelectHoja(tipo, hoja)),
    ]);
    await Promise.all([this.actualizarDashboardSync(), this.actualizarResumenDashboard()]);
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
          const respuesta = await API.getMesActual();
          const actual = respuesta?.mes || respuesta;
          if (actual && actual.codigo) {
            this.meses = [actual];
            select.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = actual.codigo;
            opt.textContent = actual.nombre || actual.codigo;
            select.appendChild(opt);
            select.value = actual.codigo;
            this.switchMes(actual.codigo);
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
    this.actualizarEtiquetaMes(mes);
    this.actualizarIndicadorDrive(mes);
    this.actualizarResumenDashboard();
    if (this.currentView === 'module' && FormBuilder.currentHoja) {
      this.onSelectHoja(FormBuilder.currentTipo, FormBuilder.currentHoja);
    } else if (this.currentView === 'recent' && RecentTable.currentHoja) {
      RecentTable.cargar(RecentTable.currentTipo, RecentTable.currentHoja);
    }
  },

  actualizarEtiquetaMes(mes) {
    const label = document.getElementById('dashboardMonthLabel');
    if (label) label.textContent = mes ? (mes.nombre || mes.codigo) : 'Sin mes seleccionado';
  },

  async actualizarResumenDashboard() {
    const elementos = {
      emergencia: [document.getElementById('dashboardEmergencyCount'), document.getElementById('dashboardEmergencyCountLabel')],
      hospitalizacion: [document.getElementById('dashboardHospitalCount'), document.getElementById('dashboardHospitalCountLabel')],
    };
    const mesSolicitado = window.mesActual || '';
    try {
      const respuesta = await API.getDashboardResumen(mesSolicitado);
      if (mesSolicitado !== (window.mesActual || '')) return;
      for (const tipo of Object.keys(elementos)) {
        const [valor, label] = elementos[tipo];
        const dato = respuesta.resumen?.[tipo];
        valor.textContent = ['ok', 'parcial'].includes(dato?.estado) ? Number(dato.total || 0).toLocaleString('es-EC') : '—';
        label.textContent = dato?.estado === 'ok' ? 'Registros del mes' :
          (dato?.estado === 'parcial' ? 'Registros contados; revisar hojas' :
          (dato?.estado === 'sin-archivo' ? 'Sin archivo enlazado' : 'Total no disponible'));
      }
    } catch (error) {
      for (const [valor, label] of Object.values(elementos)) {
        valor.textContent = '—';
        label.textContent = 'Total no disponible';
      }
    }
  },

  async actualizarDashboardSync() {
    const status = document.getElementById('dashboardSyncStatus');
    const detail = document.getElementById('dashboardSyncUpdated');
    const button = document.getElementById('btnDashboardSync');
    try {
      const respuesta = await API.checkSyncStatus();
      const pendientes = Number(respuesta.pendientes || 0);
      status.textContent = pendientes ? `${pendientes} registro(s) pendiente(s)` : 'Todo está sincronizado';
      detail.textContent = pendientes
        ? 'Hay registros locales esperando enviarse a Google Sheets.'
        : 'No hay cambios pendientes de enviar a Google Sheets.';
      if (button) button.disabled = pendientes === 0;
    } catch (error) {
      status.textContent = 'Estado no disponible';
      detail.textContent = 'No se pudo consultar la cola de sincronización local.';
      if (button) button.disabled = true;
    }
  },

  async sincronizarDashboard() {
    const button = document.getElementById('btnDashboardSync');
    const status = document.getElementById('dashboardSyncStatus');
    const detail = document.getElementById('dashboardSyncUpdated');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Sincronizando…';
    try {
      const respuesta = await API.forceSync();
      status.textContent = respuesta.restantes ? `${respuesta.restantes} registro(s) pendiente(s)` : 'Todo está sincronizado';
      detail.textContent = respuesta.mensaje || 'Se actualizó la sincronización.';
      await this.actualizarDashboardSync();
    } catch (error) {
      status.textContent = 'No se pudo sincronizar';
      detail.textContent = error.message;
      button.disabled = false;
    } finally {
      button.textContent = 'Sincronizar ahora';
    }
  },

  ingresarMedico(event) {
    event.preventDefault();
    const input = document.getElementById('doctorEntryName');
    const nombre = (input?.value || '').trim().replace(/\s+/g, ' ');
    const error = document.getElementById('doctorEntryError');
    if (!nombre) {
      error.textContent = 'Escribe el nombre del médico para continuar.';
      input?.focus();
      return;
    }
    const nombreAnterior = this.doctorName;
    this.doctorName = nombre;
    sessionStorage.setItem('planillaje.medico', nombre);
    document.getElementById('doctorNameDisplay').textContent = nombre;
    document.getElementById('welcomeDoctorName').textContent = nombre;
    document.getElementById('doctorEntryScreen').hidden = true;
    document.getElementById('appShell').hidden = false;
    error.textContent = '';
    if (nombreAnterior !== nombre) this.aplicarMedicoEnFormulario(nombreAnterior);
  },

  solicitarCambioMedico() {
    document.getElementById('doctorEntryName').value = this.doctorName;
    document.getElementById('doctorEntryError').textContent = '';
    document.getElementById('appShell').hidden = true;
    document.getElementById('doctorEntryScreen').hidden = false;
    document.getElementById('doctorEntryName').focus();
  },

  aplicarMedicoEnFormulario(nombreAnterior = '') {
    const campos = document.querySelectorAll('#formFields input, #formFields select, #formFields textarea');
    const profesional = [...campos].find(campo => {
      const key = Utils.normalizar(campo.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return key.includes('PROFESIONAL') && key.includes('APELLIDO');
    });
    if (profesional && (!profesional.value.trim() || profesional.value.trim() === nombreAnterior)) {
      profesional.value = this.doctorName;
    }
  },

  abrirModulo(tipo) {
    const hoja = Menu.modulos?.[tipo]?.[0];
    if (hoja) Menu.selectHoja(tipo, hoja);
    else Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', `No hay hojas configuradas para ${tipo}.`);
  },

  iniciarRegistroRapido() {
    this.abrirModulo('emergencia');
  },

  async abrirRecientes() {
    const tipo = RecentTable.currentTipo || FormBuilder.currentTipo || 'emergencia';
    const hoja = RecentTable.currentHoja || FormBuilder.currentHoja || Menu.modulos?.[tipo]?.[0];
    if (!hoja) return;
    this.currentView = 'recent';
    Utils.hide(document.getElementById('welcomeScreen'));
    Utils.hide(document.getElementById('formContainer'));
    await RecentTable.cargar(tipo, hoja);
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
      if (btn) { btn.disabled = false; btn.textContent = 'Crear mes'; }
    } catch (err) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error al crear mes: ' + err.message);
      const btn = document.getElementById('btnNuevoMes');
      if (btn) { btn.disabled = false; btn.textContent = 'Crear mes'; }
    }
  },

  async checkConnection() {
    const capabilityNote = document.getElementById('localCapabilityNote');
    try {
      const h = await API.getHealth();
      document.getElementById('statusDot').className = 'status-dot online';
      document.getElementById('statusText').textContent = 'Conectado';
      if (capabilityNote) capabilityNote.textContent = 'Servidor conectado. El estado de las hojas aparece en cada módulo; selecciona una hoja mensual para registrar datos.';
    } catch {
      document.getElementById('statusDot').className = 'status-dot offline';
      document.getElementById('statusText').textContent = 'Sin conexi\u00f3n';
      if (capabilityNote) capabilityNote.textContent = 'No se pudo conectar al servidor local. Reinicia la aplicación y vuelve a cargar esta página.';
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
    document.getElementById('btnCloseRecordDetails')?.addEventListener('click', () => RecentTable.cerrarDetalle());
    document.getElementById('btnPrintRecordDetails')?.addEventListener('click', () => {
      const fila = document.getElementById('recordDetailsTitle')?.textContent.match(/Registro (\d+)/)?.[1];
      if (fila) RecentTable.imprimir(Number(fila));
    });
    document.getElementById('btnDashboardSync')?.addEventListener('click', () => this.sincronizarDashboard());
    document.getElementById('doctorEntryForm')?.addEventListener('submit', event => this.ingresarMedico(event));
    document.getElementById('btnCambiarMedico')?.addEventListener('click', () => this.solicitarCambioMedico());
    document.getElementById('btnDashboardEmergencia')?.addEventListener('click', () => this.abrirModulo('emergencia'));
    document.getElementById('btnDashboardHospitalizacion')?.addEventListener('click', () => this.abrirModulo('hospitalizacion'));
    document.getElementById('btnDashboardNuevo')?.addEventListener('click', () => this.abrirModulo('emergencia'));
    document.getElementById('btnDashboardNuevoHosp')?.addEventListener('click', () => this.abrirModulo('hospitalizacion'));
    document.getElementById('btnDashboardRecientes')?.addEventListener('click', () => this.abrirRecientes());
    document.getElementById('btnSidebarInicio')?.addEventListener('click', () => this.volverInicio());
    document.getElementById('btnSidebarRecientes')?.addEventListener('click', () => this.abrirRecientes());
    document.getElementById('btnSidebarConfiguracion')?.addEventListener('click', event => {
      const button = event.currentTarget;
      const options = document.getElementById('sidebarConfigOptions');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      options.hidden = expanded;
      button.classList.toggle('open', !expanded);
    });
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
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.iniciarRegistroRapido();
      }
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
      if (btn) { btn.disabled = false; btn.textContent = 'Buscar meses en Drive'; }
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
    const tipo = this.currentView === 'recent' ? RecentTable.currentTipo : (FormBuilder.currentTipo || 'emergencia');
    const hoja = this.currentView === 'recent' ? RecentTable.currentHoja :
      (FormBuilder.currentHoja || Menu.modulos?.[tipo]?.[0]);
    if (!tipo || !hoja) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Selecciona un módulo antes de exportar.');
      return;
    }
    try {
      const btn = document.getElementById('btnExportarExcel');
      if (btn) { btn.disabled = true; btn.textContent = 'Exportando...'; }
      await API.exportarExcel(tipo, hoja);
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Excel exportado correctamente');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4C4; Exportar Excel'; }
    } catch (err) {
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'error', 'Error al exportar: ' + err.message);
      const btn = document.getElementById('btnExportarExcel');
      if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4C4; Exportar Excel'; }
    }
  },

  async onSelectHoja(tipo, hoja) {
    this.currentView = 'module';
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
    this.currentView = 'home';
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
