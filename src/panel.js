// Schema-driven control panel. Every control is bound to one key of the store
// and re-syncs itself whenever the store changes (undo, presets, pairings…).
import { normalizeHex } from './state.js';

let uid = 0;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

function trimNumber(value, digits) {
  return digits ? value.toFixed(digits) : String(Math.round(value));
}

const builders = {
  slider(item, store) {
    const id = `c${++uid}`;
    const digits = item.digits ?? (item.step < 1 ? (item.step < 0.1 ? 2 : 1) : 0);
    const range = el('input', { type: 'range', id, min: item.min, max: item.max, step: item.step });
    const num = el('input', {
      type: 'number',
      class: 'num',
      min: item.min,
      max: item.max,
      step: item.step,
      'aria-label': `${item.label} value`,
    });
    const paint = (v) => {
      range.style.setProperty('--fill', `${((v - item.min) / (item.max - item.min)) * 100}%`);
    };
    range.addEventListener('input', () => {
      const v = Number(range.value);
      num.value = trimNumber(v, digits);
      paint(v);
      store.set({ [item.key]: v });
    });
    num.addEventListener('change', () => {
      let v = Number(num.value);
      if (!Number.isFinite(v)) v = store.state[item.key];
      v = Math.min(item.max, Math.max(item.min, v));
      store.set({ [item.key]: v });
      sync();
    });
    const sync = () => {
      const v = store.state[item.key];
      range.value = v;
      if (document.activeElement !== num) num.value = trimNumber(v, digits);
      paint(v);
    };
    return { node: row(item.label, id, [range, num], 'row-slider'), sync };
  },

  select(item, store) {
    const id = `c${++uid}`;
    const select = el('select', { id });
    const sync = () => {
      const options = typeof item.options === 'function' ? item.options(store.state) : item.options;
      const signature = options.map(([value, label]) => `${value}=${label}`).join('|');
      if (select._signature !== signature) {
        select._signature = signature;
        select.replaceChildren(...options.map(([value, label]) => el('option', { value: String(value), text: label })));
        select._values = options.map(([value]) => value);
      }
      select.value = String(store.state[item.key]);
    };
    select.addEventListener('change', () => {
      const value = select._values.find((v) => String(v) === select.value);
      if (item.onSelect) item.onSelect(value);
      else store.set({ [item.key]: value });
    });
    return { node: row(item.label, id, [el('div', { class: 'select' }, [select])]), sync };
  },

  check(item, store) {
    const id = `c${++uid}`;
    const input = el('input', { type: 'checkbox', id });
    input.addEventListener('change', () => store.set({ [item.key]: input.checked }));
    const sync = () => {
      input.checked = !!store.state[item.key];
    };
    return { node: row(item.label, id, [input]), sync };
  },

  color(item, store) {
    const id = `c${++uid}`;
    const swatch = el('input', { type: 'color', id });
    const hex = el('input', {
      type: 'text',
      class: 'hex',
      maxlength: 7,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': `${item.label} hex value`,
    });
    const commit = (value) => {
      const patch = { [item.key]: value };
      if (item.onSet) Object.assign(patch, item.onSet(value));
      store.set(patch);
    };
    swatch.addEventListener('input', () => commit(swatch.value));
    hex.addEventListener('change', () => {
      const value = normalizeHex(hex.value);
      if (value) commit(value);
      sync();
    });
    const sync = () => {
      swatch.value = store.state[item.key];
      if (document.activeElement !== hex) hex.value = store.state[item.key];
    };
    return { node: row(item.label, id, [swatch, hex], 'row-color'), sync };
  },

  buttons(item) {
    const node = el(
      'div',
      { class: `buttons cols-${item.columns || 1}` },
      item.buttons.map((b) =>
        el('button', {
          type: 'button',
          class: b.primary ? 'btn primary' : 'btn',
          text: b.label,
          title: b.title || '',
          onclick: b.onClick,
        }),
      ),
    );
    return { node, sync() {} };
  },

  // Escape hatch for one-off controls: the schema supplies its own builder.
  custom(item, store) {
    return item.build(store, el);
  },

  note(item) {
    return { node: el('p', { class: 'note', text: item.text }), sync() {} };
  },
};

function row(label, id, controls, extra = '') {
  return el('div', { class: `row ${extra}` }, [
    el('label', { for: id, text: label }),
    el('div', { class: 'ctl' }, controls),
  ]);
}

export function buildPanel(root, tabs, store) {
  const bound = [];
  const sections = [];
  const tabButtons = [];
  const pages = [];

  const tablist = el('div', { class: 'tabs', role: 'tablist' });
  root.append(tablist);

  const setTab = (id) => {
    tabs.forEach((tab, i) => {
      const active = tab.id === id;
      tabButtons[i].setAttribute('aria-selected', String(active));
      tabButtons[i].tabIndex = active ? 0 : -1;
      pages[i].hidden = !active;
    });
  };

  tabs.forEach((tab, index) => {
    const button = el('button', {
      type: 'button',
      role: 'tab',
      id: `tab-${tab.id}`,
      'aria-controls': `page-${tab.id}`,
      text: tab.label,
      onclick: () => setTab(tab.id),
    });
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      setTab(tabs[next].id);
      tabButtons[next].focus();
    });
    tabButtons.push(button);
    tablist.append(button);

    const page = el('div', { class: 'page', role: 'tabpanel', id: `page-${tab.id}`, 'aria-labelledby': `tab-${tab.id}` });
    for (const section of tab.sections) {
      const body = el('div', { class: 'section-body' });
      for (const item of section.items) {
        const control = builders[item.type](item, store);
        bound.push({ ...control, item });
        body.append(control.node);
      }
      const details = el('details', { class: 'section' }, [el('summary', { text: section.title }), body]);
      details.open = section.open !== false;
      if (section.visible) sections.push({ node: details, visible: section.visible });
      page.append(details);
    }
    pages.push(page);
    root.append(page);
  });

  const refresh = () => {
    for (const { node, sync, item } of bound) {
      sync();
      if (item.visible) node.hidden = !item.visible(store.state);
    }
    for (const { node, visible } of sections) node.hidden = !visible(store.state);
  };
  refresh();
  setTab(tabs[0].id);
  store.subscribe(refresh);
  return { refresh, setTab };
}
