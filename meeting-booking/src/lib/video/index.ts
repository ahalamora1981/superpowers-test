import { FakeProvider } from './fake.js';
import type { VideoProvider } from './provider.js';

export function getVideoProvider(opts: { kind: 'fake' | 'zoom' | 'google'; hostname: string }): VideoProvider {
  switch (opts.kind) {
    case 'fake': return new FakeProvider(opts.hostname);
    case 'zoom':
    case 'google':
      throw new Error(`VIDEO_PROVIDER=${opts.kind} is not implemented in v1`);
  }
}

export type { VideoProvider, CreateMeetingArgs, CreateMeetingResult, UpdateMeetingArgs } from './provider.js';
