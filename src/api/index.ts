/**
 * Narratoqo API Bridge — Headless programmatic interface for AI agents.
 */

export { AppBridge } from './AppBridge';
export { StateInspector } from './StateInspector';
export { ActionRecorder, type RecordedAction } from './ActionRecorder';

import { AppBridge } from './AppBridge';

export const bridge = AppBridge.getInstance();

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).__APP_BRIDGE = bridge;
  (window as unknown as Record<string, unknown>).__NARRATOQO = bridge;
}
