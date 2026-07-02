# Meeting Booking System — Design Spec

**Date:** 2026-07-02
**Status:** Approved (pending user review of written spec)

## 1. Purpose

A small, local-first web application for a team of 5–20 people to book online meetings and send calendar invitations by email. It is **not** a physical-room booking system and is **not** a general "meeting management" hub with collaborative notes, action items, or RSVP tracking.

The system is designed to be:
- **Simple to deploy** — one Node.js process, one SQLite file, one `.env`.
- **Simple to operate** — no cloud account, no per-user billing, runs on a LAN server or a Raspberry Pi.
- **Familiar** — uses the standard email + `.ics` calendar-invitation flow that participants already know from Outlook/Google/Apple Calendar.

## 2. In scope (v1)

- Username + password authentication with two roles: `member` and `admin`.
- A week-view calendar showing all meetings in the viewer's time zone.
- Create a meeting: title, description, start/end datetime, list of attendee emails, auto-generated video link.
- Edit and cancel a meeting; both send updated/cancelled `.ics` attachments to all attendees.
- Conflict detection for the **organizer** (not for attendees).
- Admin user management (create, delete, set role).
- Admin views: all meetings, email-send log, error log.
- Email invitations with `.ics` calendar attachments.
- Per-user time zone (UTC internally).
- A `VideoProvider` abstraction with a `FakeProvider` implementation; real Zoom/Google/Teams providers stubbed for the future.

## 3. Out of scope (v1, deliberate YAGNI)

- Physical meeting-room booking.
- Collaborative note-taking, action items, agendas, minutes.
- RSVP / accept-decline tracking.
- Recurring meetings.
- "Find a time" from participant availability.
- Free/busy lookups against attendees' external calendars.
- LDAP / SSO / OAuth login.
- 2FA, password reset flow (admin can set a new password).
- Multi-instance / horizontal scaling.
- HTTPS certificate management (handled by reverse proxy in deployment).
- Browser/UI automated tests (Playwright etc.); load testing; accessibility audit.
- Mobile-first UI (responsive enough for tablets; phone is best-effort).

## 4. Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Browser (UI)   │────▶│  Express server  │
│  HTMX + EJS     │◀────│  (Node.js)       │
└─────────────────┘     └──────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌────────────┐    ┌─────────────┐
        │ SQLite   │    │ Email      │    │ Video       │
        │ (file)   │    │ pipeline   │    │ provider    │
        │          │    │ (Nodemailer│    │ (fake→real) │
        │          │    │  + .ics)   │    │             │
        └──────────┘    └────────────┘    └─────────────┘
```

- **Express server** is the only process. It serves pages, handles form submissions, manages sessions, sends email, and writes to SQLite.
- **SQLite** is a single file on disk (e.g., `./data/app.db`). Easy to back up, no separate database server.
- **Email pipeline** uses Nodemailer with SMTP credentials from `.env`. It generates an `.ics` attachment for each invitation and embeds it in a multipart email.
- **Video provider** is an abstraction with a `FakeProvider` implementation that returns a UUID-based URL. Real Zoom/Meet/Teams providers can be added later by implementing the same interface.

## 5. Data model

```sql
-- Users
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,        -- argon2id
  role          TEXT NOT NULL CHECK (role IN ('member','admin')),
  timezone      TEXT NOT NULL,        -- IANA, e.g. "America/Los_Angeles"
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Meetings
CREATE TABLE meetings (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  organizer_id    INTEGER NOT NULL REFERENCES users(id),
  start_utc       TEXT NOT NULL,      -- ISO 8601 UTC
  end_utc         TEXT NOT NULL,
  timezone        TEXT NOT NULL,      -- organizer's IANA TZID at time of creation
  join_url        TEXT NOT NULL,      -- from VideoProvider
  status          TEXT NOT NULL CHECK (status IN ('scheduled','cancelled')),
  sequence        INTEGER NOT NULL DEFAULT 0,  -- bumped on each edit, used by .ics
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Participants: one row per attendee, including organizer (auto-added)
CREATE TABLE participants (
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  PRIMARY KEY (meeting_id, email)
);

-- Email send log: every send attempt, success or failure
CREATE TABLE email_send_log (
  id           INTEGER PRIMARY KEY,
  meeting_id   INTEGER REFERENCES meetings(id),
  recipient    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('invite','update','cancel')),
  status       TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error        TEXT,
  sent_at      TEXT NOT NULL
);

