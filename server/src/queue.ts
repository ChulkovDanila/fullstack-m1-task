type Entry<TPayload, TResult> = {
  key: string;
  payload: TPayload;
  resolves: Array<(value: TResult) => void>;
  rejects: Array<(reason?: unknown) => void>;
};

export class BatchQueue<TPayload, TResult> {
  private pending = new Map<string, Entry<TPayload, TResult>>();
  private timer: NodeJS.Timeout;
  private handler: (entries: Array<Entry<TPayload, TResult>>) => Promise<Map<string, TResult>>;
  private keyResolver: (payload: TPayload) => string;

  constructor(
    intervalMs: number,
    keyResolver: (payload: TPayload) => string,
    handler: (entries: Array<Entry<TPayload, TResult>>) => Promise<Map<string, TResult>>
  ) {
    this.keyResolver = keyResolver;
    this.handler = handler;
    this.timer = setInterval(() => {
      void this.flush();
    }, intervalMs);
  }

  enqueue(payload: TPayload): Promise<TResult> {
    const key = this.keyResolver(payload);
    return new Promise<TResult>((resolve, reject) => {
      const existing = this.pending.get(key);
      if (existing) {
        existing.payload = payload;
        existing.resolves.push(resolve);
        existing.rejects.push(reject);
        return;
      }
      this.pending.set(key, {
        key,
        payload,
        resolves: [resolve],
        rejects: [reject],
      });
    });
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private async flush(): Promise<void> {
    if (this.pending.size === 0) {
      return;
    }
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    try {
      const resultMap = await this.handler(entries);
      for (const entry of entries) {
        const result = resultMap.get(entry.key);
        for (const resolve of entry.resolves) {
          resolve(result as TResult);
        }
      }
    } catch (error) {
      for (const entry of entries) {
        for (const reject of entry.rejects) {
          reject(error);
        }
      }
    }
  }
}
