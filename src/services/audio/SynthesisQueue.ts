/**
 * Runs speech synthesis one job at a time.
 *
 * On-device voices (Kokoro, Piper) run a single model, so parallel requests only
 * queue up inside it. Running them here instead lets the segment the listener is
 * waiting for go first: a 'foreground' job runs before any queued 'background'
 * (preload) job, and a queued preload can be promoted when the listener reaches it.
 */
export type SynthesisPriority = 'foreground' | 'background';

interface Job {
  key: number;
  priority: SynthesisPriority;
  seq: number;
  run: () => Promise<void>;
  cancel: () => void;
}

/** Rejects a queued job that was dropped before it started. */
export class SynthesisCancelledError extends Error {
  constructor() {
    super('Synthesis cancelled');
    this.name = 'SynthesisCancelledError';
  }
}

export class SynthesisQueue {
  private pending: Job[] = [];
  private running = false;
  private seq = 0;

  /** Queue a job. The returned promise settles with the job's own result. */
  enqueue<T>(key: number, task: () => Promise<T>, priority: SynthesisPriority): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        key,
        priority,
        seq: this.seq++,
        run: () => Promise.resolve().then(task).then(resolve, reject),
        cancel: () => reject(new SynthesisCancelledError()),
      });
      this.drain();
    });
  }

  /** Move a queued job to the front (no effect once it is running). */
  promote(key: number): void {
    for (const job of this.pending) {
      if (job.key === key) job.priority = 'foreground';
    }
  }

  /**
   * Drop every queued background (preload) job; each rejects with SynthesisCancelledError.
   * The job already running is left to finish. Returns how many were dropped.
   */
  dropBackground(): number {
    const dropped = this.pending.filter((job) => job.priority === 'background');
    this.pending = this.pending.filter((job) => job.priority !== 'background');
    for (const job of dropped) job.cancel();
    return dropped.length;
  }

  /** Number of jobs waiting (not counting the one running). */
  get size(): number {
    return this.pending.length;
  }

  private next(): Job | undefined {
    if (this.pending.length === 0) return undefined;
    let best = 0;
    for (let i = 1; i < this.pending.length; i++) {
      const a = this.pending[i];
      const b = this.pending[best];
      const aFirst = a.priority === b.priority ? a.seq < b.seq : a.priority === 'foreground';
      if (aFirst) best = i;
    }
    return this.pending.splice(best, 1)[0];
  }

  private drain(): void {
    if (this.running) return;
    const job = this.next();
    if (!job) return;
    this.running = true;
    job.run().finally(() => {
      this.running = false;
      this.drain();
    });
  }
}
