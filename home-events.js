// Fills the "next event" section on the home page with the soonest
// published event that has not started yet. Until there is one, the
// placeholder card stays in place.
//
// Unlike home-blog.js, this does not sort or limit in the query. Finding the
// soonest event needs a range filter and an order on startsAt together,
// which would need its own composite index, exactly the one the events list
// page deliberately avoids. Published events are fetched once instead and
// the soonest upcoming one is picked in the browser, the same trade the
// events list makes.

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const grid = document.getElementById("homeEventGrid");
const placeholder = document.getElementById("homeEventPlaceholder");

// The stored path points at the full image. The 400px thumbnail sits beside
// it with a -thumb suffix before the file extension.
function thumbPath(imageUrl) {
  const dot = imageUrl.lastIndexOf(".");
  if (dot === -1) {
    return imageUrl;
  }
  return imageUrl.slice(0, dot) + "-thumb" + imageUrl.slice(dot);
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

  return card;
}

async function loadNextEvent() {
  const snapshot = await getDocs(
    query(collection(db, "events"), where("published", "==", true)),
  );

  const now = new Date();
  const upcoming = snapshot.docs
    .map(function (docSnapshot) {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        title: data.title || "Untitled",
        startsAt: data.startsAt ? data.startsAt.toDate() : null,
        imageAlt: data.imageAlt || "",
        imageUrl: data.imageUrl || "",
      };
    })
    .filter(function (eventItem) {
      return eventItem.startsAt && eventItem.startsAt >= now;
    })
    .sort(function (first, second) {
      return first.startsAt - second.startsAt;
    });

  if (upcoming.length === 0) {
    return;
  }

  placeholder.hidden = true;
  grid.appendChild(buildCard(upcoming[0]));
}

loadNextEvent().catch(function (error) {
  console.error("Failed to load the next event:", error);
});
