// js/emu_neon.js
import Memory from './memory.js';
import CPU from './cpu.js';
import PPU from './ppu.js'; // optional; if you don't want PPU, simply ignore
import SaveStateManager from './savestate.js';
import * as storage from './storage.js';

export default class Emulator {
  constructor({ canvas, statusCallback = ()=>{}, autoSaveInterval = 5000 } = {}) {
    this.mem = new Memory();
    this.canvas = canvas;
    this.ppu = new PPU(canvas);
    this.cpu = new CPU(this.mem);
    this.running = false;
    this.rafId = null;
    this.statusCallback = statusCallback;
    this.frameBudgetCycles = 280896; // approx cycles/frame
    this.ffFactor = 1; // fast-forward multiplier (2,4,8)
    this.saveManager = new SaveStateManager(32);
    this.autoSaveInterval = autoSaveInterval;
    this.autoSaveTimer = null;
    this.inputState = {}; // set by input module
    this.currentRom = null; // metadata
    this.pluginCore = null; // hook for external core

    // Hook: if a plugin core is provided it should implement:
    // pluginCore.loadROM(uint8array), pluginCore.start(), stop(), step(), runCycles(n), exportState()/importState(bytes)
    // See below: attachPluginCore(core)
  }

  attachPluginCore(core) {
    // simple integration layer - if you attach a WASM based core, emulator will use it
    // core must follow the minimal API above
    this.pluginCore = core;
  }

