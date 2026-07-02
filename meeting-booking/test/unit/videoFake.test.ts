import { describe, it, expect } from 'vitest';
import { FakeProvider } from '../../src/lib/video/fake.js';
import { getVideoProvider } from '../../src/lib/video/index.js';

describe('FakeProvider', () => {
  it('createMeeting returns a https://meet.${hostname}/${uuid} URL', async () => {
    const p = new FakeProvider('example.com');
    const r = await p.createMeeting({ title: 't', startUtc: 'x', endUtc: 'y', organizerEmail: 'o@x.com' });
    expect(r.joinUrl).toMatch(/^https:\/\/meet\.example\.com\/[0-9a-f-]{36}$/);
    expect(r.externalId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('updateMeeting and cancelMeeting do not throw', async () => {
    const p = new FakeProvider('meet.example.com');
    await p.updateMeeting('abc', { title: 't', startUtc: 'x', endUtc: 'y' });
    await p.cancelMeeting('abc');
  });
});

describe('getVideoProvider', () => {
  it('returns FakeProvider for "fake"', () => {
    const p = getVideoProvider({ kind: 'fake', hostname: 'meet.example.com' });
    expect(p).toBeInstanceOf(FakeProvider);
  });

  it('throws for "zoom" in v1', () => {
    expect(() => getVideoProvider({ kind: 'zoom', hostname: 'x' })).toThrow(/not implemented/i);
  });
});
