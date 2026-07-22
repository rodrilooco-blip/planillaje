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
      this.meses.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.codigo;
        opt.textContent = m.nombre || m.codigo;
        select.appendChild(opt);
      });
      if (this.meses.length > 0) {
        select.value = this.meses[this.meses.length - 1].codigo;
        this.switchMes(select.value);
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
    if (FormBuilder.currentHoja) {
      this.onSelectHoja(FormBuilder.currentTipo, FormBuilder.currentHoja);
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
    await FormBuilder.build(tipo, hoja);
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
