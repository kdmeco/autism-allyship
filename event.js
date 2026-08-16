// Public single event. Reads the id from the URL and does one Firestore
// read. A missing id, a deleted event and a draft the security rules
// rightly refuse all land on the same plain message rather than a broken
// page, the same shape blog-post.js uses.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const article = document.getElementById("eventArticle");
const titleSlot = document.getElementById("eventTitle");
const metaSlot = document.getElementById("eventMeta");
const capacitySlot = document.getElementById("eventCapacity");
const bodySlot = document.getElementById("eventBody");
const attachmentsSection = document.getElementById("eventAttachmentsSection");
const attachmentsList = document.getElementById("eventAttachmentsList");
const missing = document.getElementById("eventMissing");
const shareButton = document.getElementById("shareButton");
const whatsappShare = document.getElementById("whatsappShare");
const copyLinkButton = document.getElementById("copyLinkButton");
const copyConfirmation = document.getElementById("copyConfirmation");

const eventId = new URLSearchParams(window.location.search).get("id");

// Strings built in JavaScript miss applyLanguage, so they are looked up here
// for the language already resolved by main.js.
function translated(key) {
  const language = document.documentElement.getAttribute("lang") || "en";
  const dictionary = translations[language] || translations.en;
  return dictionary[key] || translations.en[key];
}

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
