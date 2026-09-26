/**
 * Reads a Figma .fig export: a zip holding canvas.fig, which is "fig-kiwi" + version + chunks
 * (a deflated kiwi schema, then the deflated or zstd'd message). Returns the decoded message and
 * a parent→children index. No network, no Figma API.
 */
const fs = require('fs');
const zlib = require('zlib');
const kiwi = require('kiwi-schema');
const fzstd = require('fzstd');

function unzipCanvas(figPath) {
  const buf = fs.readFileSync(figPath);
  if (buf.subarray(0, 8).toString() === 'fig-kiwi') return buf;
  // Minimal zip reader over the central directory (local headers may defer sizes to a data
  // descriptor, so they cannot be trusted).
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('Not a zip or a .fig: ' + figPath);
  const entries = buf.readUInt16LE(eocd + 10);
  let o = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i += 1) {
    const method = buf.readUInt16LE(o + 10);
    const size = buf.readUInt32LE(o + 20);
    const nameLen = buf.readUInt16LE(o + 28);
    const extraLen = buf.readUInt16LE(o + 30);
    const commentLen = buf.readUInt16LE(o + 32);
    const local = buf.readUInt32LE(o + 42);
    const name = buf.subarray(o + 46, o + 46 + nameLen).toString();
    if (name === 'canvas.fig') {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    o += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('canvas.fig not found in ' + figPath);
}

function load(figPath) {
  const b = unzipCanvas(figPath);
  let o = 12;
  const chunks = [];
  while (o < b.length) {
    const n = b.readUInt32LE(o);
    chunks.push(b.subarray(o + 4, o + 4 + n));
    o += 4 + n;
  }
  const un = (c) => {
    try {
      return zlib.inflateRawSync(c);
    } catch {
      return Buffer.from(fzstd.decompress(c));
    }
  };
  const schema = kiwi.compileSchema(kiwi.decodeBinarySchema(un(chunks[0])));
  const m = schema.decodeMessage(un(chunks[1]));
  const id = (g) => (g ? `${g.sessionID}:${g.localID}` : null);
  const K = {};
  for (const n of m.nodeChanges) {
    const p = id(n.parentIndex && n.parentIndex.guid);
    if (p) (K[p] = K[p] || []).push(n);
  }
  for (const k in K) K[k].sort((a, b) => (a.parentIndex.position < b.parentIndex.position ? -1 : 1));
  return { m, K, id };
}

module.exports = { load };
