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

const upcomingList = document.getElementById("eventsUpcomingList");
const upcomingEmpty = document.getElementById("eventsUpcomingEmpty");
const pastList = document.getElementById("eventsPastList");
const pastEmpty = document.getElementById("eventsPastEmpty");

// Strings built in JavaScript miss applyLanguage, so they are looked up here
// for the language already resolved by main.js.
function translated(key) {
  const language = document.documentElement.getAttribute("lang") || "en";
  const dictionary = translations[language] || translations.en;
  return dictionary[key] || translations.en[key];
}

// The stored path points at the full image. The 400px thumbnail sits beside
// it with a -thumb suffix before the file extension.
function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
}

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
      return eventItem.startsAt >= now;
    })
    .sort(function (first, second) {
      return first.startsAt - second.startsAt;
    });

  const past = events
    .filter(function (eventItem) {
      return eventItem.startsAt < now;
    })
    .sort(function (first, second) {
      return second.startsAt - first.startsAt;
    });

  upcoming.forEach(function (eventItem) {
    upcomingList.appendChild(buildCard(eventItem));
  });
  past.forEach(function (eventItem) {
    pastList.appendChild(buildCard(eventItem));
  });

  upcomingEmpty.hidden = upcoming.length > 0;
  pastEmpty.hidden = past.length > 0;
}

loadEvents().catch(function (error) {
  console.error("Failed to load events:", error);
  upcomingEmpty.hidden = false;
  pastEmpty.hidden = false;
});
