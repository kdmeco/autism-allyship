// Helper functions shared across the public pages. Imported as an ES module
// by each page script at the end of the body, after the classic translations.js
// and main.js deferred scripts have already run.

// The stored path points at the full image. The 400px thumbnail sits beside it
// with a -thumb suffix before the file extension.
export function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
}

// Strings built in JavaScript miss applyLanguage, so they are looked up here
// for the language already resolved by main.js.
export function translated(key) {
  const language = document.documentElement.getAttribute("lang") || "en";
  const dictionary = translations[language] || translations.en;
  return dictionary[key] || translations.en[key];
}

// RFC 5545 wants CRLF, escaped text and UTC stamps. No DTEND: neither an
// event nor a ticket stores an end time, and inventing one would put a made
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

// Shared between the event page and the ticket page, so a calendar entry
// looks the same wherever it was downloaded from. The ticket page has no
// description to offer, which buildIcsContent treats the same as an event
// nobody bothered to describe: the DESCRIPTION line is simply empty.
export function buildIcsContent({ uid, title, description, startsAt }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Autism Allyship Foundation//Events//EN",
    "BEGIN:VEVENT",
    "UID:" + uid + "@autismallyship.org",
    "DTSTAMP:" + icsStamp(new Date()),
    "DTSTART:" + icsStamp(startsAt),
    "SUMMARY:" + icsEscape(title || "Untitled"),
    "DESCRIPTION:" + icsEscape(description || ""),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function downloadIcs(eventData, filename) {
  const content = buildIcsContent(eventData);
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

// The save-your-ticket panel. Shared between the registration confirmation
// on event.html and ticket.html itself, since both are moments where the
// visitor has a ticket link on screen and nowhere else it is guaranteed to
// exist yet: there is no login, so this link and the emailed copy are the
// whole story.
//
// It does not use beforeunload to block leaving. That dialog cannot be
// reworded, fires on an ordinary refresh as readily as on someone actually
// leaving, and a sudden system interruption is exactly what the sensory
// rules elsewhere on this site exist to avoid. The insistence here comes
// from layout and copy instead: the panel stays visually prominent, and
// every action stays available for as long as the visitor is on the page.
// It deliberately never collapses or marks itself done, even after a save
// action runs: a misclick on the wrong option must not read as "handled"
// and take the others off the table.
export function buildSavePanel({ ticketUrl, eventTitle, icsData }) {
  const panel = document.createElement("div");
  panel.className = "save-ticket-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", translated("saveTicketHeading"));

  const heading = document.createElement("h3");
  heading.textContent = translated("saveTicketHeading");
  panel.appendChild(heading);

  const intro = document.createElement("p");
  intro.textContent = translated("saveTicketIntro");
  panel.appendChild(intro);

  const actions = document.createElement("div");
  actions.className = "save-ticket-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary";
  copyButton.textContent = translated("saveTicketCopyLink");
  const copyConfirmation = document.createElement("span");
  copyConfirmation.className = "share-copied";
  copyConfirmation.setAttribute("role", "status");
  copyConfirmation.hidden = true;
  copyConfirmation.textContent = translated("saveTicketLinkCopied");
  copyButton.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(ticketUrl);
      copyConfirmation.hidden = false;
      setTimeout(function () {
        copyConfirmation.hidden = true;
      }, 4000);
    } catch (error) {
      console.error("Could not copy the ticket link:", error);
    }
  });

  const whatsappLink = document.createElement("a");
  whatsappLink.className = "button button-secondary";
  whatsappLink.href = "https://wa.me/?text=" + encodeURIComponent(ticketUrl);
  whatsappLink.target = "_blank";
  whatsappLink.rel = "noopener";
  whatsappLink.textContent = translated("saveTicketWhatsApp");

  const subject = translated("saveTicketEmailSubject").replace(
    "{event}",
    eventTitle || "",
  );
  const mailtoHref =
    "mailto:?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(ticketUrl);

  // navigator.share opens the OS share sheet, which lists every app
  // registered to handle a shared link, Gmail included where it is
  // installed, rather than forcing whatever the OS picked as the default
  // mail handler. mailto is the fallback where no share sheet exists,
  // mainly desktop browsers.
  const emailButton = document.createElement("button");
  emailButton.type = "button";
  emailButton.className = "button button-secondary";
  emailButton.textContent = translated("saveTicketEmailSelf");
  emailButton.addEventListener("click", async function () {
    if (navigator.share) {
      try {
        await navigator.share({ title: subject, text: ticketUrl, url: ticketUrl });
      } catch (error) {
        // Closing the share sheet is not an error worth showing, matching
        // the pattern the event page's own share button already uses.
      }
      return;
    }
    window.location.href = mailtoHref;
  });

  const calendarButton = document.createElement("button");
  calendarButton.type = "button";
  calendarButton.className = "button button-secondary";
  calendarButton.textContent = translated("saveTicketAddToCalendar");
  calendarButton.addEventListener("click", function () {
    // Matches the event page's own add-to-calendar button: no startsAt
    // means nothing to build a calendar entry from, so this does nothing
    // rather than inventing a time and shipping a wrong one.
    if (!icsData || !icsData.startsAt) {
      return;
    }
    downloadIcs(icsData, "ticket.ics");
  });

  // Inert until the app is on the Play Store: Section 10 of the notes
  // tracks wiring the real link. Do not fake a store URL in the meantime.
  const appLink = document.createElement("a");
  appLink.className = "button button-secondary";
  appLink.href = "#";
  appLink.textContent = translated("saveTicketGetApp");

  actions.append(
    copyButton,
    copyConfirmation,
    whatsappLink,
    emailButton,
    calendarButton,
    appLink,
  );
  panel.appendChild(actions);

  return panel;
}

export function chevronSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "chevron");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 6l5 5 5-5");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}
