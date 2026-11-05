import { Clock } from '@/shared/application/ports/clock';

export class FakeClock extends Clock {
  constructor(private current = new Date('2026-01-01T00:00:00.000Z')) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
