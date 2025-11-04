// js/loader_neon.js
import * as storage from './storage.js';

// ROM store keys: id = rom_<sha or timestamp>
// { id, name, size, data:Uint8Array, addedAt }

const ROM_STORE = 'roms';

function makeRomElement(rom, emu) {
  const div = document.createElement('div');
  div.className = 'rom-item';
  const left = document.createElement('div');
  left.innerHTML = `<div class="title">${rom.name}</div><div class="small">${(rom.size/1024|0)} KB</div>`;
  const actions = document.createElement('div');
  const load = document.createElement('button'); load.textContent = 'Load';
  const del  = document.createElement('button'); del.textContent = 'Delete';
  load.onclick = async () => {
    emu.loadROM(rom.data);
    await storage.put('meta', { key: 'lastROM', value: rom.id });
    document.getElementById('sessionInfo').textContent = `Loaded: ${rom.name}`;
  };
  del.onclick = async () => {
    if (!confirm(`Delete ROM ${rom.name}?`)) return;
    await storage.del(ROM_STORE, rom.id);
    div.remove();
  };
  actions.appendChild(load); actions.appendChild(del);
  div.appendChild(left); div.appendChild(actions);
  return div;
}

export async function setupLoaderUI(emu) {
  const romFile = document.getElementById('romFile');
  const romList = document.getElementById('romList');

  async function refreshList() {
    const all = await storage.all(ROM_STORE);
    romList.innerHTML = '';
    if (!all.length) romList.textContent = 'No ROMs yet';
    else {
      all.sort((a,b)=>b.addedAt - a.addedAt);
      for (const r of all) romList.appendChild(makeRomElement(r, emu));
    }
  }

  romFile.addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    const id = `rom_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record = { id, name: f.name, size: f.size, data: new Uint8Array(buf), addedAt: Date.now() };
    await storage.put(ROM_STORE, record);
    await refreshList();
  });

  // library button opens the right panel (if you want to toggle UI)
  document.getElementById('btnLibrary').onclick = () => {
    const panel = document.querySelector('.panel');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Clear all data
  document.getElementById('btnClearAll').onclick = async () => {
    if (!confirm('Clear all ROMs and saves? This cannot be undone.')) return;
    const all = await storage.all(ROM_STORE);
    for (const r of all) await storage.del(ROM_STORE, r.id);
    await storage.put('meta', { key:'lastROM', value:null });
    await refreshList();
    location.reload();
  };

  await refreshList();
}
