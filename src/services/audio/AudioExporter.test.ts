import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAudioExporter,
  resetAudioExporter,
  type GlobalTimingMap,
} from './AudioExporter';

describe('AudioExporter', () => {
  beforeEach(() => {
    resetAudioExporter();
  });

  describe('getAudioExporter', () => {
    it('returns singleton instance', () => {
      const exporter1 = getAudioExporter();
      const exporter2 = getAudioExporter();
      expect(exporter1).toBe(exporter2);
    });

    it('returns new instance after reset', () => {
      const exporter1 = getAudioExporter();
      resetAudioExporter();
      const exporter2 = getAudioExporter();
      expect(exporter1).not.toBe(exporter2);
    });
  });

  describe('findPositionAtTime', () => {
    const createTimingMap = (): GlobalTimingMap => ({
      projectId: 'test-project',
      totalDuration: 100,
      segments: [
        {
          segmentIndex: 0,
          globalStartTime: 0,
          globalEndTime: 30,
          words: [
            { word: 'Hello', globalStart: 0, globalEnd: 5 },
            { word: 'world', globalStart: 5, globalEnd: 10 },
            { word: 'this', globalStart: 10, globalEnd: 15 },
          ],
        },
        {
          segmentIndex: 1,
          globalStartTime: 30,
          globalEndTime: 60,
          words: [
            { word: 'is', globalStart: 30, globalEnd: 35 },
            { word: 'segment', globalStart: 35, globalEnd: 45 },
            { word: 'two', globalStart: 45, globalEnd: 50 },
          ],
        },
        {
          segmentIndex: 2,
          globalStartTime: 60,
          globalEndTime: 100,
          words: [
            { word: 'and', globalStart: 60, globalEnd: 65 },
            { word: 'segment', globalStart: 65, globalEnd: 75 },
            { word: 'three', globalStart: 75, globalEnd: 85 },
          ],
        },
      ],
      createdAt: new Date(),
      contentHash: 'test-hash',
    });

    it('finds position at start of first segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 0);

      expect(result).toEqual({
        segmentIndex: 0,
        wordIndex: 0,
        segmentLocalTime: 0,
      });
    });

    it('finds position in middle of first segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 7);

      expect(result).toEqual({
        segmentIndex: 0,
        wordIndex: 1, // "world" (5-10)
        segmentLocalTime: 7,
      });
    });

    it('finds position at start of second segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 30);

      expect(result).toEqual({
        segmentIndex: 1,
        wordIndex: 0, // "is" (30-35)
        segmentLocalTime: 0,
      });
    });

    it('finds position in middle of second segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 40);

      expect(result).toEqual({
        segmentIndex: 1,
        wordIndex: 1, // "segment" (35-45)
        segmentLocalTime: 10,
      });
    });

    it('finds position in third segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 70);

      expect(result).toEqual({
        segmentIndex: 2,
        wordIndex: 1, // "segment" (65-75)
        segmentLocalTime: 10,
      });
    });

    it('returns null for time beyond total duration', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, 150);

      expect(result).toBeNull();
    });

    it('returns null for negative time', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      const result = exporter.findPositionAtTime(timingMap, -5);

      expect(result).toBeNull();
    });

    it('finds position at exact end of last segment (inclusive boundary)', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      // At exactly globalEndTime=100 of the last segment, should still match
      const result = exporter.findPositionAtTime(timingMap, 100);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(2);
    });

    it('finds word at exact end of last word in last segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      // At exactly globalEnd=85 of the last word "three" in last segment
      const result = exporter.findPositionAtTime(timingMap, 85);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(2);
      expect(result!.wordIndex).toBe(2); // "three"
    });

    it('does not match non-last segments at their exact end time', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      // At exactly globalEndTime=30 of segment 0 (non-last), should match segment 1 start
      const result = exporter.findPositionAtTime(timingMap, 30);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(1);
    });

    it('returns wordIndex -1 when between words', () => {
      const exporter = getAudioExporter();
      const timingMap: GlobalTimingMap = {
        projectId: 'test',
        totalDuration: 50,
        segments: [
          {
            segmentIndex: 0,
            globalStartTime: 0,
            globalEndTime: 50,
            words: [
              { word: 'Hello', globalStart: 0, globalEnd: 5 },
              // gap from 5-10
              { word: 'world', globalStart: 10, globalEnd: 15 },
            ],
          },
        ],
        createdAt: new Date(),
        contentHash: 'test',
      };

      const result = exporter.findPositionAtTime(timingMap, 7); // In the gap

      expect(result).toEqual({
        segmentIndex: 0,
        wordIndex: -1, // Between words
        segmentLocalTime: 7,
      });
    });
  });

  describe('getGlobalTime', () => {
    const createTimingMap = (): GlobalTimingMap => ({
      projectId: 'test-project',
      totalDuration: 100,
      segments: [
        {
          segmentIndex: 0,
          globalStartTime: 0,
          globalEndTime: 30,
          words: [
            { word: 'Hello', globalStart: 0, globalEnd: 5 },
            { word: 'world', globalStart: 5, globalEnd: 10 },
          ],
        },
        {
          segmentIndex: 1,
          globalStartTime: 30,
          globalEndTime: 60,
          words: [
            { word: 'is', globalStart: 30, globalEnd: 35 },
            { word: 'segment', globalStart: 35, globalEnd: 45 },
          ],
        },
        {
          segmentIndex: 2,
          globalStartTime: 60,
          globalEndTime: 100,
          words: [
            { word: 'and', globalStart: 60, globalEnd: 65 },
            { word: 'three', globalStart: 75, globalEnd: 85 },
          ],
        },
      ],
      createdAt: new Date(),
      contentHash: 'test-hash',
    });

    it('returns segment start time when no word index provided', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.getGlobalTime(timingMap, 0)).toBe(0);
      expect(exporter.getGlobalTime(timingMap, 1)).toBe(30);
      expect(exporter.getGlobalTime(timingMap, 2)).toBe(60);
    });

    it('returns word start time when word index provided', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.getGlobalTime(timingMap, 0, 0)).toBe(0); // "Hello"
      expect(exporter.getGlobalTime(timingMap, 0, 1)).toBe(5); // "world"
      expect(exporter.getGlobalTime(timingMap, 1, 0)).toBe(30); // "is"
      expect(exporter.getGlobalTime(timingMap, 1, 1)).toBe(35); // "segment"
      expect(exporter.getGlobalTime(timingMap, 2, 1)).toBe(75); // "three"
    });

    it('returns segment start for invalid word index', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.getGlobalTime(timingMap, 0, 99)).toBe(0);
      expect(exporter.getGlobalTime(timingMap, 1, -1)).toBe(30);
    });

    it('returns 0 for non-existent segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.getGlobalTime(timingMap, 99)).toBe(0);
    });
  });

  describe('segmentToGlobal', () => {
    const createTimingMap = (): GlobalTimingMap => ({
      projectId: 'test',
      totalDuration: 100,
      segments: [
        { segmentIndex: 0, globalStartTime: 0, globalEndTime: 30, words: [] },
        { segmentIndex: 1, globalStartTime: 30, globalEndTime: 60, words: [] },
        { segmentIndex: 2, globalStartTime: 60, globalEndTime: 100, words: [] },
      ],
      createdAt: new Date(),
      contentHash: 'test',
    });

    it('converts segment-local time to global time', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.segmentToGlobal(timingMap, 0, 0)).toBe(0);
      expect(exporter.segmentToGlobal(timingMap, 0, 15)).toBe(15);
      expect(exporter.segmentToGlobal(timingMap, 1, 0)).toBe(30);
      expect(exporter.segmentToGlobal(timingMap, 1, 10)).toBe(40);
      expect(exporter.segmentToGlobal(timingMap, 2, 5)).toBe(65);
    });

    it('returns 0 for non-existent segment', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.segmentToGlobal(timingMap, 99, 10)).toBe(0);
    });
  });

  describe('globalToSegment', () => {
    const createTimingMap = (): GlobalTimingMap => ({
      projectId: 'test',
      totalDuration: 100,
      segments: [
        { segmentIndex: 0, globalStartTime: 0, globalEndTime: 30, words: [] },
        { segmentIndex: 1, globalStartTime: 30, globalEndTime: 60, words: [] },
        { segmentIndex: 2, globalStartTime: 60, globalEndTime: 100, words: [] },
      ],
      createdAt: new Date(),
      contentHash: 'test',
    });

    it('converts global time to segment-local position', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.globalToSegment(timingMap, 0)).toEqual({ segmentIndex: 0, localTime: 0 });
      expect(exporter.globalToSegment(timingMap, 15)).toEqual({ segmentIndex: 0, localTime: 15 });
      expect(exporter.globalToSegment(timingMap, 30)).toEqual({ segmentIndex: 1, localTime: 0 });
      expect(exporter.globalToSegment(timingMap, 45)).toEqual({ segmentIndex: 1, localTime: 15 });
      expect(exporter.globalToSegment(timingMap, 75)).toEqual({ segmentIndex: 2, localTime: 15 });
    });

    it('returns null for time beyond total duration', () => {
      const exporter = getAudioExporter();
      const timingMap = createTimingMap();

      expect(exporter.globalToSegment(timingMap, 150)).toBeNull();
    });
  });

  describe('downloadBlob', () => {
    it('creates download link with correct attributes', () => {
      const exporter = getAudioExporter();

      // Mock DOM methods
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const blob = new Blob(['test'], { type: 'audio/wav' });
      exporter.downloadBlob(blob, 'test-audio.wav');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.href).toBe('blob:test-url');
      expect(mockLink.download).toBe('test-audio.wav');
      expect(mockLink.click).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');

      // Cleanup
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });
  });
});
