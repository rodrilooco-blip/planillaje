const API = {
  async fetchJSON(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Error ' + res.status);
    }
    return res.json();
  },

  getHealth() { return this.fetchJSON(Utils.API_BASE + '/health'); },
  getHojas() { return this.fetchJSON(Utils.API_BASE + '/hojas'); },

  getColumnas(tipo, hoja) { return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/columnas`); },
  getRegistros(tipo, hoja) { return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}`); },
  getNextNumero(tipo, hoja) { return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/next-numero`); },
  getRegistro(tipo, hoja, fila) { return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/${fila}`); },

  guardarRegistro(tipo, hoja, data) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}`, { method: 'POST', body: JSON.stringify(data) });
  },

  actualizarRegistro(tipo, hoja, fila, data) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/${fila}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  eliminarRegistro(tipo, hoja, fila) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/${fila}`, { method: 'DELETE' });
  },

  buscarCatalogo(nombre, query, limite) {
    return this.fetchJSON(`${Utils.API_BASE}/catalogos/${nombre}?q=${encodeURIComponent(query)}&limite=${limite || 5}`);
  },

  getCatalogoCompleto(nombre) {
    return this.fetchJSON(`${Utils.API_BASE}/catalogos/${nombre}/completo`);
  },

  buscarPacientes(query) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/buscar-pacientes?q=${encodeURIComponent(query)}`);
  },
};
