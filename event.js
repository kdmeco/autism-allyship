// Public single event. Reads the id from the URL and does one Firestore
// read. A missing id, a deleted event and a draft the security rules
// rightly refuse all land on the same plain message rather than a broken
// page, the same shape blog-post.js uses.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated, downloadIcs, buildSavePanel } from "./shared.js";
import { API_TICKET_URL } from "./api.js";

const article = document.getElementById("eventArticle");
const titleSlot = document.getElementById("eventTitle");
const metaSlot = document.getElementById("eventMeta");
const capacitySlot = document.getElementById("eventCapacity");
const bodySlot = document.getElementById("eventBody");
const attachmentsSection = document.getElementById("eventAttachmentsSection");
const attachmentsList = document.getElementById("eventAttachmentsList");
const addToCalendarButton = document.getElementById("addToCalendarButton");
const missing = document.getElementById("eventMissing");
const shareButton = document.getElementById("shareButton");
const whatsappShare = document.getElementById("whatsappShare");
const copyLinkButton = document.getElementById("copyLinkButton");
const copyConfirmation = document.getElementById("copyConfirmation");

const registrationSection = document.getElementById("ticketRegistration");
const registrationForm = document.getElementById("registrationForm");
const nameInput = document.getElementById("attendeeName");
const nameError = document.getElementById("attendeeNameError");
const emailInput = document.getElementById("attendeeEmail");
const emailError = document.getElementById("attendeeEmailError");
const quantityInput = document.getElementById("attendeeQuantity");
const quantityError = document.getElementById("attendeeQuantityError");
const quantityNote = document.getElementById("quantityNote");
const registerButton = document.getElementById("registerButton");
const registrationFormError = document.getElementById(
  "registrationFormError",
);
const registrationConfirmation = document.getElementById(
  "registrationConfirmation",
);
const ticketLink = document.getElementById("ticketLink");
const ticketConfirmationEmailSent = document.getElementById(
  "ticketConfirmationEmailSent",
);
const soldOutNotice = document.getElementById("ticketSoldOutNotice");
const pastNotice = document.getElementById("ticketPastNotice");

// Mirrors the Worker's own cap. A family arrives together, so this stops
// looking like a family well before it stops looking like a script; the
// Worker enforces the real limit regardless of what this page allows typing.
const MAX_GROUP_SIZE = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const eventId = new URLSearchParams(window.location.search).get("id");

function showMissing() {
  article.hidden = true;
  missing.hidden = false;
}

function formatPrice(data) {
  return data.isTicketed ? "R" + data.price : translated("eventsPriceFree");
}

// Capacity is always shown as text plus a border, never colour alone,
// because sensory mode strips shadows and motion with !important and a
// state shown only by colour fails anyone who cannot see it.
function renderCapacity(data) {
  const capacity = typeof data.capacity === "number" ? data.capacity : 0;
  const ticketsSold =
    typeof data.ticketsSold === "number" ? data.ticketsSold : 0;

  if (capacity === 0) {
    capacitySlot.textContent = translated("eventsCapacityUnlimited");
  } else if (ticketsSold >= capacity) {
    capacitySlot.textContent = translated("eventsSoldOut");
    capacitySlot.classList.add("event-capacity-sold-out");
  } else {
    const remaining = capacity - ticketsSold;
    capacitySlot.textContent =
      remaining === 1
        ? translated("eventsSpotsLeftSingular")
        : translated("eventsSpotsLeftPlural").replace(
            "{count}",
            String(remaining),
          );
  }

  capacitySlot.hidden = false;
}

// Decides which of three states the registration area is in: the form, a
// sold-out notice, or a past-event notice. Ticketed events get none of
// these; the paid path is Section 7's Paystack work, and until it exists
// this page says nothing at all about buying a ticket, rather than
// half-offering a flow that does not work yet.
function setUpRegistration(data, startsAt) {
  if (data.isTicketed) {
    return;
  }

  const isPast = !startsAt || startsAt.getTime() <= Date.now();
  if (isPast) {
    pastNotice.hidden = false;
    return;
  }

  const capacity = typeof data.capacity === "number" ? data.capacity : 0;
  const ticketsSold =
    typeof data.ticketsSold === "number" ? data.ticketsSold : 0;

  if (capacity !== 0 && ticketsSold >= capacity) {
    soldOutNotice.hidden = false;
    return;
  }

  const remaining = capacity === 0 ? MAX_GROUP_SIZE : capacity - ticketsSold;
  const effectiveMax = Math.min(MAX_GROUP_SIZE, remaining);
  quantityInput.max = String(effectiveMax);

  // Only worth a note when the event's own capacity is the thing doing the
  // capping. Below the group max for its own sake needs no explanation.
  if (capacity !== 0 && remaining < MAX_GROUP_SIZE) {
    quantityNote.textContent =
      effectiveMax === 1
        ? translated("ticketQuantityCapNoteSingular")
        : translated("ticketQuantityCapNotePlural").replaceAll(
            "{count}",
            String(effectiveMax),
          );
    quantityNote.hidden = false;
  }

  registrationSection.hidden = false;

  registrationForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearRegistrationErrors();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const quantity = parseInt(quantityInput.value, 10);

    let valid = true;
    if (!name) {
      showRegistrationError(nameError, translated("ticketNameError"));
      valid = false;
    }
    if (!email || !EMAIL_PATTERN.test(email)) {
      showRegistrationError(emailError, translated("ticketEmailError"));
      valid = false;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      showRegistrationError(quantityError, translated("ticketQuantityError"));
      valid = false;
    } else if (quantity > effectiveMax) {
      showRegistrationError(
        quantityError,
        effectiveMax === 1
          ? translated("ticketQuantityCapNoteSingular")
          : translated("ticketQuantityCapNotePlural").replaceAll(
              "{count}",
              String(effectiveMax),
            ),
      );
      valid = false;
    }
    if (!valid) {
      return;
    }

    registerButton.disabled = true;
    registerButton.textContent = translated("ticketRegistering");

    try {
      const response = await fetch(API_TICKET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventId,
          attendeeName: name,
          attendeeEmail: email,
          quantity: quantity,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        showRegistrationError(
          registrationFormError,
          result.error || translated("ticketRegisterFailed"),
        );
        registerButton.disabled = false;
        registerButton.textContent = translated("ticketRegisterButton");
        return;
      }

      registrationForm.hidden = true;
      const url = new URL(
        "ticket.html?token=" + encodeURIComponent(result.token),
        window.location.href,
      );
      ticketLink.href = url.href;
      // The link's visible text is the address itself, not a generic
      // "click here", so it can be read out, copied or texted on even if a
      // screen reader announces only the link text. This is also the
      // fallback if the save panel below it fails for any reason: plain
      // text and a real href, nothing that depends on JavaScript running
      // twice.
      ticketLink.textContent = url.href;

      // Only claim the email went out when the Worker actually confirms it.
      // Brevo can be unreachable, misconfigured or simply not set up yet,
      // and the visible link above is correct either way.
      ticketConfirmationEmailSent.hidden = !result.emailSent;

      registrationConfirmation
        .querySelectorAll(".save-ticket-panel")
        .forEach(function (existing) {
          existing.remove();
        });
      registrationConfirmation.appendChild(
        buildSavePanel({
          ticketUrl: url.href,
          eventTitle: data.title,
          icsData: {
            uid: eventId,
            title: data.title,
            description: data.description,
            startsAt: startsAt,
          },
        }),
      );

      registrationConfirmation.hidden = false;
    } catch (error) {
      console.error("Registration failed:", error);
      showRegistrationError(
        registrationFormError,
        translated("ticketRegisterFailed"),
      );
      registerButton.disabled = false;
      registerButton.textContent = translated("ticketRegisterButton");
    }
  });
}

