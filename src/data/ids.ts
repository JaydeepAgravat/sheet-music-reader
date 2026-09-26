/**
 * UUID v7: time-ordered, so primary keys insert at the end of the B-tree and sort by creation.
 * Hermes has no crypto.getRandomValues; Math.random is fine for local-only identifiers.
 */
export function uuidv7(now = Date.now()): string {
  const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');
  const rand = (bits: number) => Math.floor(Math.random() * 2 ** bits);
  const ms = hex(now, 12);
  const verRand = hex(0x7000 + rand(12), 4);
  const variant = hex(0x8000 + rand(14), 4);
  const tail = hex(rand(24), 6) + hex(rand(24), 6);
  return `${ms.slice(0, 8)}-${ms.slice(8)}-${verRand}-${variant}-${tail}`;
}
