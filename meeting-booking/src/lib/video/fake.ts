import { randomUUID } from 'node:crypto';
import type { VideoProvider, CreateMeetingArgs, CreateMeetingResult, UpdateMeetingArgs } from './provider.js';

export class FakeProvider implements VideoProvider {
  constructor(private hostname: string) {}

  async createMeeting(_args: CreateMeetingArgs): Promise<CreateMeetingResult> {
    const id = randomUUID();
    return { joinUrl: `https://meet.${this.hostname}/${id}`, externalId: id };
  }

  async updateMeeting(_externalId: string, _args: UpdateMeetingArgs): Promise<void> { /* no-op */ }
  async cancelMeeting(_externalId: string): Promise<void> { /* no-op */ }
}
