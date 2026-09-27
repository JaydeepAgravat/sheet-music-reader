/* eslint-disable no-bitwise -- byte packing (base64, Float32, ARGB) */
/**
 * Standard (RFC 4648, padded) base64 for byte arrays, via lookup tables. Hermes has no Buffer and
 * btoa/atob work on binary strings (slow for stroke blobs), so ink points cross the bridge this way.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ENC: number[] = Array.from(ALPHABET, c => c.charCodeAt(0));
const DEC = new Int16Array(128).fill(-1);
for (let i = 0; i < ENC.length; i++) DEC[ENC[i]!] = i;
// Tolerate URL-safe input too.
DEC['-'.charCodeAt(0)] = 62;
DEC['_'.charCodeAt(0)] = 63;

const PAD = '='.charCodeAt(0);
/** String.fromCharCode spreads at most this many args at a time (stack-safe). */
const CHUNK = 0x2000;

export function bytesToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  const out = new Uint16Array(Math.ceil(len / 3) * 4);
  let o = 0;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out[o++] = ENC[(n >> 18) & 63]!;
    out[o++] = ENC[(n >> 12) & 63]!;
    out[o++] = ENC[(n >> 6) & 63]!;
    out[o++] = ENC[n & 63]!;
  }
  const rest = len - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out[o++] = ENC[(n >> 18) & 63]!;
    out[o++] = ENC[(n >> 12) & 63]!;
    out[o++] = PAD;
    out[o++] = PAD;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out[o++] = ENC[(n >> 18) & 63]!;
    out[o++] = ENC[(n >> 12) & 63]!;
    out[o++] = ENC[(n >> 6) & 63]!;
    out[o++] = PAD;
  }
  let s = '';
  for (let c = 0; c < out.length; c += CHUNK) {
    s += String.fromCharCode.apply(null, out.subarray(c, c + CHUNK) as unknown as number[]);
  }
  return s;
}

/** Decodes padded or unpadded base64 (standard or URL-safe). Throws on invalid characters. */
export function base64ToBytes(b64: string): Uint8Array {
  let end = b64.length;
  while (end > 0 && b64.charCodeAt(end - 1) === PAD) end--;
  if (end % 4 === 1) throw new Error('Invalid base64 length');
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  const val = (idx: number): number => {
    const c = b64.charCodeAt(idx);
    const v = c < 128 ? DEC[c]! : -1;
    if (v < 0) throw new Error(`Invalid base64 character at ${idx}`);
    return v;
  };
  let o = 0;
  let i = 0;
  for (; i + 3 < end; i += 4) {
    const n = (val(i) << 18) | (val(i + 1) << 12) | (val(i + 2) << 6) | val(i + 3);
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  const rest = end - i;
  if (rest >= 2) {
    const n = (val(i) << 18) | (val(i + 1) << 12) | (rest === 3 ? val(i + 2) << 6 : 0);
    out[o++] = (n >> 16) & 255;
    if (rest === 3) out[o++] = (n >> 8) & 255;
  }
  return out;
}

/** Packs floats as little-endian Float32 bytes (the ink blob / wire format). */
export function floatsToBytes(floats: Float32Array | readonly number[]): Uint8Array {
  const bytes = new Uint8Array(floats.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < floats.length; i++) view.setFloat32(i * 4, floats[i]!, true);
  return bytes;
}

/** Reads little-endian Float32 bytes (trailing bytes that don't make a whole float are ignored). */
export function bytesToFloats(bytes: Uint8Array): Float32Array {
  const n = bytes.byteLength >> 2;
  const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function floatsToBase64(floats: Float32Array | readonly number[]): string {
  return bytesToBase64(floatsToBytes(floats));
}

export function base64ToFloats(b64: string): Float32Array {
  return bytesToFloats(base64ToBytes(b64));
}
