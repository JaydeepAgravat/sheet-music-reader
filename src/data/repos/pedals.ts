import { notifyChanged } from '@/data/db/live';
import { sql } from '@/data/db/runner';
import { assignKey, PEDAL_ACTIONS, type LearnedMapping, type PedalAction } from '@/domain/pedals/keymap';

type Row = { keycode: number; action: string; device_name: string | null; key_name: string | null };

/** Keys the user taught on the Pedals screen (defaults are not stored). */
export function listLearned(): LearnedMapping[] {
  return sql()
    .all<Row>('SELECT keycode, action, device_name, key_name FROM pedal_mappings ORDER BY rowid')
    .filter(r => PEDAL_ACTIONS.includes(r.action as PedalAction))
    .map(r => ({ keyCode: r.keycode, action: r.action as PedalAction, deviceName: r.device_name ?? '', keyName: r.key_name ?? '' }));
}

export function learnKey(m: LearnedMapping): void {
  const next = assignKey(listLearned(), m);
  const db = sql();
  db.tx(() => {
    db.run('DELETE FROM pedal_mappings');
    for (const x of next) {
      db.run('INSERT INTO pedal_mappings (keycode, action, device_name, key_name) VALUES (?,?,?,?)', [x.keyCode, x.action, x.deviceName, x.keyName]);
    }
  });
  notifyChanged('pedal_mappings');
}

export function forgetKey(keyCode: number): void {
  sql().run('DELETE FROM pedal_mappings WHERE keycode = ?', [keyCode]);
  notifyChanged('pedal_mappings');
}

export function resetLearned(): void {
  sql().run('DELETE FROM pedal_mappings');
  notifyChanged('pedal_mappings');
}
