// Endpoint for the public autism-allyship-api Worker: free-event ticket
// registration today, and the intended home for Paystack and Brevo
// endpoints once Sections 7 and 8 are built. Kept separate from
// admin/upload.js because that one is imported only by admin pages talking
// to a different Worker, and this one is needed by the public event page.
export const API_TICKET_URL =
  "https://autism-allyship-api.kdmeco-dev.workers.dev/ticket";
