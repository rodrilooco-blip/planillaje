const RecentTable = {
  currentTipo: null,
  currentHoja: null,
  registros: [],
  requestId: 0,
  page: 1,
  pageSize: 10,
  filteredRecords: [],

  async cargar(tipo, hoja) {
    const requestId = ++this.requestId;
    const mesSolicitado = window.mesActual || '';
    this.currentTipo = tipo;
    this.currentHoja = hoja;
    this.setupPagination();

    const container = document.getElementById('recentTableContainer');
    if (!container) return;
    container.style.display = 'block';

    const tbody = document.getElementById('recentBody');
    const info = document.getElementById('recentInfo');

    tbody.innerHTML = '<tr><td colspan="6" class="td-center">Cargando...</td></tr>';

    try {
      const res = await API.getRegistros(tipo, hoja);
      if (requestId !== this.requestId || mesSolicitado !== (window.mesActual || '')) return;
      const registros = res.registros || [];
      this.registros = registros;
      this.page = 1;
      const search = document.getElementById('recentSearch');
      if (search) search.oninput = () => {
        this.page = 1;
        this.renderRegistros(this.filtrar(search.value));
      };

      if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="td-center">Sin registros</td></tr>';
        this.renderRegistros([]);
        return;
      }

      this.renderRegistros(this.filtrar(search?.value || ''));
    } catch (err) {
      if (requestId !== this.requestId || mesSolicitado !== (window.mesActual || '')) return;
      tbody.innerHTML = '<tr><td colspan="6" class="td-center">Error al cargar: ' + Utils.escapeHTML(err.message) + '</td></tr>';
      document.getElementById('recentPagination')?.setAttribute('hidden', '');
    }
  },

  filtrar(query) {
    const q = (query || '').trim().toUpperCase();
    if (!q) return this.registros;
    return this.registros.filter(reg => Object.values(reg.datos || {}).some(v => String(v).toUpperCase().includes(q)));
  },

  renderRegistros(registros) {
      const tbody = document.getElementById('recentBody');
      if (!tbody) return;
      const tipo = this.currentTipo;
      const hoja = this.currentHoja;
      this.filteredRecords = registros;
      const info = document.getElementById('recentInfo');
      if (info) info.textContent = registros.length + ' registro(s)';
      const pages = Math.max(1, Math.ceil(registros.length / this.pageSize));
      this.page = Math.min(Math.max(1, this.page), pages);
      const pageInfo = document.getElementById('recentPageInfo');
      const prevButton = document.getElementById('btnRecentPrev');
      const nextButton = document.getElementById('btnRecentNext');
      const pagination = document.getElementById('recentPagination');
      if (pageInfo) pageInfo.textContent = registros.length
        ? `Mostrando ${(this.page - 1) * this.pageSize + 1}–${Math.min(this.page * this.pageSize, registros.length)} de ${registros.length}`
        : '0 registros';
      if (prevButton) prevButton.disabled = this.page <= 1;
      if (nextButton) nextButton.disabled = this.page >= pages;
      if (pagination) pagination.hidden = registros.length <= this.pageSize;
      if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="td-center">No se encontraron registros</td></tr>';
        return;
      }
      const mostrar = registros.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
      let html = '';

      for (const reg of mostrar) {
        const d = reg.datos;
        const ident = this.buscarValor(d, ['IDENTIFICACION_BENEFICIARIO', 'IDENTIFICACION']) || '-';
        const apell = this.buscarValor(d, ['APELLIDOS']) || '-';
        const procCodigo = this.buscarValor(d, ['CODIGO_DE_PROCEDIMIENTO', 'CODIGO_PROCEDIMIENTO', 'CODIGO_DE_MEDICAMENTO', 'CODIGO']) || '';
        const procDetalle = this.buscarValor(d, ['NOMBRE_DEL_PROCEDIMIENTO', 'NOMBRE_PROCEDIMIENTO', 'NOMBRE_DEL_MEDICAMENTO', 'NOMBRE_MEDICAMENTO', 'PROCEDIMIENTO']) || '';
        const proc = [procCodigo, procDetalle].filter((valor, indice, lista) => valor && lista.indexOf(valor) === indice).join(' — ') || '-';
        const fecha = this.buscarValor(d, ['FECHA_ATENCION', 'FECHA_INGRESO', 'FECHA']) || '-';

        html += `<tr>
          <td>${Utils.escapeHTML(String(reg.fila))}</td>
          <td>${Utils.escapeHTML(String(ident))}</td>
          <td>${Utils.escapeHTML(String(apell).substring(0, 25))}</td>
          <td class="td-procedimiento" title="${Utils.escapeHTML(String(proc))}">${Utils.escapeHTML(String(proc))}</td>
          <td>${Utils.escapeHTML(String(fecha))}</td>
          <td class="td-actions">
            <button class="btn-sm btn-view" data-fila="${reg.fila}" title="Ver detalle" aria-label="Ver detalle del registro ${reg.fila}">&#x1F441;</button>
            <button class="btn-sm btn-edit" data-tipo="${tipo}" data-hoja="${hoja}" data-fila="${reg.fila}" title="Editar">&#x270F;&#xFE0F;</button>
            <button class="btn-sm btn-print" data-fila="${reg.fila}" title="Imprimir" aria-label="Imprimir registro ${reg.fila}">&#x1F5A8;</button>
            <button class="btn-sm btn-delete" data-tipo="${tipo}" data-hoja="${hoja}" data-fila="${reg.fila}" title="Eliminar">&#x1F5D1;</button>
          </td>
        </tr>`;
      }

      tbody.innerHTML = html;

      tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => this.editar(btn.dataset.tipo, btn.dataset.hoja, parseInt(btn.dataset.fila)));
      });
      tbody.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => this.ver(parseInt(btn.dataset.fila, 10)));
      });
      tbody.querySelectorAll('.btn-print').forEach(btn => {
        btn.addEventListener('click', () => this.imprimir(parseInt(btn.dataset.fila, 10)));
      });
      tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => this.eliminar(btn.dataset.tipo, btn.dataset.hoja, parseInt(btn.dataset.fila), btn.closest('tr')));
      });
  },

  cambiarPagina(delta) {
    this.page += delta;
    this.renderRegistros(this.filteredRecords);
  },

  setupPagination() {
    const prev = document.getElementById('btnRecentPrev');
    const next = document.getElementById('btnRecentNext');
    if (prev) prev.onclick = () => { this.cambiarPagina(-1); };
    if (next) next.onclick = () => { this.cambiarPagina(1); };
  },

  async obtenerRegistro(fila) {
    const local = this.registros.find(reg => Number(reg.fila) === Number(fila));
    if (local?.datos && Object.keys(local.datos).length) return local;
    const result = await API.getRegistro(this.currentTipo, this.currentHoja, fila);
    return { fila, datos: result.datos || {} };
  },

  async ver(fila) {
    try {
      const registro = await this.obtenerRegistro(fila);
      const campos = Object.entries(registro.datos)
        .filter(([key]) => !/(?:NUMERO|NMERO|NO)PACIENTE/.test(this.normalizarCampo(key)));
      const dialog = document.getElementById('recordDetailsDialog');
      const title = document.getElementById('recordDetailsTitle');
      const body = document.getElementById('recordDetailsBody');
      if (!dialog || !body) throw new Error('No se encontró el panel de detalle. Recarga la página.');
      title.textContent = `Registro ${fila} · ${this.currentHoja || ''}`;
      body.innerHTML = campos.length
        ? campos.map(([key, value]) => `<div class="record-detail-item"><strong>${Utils.escapeHTML(key)}</strong><span>${Utils.escapeHTML(String(value || '—'))}</span></div>`).join('')
        : '<p>Sin datos para mostrar.</p>';
      dialog.showModal();
    } catch (err) {
      alert('Error al consultar el registro: ' + err.message);
    }
  },

  async imprimir(fila) {
    const ventana = window.open('', '_blank', 'width=850,height=700');
    if (!ventana) {
      alert('Permite las ventanas emergentes para imprimir el registro.');
      return;
    }
    try {
      const registro = await this.obtenerRegistro(fila);
      const filas = Object.entries(registro.datos)
        .filter(([key]) => !/(?:NUMERO|NMERO|NO)PACIENTE/.test(this.normalizarCampo(key)))
        .map(([key, value]) => `<tr><th>${Utils.escapeHTML(key)}</th><td>${Utils.escapeHTML(String(value || '—'))}</td></tr>`).join('');
      ventana.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Registro ${fila}</title><style>body{font:14px Arial,sans-serif;color:#172b3a;margin:32px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5db;padding:8px;text-align:left;vertical-align:top}th{width:34%;background:#f2f6f7}@media print{body{margin:12mm}}</style><h1>Planillaje · ${Utils.escapeHTML(this.currentHoja || '')}</h1><p>Registro ${fila} · ${Utils.escapeHTML(this.currentTipo || '')}</p><table>${filas}</table><script>window.onload=()=>window.print()<\/script></html>`);
      ventana.document.close();
    } catch (err) {
      ventana.close();
      alert('Error al preparar la impresión: ' + err.message);
    }
  },

  cerrarDetalle() {
    document.getElementById('recordDetailsDialog')?.close();
  },

  buscarValor(obj, keys) {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== '') return obj[k];
      const found = Object.keys(obj).find(ok => ok.toUpperCase().includes(k.toUpperCase()));
      if (found && obj[found]) return obj[found];
    }
    return '';
  },

  normalizarCampo(nombre) {
    return Utils.normalizar(String(nombre || ''))
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  },

  claveAtencion(datos) {
    const numero = this.buscarValor(datos, ['NMERO_PACIENTE', 'NUMERO_PACIENTE', 'NO_PACIENTE', 'NO.']);
    if (String(numero || '').trim()) return 'NUM:' + String(numero).trim();

    const identificacion = this.buscarValor(datos, [
      'CEDULA_DE_IDENTIDAD_DEL_BENEFICIARIO',
      'IDENTIFICACION_BENEFICIARIO',
      'IDENTIFICACION_DEL_BENEFICIARIO',
    ]);
    const fecha = this.buscarValor(datos, ['FECHA_DE_INGRESO', 'FECHA_INGRESO', 'FECHA_ATENCION']);
    if (!identificacion || !fecha) return '';
    return 'PAC:' + String(identificacion).trim() + '|FECHA:' + String(fecha).trim();
  },

  encontrarInputParaCampo(inputs, key) {
    const buscada = this.normalizarCampo(key);
    let input = [...inputs].find(el => this.normalizarCampo(el.name) === buscada);
    if (input) return input;

    const esIdentificacionBeneficiario =
      buscada.includes('BENEFICIARIO') && (buscada.includes('CEDULA') || buscada.includes('IDENTIFICACION'));
    if (esIdentificacionBeneficiario) {
      input = [...inputs].find(el => {
        const nombre = this.normalizarCampo(el.name);
        return nombre.includes('BENEFICIARIO') && (nombre.includes('CEDULA') || nombre.includes('IDENTIFICACION'));
      });
    }
    return input || null;
  },

  async editar(tipo, hoja, fila) {
    if (!confirm('Editar registro #' + fila + '?')) return;
    try {
      App.currentView = 'module';
      const res = await API.getRegistro(tipo, hoja, fila);
      await FormBuilder.build(tipo, hoja, fila);

      const inputs = document.querySelectorAll('#formFields input, #formFields select');
      for (const [key, val] of Object.entries(res.datos)) {
        const input = this.encontrarInputParaCampo(inputs, key);
        if (input && !input.disabled) input.value = input.type === 'date' ? Utils.toInputDate(val) : val;
      }

      if (document.getElementById('itemsTableBody')) {
        const clave = this.claveAtencion(res.datos);
        const grupo = clave
          ? this.registros.filter(reg => this.claveAtencion(reg.datos || {}) === clave)
          : [];
        const registrosAtencion = grupo.length ? grupo : [{ fila, datos: res.datos }];
        FormBuilder.editFilas = registrosAtencion.map(reg => reg.fila);
        FormBuilder.cargarItemsEdicion(registrosAtencion.map(reg => reg.datos || {}));
      }
      Reglas.aplicarValoresFijos(hoja);
    } catch (err) {
      alert('Error al cargar registro: ' + err.message);
    }
  },

  async eliminar(tipo, hoja, fila, tr) {
    if (!confirm('\u00bfEliminar registro #' + fila + '? Esta acci\u00f3n no se puede deshacer.')) return;

    try {
      await API.eliminarRegistro(tipo, hoja, fila);
      tr.remove();
      Utils.mostrarAlerta(document.getElementById('formMessages'), 'success', 'Registro #' + fila + ' eliminado');
      this.cargar(this.currentTipo, this.currentHoja);
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  },
};
