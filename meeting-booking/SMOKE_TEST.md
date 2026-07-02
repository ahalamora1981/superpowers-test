# Smoke test checklist

Run these steps against a fresh install. Requires `npm install && npm run db:migrate && npm start` and a real SMTP server (e.g., MailHog on localhost:1025).

1. Visit `http://localhost:3000/setup` → fill the form → submit. Confirm you land on `/login` and the user table has one row with role=admin.
2. Log in with that user.
3. Land on `/` (calendar). The week should be empty.
4. Click an empty cell or "New meeting" → fill in title, time, an attendee email → submit.
5. Confirm you land on `/meetings/:id` with a Join button.
6. Check your SMTP catcher: an email should be there with `invite.ics` attached. Open the `.ics` and verify UID, SEQUENCE=0, METHOD=REQUEST, TZID set, join URL.
7. Open the same `.ics` in a real calendar app (Google Calendar import, Outlook.com, Apple Calendar) and confirm it imports cleanly.
8. Edit the meeting (change the time) → confirm a new email arrives with SEQUENCE=1, the same UID, and METHOD=REQUEST.
9. Book a second meeting at a time that conflicts with the first. Confirm you see a conflict warning. Click "Book anyway" → confirm it goes through.
10. Cancel the meeting. Confirm a cancellation email arrives with METHOD=CANCEL and STATUS:CANCELLED.
11. Visit `/admin/users` → add a new member user → log out → log in as the new user.
12. As a member, try to visit `/admin/users` → confirm 403.
13. As a member, try to edit the meeting from step 8 → confirm 403.
14. As admin, visit `/admin/meetings` and `/admin/email-log` → confirm both show data.
15. Cross-timezone test: set two users' time zones to `America/Los_Angeles` and `Asia/Tokyo`. Have one book a meeting, the other view it. Confirm each sees the time in their own TZ.
16. Disconnect the SMTP server. Create a meeting. Confirm the meeting is still saved and the user sees a "N of M invitations failed" warning on the details page. Confirm the failure shows in `/admin/email-log`.
17. Visit `/healthz` (no auth) → confirm 200 with `{ok: true, db: 'up'}`.
18. Run `npm test` from a fresh checkout. Confirm all tests pass.

## Known v1 constraints (from spec §3)

- Physical meeting-room booking is out of scope.
- Recurring meetings are out of scope.
- "Find a time" from participant availability is out of scope.
- RSVP tracking is out of scope.
- Real Zoom/Meet/Teams video providers are stubbed (FakeProvider returns a fake URL).
- Browser/UI automated tests are not implemented.
