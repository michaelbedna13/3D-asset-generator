// Schema-driven controls. Every control is bound to one key of the store and
// re-syncs itself whenever the store changes (undo, presets, look switches…).
import { normalizeHex, DEFAULTS } from './state.js';

let uid = 0;

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function trimNumber(value, digits) {
  return digits ? value.toFixed(digits) : String(Math.round(value));
}

function digitsFor(item) {
  return item.digits ?? (item.step < 1 ? (item.step < 0.1 ? 2 : 1) : 0);
}

// label + control(s) on one line
function row(label, id, controls, extra = '') {
  const name = id ? el('label', { for: id, text: label }) : el('span', { class: 'label', text: label });
  return { node: el('div', { class: `row ${extra}` }, [name, el('div', { class: 'ctl' }, controls)]), name };
}

function rangeInput(item, store, id) {
  const input = el('input', { type: 'range', id, min: item.min, max: item.max, step: item.step });
  const paint = (v) => input.style.setProperty('--fill', `${((v - item.min) / (item.max - item.min)) * 100}%`);
  return { input, paint };
}

const builders = {
  slider(item, store) {
    const id = `c${++uid}`;
    const digits = digitsFor(item);
    const { input: range, paint } = rangeInput(item, store, id);
    const num = el('input', {
      type: 'number',
      class: 'num',
      min: item.min,
      max: item.max,
      step: item.step,
      'aria-label': `${item.label} value`,
    });
    const sync = () => {
      const v = store.state[item.key];
      range.value = v;
      if (document.activeElement !== num) num.value = trimNumber(v, digits);
      paint(v);
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
      store.set({ [item.key]: Math.min(item.max, Math.max(item.min, v)) });
      sync();
    });
    const built = row(item.label, id, [range, num], 'row-slider');
    // Double-clicking a slider's name puts it back to its default.
    if (item.key in DEFAULTS) {
      built.name.title = 'Double-click to reset';
      built.name.addEventListener('dblclick', (e) => {
        e.preventDefault();
        store.set({ [item.key]: DEFAULTS[item.key] });
      });
    }
    return { node: built.node, sync };
  },

  select(item, store) {
    const id = `c${++uid}`;
    const select = el('select', { id, 'aria-label': item.bare ? item.label : null });
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
    const wrap = el('div', { class: 'select' }, [select]);
    return { node: item.bare ? wrap : row(item.label, id, [wrap]).node, sync };
  },

  // A few mutually exclusive choices, all visible: a radio group drawn as one strip.
  segment(item, store) {
    const id = `c${++uid}`;
    const current = () => (item.value ? item.value(store.state) : store.state[item.key]);
    const choose = (value) => {
      if (item.onSelect) item.onSelect(value);
      else store.set({ [item.key]: value });
    };
    const buttons = item.options.map(([value, label, glyph]) => {
      const button = el('button', {
        type: 'button',
        role: 'radio',
        class: 'seg-btn',
        title: item.titles?.[value],
        'aria-label': glyph && item.iconOnly ? label : null,
        onclick: () => choose(value),
      });
      if (glyph) button.append(el('span', { class: 'glyph', html: glyph }));
      if (!(glyph && item.iconOnly)) button.append(el('span', { text: label }));
      button._value = value;
      return button;
    });
    const group = el('div', { class: `seg ${item.class || ''}`, role: 'radiogroup', 'aria-labelledby': `${id}-l` }, buttons);
    group.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const index = buttons.findIndex((b) => b._value === current());
      const next = buttons[(index + step + buttons.length) % buttons.length];
      choose(next._value);
      next.focus();
    });
    const sync = () => {
      const value = current();
      for (const button of buttons) {
        const on = button._value === value;
        button.setAttribute('aria-checked', String(on));
        button.tabIndex = on ? 0 : -1;
      }
      if (!buttons.some((b) => b.tabIndex === 0)) buttons[0].tabIndex = 0;
    };
    if (item.bare) {
      group.removeAttribute('aria-labelledby');
      group.setAttribute('aria-label', item.label);
      return { node: group, sync };
    }
    const built = row(item.label, null, [group]);
    built.name.id = `${id}-l`;
    return { node: built.node, sync };
  },

  check(item, store) {
    const id = `c${++uid}`;
    const input = el('input', { type: 'checkbox', id });
    input.addEventListener('change', () => store.set({ [item.key]: input.checked }));
    const sync = () => {
      input.checked = !!store.state[item.key];
    };
    return { node: row(item.label, id, [input]).node, sync };
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
    const sync = () => {
      swatch.value = store.state[item.key];
      if (document.activeElement !== hex) hex.value = store.state[item.key];
    };
    swatch.addEventListener('input', () => commit(swatch.value));
    hex.addEventListener('change', () => {
      const value = normalizeHex(hex.value);
      if (value) commit(value);
      sync();
    });
    return { node: row(item.label, id, [swatch, hex], 'row-color').node, sync };
  },

  buttons(item) {
    const node = el(
      'div',
      { class: `buttons cols-${item.columns || 1}` },
      item.buttons.map((b) => {
        const button = el('button', {
          type: 'button',
          class: b.primary ? 'btn primary' : 'btn',
          title: b.title,
          onclick: b.onClick,
        });
        if (b.glyph) button.append(el('span', { class: 'glyph', html: b.glyph }));
        button.append(el('span', { text: b.label }));
        if (b.hint) button.append(el('kbd', { text: b.hint }));
        return button;
      }),
    );
    return { node, sync() {} };
  },

  note(item) {
    return { node: el('p', { class: 'note', text: item.text }), sync() {} };
  },

  // Escape hatch for one-off controls: the schema supplies its own builder.
  custom(item, store) {
    return item.build(store);
  },
};

// Builds one control outside the panel (canvas bar, top bar) and keeps it in sync.
export function bindControl(item, store) {
  const control = builders[item.type](item, store);
  const refresh = () => {
    control.sync();
    if (item.visible) control.node.hidden = !item.visible(store.state);
  };
  refresh();
  store.subscribe(refresh);
  return control.node;
}

export function buildPanel(root, tabs, store) {
  const bound = [];
  const groups = [];
  const tabButtons = [];
  const pages = [];

  const tablist = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings' });
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
    for (const group of tab.groups) {
      const body = el('div', { class: 'group-body' });
      for (const item of group.items) {
        const control = builders[item.type](item, store);
        bound.push({ ...control, item });
        body.append(control.node);
      }
      const details = el('details', { class: 'group' }, [el('summary', { text: group.title }), body]);
      details.open = group.open !== false;
      if (group.visible) groups.push({ node: details, visible: group.visible });
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
    for (const { node, visible } of groups) node.hidden = !visible(store.state);
  };
  refresh();
  setTab(tabs[0].id);
  store.subscribe(refresh);
  return { refresh, setTab };
}
