/* global jest */
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// Reanimated 4.7 + RN's "native" Jest platform: the native initializer calls a CSS hook that the
// JS (test) backend doesn't implement. Make just that hook a no-op; everything else stays real.
jest.mock('react-native-reanimated/lib/module/css/native/proxy', () => ({
  ...jest.requireActual('react-native-reanimated/lib/module/css/native/proxy'),
  setCSSEventHandler: () => {},
}));

// Native modules that don't exist in Jest.
jest.mock('@/specs/NativeAppSystem', () => ({
  __esModule: true,
  default: { performHaptic: jest.fn(), setSystemBarIconsDark: jest.fn(), setNightMode: jest.fn() },
}));

jest.mock('react-native-mmkv', () => {
  const React = require('react');
  const stores = new Map();
  const createMMKV = ({ id = 'default' } = {}) => {
    if (!stores.has(id)) {
      const data = new Map();
      const listeners = new Set();
      stores.set(id, {
        getString: k => data.get(k),
        set: (k, v) => {
          data.set(k, v);
          listeners.forEach(l => l(k));
        },
        remove: k => data.delete(k),
        addOnValueChangedListener: l => {
          listeners.add(l);
          return { remove: () => listeners.delete(l) };
        },
      });
    }
    return stores.get(id);
  };
  const useMMKVString = (key, store) => {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => store.addOnValueChangedListener(k => k === key && force()).remove, [key, store]);
    return [store.getString(key), v => store.set(key, v)];
  };
  return { createMMKV, useMMKVString };
});

jest.mock('@/data/db/database', () => ({ getDb: jest.fn() }));

// SafeAreaProvider renders nothing until native insets arrive; use the library's static mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
