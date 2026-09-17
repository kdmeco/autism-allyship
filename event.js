// Public single event. Reads the id from the URL and does one Firestore
// read. A missing id, a deleted event and a draft the security rules
// rightly refuse all land on the same plain message rather than a broken
// page, the same shape blog-post.js uses. Every event registers the same way,
// through POST /ticket. Where an event has a price, that price is shown but
// never collected here: the foundation takes it by EFT or in cash at the
// event, so nothing on this page touches money.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  translated,
  downloadIcs,
  buildSavePanel,
  endOfLocalDay,
} from "./shared.js";
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
const registrationIntro = document.getElementById("ticketRegisterIntro");
const ticketPriceTotal = document.getElementById("ticketPriceTotal");
const ticketPayTotalConfirm = document.getElementById("ticketPayTotalConfirm");
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
const registrationEmailConfirmation = document.getElementById(
  "registrationEmailConfirmation",
);
const registrationEmailConfirmationText = document.getElementById(
  "registrationEmailConfirmationText",
);
const confirmRegistrationButton = document.getElementById(
  "confirmRegistrationButton",
);
const changeRegistrationEmailButton = document.getElementById(
  "changeRegistrationEmailButton",
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

const pageParams = new URLSearchParams(window.location.search);
const eventId = pageParams.get("id");
// Hiding the shell and applying the app's theme happens in the shell script in
// the head, early enough that the header never paints. This flag is only for
// the two behaviours below that are specific to this page.
const isAppEmbed = pageParams.get("app") === "1";

function showMissing() {
  article.hidden = true;
  missing.hidden = false;
}

// A Firestore document id never contains a slash, because that is the path
// separator, and doc() throws synchronously for one, before the promise
// chain runs, which would leave the page blank.
function isPlainDocumentId(id) {
  return /^[^/]+$/.test(id);
}

function formatPrice(data) {
  return data.isTicketed ? "R" + data.price : translated("eventsPriceFree");
}

function formatRands(amount) {
  return amount % 1 === 0 ? String(amount) : amount.toFixed(2);
}

function hasTicketPrice(data) {
  return data.isTicketed === true && typeof data.price === "number" && data.price > 0;
}

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

function updatePriceTotal(data, quantity) {
  if (!hasTicketPrice(data)) {
    ticketPriceTotal.hidden = true;
    ticketPayTotalConfirm.hidden = true;
    return;
  }
  const total = data.price * quantity;
  const label = translated("ticketPriceTotal").replace(
    "{amount}",
    formatRands(total),
  );
  ticketPriceTotal.textContent = label;
  ticketPriceTotal.hidden = false;
  ticketPayTotalConfirm.textContent = label;
  ticketPayTotalConfirm.hidden = false;
}

function showRegistrationSuccess(data, startsAt, token, emailSent) {
  const url = new URL(
    "ticket.html?token=" + encodeURIComponent(token),
    window.location.href,
  );

  // Inside the app WebView the native ticket screen takes over once this
  // URL loads, so navigate rather than only showing an inline link.
  if (isAppEmbed) {
    window.location.href = url.href;
    return;
  }

  registrationForm.hidden = true;
  registrationEmailConfirmation.hidden = true;
  ticketLink.href = url.href;
  ticketLink.textContent = url.href;
  ticketConfirmationEmailSent.hidden = !emailSent;

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
      showAppLink: !isAppEmbed,
    }),
  );

  registrationConfirmation.hidden = false;
}

function resetRegistrationControls() {
  registerButton.disabled = false;
  registerButton.textContent = translated("ticketRegisterButton");
  confirmRegistrationButton.disabled = false;
  confirmRegistrationButton.textContent = translated(
    "ticketConfirmEmailButton",
  );
}

async function submitRegistrationRequest(data, startsAt, name, email, quantity) {
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
  // A non JSON reply, an error page from a proxy or an empty body, makes
  // json() throw, and the raw parse error is no use to a visitor. The API's
  // own error message still shows when the reply is JSON.
  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error(translated("ticketRegisterFailed"));
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || translated("ticketRegisterFailed"));
  }

  showRegistrationSuccess(data, startsAt, result.token, result.emailSent);
}

function setUpRegistration(data, startsAt) {
  const isPast = !startsAt || endOfLocalDay(startsAt).getTime() < Date.now();
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
  const paid = hasTicketPrice(data);
  quantityInput.max = String(effectiveMax);

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

  registrationIntro.textContent = paid
    ? translated("ticketRegisterIntroPaid")
    : translated("ticketRegisterIntro");
  registerButton.textContent = translated("ticketRegisterButton");
  confirmRegistrationButton.textContent = translated(
    "ticketConfirmEmailButton",
  );
  updatePriceTotal(data, parseInt(quantityInput.value, 10) || 1);

  quantityInput.addEventListener("input", function () {
    const quantity = parseInt(quantityInput.value, 10);
    if (Number.isInteger(quantity) && quantity >= 1) {
      updatePriceTotal(data, quantity);
    }
  });

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

    updatePriceTotal(data, quantity);
    registrationEmailConfirmationText.textContent = translated(
      "ticketEmailConfirmation",
    ).replace("{email}", email);
    registrationForm.hidden = true;
    registrationEmailConfirmation.hidden = false;
    confirmRegistrationButton.focus();

    confirmRegistrationButton.onclick = async function () {
      await submitRegistration(name, email, quantity);
    };
  });

  changeRegistrationEmailButton.addEventListener("click", function () {
    registrationEmailConfirmation.hidden = true;
    registrationForm.hidden = false;
    emailInput.focus();
  });

  async function submitRegistration(name, email, quantity) {
    registrationEmailConfirmation.hidden = true;
    registerButton.disabled = true;
    confirmRegistrationButton.disabled = true;
    registerButton.textContent = translated("ticketRegistering");
    confirmRegistrationButton.textContent = translated("ticketRegistering");

    try {
      await submitRegistrationRequest(data, startsAt, name, email, quantity);
    } catch (error) {
      console.error("Registration failed:", error);
      showRegistrationError(
        registrationFormError,
        (error && error.message) || translated("ticketRegisterFailed"),
      );
      registrationForm.hidden = false;
      resetRegistrationControls();
    }
  }
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

if (!eventId || !isPlainDocumentId(eventId)) {
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
