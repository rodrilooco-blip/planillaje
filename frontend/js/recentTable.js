const RecentTable = {
  currentTipo: null,
  currentHoja: null,

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

      info.textContent = registros.length + ' registro(s)';

      if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="td-center">Sin registros</td></tr>';
        return;
      }

      const mostrar = registros.slice(0, 15);
      let html = '';

      for (const reg of mostrar) {
        const d = reg.datos;
        const numPac = this.buscarValor(d, ['NO_PACIENTE', 'NO.', 'NO', 'NUMERO']) || reg.fila;
        const ident = this.buscarValor(d, ['IDENTIFICACION_BENEFICIARIO', 'IDENTIFICACION']) || '-';
        const apell = this.buscarValor(d, ['APELLIDOS']) || '-';
        const proc = this.buscarValor(d, ['PROCEDIMIENTO', 'CODIGO_DE_PROCEDIMIENTO', 'CODIGO']) || '-';
        const fecha = this.buscarValor(d, ['FECHA_ATENCION', 'FECHA_INGRESO', 'FECHA']) || '-';

        html += `<tr>
          <td>${Utils.escapeHTML(String(reg.fila))}</td>
          <td>${Utils.escapeHTML(String(numPac))}</td>
          <td>${Utils.escapeHTML(String(ident))}</td>
          <td>${Utils.escapeHTML(String(apell).substring(0, 25))}</td>
          <td>${Utils.escapeHTML(String(proc).substring(0, 15))}</td>
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

    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="td-center">Error al cargar: ' + err.message + '</td></tr>';
    }
  },

  buscarValor(obj, keys) {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== '') return obj[k];
      const found = Object.keys(obj).find(ok => ok.toUpperCase().includes(k.toUpperCase()));
      if (found && obj[found]) return obj[found];
    }
    return '';
  },

  async editar(tipo, hoja, fila) {
    if (!confirm('Editar registro #' + fila + '?')) return;
    try {
      const res = await API.getRegistro(tipo, hoja, fila);
      await FormBuilder.build(tipo, hoja, fila);

      const inputs = document.querySelectorAll('#formFields input, #formFields select');
      for (const [key, val] of Object.entries(res.datos)) {
        const normalizedKey = key.replace(/_/g, '').toLowerCase();
        for (const input of inputs) {
          if (input.name) {
            const inputKey = input.name.replace(/_/g, '').toLowerCase();
            if (normalizedKey === inputKey) {
              if (!input.disabled) input.value = val;
              break;
            }
          }
        }
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
