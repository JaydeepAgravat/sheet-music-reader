import { assignKey, effectiveMappings, KeyCode, keyLabel, keysByAction, type LearnedMapping } from '../keymap';

const learned = (keyCode: number, action: LearnedMapping['action']): LearnedMapping => ({ keyCode, action, keyName: '', deviceName: 'AirTurn' });

describe('pedal key map', () => {
  it('works out of the box for arrow-mode and page-mode pedals', () => {
    const m = effectiveMappings([], false);
    expect(m.get(KeyCode.PAGE_DOWN)).toBe('NEXT');
    expect(m.get(KeyCode.DPAD_RIGHT)).toBe('NEXT');
    expect(m.get(KeyCode.PAGE_UP)).toBe('PREV');
    expect(m.get(KeyCode.DPAD_LEFT)).toBe('PREV');
  });

  it('adds volume keys only when opted in', () => {
    expect(effectiveMappings([], false).has(KeyCode.VOLUME_DOWN)).toBe(false);
    expect(effectiveMappings([], true).get(KeyCode.VOLUME_DOWN)).toBe('NEXT');
  });

  it('learned keys override defaults and re-assigning a key replaces it', () => {
    let l = assignKey([], learned(KeyCode.DPAD_RIGHT, 'TOGGLE_HALF'));
    l = assignKey(l, learned(KeyCode.DPAD_RIGHT, 'NEXT_SONG'));
    expect(l).toHaveLength(1);
    expect(effectiveMappings(l, false).get(KeyCode.DPAD_RIGHT)).toBe('NEXT_SONG');
    expect(keysByAction(l, false).NEXT).not.toContain(KeyCode.DPAD_RIGHT);
  });

  it('labels keys readably', () => {
    expect(keyLabel(KeyCode.PAGE_DOWN)).toBe('Page Down');
    expect(keyLabel(KeyCode.DPAD_LEFT)).toBe('Arrow Left');
    expect(keyLabel(999)).toBe('Key 999');
    expect(keyLabel(999, 'BUTTON_A')).toBe('Button A');
  });
});
