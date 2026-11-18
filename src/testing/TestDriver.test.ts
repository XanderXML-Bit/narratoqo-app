import { describe, it, expect, beforeEach } from 'vitest';
import { TestDriver, TestDriverError, resetIdCounter } from './TestDriver';

describe('TestDriver', () => {
  let app: TestDriver;

  beforeEach(() => {
    resetIdCounter();
    app = new TestDriver();
  });

  // =========================================================================
  // Import
  // =========================================================================

  describe('importBook', () => {
    it('imports text and creates segments', () => {
      const result = app.importBook('My Book', 'First paragraph.\n\nSecond paragraph.');
      expect(result.ok).toBe(true);
      expect(result.data.title).toBe('My Book');
      expect(app.segments.length).toBe(2);
      expect(app.currentSegmentIndex).toBe(0);
    });

    it('rejects empty title', () => {
      expect(() => app.importBook('', 'content')).toThrow(TestDriverError);
    });

    it('rejects empty content', () => {
      expect(() => app.importBook('Title', '')).toThrow(TestDriverError);
    });

    it('initializes segment audio status', () => {
      app.importBook('Book', 'One.\n\nTwo.\n\nThree.');
      expect(Object.keys(app.segmentAudioStatus).length).toBe(3);
      expect(app.segmentAudioStatus[0]).toBe('idle');
    });

    it('creates pages', () => {
      const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}.`).join('\n\n');
      app.importBook('Big Book', text);
      expect(app.pages.length).toBeGreaterThan(1);
    });
  });

  describe('importFromURL', () => {
    it('sets sourceType to url', () => {
      const result = app.importFromURL('https://example.com/book', 'Web Book', 'Some content here.');
      expect(result.data.sourceType).toBe('url');
    });

    it('rejects invalid URL protocol', () => {
      expect(() => app.importFromURL('ftp://bad', 'Bad', 'content')).toThrow(TestDriverError);
    });
  });

  // =========================================================================
  // Segment Navigation
  // =========================================================================

  describe('selectSegment', () => {
    beforeEach(() => {
      app.importBook('Book', 'First.\n\nSecond.\n\nThird.');
    });

    it('selects valid segment', () => {
      const result = app.selectSegment(1);
      expect(result.ok).toBe(true);
      expect(app.currentSegmentIndex).toBe(1);
    });

    it('rejects out of range', () => {
      expect(() => app.selectSegment(99)).toThrow(TestDriverError);
      expect(() => app.selectSegment(-1)).toThrow(TestDriverError);
    });

    it('skips non-readable segments to next readable', () => {
      app.importBook('Book', 'Hello.\n\n...\n\n123\n\nWorld.');
      // Segment 1 is "...", segment 2 is "123" - both non-readable
      app.selectSegment(1);
      // Should skip to segment 3 "World."
      expect(app.currentSegmentIndex).toBe(3);
    });

    it('fails when no project loaded', () => {
      const fresh = new TestDriver();
      expect(() => fresh.selectSegment(0)).toThrow(TestDriverError);
    });
  });

  describe('nextSegment / prevSegment', () => {
    beforeEach(() => {
      app.importBook('Book', 'Alpha.\n\n...\n\nBeta.\n\nGamma.');
    });

    it('advances to next readable segment', () => {
      // Start at 0 ("Alpha."), next readable should be 2 ("Beta."), skipping 1 ("...")
      app.nextSegment();
      expect(app.currentSegmentIndex).toBe(2);
    });

    it('goes back to previous readable segment', () => {
      app.selectSegment(2); // "Beta."
      app.prevSegment();
      expect(app.currentSegmentIndex).toBe(0); // "Alpha." (skips "...")
    });

    it('throws at end of segments', () => {
      app.selectSegment(3); // "Gamma." (last)
      expect(() => app.nextSegment()).toThrow(TestDriverError);
    });

    it('throws at start of segments', () => {
      expect(() => app.prevSegment()).toThrow(TestDriverError);
    });
  });

  // =========================================================================
  // Audio Generation & Playback
  // =========================================================================

  describe('generateAudio', () => {
    beforeEach(() => {
      app.importBook('Book', 'Hello world.\n\nSecond paragraph.');
    });

    it('generates mock audio for segment', () => {
      const result = app.generateAudio(0);
      expect(result.ok).toBe(true);
      expect(app.audioCache.has(0)).toBe(true);
      expect(app.segmentAudioStatus[0]).toBe('ready');
    });

    it('generates audio with timing', () => {
      const timing = [
        { word: 'Hello', startTime: 0, endTime: 0.5 },
        { word: 'world.', startTime: 0.5, endTime: 1.0 },
      ];
      const result = app.generateAudio(0, timing);
      expect(result.data.timing).toEqual(timing);
    });

    it('rejects non-readable segment', () => {
      app.importBook('Book', 'Hello.\n\n...\n\nWorld.');
      expect(() => app.generateAudio(1)).toThrow(TestDriverError);
    });
  });

  describe('generateAllAudio', () => {
    it('generates for all readable segments', () => {
      app.importBook('Book', 'One.\n\n...\n\nTwo.\n\nThree.');
      const result = app.generateAllAudio();
      // "..." is not readable, so only 3 out of 4
      expect(result.data).toBe(3);
      expect(app.audioCache.size).toBe(3);
    });
  });

  describe('playAudio', () => {
    beforeEach(() => {
      app.importBook('Book', 'Hello world.');
      app.generateAudio(0);
    });

    it('plays current segment', () => {
      app.playAudio();
      expect(app.player.isPlaying).toBe(true);
    });

    it('throws if no audio generated', () => {
      app.importBook('Book', 'No audio yet.');
      expect(() => app.playAudio()).toThrow(TestDriverError);
    });

    it('throws if already playing', () => {
      app.playAudio();
      expect(() => app.playAudio()).toThrow(TestDriverError);
    });
  });

  describe('pauseAudio', () => {
    it('pauses playing audio', () => {
      app.importBook('Book', 'Content.');
      app.generateAudio(0);
      app.playAudio();
      app.pauseAudio();
      expect(app.player.isPlaying).toBe(false);
    });

    it('throws if not playing', () => {
      expect(() => app.pauseAudio()).toThrow(TestDriverError);
    });
  });

  describe('togglePlayPause', () => {
    it('auto-generates and plays if no audio cached', () => {
      app.importBook('Book', 'Hello world.');
      app.togglePlayPause();
      expect(app.player.isPlaying).toBe(true);
      expect(app.audioCache.has(0)).toBe(true);
    });

    it('toggles between play and pause', () => {
      app.importBook('Book', 'Hello world.');
      app.generateAudio(0);
      app.togglePlayPause(); // play
      expect(app.player.isPlaying).toBe(true);
      app.togglePlayPause(); // pause
      expect(app.player.isPlaying).toBe(false);
    });
  });

  // =========================================================================
  // Seek
  // =========================================================================

  describe('seek', () => {
    beforeEach(() => {
      app.importBook('Book', 'Content.');
      app.generateAudio(0);
      app.playAudio();
    });

    it('seeks to valid time', () => {
      app.seekTo(2.5);
      expect(app.player.currentTime).toBe(2.5);
    });

    it('rejects negative time', () => {
      expect(() => app.seekTo(-1)).toThrow(TestDriverError);
    });

    it('rejects time beyond duration', () => {
      expect(() => app.seekTo(999)).toThrow(TestDriverError);
    });

    it('seeks forward', () => {
      app.seekForward(2);
      expect(app.player.currentTime).toBe(2);
    });

    it('seeks backward clamped to 0', () => {
      app.seekBackward(999);
      expect(app.player.currentTime).toBe(0);
    });
  });

  // =========================================================================
  // Auto-read
  // =========================================================================

  describe('autoRead', () => {
    beforeEach(() => {
      app.importBook('Book', 'One.\n\nTwo.\n\nThree.');
      app.generateAllAudio();
    });

    it('auto-advances on audio end', () => {
      app.toggleAutoRead();
      expect(app.autoRead).toBe(true);

      app.playAudio();
      const result = app.simulateAudioEnd();
      expect(result.data.advanced).toBe(true);
      expect(result.data.nextSegment).toBe(1);
      expect(app.currentSegmentIndex).toBe(1);
      expect(app.player.isPlaying).toBe(true);
    });

    it('stops at end of book', () => {
      app.toggleAutoRead();
      app.selectSegment(2); // last segment
      app.playAudio();
      const result = app.simulateAudioEnd();
      expect(result.data.advanced).toBe(false);
      expect(app.autoRead).toBe(false);
    });

    it('does not advance when auto-read is off', () => {
      app.playAudio();
      const result = app.simulateAudioEnd();
      expect(result.data.advanced).toBe(false);
      expect(app.currentSegmentIndex).toBe(0);
    });
  });

  // =========================================================================
  // Settings
  // =========================================================================

  describe('settings', () => {
    it('sets playback speed', () => {
      app.setPlaybackSpeed(1.5);
      expect(app.player.playbackSpeed).toBe(1.5);
    });

    it('rejects invalid speed', () => {
      expect(() => app.setPlaybackSpeed(0.1)).toThrow(TestDriverError);
      expect(() => app.setPlaybackSpeed(3.0)).toThrow(TestDriverError);
    });

    it('sets volume', () => {
      app.setVolume(0.5);
      expect(app.player.volume).toBe(0.5);
    });

    it('toggles mute', () => {
      app.toggleMute();
      expect(app.player.volume).toBe(0);
      app.toggleMute();
      expect(app.player.volume).toBe(1);
    });
  });

  describe('selectVoice', () => {
    it('changes voice and invalidates cache', () => {
      app.importBook('Book', 'Content.');
      app.generateAudio(0);
      expect(app.audioCache.size).toBe(1);

      app.selectVoice('new-voice', 'openai');
      expect(app.settings.defaultVoiceId).toBe('new-voice');
      expect(app.settings.defaultProvider).toBe('openai');
      expect(app.audioCache.size).toBe(0); // Cache invalidated
    });
  });

  // =========================================================================
  // View Modes
  // =========================================================================

  describe('view modes', () => {
    it('toggles between segmented and continuous', () => {
      expect(app.viewMode).toBe('segmented');
      app.toggleViewMode();
      expect(app.viewMode).toBe('continuous');
      app.toggleViewMode();
      expect(app.viewMode).toBe('segmented');
    });

    it('toggles pagination', () => {
      app.importBook('Book', Array(12).fill('Paragraph.').join('\n\n'));
      app.togglePagination();
      expect(app.isPaginated).toBe(true);
    });

    it('navigates pages', () => {
      app.importBook('Book', Array(12).fill('Paragraph content here.').join('\n\n'));
      app.togglePagination();
      app.goToPage(1);
      expect(app.currentPage).toBe(1);
    });

    it('rejects page navigation when not paginated', () => {
      app.importBook('Book', 'Content.');
      expect(() => app.goToPage(0)).toThrow(TestDriverError);
    });

    it('enters and exits full audio mode', () => {
      app.importBook('Book', 'Content.');
      app.enterFullAudioMode();
      expect(app.fullAudioMode).toBe(true);
      app.exitFullAudioMode();
      expect(app.fullAudioMode).toBe(false);
    });
  });

  // =========================================================================
  // Export
  // =========================================================================

  describe('exportAudio', () => {
    it('exports when all segments have audio', () => {
      app.importBook('Book', 'One.\n\nTwo.');
      app.generateAllAudio();
      const result = app.exportAudio();
      expect(result.ok).toBe(true);
      expect(result.data.segmentCount).toBe(2);
    });

    it('fails when segments missing audio', () => {
      app.importBook('Book', 'One.\n\nTwo.');
      app.generateAudio(0); // Only first segment
      expect(() => app.exportAudio()).toThrow(TestDriverError);
    });

    it('fails for mp3 format', () => {
      app.importBook('Book', 'Content.');
      app.generateAllAudio();
      expect(() => app.exportAudio('mp3')).toThrow(TestDriverError);
    });
  });

  // =========================================================================
  // Snapshot
  // =========================================================================

  describe('snapshot', () => {
    it('returns null project when nothing loaded', () => {
      const snap = app.snapshot();
      expect(snap.projectTitle).toBeNull();
      expect(snap.segmentCount).toBe(0);
    });

    it('returns complete state', () => {
      app.importBook('My Book', 'Hello world.\n\nSecond para.');
      app.generateAudio(0);
      app.setPlaybackSpeed(1.5);
      app.setVolume(0.8);

      const snap = app.snapshot();
      expect(snap.projectTitle).toBe('My Book');
      expect(snap.segmentCount).toBe(2);
      expect(snap.cachedSegments).toBe(1);
      expect(snap.speed).toBe(1.5);
      expect(snap.volume).toBe(0.8);
    });
  });

  // =========================================================================
  // Event Log
  // =========================================================================

  describe('event log', () => {
    it('records actions', () => {
      app.importBook('Book', 'Content.');
      app.generateAudio(0);
      app.playAudio();
      const log = app.getEventLog();
      expect(log.length).toBe(3);
      expect(log[0]).toContain('Imported book');
      expect(log[1]).toContain('Generated audio');
      expect(log[2]).toContain('Playing');
    });

    it('clears log', () => {
      app.importBook('Book', 'Content.');
      app.clearEventLog();
      expect(app.getEventLog().length).toBe(0);
    });
  });
});

// ===========================================================================
// Journey Tests
// ===========================================================================

describe('Journey: Basic audiobook reading', () => {
  let app: TestDriver;

  beforeEach(() => {
    resetIdCounter();
    app = new TestDriver();
  });

  it('imports book, generates audio, plays through segments', () => {
    // 1. Import
    app.importBook('Alice in Wonderland', [
      'Alice was beginning to get very tired of sitting by her sister on the bank.',
      '"Oh dear!" said Alice.',
      'Down, down, down. Would the fall never come to an end?',
    ].join('\n\n'));

    expect(app.segments.length).toBe(3);
    expect(app.segments[1].type).toBe('dialogue');

    // 2. Generate audio for all
    app.generateAllAudio();
    expect(app.audioCache.size).toBe(3);

    // 3. Play first segment
    app.playAudio();
    expect(app.player.isPlaying).toBe(true);

    // 4. Seek within segment
    app.seekForward(2);
    expect(app.player.currentTime).toBe(2);

    // 5. Navigate to next segment
    app.pauseAudio();
    app.nextSegment();
    expect(app.currentSegmentIndex).toBe(1);
    expect(app.getCurrentSegmentText()).toContain('Oh dear');

    // 6. Play and advance
    app.playAudio();
    app.pauseAudio();
    app.nextSegment();
    expect(app.currentSegmentIndex).toBe(2);
  });
});

describe('Journey: Auto-read through entire book', () => {
  it('reads through all segments automatically', () => {
    const app = new TestDriver();
    app.importBook('Short Story', 'Part one.\n\nPart two.\n\nPart three.\n\nThe end.');

    app.generateAllAudio();
    app.toggleAutoRead();
    app.playAudio();

    // Simulate each segment ending
    const visited: number[] = [0];

    for (let i = 0; i < 10; i++) {
      const result = app.simulateAudioEnd();
      if (!result.data.advanced) break;
      visited.push(result.data.nextSegment!);
    }

    expect(visited).toEqual([0, 1, 2, 3]);
    expect(app.autoRead).toBe(false); // Auto-disabled at end
    expect(app.player.isPlaying).toBe(false);
  });
});

describe('Journey: Voice switching invalidates cache', () => {
  it('clears cache when voice changes', () => {
    const app = new TestDriver();
    app.importBook('Book', 'Hello.\n\nWorld.');
    app.generateAllAudio();

    expect(app.audioCache.size).toBe(2);
    expect(app.segmentAudioStatus[0]).toBe('ready');

    // Switch voice
    app.selectVoice('alloy', 'openai');

    expect(app.audioCache.size).toBe(0);
    expect(app.segmentAudioStatus[0]).toBe('idle');

    // Regenerate
    app.generateAllAudio();
    expect(app.audioCache.size).toBe(2);
  });
});

describe('Journey: Export after full generation', () => {
  it('generates all then exports', () => {
    const app = new TestDriver();
    app.importBook('Exportable', 'Chapter one.\n\n...\n\nChapter two.');

    // Generate all readable
    app.generateAllAudio();

    // Export
    const result = app.exportAudio();
    expect(result.data.segmentCount).toBe(2); // "..." is not readable
    expect(result.data.totalSegments).toBe(3);
  });
});

describe('Journey: Non-readable segments skipping', () => {
  it('navigates through mixed readable/non-readable content', () => {
    const app = new TestDriver();
    app.importBook('Mixed', [
      'Readable one.',
      '...',
      '123',
      '!!!',
      'Readable two.',
      '---',
      'Readable three.',
    ].join('\n\n'));

    expect(app.segments.length).toBe(7);

    // Select segment 0 (readable)
    app.selectSegment(0);
    expect(app.currentSegmentIndex).toBe(0);

    // Next should skip to segment 4 (skips "...", "123", "!!!")
    app.nextSegment();
    expect(app.currentSegmentIndex).toBe(4);

    // Next should skip to segment 6 (skips "---")
    app.nextSegment();
    expect(app.currentSegmentIndex).toBe(6);

    // No more readable segments
    expect(() => app.nextSegment()).toThrow(TestDriverError);

    // Go back
    app.prevSegment();
    expect(app.currentSegmentIndex).toBe(4);
  });
});

describe('Journey: Pagination navigation', () => {
  it('navigates pages and selects segments across pages', () => {
    const app = new TestDriver();
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} content.`).join('\n\n');
    app.importBook('Long Book', text);

    expect(app.pages.length).toBe(3); // 12 segments / 5 per page

    app.togglePagination();

    // Navigate to page 2
    app.goToPage(1);
    expect(app.currentPage).toBe(1);

    // Select segment on page 3
    app.selectSegment(10);
    expect(app.currentPage).toBe(2); // Should auto-update page
  });
});

describe('Journey: Settings changes during playback', () => {
  it('changes speed and volume during playback', () => {
    const app = new TestDriver();
    app.importBook('Book', 'Content here.');
    app.generateAudio(0);
    app.playAudio();

    app.setPlaybackSpeed(1.5);
    expect(app.player.playbackSpeed).toBe(1.5);
    expect(app.player.isPlaying).toBe(true);

    app.setVolume(0.3);
    expect(app.player.volume).toBe(0.3);

    app.toggleMute();
    expect(app.player.volume).toBe(0);

    app.toggleMute();
    expect(app.player.volume).toBe(1);
  });
});
