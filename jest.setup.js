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
  default: {
    performHaptic: jest.fn(),
    setSystemBarIconsDark: jest.fn(),
    setNightMode: jest.fn(),
    setKeepAwake: jest.fn(),
    setImmersive: jest.fn(),
    setOrientationLock: jest.fn(),
    pickDate: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('@/specs/NativeKeyEvents', () => {
  const sub = () => ({ remove: jest.fn() });
  return {
    __esModule: true,
    default: {
      setMappings: jest.fn(),
      setDebounceMs: jest.fn(),
      setReaderActive: jest.fn(),
      setTurnPlan: jest.fn(),
      clearTurnPlan: jest.fn(),
      setLearning: jest.fn(),
      getConnectedDevices: jest.fn(() => []),
      hasHardwareKeyboard: jest.fn(() => false),
      onPedal: jest.fn(sub),
      onKeyLearned: jest.fn(sub),
      onDeviceAdded: jest.fn(sub),
      onDeviceRemoved: jest.fn(sub),
    },
  };
});

jest.mock('@/specs/NativeInk', () => {
  const sub = () => ({ remove: jest.fn() });
  return {
    __esModule: true,
    default: {
      addStrokes: jest.fn(),
      removeStrokes: jest.fn(),
      releaseInk: jest.fn(),
      setTool: jest.fn(),
      hasSeenStylus: jest.fn(() => false),
      onInkEdit: jest.fn(sub),
      onStylus: jest.fn(sub),
    },
  };
});

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

jest.mock('@/specs/NativeSafImport', () => ({
  __esModule: true,
  default: {
    pickFiles: jest.fn(async () => []),
    pickFolder: jest.fn(async () => null),
    listFolder: jest.fn(async () => []),
    copyToLibrary: jest.fn(),
    takePendingShares: jest.fn(() => []),
    libraryDir: jest.fn(() => '/data/files/library'),
    coversDir: jest.fn(() => '/data/files/covers'),
    deleteFile: jest.fn(() => true),
    freeBytes: jest.fn(() => 1e10),
    onShareReceived: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('@/specs/NativeBackup', () => ({
  __esModule: true,
  default: {
    pickDestination: jest.fn(async () => null),
    pickBackupFile: jest.fn(async () => null),
    writeBackup: jest.fn(async () => ({ bytes: 0, missing: [], damaged: [] })),
    readTextEntries: jest.fn(async () => []),
    extractFiles: jest.fn(async (_uri, items) => items.map(i => ({ name: i.name, destPath: i.destPath, ok: true, sha256: i.sha256 }))),
    hashFiles: jest.fn(async paths => paths.map(p => ({ path: p, ok: true, sha256: '' }))),
    cancel: jest.fn(),
    fileSize: jest.fn(async () => -1),
    onBackupProgress: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
