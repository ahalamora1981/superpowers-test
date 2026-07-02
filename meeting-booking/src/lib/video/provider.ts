export interface CreateMeetingArgs {
  title: string;
  startUtc: string;
  endUtc: string;
  organizerEmail: string;
}

export interface CreateMeetingResult {
  joinUrl: string;
  externalId?: string;
}

export interface UpdateMeetingArgs {
  title: string;
  startUtc: string;
  endUtc: string;
}

export interface VideoProvider {
  createMeeting(args: CreateMeetingArgs): Promise<CreateMeetingResult>;
  updateMeeting(externalId: string, args: UpdateMeetingArgs): Promise<void>;
  cancelMeeting(externalId: string): Promise<void>;
}
