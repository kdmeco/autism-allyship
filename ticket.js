// Public ticket page. The token in the URL is both the Firestore document ID
// and the secret: SCHEMA.md's rules allow reading a ticket by ID but never
// listing the collection, so a direct get() is exactly what this page needs
// and nothing more is possible from the browser. A missing token, an
// unknown one and a malformed one all land on the same plain message, the
// same shape event.js and blog-post.js use for their own missing states.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated, buildSavePanel } from "./shared.js";

const article = document.getElementById("ticketArticle");
const eventTitleSlot = document.getElementById("ticketEventTitle");
const eventDateSlot = document.getElementById("ticketEventDate");
const bookedBySlot = document.getElementById("ticketBookedBy");
const redeemedNotice = document.getElementById("ticketRedeemedNotice");
const qrWrapper = document.getElementById("ticketQrWrapper");
const qrCanvas = document.getElementById("ticketQrCanvas");
const missing = document.getElementById("ticketMissing");

const token = new URLSearchParams(window.location.search).get("token");

function showMissing() {
  article.hidden = true;
  missing.hidden = false;
}

function renderTicket(data) {
  eventTitleSlot.textContent = data.eventTitle || "";
  document.title =
    (data.eventTitle || "Ticket") + " | Autism Allyship Foundation";

  if (data.eventStartsAt) {
    const startsAt = data.eventStartsAt.toDate();
    eventDateSlot.textContent =
      startsAt.toLocaleDateString("en-ZA") +
      " " +
      startsAt.toLocaleTimeString("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
      });
  }

  const quantity = typeof data.quantity === "number" ? data.quantity : 1;
  // Never "this ticket belongs to": a booking is transferable at no cost,
  // so the wording only ever says who booked it, per SCHEMA.md.
  bookedBySlot.textContent = (
    quantity === 1
      ? translated("ticketBookedBySingular")
      : translated("ticketBookedByPlural").replace("{count}", String(quantity))
  ).replace("{name}", data.attendeeName || "");

  if (data.redeemed === true) {
    const redeemedAt = data.redeemedAt ? data.redeemedAt.toDate() : null;
    redeemedNotice.textContent = redeemedAt
      ? translated("ticketRedeemedAt").replace(
          "{time}",
          redeemedAt.toLocaleDateString("en-ZA") +
            " " +
            redeemedAt.toLocaleTimeString("en-ZA", {
              hour: "2-digit",
              minute: "2-digit",
            }),
        )
      : translated("ticketRedeemed");
    redeemedNotice.hidden = false;
  }

  // The full page URL, not the bare token: a phone camera has to see a
  // link it can open, not a string it offers to search for.
  const ticketUrl = window.location.href;
  renderQr(ticketUrl);

  // Offered here too, not only right after registering: a visitor can
  // land on this exact page from a forwarded link or an old email with
  // nothing saved anywhere yet.
  article.appendChild(
    buildSavePanel({
      ticketUrl: ticketUrl,
      eventTitle: data.eventTitle,
      icsData: {
        uid: data.eventId,
        title: data.eventTitle,
        // The ticket document carries no event description, unlike the
        // confirmation on event.html, which has the full event to hand.
        description: "",
        startsAt: data.eventStartsAt ? data.eventStartsAt.toDate() : null,
      },
    }),
  );

  article.hidden = false;
}

// Rendered to a canvas rather than an img: canvas is not one of the
// elements simplified text mode hides, so the code that has to scan at the
// door keeps working even for a visitor who has turned images off.
// Colours are fixed black-on-white rather than following the page theme,
// because a QR on a dark background will not scan.
function renderQr(text) {
  if (!window.QRCode) {
    qrWrapper.hidden = true;
    return;
  }
  window.QRCode.toCanvas(
    qrCanvas,
    text,
    {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 240,
      color: { dark: "#000000", light: "#ffffff" },
    },
    function (error) {
      if (error) {
        console.error("Could not render the ticket QR code:", error);
        qrWrapper.hidden = true;
      }
    },
  );
}

if (!token) {
  showMissing();
} else {
  getDoc(doc(db, "tickets", token))
    .then(function (snapshot) {
      if (!snapshot.exists()) {
        showMissing();
        return;
      }
      renderTicket(snapshot.data());
    })
    .catch(function (error) {
      console.error("Failed to load the ticket:", error);
      showMissing();
    });
}
