// Side-effect module: imported first in App.tsx so the handler is in place before any other app
// module is evaluated (imports are hoisted, so a call further down would run too late).
import { installCrashHandler } from './crashHandler';

installCrashHandler();
