// Public events list. Fetches every published event once with no orderBy,
// then splits it into upcoming and past in the browser, soonest first and
// most recent first. This is deliberate: the SCHEMA.md queries would need a
// composite index each, and a client-side split needs none and keeps the
// filter pills instant. The foundation runs about one flagship event a year
// plus occasional gatherings, so the whole set is small enough to hold.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { thumbPath, translated, endOfLocalDay } from "./shared.js";

const toolbar = document.getElementById("eventsToolbar");

// Revealed here rather than after the fetch. The markup ships it hidden so it
// never appears without JavaScript to drive it, but unhiding it only once the
// events arrive meant a roughly 400px toolbar dropping into the page after
// first paint and pushing everything below it down. That single reveal was the
// whole of this page's 0.182 layout shift. This module is deferred, so doing
// it here still runs before the first paint and the page never moves.
if (toolbar) {
  toolbar.hidden = false;
}
const upcomingSection = document.getElementById("upcomingSection");
const upcomingList = document.getElementById("eventsUpcomingList");
const upcomingEmpty = document.getElementById("eventsUpcomingEmpty");
const pastSection = document.getElementById("pastSection");
const pastList = document.getElementById("eventsPastList");
const pastEmpty = document.getElementById("eventsPastEmpty");
const timeButtons = document.querySelectorAll("[data-time-filter]");
const priceButtons = document.querySelectorAll("[data-price-filter]");
const countLine = document.getElementById("eventsCount");
const filteredEmpty = document.getElementById("eventsFilteredEmpty");
const clearRow = document.getElementById("eventsClearRow");
const clearLink = document.getElementById("eventsClearLink");

let activeTimeFilter = "";
let activePriceFilter = "";
let totalEvents = 0;
let allEvents = [];

function formatPrice(eventItem) {
  return eventItem.isTicketed
    ? "R" + eventItem.price
    : translated("eventsPriceFree");
}

// capacity of 0 means unlimited, never sold out, no matter how many tickets
// have gone.
function isSoldOut(eventItem) {
  return (
    eventItem.capacity > 0 && eventItem.ticketsSold >= eventItem.capacity
  );
}

function buildCard(eventItem) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.price = eventItem.isTicketed ? "ticketed" : "free";

  if (eventItem.imageUrl) {
    const image = document.createElement("img");
    image.className = "card-image";
    image.src = thumbPath(eventItem.imageUrl);
    image.alt = eventItem.imageAlt || "";
    image.width = 400;
    image.height = 267;
    card.appendChild(image);
  }

  const heading = document.createElement("h3");
  const headingLink = document.createElement("a");
  headingLink.href = "event.html?id=" + encodeURIComponent(eventItem.id);
  headingLink.textContent = eventItem.title;
  heading.appendChild(headingLink);
  card.appendChild(heading);

  const dateLine = document.createElement("p");
  dateLine.className = "card-date";
  dateLine.textContent = eventItem.startsAt.toLocaleDateString("en-ZA");
  card.appendChild(dateLine);

  const priceLine = document.createElement("p");
  priceLine.className = "card-meta";
  priceLine.textContent = formatPrice(eventItem);
  card.appendChild(priceLine);

  // Sold out is shown as its own labelled badge, never by colour or a
  // shadow alone, so it still reads correctly in sensory mode and to
  // anyone who cannot see colour.
  if (isSoldOut(eventItem)) {
    const badge = document.createElement("span");
    badge.className = "event-card-badge";
    badge.textContent = translated("eventsSoldOut");
    card.appendChild(badge);
  }

  return card;
}

