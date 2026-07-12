const Utils = {
  API_BASE: window.location.origin + '/api',

  async fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  },

  getFechaHoy() {
    return new Date().toISOString().split('T')[0];
  },

  normalizar(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  mostrarAlerta(container, tipo, mensaje) {
    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensaje;
    container.appendChild(alerta);
    setTimeout(() => alerta.remove(), 5000);
  },

  limpiarAlertas(container) {
    container.innerHTML = '';
  },

  show(element) {
    if (element) element.style.display = '';
  },

  hide(element) {
    if (element) element.style.display = 'none';
  },

  getColumnKey(columna) {
    return (columna.nombre || columna || '')
      .toUpperCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/\./g, '')
      .replace(/[^A-Z0-9_]/g, '');
  },
};