-- Sessions: stored in a separate SQLite file (./data/sessions.db)
-- (managed by better-sqlite3-session-store)
```

- Participants are stored as emails (not user IDs) so external people can be invited without accounts.
- The organizer is auto-added to `participants` on create.
- `meetings.sequence` is bumped on every edit and embedded in the `.ics` `SEQUENCE` field so calendar apps know the new invitation supersedes the prior one.

## 6. Routes & pages

| Method | Path                          | Purpose                                    | Auth                |
|--------|-------------------------------|--------------------------------------------|---------------------|
| GET    | `/login`                      | Login form                                 | public              |
| POST   | `/login`                      | Authenticate, set session cookie           | public              |
| POST   | `/logout`                     | Destroy session                            | logged in           |
| GET    | `/setup`                      | First-run: create initial admin            | public, only when 0 users exist |
| GET    | `/`                           | Calendar (week view, default landing)      | logged in           |
| GET    | `/calendar?week=YYYY-MM-DD`   | Calendar for a given week (ISO Monday)     | logged in           |
| GET    | `/meetings/new?start=...`     | New meeting form (pre-filled from slot)    | logged in           |
| POST   | `/meetings`                   | Create meeting; enqueue invitations        | logged in           |
| GET    | `/meetings/:id`               | View meeting details                       | logged in           |
| GET    | `/meetings/:id/edit`          | Edit form                                  | booker or admin     |
| POST   | `/meetings/:id`               | Update meeting; enqueue updated invites    | booker or admin     |
| POST   | `/meetings/:id/cancel`        | Cancel meeting; enqueue cancellations      | booker or admin     |
| GET    | `/my-meetings`                | List of meetings I organize                | logged in           |
| GET    | `/profile`                    | Edit own display name / timezone / password | logged in           |
| POST   | `/profile`                    | Save profile changes                       | logged in           |
| GET    | `/admin/users`                | List users                                 | admin               |
| POST   | `/admin/users`                | Create user                                | admin               |
| POST   | `/admin/users/:id/delete`     | Delete user (blocked if user has scheduled meetings) | admin               |
| GET    | `/admin/meetings`             | All meetings (any organizer)               | admin               |
| GET    | `/admin/email-log`            | Email send log                             | admin               |
| GET    | `/healthz`                    | Health check (DB ping)                     | public              |

Forms use POST + redirect (PRG). HTMX is used for inline updates (week navigation, deleting a user from a list, refreshing the email log).

### Pages

- **Login:** username, password, "Sign in" button. Generic error on bad credentials.
- **Calendar (week view):** 7 columns (Mon–Sun), 30-minute rows from `CALENDAR_START_HOUR` to `CALENDAR_END_HOUR`. Meeting blocks sized to duration, clickable. Empty cells link to `/meetings/new?start=…`. Prev/next/today buttons (HTMX).
- **New / edit meeting form:** title, description, start, end, attendees (chip input — type email + enter to add a chip, × to remove). Same template used for new and edit (parameterized by `meeting`). The `join_url` is **not** shown in the form — it is generated server-side at submit time and shown on the meeting-details page after creation.
- **Meeting details:** title, time in viewer's TZ, organizer's TZ noted if different, organizer, attendees, description, "Join meeting" button, edit/cancel buttons (if permitted).
- **My meetings:** upcoming + past meetings I organized, with status badges.
- **Profile:** display name, timezone, change password.
- **Admin → users:** table of users with role, timezone, last login; "Add user" form; per-row delete (HTMX confirm).
- **Admin → meetings:** full table of all meetings, with organizer and status.
- **Admin → email-log:** recent sends with success/failure and error message.
- **First-run setup:** one form to create the initial admin user.

## 7. Email + .ics pipeline

### Per-participant flow on create / update / cancel

1. After the meeting is committed to SQLite, the server iterates over participants.
2. For each participant email, it generates an `.ics` blob and an HTML+text body.
3. The email is sent via Nodemailer SMTP.
4. **Failure policy:** one failed send does not abort the others. Each attempt is recorded in `email_send_log`. The meeting is never rolled back because of email failure.
5. The user sees: "Meeting saved, but N of M invitations could not be sent — see admin" when there were any failures.

### `.ics` contents

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| `UID`         | `meeting-${id}@${APP_HOSTNAME}` (stable across edits)              |
| `SEQUENCE`    | Incremented on each edit (calendar apps use this to supersede)     |
| `METHOD`      | `REQUEST` for create/update, `CANCEL` for cancel                   |
| `DTSTART`     | With `TZID=${meeting.timezone}` (organizer's TZ)                   |
| `DTEND`       | Same                                                                |
| `SUMMARY`     | Meeting title                                                       |
| `DESCRIPTION` | Meeting description                                                 |
| `URL`         | `joinUrl` from the video provider                                  |
| `ORGANIZER`   | Booker's name + email                                              |
| `ATTENDEE`    | One per participant                                                |
| `STATUS`      | `CONFIRMED` or `CANCELLED`                                         |

The `.ics` is sent as an attachment named `invite.ics` (or `cancel.ics`). Calendar apps auto-import and prompt Accept/Decline/Tentative.

### Email body (multipart text/html + text/plain)

- Header: "You're invited to: <title>"
- Body: formatted meeting details (title, time in organizer's TZ with a note about viewer's TZ if different, organizer name, description)
- Big "Join meeting" button linking to `joinUrl`
- Footer: "This invitation was sent by the team meeting system. To remove yourself, contact the organizer."

### We do not parse RSVP replies.

If a participant accepts/declines in their calendar, the system doesn't know. (Out of scope for v1.)

## 8. Video provider abstraction

```ts
// src/video/provider.ts
export interface VideoProvider {
  createMeeting(opts: {
    title: string;
    startUtc: string;
    endUtc: string;
    organizerEmail: string;
  }): Promise<{ joinUrl: string; externalId?: string }>;

