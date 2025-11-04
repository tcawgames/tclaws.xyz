// js/memory.js
export default class Memory {
  constructor() {
    this.rom = null;
    this.iwram = new Uint8Array(32 * 1024);
    this.ewram = new Uint8Array(256 * 1024);
    this.vram  = new Uint8Array(96 * 1024);
    this.io   = new Uint8Array(0x400);
    this.oam  = new Uint8Array(1 * 1024);
    this.palette = new Uint8Array(1 * 1024);
  }

  loadROM(buffer) {
    this.rom = buffer;
  }

  read8(addr) {
    addr = addr >>> 0;
    if (addr >= 0x08000000 && addr < 0x0A000000) {
      const idx = addr - 0x08000000;
      if (!this.rom) return 0xFF;
      return this.rom[idx] ?? 0xFF;
    } else if (addr >= 0x02000000 && addr < 0x02040000) {
      return this.iwram[addr - 0x02000000];
    } else if (addr >= 0x03000000 && addr < 0x03007F00) {
      return this.palette[addr - 0x03000000] ?? 0;
    } else if (addr >= 0x04000000 && addr < 0x04000400) {
      return this.io[addr - 0x04000000];
    } else if (addr >= 0x06000000 && addr < 0x06020000) {
      return this.vram[addr - 0x06000000];
    }
    return 0x00;
  }

  read16(addr) {
    const lo = this.read8(addr);
    const hi = this.read8(addr + 1);
    return (hi << 8) | lo;
  }

  read32(addr) {
    const a = this.read16(addr);
    const b = this.read16(addr + 2);
    return (b << 16) | a;
  }

  write8(addr, val) {
    addr = addr >>> 0; val = val & 0xFF;
    if (addr >= 0x02000000 && addr < 0x02040000) {
      this.iwram[addr - 0x02000000] = val;
    } else if (addr >= 0x04000000 && addr < 0x04000400) {
      this.io[addr - 0x04000000] = val;
    } else if (addr >= 0x06000000 && addr < 0x06020000) {
      this.vram[addr - 0x06000000] = val;
    }
  }

  write16(addr, val) {
    this.write8(addr, val & 0xFF);
    this.write8(addr + 1, (val >> 8) & 0xFF);
  }

  write32(addr, val) {
    this.write16(addr, val & 0xFFFF);
    this.write16(addr + 2, (val >>> 16) & 0xFFFF);
  }
}
