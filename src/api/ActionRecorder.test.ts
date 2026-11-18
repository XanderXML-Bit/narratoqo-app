import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRecorder } from './ActionRecorder';

describe('ActionRecorder', () => {
  let recorder: ActionRecorder;

  beforeEach(() => {
    recorder = new ActionRecorder();
  });

  it('should start recording by default', () => {
    expect(recorder.isRecording()).toBe(true);
  });

  it('should record actions', () => {
    recorder.record('testMethod', { key: 'value' }, { ok: true });

    const history = recorder.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].method).toBe('testMethod');
    expect(history[0].input).toEqual({ key: 'value' });
    expect(history[0].result.ok).toBe(true);
    expect(history[0].timestamp).toBeGreaterThan(0);
  });

  it('should record multiple actions in order', () => {
    recorder.record('action1', {}, { ok: true });
    recorder.record('action2', {}, { ok: false, error: 'fail' });
    recorder.record('action3', {}, { ok: true });

    const history = recorder.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].method).toBe('action1');
    expect(history[1].method).toBe('action2');
    expect(history[2].method).toBe('action3');
  });

  it('should return a copy of history (not a reference)', () => {
    recorder.record('test', {}, { ok: true });

    const history1 = recorder.getHistory();
    const history2 = recorder.getHistory();

    expect(history1).not.toBe(history2);
    expect(history1).toEqual(history2);
  });

  it('should filter successful actions', () => {
    recorder.record('success1', {}, { ok: true });
    recorder.record('failure', {}, { ok: false, error: 'oops' });
    recorder.record('success2', {}, { ok: true });

    const successful = recorder.getSuccessful();
    expect(successful).toHaveLength(2);
    expect(successful[0].method).toBe('success1');
    expect(successful[1].method).toBe('success2');
  });

  it('should clear history', () => {
    recorder.record('test', {}, { ok: true });
    expect(recorder.getHistory()).toHaveLength(1);

    recorder.clear();
    expect(recorder.getHistory()).toHaveLength(0);
  });

  it('should pause and resume recording', () => {
    recorder.record('before', {}, { ok: true });
    expect(recorder.getHistory()).toHaveLength(1);

    recorder.pause();
    expect(recorder.isRecording()).toBe(false);

    recorder.record('during-pause', {}, { ok: true });
    expect(recorder.getHistory()).toHaveLength(1); // Not recorded

    recorder.resume();
    expect(recorder.isRecording()).toBe(true);

    recorder.record('after', {}, { ok: true });
    expect(recorder.getHistory()).toHaveLength(2);
    expect(recorder.getHistory()[1].method).toBe('after');
  });

  it('should serialize to JSON', () => {
    recorder.record('test', { id: 1 }, { ok: true });

    const json = recorder.toJSON();
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].method).toBe('test');
    expect(parsed[0].input).toEqual({ id: 1 });
  });

  it('should deserialize from JSON', () => {
    const data = [
      { timestamp: 1000, method: 'loaded', input: {}, result: { ok: true } },
      { timestamp: 2000, method: 'failed', input: { x: 1 }, result: { ok: false, error: 'err' } },
    ];
    const json = JSON.stringify(data);

    recorder.fromJSON(json);

    const history = recorder.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].method).toBe('loaded');
    expect(history[1].method).toBe('failed');
    expect(history[1].result.error).toBe('err');
  });

  it('should ignore invalid JSON in fromJSON', () => {
    recorder.record('existing', {}, { ok: true });

    // Non-array JSON should not overwrite
    recorder.fromJSON('"not-an-array"');
    expect(recorder.getHistory()).toHaveLength(1);
  });
});