  updateMeeting(
    externalId: string,
    opts: { title: string; startUtc: string; endUtc: string }
  ): Promise<void>;

  cancelMeeting(externalId: string): Promise<void>;
}

// src/video/fake.ts
export class FakeProvider implements VideoProvider {
  async createMeeting(opts) {
    const id = randomUUID();
    return { joinUrl: `https://meet.${APP_HOSTNAME}/${id}`, externalId: id };
  }
  // update and cancel are no-ops; the join URL is stable across edits
}
```

- Selected at boot via `VIDEO_PROVIDER=fake|zoom|google`. Only `fake` is implemented in v1; `zoom` and `google` throw "not implemented" with a clear message.
- `meetings.join_url` is populated at create time and stays stable across edits. We do **not** re-call `createMeeting` on edit — we just send updated `.ics` with the same URL. This is the right call because: (a) participants already have the URL, (b) real Zoom/Meet URLs can be edited in place, and (c) it keeps v1 simple.
- A real provider implementation can be added later by implementing the same interface. The create call site is the only place that needs a new branch.

### Failure modes

- Provider throws on `createMeeting` → return 500, **do not** save the meeting (we need the join URL first).
- Provider throws on `updateMeeting`/`cancelMeeting` → DB is updated/cancelled anyway; log error; the email still goes out (URL is stable).

## 9. Auth & authorization

- **Sessions:** `express-session` with a SQLite-backed store (`better-sqlite3-session-store`) so we don't add a Redis dependency.
- **Cookies:** `HttpOnly`, `SameSite=Lax` (so links from external apps can land authenticated), `Secure` when `HTTPS=true`.
- **Passwords:** `argon2id`. Minimum 12 chars, no complexity rules (NIST guidance). No email verification (local-first; admin creates users).
- **CSRF:** `csurf` middleware on all state-changing routes. Tokens rendered into forms as a hidden field, verified on submit.
- **Rate limiting:** `express-rate-limit` on `/login` (10 attempts / 15 min / IP).

### Authorization middleware

```ts
requireAuth       // 401 → /login if no session
requireAdmin      // 403 if session.user.role !== 'admin'
canModifyMeeting  // 403 unless session.user.id === meeting.organizerId
                  //       || session.user.role === 'admin'
