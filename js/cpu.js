// js/cpu.js
export default class CPU {
  constructor(memory) {
    this.mem = memory;
    this.reg = new Uint32Array(16);
    this.cpsr = 0;
    this.halted = true;
    this.mode = 'ARM';
    this.pc = 0x08000000;
    this.cycles = 0;
  }

  reset() {
    this.reg.fill(0);
    this.cpsr = 0;
    this.pc = 0x08000000;
    this.halted = false;
    this.cycles = 0;
  }

  fetch32(addr) { return this.mem.read32(addr); }
  fetch16(addr) { return this.mem.read16(addr); }

  step() {
    if (this.halted) return 0;
    if (this.mode === 'ARM') {
      const word = this.fetch32(this.pc);
      this.pc = (this.pc + 4) >>> 0;
      this.cycles += 1;
      return 1;
    } else {
      const half = this.fetch16(this.pc);
      this.pc = (this.pc + 2) >>> 0;
      this.cycles += 1;
      return 1;
    }
  }

  runCycles(cycleBudget) {
    let executed = 0;
    while (executed < cycleBudget && !this.halted) {
      this.step();
      executed++;
    }
    return executed;
  }
}
