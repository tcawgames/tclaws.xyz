// js/input_neon.js
// Provides input mapping and exposes .inputState on the emulator

const DEFAULT_MAP = {
  'KeyZ': 'a', 'KeyX': 'b', 'Enter': 'start', 'ShiftLeft': 'select',
  'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight':'right',
  'KeyA':'l','KeyS':'r'
};

let keyMap = {...DEFAULT_MAP};
let state = { a:false,b:false,start:false,select:false,up:false,down:false,left:false,right:false,l:false,r:false };

export function setupInput(emu) {
  // expose
  emu.inputState = state;
  emu.rebindKey = (code, button) => { keyMap[code] = button; renderMapUI(); };

  window.addEventListener('keydown', (e) => {
    const btn = keyMap[e.code];
    if (btn) { state[btn] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const btn = keyMap[e.code];
    if (btn) { state[btn] = false; e.preventDefault(); }
  });

  document.getElementById('btnRemap').onclick = () => {
    // simple remapper: click the mapping to change next key pressed
    renderMapUI();
    document.querySelectorAll('.map-entry button').forEach(b => {
      b.onclick = () => {
        b.textContent = 'Press key...';
        const handler = (ev) => {
          keyMap[ev.code] = b.dataset.button;
          window.removeEventListener('keydown', handler);
          renderMapUI();
        };
        window.addEventListener('keydown', handler);
      };
    });
  };

  function renderMapUI() {
    const container = document.getElementById('controlMap');
    container.innerHTML = '';
    const known = ['a','b','start','select','up','down','left','right','l','r'];
    const reverse = {};
    for (const k of Object.keys(keyMap)) reverse[keyMap[k]] = k;
    known.forEach(k => {
      const div = document.createElement('div');
      div.className = 'control-entry';
      div.innerHTML = `<div>${k.toUpperCase()}</div><div><button data-button="${k}">${reverse[k]||'Unbound'}</button></div>`;
      container.appendChild(div);
    });
  }

  renderMapUI();
}
