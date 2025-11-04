// js/savestate.js
// Manage an array of savestates (byte blobs) for reverse and persistence.

import * as storage from './storage.js';

const SAVESTORE = 'saves';
const META = 'meta';

export default class SaveStateManager {
  constructor(maxSlots = 16) {
    this.maxSlots = maxSlots;
    this.ring = []; // {id, ts, data:Uint8Array}
    this.currentId = null;
  }

  async push(stateBytes, meta = {}) {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record = { id, ts: Date.now(), data: stateBytes, meta };
    this.ring.push(record);
    if (this.ring.length > this.maxSlots) {
      const removed = this.ring.shift();
      await storage.del(SAVESTORE, removed.id).catch(()=>{});
    }
    await storage.put(SAVESTORE, { id: record.id, ts: record.ts, data: record.data, meta: record.meta });
    this.currentId = id;
    await storage.put(META, { key: 'lastSave', value: { id, ts: record.ts }});
    return record;
  }

  // restore the latest and return its bytes or null
  async latest() {
    // check local ring first
    if (this.ring.length) return this.ring[this.ring.length-1].data;
    // fallback to DB lastSave
    const m = await storage.get(META, 'lastSave');
    if (!m?.value?.id) return null;
    const item = await storage.get(SAVESTORE, m.value.id);
    if (!item) return null;
    return item.data;
  }

  async previous() {
    if (this.ring.length <= 1) return null;
    // remove last and return the new last (this is used for "reverse")
    this.ring.pop();
    const last = this.ring[this.ring.length - 1];
    this.currentId = last.id;
    return last.data;
  }

  async exportCurrent() {
    const b = await this.latest();
    if (!b) return null;
    // create Blob
    const blob = new Blob([b], { type: 'application/octet-stream' });
    return blob;
  }

  async importAndPush(bytes, meta = {}) {
    // bytes: Uint8Array
    return await this.push(bytes, meta);
  }

  async clearAll() {
    // remove metadata and saves from DB - careful
    const allSaves = await storage.all(SAVESTORE);
    for (const s of allSaves) await storage.del(SAVESTORE, s.id).catch(()=>{});
    await storage.put(META, { key: 'lastSave', value: null }).catch(()=>{});
    this.ring = [];
    this.currentId = null;
  }
}
