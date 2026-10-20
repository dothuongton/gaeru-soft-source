export type AudioAlertIdentity = {id: string; tableId: string; tableName: string};
export type AudioAttempt = {token: number; alertId: string; locationKey: string};

/** Tracks actual speech starts, not calls that an autoplay policy may reject. */
export class AudioAnnouncementLedger {
  private serial = 0;
  private current: AudioAttempt | null = null;
  private started = new Set<string>();

  hasStarted(alertId: string): boolean {return this.started.has(alertId);}

  canBegin(alert: AudioAlertIdentity): boolean {
    return !this.started.has(alert.id) && this.current?.locationKey !== this.key(alert);
  }

  begin(alert: AudioAlertIdentity): AudioAttempt | null {
    if (!this.canBegin(alert)) return null;
    this.current = {token: ++this.serial, alertId: alert.id, locationKey: this.key(alert)};
    return this.current;
  }

  markStarted(attempt: AudioAttempt): boolean {
    if (this.current?.token !== attempt.token) return false;
    this.started.add(attempt.alertId);
    return true;
  }

  finish(attempt: AudioAttempt): boolean {
    if (this.current?.token !== attempt.token) return false;
    this.current = null;
    return true;
  }

  cancel(): void {this.current = null;}

  private key(alert: AudioAlertIdentity): string {
    return JSON.stringify([alert.id, alert.tableId, alert.tableName]);
  }
}

/** Audio completion owns this FIFO; popup expiry never removes its entries. */
export class AudioAnnouncementQueue<T extends AudioAlertIdentity> {
  private items: T[] = [];

  first(): T | null {return this.items[0] ?? null;}
  snapshot(): T[] {return [...this.items];}

  reconcile(pending: readonly T[]): void {
    const unique = new Map<string, T>();
    for (const alert of pending) unique.set(alert.id, alert);
    this.items = [...unique.values()];
  }

  complete(alertId: string): void {
    // A late completion for a pruned/moved alert cannot consume the next table.
    if (this.items[0]?.id === alertId) this.items.shift();
  }
}