function showRegistrationError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearRegistrationErrors() {
  nameError.hidden = true;
  emailError.hidden = true;
  quantityError.hidden = true;
  registrationFormError.hidden = true;
}

function renderAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return;
  }

  attachments.forEach(function (attachment) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = attachment.url;
    link.textContent = attachment.name || attachment.url;
    link.target = "_blank";
    link.rel = "noopener";
    item.appendChild(link);
    attachmentsList.appendChild(item);
  });

  attachmentsSection.hidden = false;
}

function renderEvent(data) {
  titleSlot.textContent = data.title || "Untitled";
  document.title = (data.title || "Event") + " | Autism Allyship Foundation";

  const startsAt = data.startsAt ? data.startsAt.toDate() : null;
  const metaParts = [];
  if (startsAt) {
    metaParts.push(
      startsAt.toLocaleDateString("en-ZA") +
        " " +
        startsAt.toLocaleTimeString("en-ZA", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
  }
  metaParts.push(formatPrice(data));
  metaSlot.textContent = metaParts.join(" · ");

  // startsAt is required by the admin form, so this only matters for a
  // record edited by hand into an invalid state. The button stays visible
  // either way, it just does nothing without a date to build from.
  addToCalendarButton.addEventListener("click", function () {
    if (!startsAt) {
      return;
    }
    downloadIcs(
      {
        uid: eventId,
        title: data.title,
        description: data.description,
        startsAt: startsAt,
      },
      "event.ics",
    );
  });

  if (data.imageUrl) {
    // Built here rather than shipped empty in the page, because an img with
    // no src is invalid HTML.
    const image = document.createElement("img");
    image.className = "event-image";
    image.src = data.imageUrl;
    image.alt = data.imageAlt || "";
    image.width = 1600;
    image.height = 1067;
    article.insertBefore(image, capacitySlot);
  }

  renderCapacity(data);
  setUpRegistration(data, startsAt);

  // Each line break in the textarea becomes its own paragraph, and the text
  // goes in through textContent so nothing in an event can run as markup.
  (data.description || "")
    .split(/\n+/)
    .map(function (chunk) {
      return chunk.trim();
    })
    .filter(Boolean)
    .forEach(function (chunk) {
      const paragraph = document.createElement("p");
      paragraph.textContent = chunk;
      bodySlot.appendChild(paragraph);
    });

  renderAttachments(data.attachments);

  article.hidden = false;
  setUpShareButtons(data.title || "");
}

function setUpShareButtons(title) {
  const shareData = { title: title, text: title, url: window.location.href };

  // The system share sheet only exists on some browsers, so the button is
  // hidden in the markup and unhidden here.
  if (navigator.share) {
    shareButton.hidden = false;
    shareButton.addEventListener("click", function () {
      navigator.share(shareData).catch(function () {
        // Somebody closing the share sheet is not an error worth showing.
      });
    });
  }

  whatsappShare.href =
    "https://wa.me/?text=" +
    encodeURIComponent(title + " " + window.location.href);

  copyLinkButton.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyConfirmation.hidden = false;
      setTimeout(function () {
        copyConfirmation.hidden = true;
      }, 4000);
    } catch (error) {
      console.error("Could not copy the link:", error);
    }
  });
}

if (!eventId) {
  showMissing();
} else {
  getDoc(doc(db, "events", eventId))
    .then(function (snapshot) {
      if (!snapshot.exists()) {
        showMissing();
        return;
      }
      renderEvent(snapshot.data());
    })
    .catch(function (error) {
      console.error("Failed to load the event:", error);
      showMissing();
    });
}
