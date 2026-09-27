/* eslint-disable no-bitwise -- byte packing (base64, Float32, ARGB) */
import { base64ToBytes, base64ToFloats, bytesToBase64, bytesToFloats, floatsToBase64, floatsToBytes } from '../base64';

/** Naive reference encoder (bit string), independent of the table-driven one. */
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ref = (b: Uint8Array) => {
  const bits = Array.from(b, x => x.toString(2).padStart(8, '0')).join('');
  let s = '';
  for (let i = 0; i < bits.length; i += 6) s += A[parseInt(bits.slice(i, i + 6).padEnd(6, '0'), 2)];
  return s + '='.repeat((4 - (s.length % 4)) % 4);
};

describe('base64', () => {
  it('matches the reference encoder for every length 0..40 (odd lengths and padding)', () => {
    for (let len = 0; len <= 40; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 97 + len * 13) & 255);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(ref(bytes));
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    }
  });

  it('known vectors', () => {
    const enc = (s: string) => bytesToBase64(Uint8Array.from(s, c => c.charCodeAt(0)));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foobar')).toBe('Zm9vYmFy');
  });

  it('round-trips large random buffers (chunked string building)', () => {
    const bytes = Uint8Array.from({ length: 30_001 }, () => Math.floor(Math.random() * 256));
    const b64 = bytesToBase64(bytes);
    expect(b64).toBe(ref(bytes));
    expect(base64ToBytes(b64)).toEqual(bytes);
  });

  it('decodes unpadded and URL-safe input, rejects garbage', () => {
    expect(Array.from(base64ToBytes('Zm8'))).toEqual([102, 111]);
    expect(Array.from(base64ToBytes('-_8='))).toEqual([251, 255]);
    expect(() => base64ToBytes('Zm9v!')).toThrow();
    expect(() => base64ToBytes('Z')).toThrow();
  });

  it('packs floats little-endian and round-trips through base64', () => {
    const f = new Float32Array([0, 0.5, 1, 0.123, 0.999, 0.25]);
    const bytes = floatsToBytes(f);
    expect(Array.from(bytes.subarray(4, 8))).toEqual([0, 0, 0, 63]); // 0.5 = 0x3F000000 LE
    expect(bytesToFloats(bytes)).toEqual(f);
    expect(base64ToFloats(floatsToBase64(f))).toEqual(f);
    expect(floatsToBase64([])).toBe('');
    expect(base64ToFloats('').length).toBe(0);
  });

  it('reads floats from an offset view', () => {
    const f = new Float32Array([1, 2, 3]);
    const padded = new Uint8Array(16);
    padded.set(floatsToBytes(f), 3);
    expect(Array.from(bytesToFloats(padded.subarray(3, 15)))).toEqual([1, 2, 3]);
  });
});
