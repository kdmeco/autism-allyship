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
const loading = document.getElementById("ticketLoading");
const missing = document.getElementById("ticketMissing");
const errorState = document.getElementById("ticketError");
const retryButton = document.getElementById("ticketRetryButton");

const token = new URLSearchParams(window.location.search).get("token");

function hideStates() {
  loading.hidden = true;
  article.hidden = true;
  missing.hidden = false;
  errorState.hidden = true;
}

function showMissing() {
  hideStates();
}

function showError() {
  loading.hidden = true;
  article.hidden = true;
  missing.hidden = true;
  errorState.hidden = false;
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
  } else {
    eventDateSlot.textContent = "";
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
  } else {
    redeemedNotice.hidden = true;
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
  loading.hidden = true;
  missing.hidden = true;
  errorState.hidden = true;
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

async function loadTicket() {
  loading.hidden = false;
  article.hidden = true;
  missing.hidden = true;
  errorState.hidden = true;

  if (!token) {
    showMissing();
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "tickets", token));
    if (!snapshot.exists()) {
      showMissing();
      return;
    }
    renderTicket(snapshot.data());
  } catch (error) {
    console.error("Failed to load the ticket:", error);
    showError();
  }
}

retryButton.addEventListener("click", loadTicket);

if (!token) {
  showMissing();
} else {
  loadTicket();
}
