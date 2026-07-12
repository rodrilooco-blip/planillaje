const Menu = {
  modulos: null,
  onSelectHoja: null,

  async init(onSelectHojaCallback) {
    this.onSelectHoja = onSelectHojaCallback;
    try {
      this.modulos = await API.getHojas();
      this.render();
    } catch (err) {
      console.error('Error cargando menú:', err);
    }
  },

  render() {
    const container = document.getElementById('menuPrincipal');
    container.innerHTML = '';

    this.renderModulo(container, 'emergencia', '🚑', 'Emergencia', this.modulos.emergencia);
    this.renderModulo(container, 'hospitalizacion', '🏨', 'Hospitalización', this.modulos.hospitalizacion);
  },

  renderModulo(container, tipo, icono, titulo, hojas) {
    const modDiv = document.createElement('div');
    modDiv.className = 'menu-modulo';

    const header = document.createElement('button');
    header.className = `menu-modulo-header ${tipo}`;
    header.innerHTML = `
      <span class="menu-icon">${icono}</span>
      <span>${titulo}</span>
      <span class="menu-arrow">▶</span>
    `;

    const subDiv = document.createElement('div');
    subDiv.className = 'menu-submodulos';

    hojas.forEach(hoja => {
      const item = document.createElement('button');
      item.className = `menu-submodulo-item ${tipo}-item`;
      const badge = tipo === 'emergencia' ? 'badge-emergencia' : 'badge-hospitalizacion';
      item.innerHTML = `${hoja} <span class="submodulo-badge ${badge}">${tipo === 'emergencia' ? 'E' : 'H'}</span>`;
      item.dataset.tipo = tipo;
      item.dataset.hoja = hoja;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectHoja(tipo, hoja);
      });

      subDiv.appendChild(item);
    });

    header.addEventListener('click', () => {
      const isOpen = header.classList.toggle('open');
      subDiv.classList.toggle('open');
    });

    modDiv.appendChild(header);
    modDiv.appendChild(subDiv);
    container.appendChild(modDiv);
  },

  selectHoja(tipo, hoja) {
    document.querySelectorAll('.menu-submodulo-item').forEach(el => el.classList.remove('active'));
    const selector = `[data-tipo="${tipo}"][data-hoja="${hoja}"]`;
    const item = document.querySelector(selector);
    if (item) item.classList.add('active');

    const parentMod = item?.closest('.menu-modulo');
    if (parentMod) {
      const header = parentMod.querySelector('.menu-modulo-header');
      header.classList.add('open');
      parentMod.querySelector('.menu-submodulos').classList.add('open');
    }

    if (this.onSelectHoja) this.onSelectHoja(tipo, hoja);
  },
};
