// Public single event. Reads the id from the URL and does one Firestore
// read. A missing id, a deleted event and a draft the security rules
// rightly refuse all land on the same plain message rather than a broken
// page, the same shape blog-post.js uses.

import { db } from "./firebase.js";
import {
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { translated } from "./shared.js";

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

// RFC 5545 wants CRLF, escaped text and UTC stamps. No DTEND: SCHEMA.md has
// startsAt and deliberately no end time, and inventing one would put a made
// up duration in somebody's calendar.
function icsEscape(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Anything past 75 octets continues on the next line with one leading space.
function foldLine(line) {
  if (line.length <= 75) {
    return line;
  }
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

function buildIcsContent(data, startsAt) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Autism Allyship Foundation//Events//EN",
    "BEGIN:VEVENT",
    "UID:" + eventId + "@autismallyship.org",
    "DTSTAMP:" + icsStamp(new Date()),
    "DTSTART:" + icsStamp(startsAt),
    "SUMMARY:" + icsEscape(data.title || "Untitled"),
    "DESCRIPTION:" + icsEscape(data.description || ""),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function downloadIcs(data, startsAt) {
  const content = buildIcsContent(data, startsAt);
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "event.ics";
  link.click();

  URL.revokeObjectURL(url);
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
    downloadIcs(data, startsAt);
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
