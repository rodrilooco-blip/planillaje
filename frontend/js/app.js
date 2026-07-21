const App = {
  initialized: false,
  userType: 'general',

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.setupEventListeners();
    Autocomplete.init();
    await this.checkConnection();
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