```

### Permission matrix

| Action                       | Permission                          |
|------------------------------|-------------------------------------|
| View any meeting             | any logged-in user                  |
| Create meeting               | any logged-in user                  |
| Edit / cancel meeting        | booker **or** admin                 |
| See "all meetings" list      | admin only                          |
| See "my meetings" list       | any logged-in user                  |
| Manage users                 | admin only                          |
| Edit own profile / password  | any logged-in user (self)           |

### Out of scope for auth (v1)

- Password reset flow (admin can set a new password for a user).
- 2FA, account lockout, login throttling beyond the rate limiter.
- Email verification.

### Deleting a user

The admin can delete a user from `/admin/users`. The system **blocks** the delete if the user has any `status='scheduled'` meetings. The admin must first cancel those meetings (or reassign them — reassignment is **not** supported in v1, so cancellation is the path). The block message is: "Cannot delete: user has N scheduled meetings. Cancel them first."

## 10. Error handling

| Category             | Examples                                       | Response                                                                    |
|----------------------|------------------------------------------------|-----------------------------------------------------------------------------|
| **Form validation**  | Missing title, end < start, bad email, no attendees, title > 200 chars | Re-render form with field-level errors and **preserved user input** |
| **Business rules**   | Organizer conflict, editing a cancelled meeting, editing a past meeting | Re-render form with a clear message; offer "book anyway" override for conflicts |
| **Authorization**    | Non-admin hits `/admin/*`, non-organizer edits a meeting | **403 page** with explanation and a link back to calendar |
| **Auth**             | Bad login, expired session                     | Generic "Invalid username or password" / 302 to `/login`                     |
| **Email pipeline**   | SMTP auth fail, per-recipient reject           | Log to `email_send_log`; for the user, show "Meeting saved, but N of M invitations failed — see admin"; do **not** roll back the meeting |
| **Video provider**   | Provider throws on `createMeeting`             | Return 500 with friendly message; **do not** save the meeting               |
| **Video provider**   | Provider throws on update/cancel               | DB is updated/cancelled anyway; log error; the email still goes out         |
| **Database**         | Disk full, constraint violation (duplicate username) | 500 with reference ID, or 400 with friendly message for known cases       |
| **Edge cases**       | Duplicate attendee email, whitespace-only title, invalid IANA TZ, past end time | Normalized (dedupe) or rejected with field-level error |

### Error pages

Standard 400 / 401 / 403 / 404 / 500 pages, all rendered from the same EJS template with a friendly message and a link back to the calendar. 500s include a short reference ID (e.g., `err-2026-07-02T14:32-9f3a`) so admins can grep `logs/error.log`.

### Form validation rules

| Field         | Rule                                                                |
|---------------|---------------------------------------------------------------------|
| `title`       | Required, 1–200 chars, trimmed                                       |
| `description` | Optional, ≤ 5000 chars                                              |
| `start`       | Required, valid ISO local datetime in viewer's TZ                   |
| `end`         | Required, > `start`, ≤ 8 hours after `start`                        |
| `attendees`   | ≥ 1, each must match a simple email regex, deduped, organizer auto-added |
| `timezone`    | Must be in IANA `tz` database (validated via `Intl.supportedValuesOf()`) |

### Conflict detection (organizer only)

On create/update, query: `start_utc < new_end AND end_utc > new_start AND status='scheduled' AND organizer_id = ?`. If a row is found, the form is re-rendered with a warning and a "Book anyway" override. Attendee calendars are not consulted (we have no access to them).

## 11. Testing strategy

**Test runner:** Vitest.

**Layered tests:**

1. **Unit tests** (no I/O, pure logic)
   - Password hash/verify (argon2 round-trip)
   - `.ics` generation — snapshot tests for create, update, cancel
   - Time zone conversion (organizer TZ ↔ UTC ↔ viewer TZ round-trips)
   - Conflict detection SQL (back-to-back, exact match, fully overlapping, cancelled meetings excluded)
   - Form validators

2. **Integration tests** (full request → response, in-memory SQLite)
   - Auth: login success/failure, session persistence, logout
   - Create meeting → DB row correct, `email_send_log` shows N invite rows queued
   - Edit meeting → `sequence` increments, `update` emails logged
   - Cancel meeting → `status='cancelled'`, `cancel` emails logged
   - Permission matrix: member can't access `/admin/*`; non-organizer member gets 403 on edit; admin can edit anyone's meeting
   - Conflict detection form: with conflict → warning + "book anyway"; without → success

3. **Email tests** using a fake SMTP transport
   - Don't hit a real SMTP server — use a transport that captures the message into a JS object.
   - Assert subject, recipients, `.ics` UID, SEQUENCE, METHOD.

4. **Manual / smoke test plan** (a checklist, not automated)
   - Send a real invitation to a Gmail account; verify it imports into Google Calendar.
   - Send to Outlook.com; verify it imports.
   - Open the calendar in two browsers; verify the same data shows.
   - Cancel a meeting; verify the cancellation `.ics` arrives and updates the calendar entry.
   - Cross-timezone test: organizer in PST, invitee in JST — verify both see correct local times.

**What we are not testing in v1:** browser/UI tests, load/performance, accessibility audit.

## 12. Deployment & operations

### Project layout

```
meeting-booking/
├── package.json
├── .env.example
├── .gitignore
├── data/                  # gitignored, contains app.db + sessions.db
├── logs/                  # gitignored, contains error.log
├── migrations/
│   └── 001_init.sql
├── src/
│   ├── server.ts          # Express app entry
│   ├── config.ts          # env loading & validation
│   ├── db.ts              # better-sqlite3 setup + migrations
│   ├── auth.ts            # session, password hashing, middleware
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── setup.ts
│   │   ├── calendar.ts
│   │   ├── meetings.ts
│   │   ├── admin.ts
│   │   ├── profile.ts
│   │   └── health.ts
│   ├── views/             # EJS templates + partials/
│   ├── lib/
│   │   ├── ics.ts
│   │   ├── email.ts
│   │   ├── time.ts
│   │   └── video/
│   │       ├── provider.ts
│   │       └── fake.ts
│   └── middleware/
│       ├── requireAuth.ts
│       ├── requireAdmin.ts
│       └── csrf.ts
└── test/
    ├── unit/
    └── integration/
```

### `.env` (config)

```dotenv
# Core
APP_HOSTNAME=meet.example.com
NODE_ENV=production
PORT=3000
HTTPS=true
SESSION_SECRET=change-me-please

# Database
DATABASE_PATH=./data/app.db
SESSIONS_DATABASE_PATH=./data/sessions.db

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=meetings@example.com
SMTP_PASS=...
SMTP_FROM="Team Meetings <meetings@example.com>"

# Video
VIDEO_PROVIDER=fake

# Calendar UI
CALENDAR_START_HOUR=7
CALENDAR_END_HOUR=21
DEFAULT_TIMEZONE=America/Los_Angeles
```

### Lifecycle commands

```bash
npm install
npm run db:migrate           # idempotent
npm start                    # production
npm run dev                  # nodemon
npm test                     # vitest
npm run create-admin -- --username alice --password '...'    # idempotent: reuses an existing user with the same username (updates password)
```

### First-run experience

If `users` is empty on boot, **every request** (including unauthenticated ones) is redirected to `/setup` — a one-screen form to create the initial admin (username, display name, email, timezone, password). All other routes are inaccessible until the first user exists. Once created, `/setup` is no longer reachable.

### Process management

- **Recommended:** run behind a reverse proxy (nginx, Caddy) for HTTPS termination. The Node process listens on `127.0.0.1:3000`.
- **Simplest:** `node src/server.js` in `tmux`/`screen`, or a small systemd unit.
- **Optional:** a tiny `Dockerfile` (`node:22-alpine`, copy app, run as non-root) with a volume for `./data`.

### Backups

- The entire app state is the `data/` directory. Back it up with whatever tool you use (`rsync`, `restic`, etc.).
- For safe hot backups, use `sqlite3 app.db ".backup /path/to/copy.db"` instead of raw file copy.

### Updates

```bash
git pull
npm install
npm run db:migrate           # idempotent
systemctl restart meeting-booking   # or however it's supervised
```

### Logging

- Structured JSON logs to stdout via `pino`, piped to `logs/error.log` in production.
- Every 5xx logs with a request ID.
- `email_send_log` is the structured record of every email attempt.

### Health check

- `GET /healthz` returns `200 {ok: true, db: 'up'}` if DB is reachable, `503` otherwise. No auth.

### Security hardening (defaults that ship)

- `helmet` middleware for sensible HTTP security headers
- `express-rate-limit` on `/login` (10 attempts / 15 min / IP)
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when `HTTPS=true`
- Passwords: argon2id, 12-char minimum
- `csurf` on all state-changing routes

## 13. Future considerations (not in v1)

- Real Zoom/Google Meet/Teams `VideoProvider` implementations.
- RSVP tracking (parse email replies or use a poll URL in `.ics`).
- Recurring meetings.
- "Find a time" from participant availability (requires per-participant accounts or OAuth).
- Admin audit log.
- 2FA.
- Multi-instance / clustering (would require switching session store and `join_url` generation strategy).
