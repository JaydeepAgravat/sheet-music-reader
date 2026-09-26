import { useEffect } from 'react';
import NativeKeyEvents from '@/specs/NativeKeyEvents';
import { useLiveQuery } from '@/data/db/live';
import { usePref } from '@/data/prefs';
import { listLearned } from '@/data/repos/pedals';
import { effectiveMappings } from '@/domain/pedals/keymap';

/** Keeps the native key router's map + debounce in sync with the database and preferences. */
export function usePedalConfigSync(): void {
  const learned = useLiveQuery(['pedal_mappings'], listLearned, []);
  const [volumeKeys] = usePref('volumeKeysTurn');
  const [debounceMs] = usePref('pedalDebounceMs');

  useEffect(() => {
    const map = effectiveMappings(learned, volumeKeys);
    NativeKeyEvents.setMappings([...map.keys()], [...map.values()]);
  }, [learned, volumeKeys]);

  useEffect(() => {
    NativeKeyEvents.setDebounceMs(Math.round(debounceMs));
  }, [debounceMs]);
}