async function loadEvents() {
  const snapshot = await getDocs(
    query(collection(db, "events"), where("published", "==", true)),
  );

  const events = snapshot.docs.map(function (docSnapshot) {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      title: data.title || "Untitled",
      startsAt: data.startsAt ? data.startsAt.toDate() : new Date(0),
      isTicketed: data.isTicketed === true,
      price: typeof data.price === "number" ? data.price : 0,
      capacity: typeof data.capacity === "number" ? data.capacity : 0,
      ticketsSold:
        typeof data.ticketsSold === "number" ? data.ticketsSold : 0,
      imageUrl: data.imageUrl || "",
      imageAlt: data.imageAlt || "",
    };
  });

  const now = new Date();

  const upcoming = events
    .filter(function (eventItem) {
      return endOfLocalDay(eventItem.startsAt) >= now;
    })
    .sort(function (first, second) {
      return first.startsAt - second.startsAt;
    });

  const past = events
    .filter(function (eventItem) {
      return endOfLocalDay(eventItem.startsAt) < now;
    })
    .sort(function (first, second) {
      return second.startsAt - first.startsAt;
    });

  upcoming.forEach(function (eventItem) {
    eventItem.section = "upcoming";
    eventItem.cardElement = buildCard(eventItem);
    upcomingList.appendChild(eventItem.cardElement);
  });
  past.forEach(function (eventItem) {
    eventItem.section = "past";
    eventItem.cardElement = buildCard(eventItem);
    pastList.appendChild(eventItem.cardElement);
  });

  // These reflect whether any event genuinely exists in each section, and
  // stay fixed regardless of the filters below. A price filter narrowing a
  // section to nothing gets its own message, not this one.
  upcomingEmpty.hidden = upcoming.length > 0;
  pastEmpty.hidden = past.length > 0;

  allEvents = upcoming.concat(past);
  totalEvents = allEvents.length;

  // Only ever hidden again when there is nothing at all to filter.
  toolbar.hidden = totalEvents === 0;

  applyFilters();
}

function setUpFilterGroup(buttons, datasetKey, onChange) {
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      buttons.forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      onChange(button.dataset[datasetKey]);
      applyFilters();
    });
  });
}

setUpFilterGroup(timeButtons, "timeFilter", function (value) {
  activeTimeFilter = value;
});
setUpFilterGroup(priceButtons, "priceFilter", function (value) {
  activePriceFilter = value;
});

// Hiding and unhiding cards and sections, never removing them, so a failure
// in here can only ever leave the full list showing.
function applyFilters() {
  try {
    const filtersActive = Boolean(activeTimeFilter) || Boolean(activePriceFilter);

    upcomingSection.hidden = activeTimeFilter === "past";
    pastSection.hidden = activeTimeFilter === "upcoming";

    let shown = 0;
    allEvents.forEach(function (eventItem) {
      const sectionVisible =
        !activeTimeFilter || activeTimeFilter === eventItem.section;
      const priceMatches =
        !activePriceFilter || eventItem.cardElement.dataset.price === activePriceFilter;
      const visible = sectionVisible && priceMatches;
      eventItem.cardElement.hidden = !visible;
      if (visible) {
        shown = shown + 1;
      }
    });

    countLine.textContent =
      shown === 1
        ? translated("eventsCountSingular")
        : translated("eventsCountPlural")
            .replace("{shown}", String(shown))
            .replace("{total}", String(totalEvents));

    filteredEmpty.hidden = !(filtersActive && shown === 0 && totalEvents > 0);
    clearRow.hidden = !filtersActive;

    // A filter can hide the card the keyboard focus was inside. Move focus
    // to the first time filter button rather than let it fall back to the
    // top of the page.
    const focusInsideHidden =
      document.activeElement &&
      document.activeElement.closest &&
      document.activeElement.closest("[hidden]");
    if (focusInsideHidden && timeButtons.length > 0) {
      timeButtons[0].focus();
    }
  } catch (error) {
    console.error("Filtering failed, showing the full list:", error);
    allEvents.forEach(function (eventItem) {
      eventItem.cardElement.hidden = false;
    });
    upcomingSection.hidden = false;
    pastSection.hidden = false;
  }
}

clearLink.addEventListener("click", function (event) {
  event.preventDefault();
  activeTimeFilter = "";
  activePriceFilter = "";
  timeButtons.forEach(function (button, index) {
    button.setAttribute("aria-pressed", String(index === 0));
  });
  priceButtons.forEach(function (button, index) {
    button.setAttribute("aria-pressed", String(index === 0));
  });
  applyFilters();
  timeButtons[0].focus();
});

loadEvents().catch(function (error) {
  console.error("Failed to load events:", error);
  upcomingEmpty.hidden = false;
  pastEmpty.hidden = false;
});
