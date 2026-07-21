class TrieNode {
  constructor() {
    this.children = {};
    this.resultados = [];
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insertar(palabra, item) {
    palabra = palabra.toLowerCase().substring(0, 30);
    let node = this.root;
    for (const ch of palabra) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
      node.resultados.push(item);
    }
  }

  buscar(prefix) {
    if (!prefix) return [];
    prefix = prefix.toLowerCase().substring(0, 30);
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children[ch]) return [];
      node = node.children[ch];
    }
    return node.resultados;
  }
}

const catalogosLocal = {};
const tries = {};

const Autocomplete = {
  dropdown: null,
  currentInput: null,
  searchTimeout: null,

  init() {
    this.dropdown = document.createElement('div');
    this.dropdown.id = 'autocompleteDropdown';
    this.dropdown.className = 'autocomplete-dropdown';
    this.dropdown.style.display = 'none';
    document.body.appendChild(this.dropdown);

    document.addEventListener('click', (e) => {
      if (this.dropdown && !this.dropdown.contains(e.target) &&
          this.currentInput && e.target !== this.currentInput) {
        this.cerrar();
      }
    });
  },

  async asegurarCatalogo(nombre) {
    if (catalogosLocal[nombre]) return;

    const nombres = nombre.split(',').map(s => s.trim());
    if (nombres.length > 1) {
      // Load all catalogs first
      for (const n of nombres) {
        if (!catalogosLocal[n]) {
          try {
            const res = await API.getCatalogoCompleto(n);
            catalogosLocal[n] = res.datos || [];
          } catch (err) {
            console.error('Error cargando cat\u00e1logo:', err);
            catalogosLocal[n] = [];
          }
        }
      }
      // Build combined Trie
      const trie = new Trie();
      for (const n of nombres) {
        for (const item of catalogosLocal[n]) {
          const codigo = (item.codigo || item.cod || item.código || '').toLowerCase();
          const descripcion = (item.descripcion || item.descripción || item.nombre || item.desc || '').toLowerCase();
          if (codigo) trie.insertar(codigo, item);
          const palabras = descripcion.split(/\s+/).filter(w => w.length >= 3);
          for (const palabra of palabras) {
            trie.insertar(palabra, item);
          }
        }
      }
      tries[nombre] = trie;
      catalogosLocal[nombre] = []; // marker that combined name is loaded
      return;
    }

    try {
      const res = await API.getCatalogoCompleto(nombre);
      catalogosLocal[nombre] = res.datos || [];

      const trie = new Trie();
      for (const item of catalogosLocal[nombre]) {
        const codigo = (item.codigo || item.cod || item.código || '').toLowerCase();
        const descripcion = (item.descripcion || item.descripción || item.nombre || item.desc || '').toLowerCase();
        if (codigo) trie.insertar(codigo, item);
        const palabras = descripcion.split(/\s+/).filter(w => w.length >= 3);
        for (const palabra of palabras) {
          trie.insertar(palabra, item);
        }
      }
      tries[nombre] = trie;
    } catch (err) {
      console.error('Error cargando cat\u00e1logo:', err);
    }
  },

  configurar(input, catalogoNombre, colCodigo, colDesc) {
    input.dataset.catalogo = catalogoNombre;
    input.dataset.colCodigo = colCodigo;
    input.dataset.colDesc = colDesc;

    input.addEventListener('focus', () => {
      this.asegurarCatalogo(catalogoNombre);
    });

    input.addEventListener('input', () => {
      this.onInput(input);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.navegar(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.navegar(-1); }
      else if (e.key === 'Enter') {
        const sel = this.dropdown?.querySelector('.ac-item.active');
        if (sel) { e.preventDefault(); sel.click(); }
      }
      else if (e.key === 'Escape') this.cerrar();
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!this.dropdown?.contains(document.activeElement)) this.cerrar();
      }, 200);
    });
  },

  onInput(input) {
    this.currentInput = input;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.buscarLocal(input), 200);
  },

  buscarLocal(input) {
    const q = input.value.trim();
    const catalogo = input.dataset.catalogo;
    const colCodigo = input.dataset.colCodigo;
    const colDesc = input.dataset.colDesc;

    this.dropdown.innerHTML = '';

    if (q.length < 2 || !catalogosLocal[catalogo]) {
      this.dropdown.style.display = 'none';
      return;
    }

    const trie = tries[catalogo];
    let resultados;
    if (trie) {
      resultados = trie.buscar(q);
    } else {
      resultados = catalogosLocal[catalogo]
        .filter(item => {
          const c = (item.codigo || item.cod || item.código || '').toLowerCase();
          const d = (item.descripcion || item.descripción || item.nombre || item.desc || '').toLowerCase();
          return c.includes(q.toLowerCase()) || d.includes(q.toLowerCase());
        });
    }

    if (!resultados.length) {
      this.dropdown.style.display = 'none';
      return;
    }

    const rect = input.getBoundingClientRect();
    this.dropdown.style.top = (rect.bottom + window.scrollY + 2) + 'px';
    this.dropdown.style.left = (rect.left + window.scrollX) + 'px';
    this.dropdown.style.width = Math.max(rect.width, 300) + 'px';

    resultados.forEach((item, idx) => {
      const codigo = item[colCodigo] || item.codigo || item.cod || item.código || '';
      const descripcion = item[colDesc] || item.descripcion || item.descripción || item.nombre || item.desc || '';
      const div = document.createElement('div');
      div.className = 'ac-item' + (idx === 0 ? ' active' : '');
      div.innerHTML = `<span class="ac-code">${this.escape(codigo)}</span><span class="ac-desc">${this.escape(descripcion)}</span>`;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.seleccionar(codigo, descripcion);
      });
      div.addEventListener('mouseenter', () => {
        this.dropdown.querySelectorAll('.ac-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
      });
      this.dropdown.appendChild(div);
    });

    this.dropdown.style.display = 'block';
  },

  navegar(dir) {
    if (!this.dropdown || this.dropdown.style.display === 'none') return;
    const items = this.dropdown.querySelectorAll('.ac-item');
    if (!items.length) return;
    let idx = -1;
    items.forEach((el, i) => { if (el.classList.contains('active')) idx = i; });
    if (idx >= 0) items[idx].classList.remove('active');
    idx = (idx + dir + items.length) % items.length;
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block: 'nearest' });
  },

  seleccionar(codigo, descripcion) {
    const input = this.currentInput;
    if (input) {
      input.value = codigo;
      input.dataset.descripcion = descripcion;
      const targetName = input.dataset.targetdesc;
      if (targetName) {
        let target = document.querySelector(`[name="${targetName}"]`);
        if (!target) {
          const tr = input.closest('tr');
          if (tr) target = tr.querySelector(`[data-item-key="${targetName}"]`);
        }
        if (target) target.value = descripcion;
      }
      const evt = new Event('input', { bubbles: true });
      input.dispatchEvent(evt);
    }
    this.cerrar();
  },

  cerrar() {
    if (this.dropdown) this.dropdown.style.display = 'none';
    this.currentInput = null;
    clearTimeout(this.searchTimeout);
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};
