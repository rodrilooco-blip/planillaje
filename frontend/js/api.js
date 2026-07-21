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

  guardarBatch(tipo, hoja, datosPaciente, items) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/${tipo}/${hoja}/guardar-batch`, {
      method: 'POST',
      body: JSON.stringify({ datosPaciente, items }),
    });
  },

  exportarExcel(tipo, hoja) {
    return new Promise((resolve, reject) => {
      fetch(`${Utils.API_BASE}/planos/${tipo}/${hoja}/exportar-excel`)
        .then(res => {
          if (!res.ok) return res.json().catch(() => ({ error: res.statusText })).then(e => { throw new Error(e.error || 'Error ' + res.status); });
          return res.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${hoja}_${new Date().toISOString().slice(0, 10)}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve({ exito: true });
        })
        .catch(reject);
    });
  },

  sincronizarDesdeGoogle(tipo, hoja) {
    return this.fetchJSON(`${Utils.API_BASE}/planos/sync/pull`, {
      method: 'POST',
      body: JSON.stringify({ tipo, hoja }),
    });
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