  async loadROM(uint8array, meta = { name: 'rom.gba' }) {
    this.mem.loadROM(uint8array);
    this.currentRom = meta;
    this.cpu.reset();

    // if plugin core present, prefer it
    if (this.pluginCore?.loadROM) {
      await this.pluginCore.loadROM(uint8array, meta);
    }

    this.ppu.fillTestPattern();
    await storage.put('meta', { key:'lastROM', value: meta });
    // push initial savestate snapshot (so reverse works early)
    const snap = await this.createSavestate();
    await this.saveManager.push(snap, { rom: meta.name });
    this.statusCallback(`Loaded ROM ${meta.name}`);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.statusCallback('Running');
    if (this.pluginCore?.start) this.pluginCore.start();
    this._runLoop();
    this._startAutoSave();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.pluginCore?.stop) this.pluginCore.stop();
    this.statusCallback('Paused');
    this._stopAutoSave();
  }

  async stepInstruction() {
    if (this.pluginCore?.step) {
      await this.pluginCore.step();
    } else {
      this.cpu.step();
    }
    this.ppu.present();
  }

  toggleFastForward() {
    // simple cycle: 1 -> 2 -> 4 -> 8 -> 1
    const cycle = [1,2,4,8];
    const cur = this.ffFactor;
    const idx = cycle.indexOf(cur);
    this.ffFactor = cycle[(idx + 1) % cycle.length];
    this.statusCallback(`Fast-forward x${this.ffFactor}`);
  }

  async _runLoop() {
    const frame = async (time) => {
      if (!this.running) return;
      // run CPU cycles multiplied by ffFactor
      const cycles = this.frameBudgetCycles * (this.ffFactor || 1);

      if (this.pluginCore?.runCycles) {
        await this.pluginCore.runCycles(cycles);
      } else {
        this.cpu.runCycles(cycles);
      }

      // create periodic savestate for reverse (low overhead snapshot)
      // We'll snapshot every frame but in real projects you'd control frequency & compression
      const snap = await this.createSavestate();
      await this.saveManager.push(snap, { rom: this.currentRom?.name || 'unknown' });

      // render PPU (if plugin core handles render it will do so)
      if (this.pluginCore?.present) {
        this.pluginCore.present();
      } else {
        this.ppu.present();
      }

      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  async createSavestate() {
    // Minimal savestate: combine memory regions + CPU registers + input state into a byte array.
    // In a plugin core scenario, prefer pluginCore.exportState().
    if (this.pluginCore?.exportState) {
      return await this.pluginCore.exportState();
    }
    // crude naive serialization:
    const memSnapshot = this.mem.ewram || new Uint8Array(0); // choose hallmarks like EWRAM + IWRAM + IO
    const iw = this.mem.iwram || new Uint8Array(0);
    const vram = this.mem.vram || new Uint8Array(0);
    const regs = new Uint32Array(this.cpu.reg);
    const header = new Uint8Array(8);
    // sizes: 4 bytes regs len, 4 bytes iw len (simpler format)
    const regsBytes = new Uint8Array(regs.buffer);
    // concat: [regsBytes][iw][memSnapshot][vram]
    const totalLen = regsBytes.length + iw.length + memSnapshot.length + vram.length;
    const out = new Uint8Array(totalLen);
    let offset = 0;
    out.set(regsBytes, offset); offset += regsBytes.length;
    out.set(iw, offset); offset += iw.length;
    out.set(memSnapshot, offset); offset += memSnapshot.length;
    out.set(vram, offset);
    return out;
  }

  async restoreSavestate(bytes) {
    // Accept bytes from createSavestate and restore — plugin core preferred
    if (!bytes) return false;
    if (this.pluginCore?.importState) {
      await this.pluginCore.importState(bytes);
      return true;
    }
    // naive restore: restore regs and memory segments (must match createSavestate)
    const regsLen = 16 * 4;
    const regsBytes = bytes.slice(0, regsLen);
    const regs = new Uint32Array(regsBytes.buffer);
    this.cpu.reg.set(regs);
    // remaining bytes we place into iwram + ewrm + vram in order if sizes allow
    let offset = regsLen;
    const iwLen = this.mem.iwram.length;
    this.mem.iwram.set(bytes.slice(offset, offset + iwLen)); offset += iwLen;
    const ewLen = this.mem.ewram?.length || 0;
    if (ewLen) this.mem.ewram.set(bytes.slice(offset, offset + ewLen)); offset += ewLen;
    const vramLen = this.mem.vram.length;
    this.mem.vram.set(bytes.slice(offset, offset + vramLen));
    this.statusCallback('Savestate restored');
    return true;
  }

  // reverse by restoring last saved state
  async restorePreviousSavestate() {
    const prev = await this.saveManager.previous();
    if (!prev) { this.statusCallback('No previous savestate to restore'); return; }
    await this.restoreSavestate(prev);
    this.ppu.present();
  }

  async exportCurrentSave() {
    const blob = await this.saveManager.exportCurrent();
    if (!blob) { alert('No save available'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const name = (this.currentRom?.name || 'save') + '.sav';
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async importSave(bytes) {
    // bytes: Uint8Array
    await this.saveManager.importAndPush(bytes, { imported: true });
    await this.restoreSavestate(bytes);
  }

  _startAutoSave() {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = setInterval(async () => {
      try {
        const snap = await this.createSavestate();
        await this.saveManager.push(snap, { rom: this.currentRom?.name || 'unknown', autosave: true });
        console.log('Autosaved snapshot');
      } catch (e) {
        console.warn('Autosave failed', e);
      }
    }, this.autoSaveInterval);
  }

  _stopAutoSave() {
    if (!this.autoSaveTimer) return;
    clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = null;
  }

  // restore last session (last savestate or last ROM)
  async restoreLastSession() {
    // try last savestate first
    const lastSave = await this.saveManager.latest();
    if (lastSave) {
      await this.restoreSavestate(lastSave);
      this.statusCallback('Restored last save');
      return true;
    }
    // fallback to last loaded ROM meta and last ROM in DB
    const lm = await storage.get('meta', 'lastROM');
    if (lm?.value) {
      // try to find the rom in DB
      const all = await storage.all('roms');
      const found = all.find(r => r.id === lm.value);
      if (found) {
        await this.loadROM(found.data, { name: found.name });
        this.statusCallback(`Loaded ROM ${found.name} from last session`);
        return true;
      }
    }
    return false;
  }

  async clearAllData() {
    await this.saveManager.clearAll();
    await storage.del('meta', 'lastROM').catch(()=>{});
  }
}
