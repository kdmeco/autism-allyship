// Endpoints for the autism-allyship-api Worker. Kept separate from
// admin/upload.js because that one talks to a different Worker entirely,
// the one that commits images through the GitHub API.
//
// /ticket is called anonymously by the public event page. /contact-notify is
// called anonymously after the contact form writes to Firestore, and again by
// donate.js when a donor tells the foundation an EFT is on its way. The three
// attendee endpoints below are admin-only, called from admin/event-attendees.js
// with a Firebase ID token, but they still live here rather than in
// admin/upload.js because they are the same Worker as /ticket, just gated
// differently.
const API_BASE = "https://autism-allyship-api.kdmeco-dev.workers.dev";
export const API_TICKET_URL = API_BASE + "/ticket";
export const API_CONTACT_NOTIFY_URL = API_BASE + "/contact-notify";
export const API_RESEND_URL = API_BASE + "/attendees/resend";
export const API_EDIT_EMAIL_URL = API_BASE + "/attendees/edit-email";
export const API_MARK_USED_URL = API_BASE + "/attendees/mark-used";
