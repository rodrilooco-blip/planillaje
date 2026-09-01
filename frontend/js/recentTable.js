const RecentTable = {
  currentTipo: null,
  currentHoja: null,
  registros: [],

  async cargar(tipo, hoja) {
    this.currentTipo = tipo;
    this.currentHoja = hoja;

    const container = document.getElementById('recentTableContainer');
    if (!container) return;
    container.style.display = 'block';

    const tbody = document.getElementById('recentBody');
    const info = document.getElementById('recentInfo');

    tbody.innerHTML = '<tr><td colspan="7" class="td-center">Cargando...</td></tr>';

    try {
      const res = await API.getRegistros(tipo, hoja);
      const registros = res.registros || [];
      this.registros = registros;
      const search = document.getElementById('recentSearch');
      if (search) search.oninput = () => this.renderRegistros(this.filtrar(search.value));

      info.textContent = registros.length + ' registro(s)';

      if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-center">Sin registros</td></tr>';
        return;
      }

      this.renderRegistros(registros);
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="td-center">Error al cargar: ' + Utils.escapeHTML(err.message) + '</td></tr>';
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
      if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-center">No se encontraron registros</td></tr>';
        return;
      }
      const mostrar = registros.slice(0, 15);
      let html = '';

      for (const reg of mostrar) {
        const d = reg.datos;
        const numPac = this.buscarValor(d, ['NO_PACIENTE', 'NO.', 'NO', 'NUMERO']) || reg.fila;
        const ident = this.buscarValor(d, ['IDENTIFICACION_BENEFICIARIO', 'IDENTIFICACION']) || '-';
        const apell = this.buscarValor(d, ['APELLIDOS']) || '-';
        const procCodigo = this.buscarValor(d, ['CODIGO_DE_PROCEDIMIENTO', 'CODIGO_PROCEDIMIENTO', 'CODIGO_DE_MEDICAMENTO', 'CODIGO']) || '';
        const procDetalle = this.buscarValor(d, ['NOMBRE_DEL_PROCEDIMIENTO', 'NOMBRE_PROCEDIMIENTO', 'NOMBRE_DEL_MEDICAMENTO', 'NOMBRE_MEDICAMENTO', 'PROCEDIMIENTO']) || '';
        const proc = [procCodigo, procDetalle].filter((valor, indice, lista) => valor && lista.indexOf(valor) === indice).join(' — ') || '-';
        const fecha = this.buscarValor(d, ['FECHA_ATENCION', 'FECHA_INGRESO', 'FECHA']) || '-';

        html += `<tr>
          <td>${Utils.escapeHTML(String(reg.fila))}</td>
          <td>${Utils.escapeHTML(String(numPac))}</td>
          <td>${Utils.escapeHTML(String(ident))}</td>
          <td>${Utils.escapeHTML(String(apell).substring(0, 25))}</td>
          <td class="td-procedimiento" title="${Utils.escapeHTML(String(proc))}">${Utils.escapeHTML(String(proc))}</td>
          <td>${Utils.escapeHTML(String(fecha))}</td>
          <td class="td-actions">
            <button class="btn-sm btn-edit" data-tipo="${tipo}" data-hoja="${hoja}" data-fila="${reg.fila}" title="Editar">&#x270F;&#xFE0F;</button>
            <button class="btn-sm btn-delete" data-tipo="${tipo}" data-hoja="${hoja}" data-fila="${reg.fila}" title="Eliminar">&#x1F5D1;</button>
          </td>
        </tr>`;
      }

      tbody.innerHTML = html;

      tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => this.editar(btn.dataset.tipo, btn.dataset.hoja, parseInt(btn.dataset.fila)));
      });
      tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => this.eliminar(btn.dataset.tipo, btn.dataset.hoja, parseInt(btn.dataset.fila), btn.closest('tr')));
      });
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
