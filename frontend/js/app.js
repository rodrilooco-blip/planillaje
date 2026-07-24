const App = {
  initialized: false,
  userType: 'general',
  meses: [],

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupEventListeners();
    Autocomplete.init();
    await this.checkConnection();
    await this.loadMeses();
    Menu.init((tipo, hoja) => this.onSelectHoja(tipo, hoja));
  },

  setUserType(tipo) {
    this.userType = tipo;
    document.querySelectorAll('.user-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.user === tipo);
    });
    if (FormBuilder.currentHoja) {
      FormBuilder.aplicarVisibilidadMedico(tipo === 'medico');
    }
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
        // Preseleccionar el mas reciente (ultimo de la lista ordenada DESC)
        const ultimo = this.meses[0].codigo;
        select.value = ultimo;
        this.switchMes(ultimo);
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
      select.addEventListener('change', () => this.switchMes(select.value));
    } catch (err) {
      console.error('Error cargando meses:', err);
    }
  },

  switchMes(codigo) {
    window.mesActual = codigo || '';
    const mes = this.meses.find(m => m.codigo === codigo);
    document.getElementById('monthSelect').value = codigo || '';
    this.actualizarIndicadorDrive(mes);
    if (FormBuilder.currentHoja) {
      this.onSelectHoja(FormBuilder.currentTipo, FormBuilder.currentHoja);
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
    await FormBuilder.build(tipo, hoja);
    // Actualizar info de sheet activo
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
