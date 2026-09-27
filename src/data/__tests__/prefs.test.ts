import { getPref, prefsStore, setPref } from '../prefs';
import { DEFAULT_INK_PRESETS } from '@/domain/ink/presets';

describe('ink prefs', () => {
  it('have defaults', () => {
    expect(getPref('inkPresets')).toEqual(DEFAULT_INK_PRESETS);
    expect(getPref('inkActiveTool')).toBe('graphite');
    expect(getPref('inkToolbarPos')).toBeNull();
    expect(getPref('inkFingerDraws')).toBe(false);
  });

  it('round-trip and sanitise presets', () => {
    const edited = DEFAULT_INK_PRESETS.map(p => ({ ...p }));
    edited[1] = { ...edited[1]!, color: '#2E7D32', width: 2.6 };
    setPref('inkPresets', edited);
    expect(getPref('inkPresets')).toEqual(edited);
    expect(getPref('inkPresets')).toBe(getPref('inkPresets')); // stable identity for hooks
    prefsStore.set('inkPresets', JSON.stringify([{ width: 99 }]));
    const p = getPref('inkPresets');
    expect(p).toHaveLength(4);
    expect(p[0]?.width).toBe(24);
    prefsStore.set('inkPresets', '{bad json');
    expect(getPref('inkPresets')).toEqual(DEFAULT_INK_PRESETS);
  });

  it('validates the toolbar position and active tool', () => {
    setPref('inkToolbarPos', { x: 0.2, y: 0.9 });
    expect(getPref('inkToolbarPos')).toEqual({ x: 0.2, y: 0.9 });
    prefsStore.set('inkToolbarPos', JSON.stringify({ x: 3, y: -1 }));
    expect(getPref('inkToolbarPos')).toEqual({ x: 1, y: 0 });
    prefsStore.set('inkToolbarPos', JSON.stringify({ x: 'a' }));
    expect(getPref('inkToolbarPos')).toBeNull();
    setPref('inkToolbarPos', null);
    expect(getPref('inkToolbarPos')).toBeNull();
    setPref('inkActiveTool', 'eraser');
    expect(getPref('inkActiveTool')).toBe('eraser');
    prefsStore.set('inkActiveTool', '""');
    expect(getPref('inkActiveTool')).toBe('graphite');
    setPref('inkFingerDraws', true);
    expect(getPref('inkFingerDraws')).toBe(true);
  });
});
