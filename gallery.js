import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { thumbPath, translated, setUpTabs } from "./shared.js";

const loadingState = document.getElementById("galleryLoading");
const yearsContainer = document.getElementById("galleryYears");
const emptyState = document.getElementById("galleryEmpty");
const errorState = document.getElementById("galleryError");
const mediaLoading = document.getElementById("mediaLoading");
const mediaList = document.getElementById("mediaList");
const mediaEmpty = document.getElementById("mediaEmpty");
const mediaError = document.getElementById("mediaError");
const lightbox = document.getElementById("galleryLightbox");
const lightboxTitle = document.getElementById("galleryLightboxTitle");
const lightboxPosition = document.getElementById("galleryLightboxPosition");
const lightboxImage = document.getElementById("galleryLightboxImage");
const lightboxFallback = document.getElementById("galleryLightboxFallback");
const closeButton = document.getElementById("galleryLightboxClose");
const previousButton = document.getElementById("galleryLightboxPrevious");
const nextButton = document.getElementById("galleryLightboxNext");

let activeImages = [];
let activeImageIndex = -1;
let lightboxOpener = null;
let inertElements = [];

function setState(stateElement, isVisible) {
  stateElement.hidden = !isVisible;
}

function imageCountText(count) {
  if (count === 1) {
    return translated("galleryImageCountSingular");
  }
  return translated("galleryImageCountPlural").replace("{count}", String(count));
}

function buildCoverFallback() {
  const fallback = document.createElement("span");
  fallback.className = "gallery-album-cover-fallback";
  fallback.textContent = translated("galleryNoCover");
  return fallback;
}

function normaliseAlbum(documentSnapshot) {
  const data = documentSnapshot.data();
  if (
    typeof data.title !== "string" ||
    !data.title.trim() ||
    typeof data.year !== "number" ||
    !Number.isFinite(data.year)
  ) {
    return null;
  }

  const images = Array.isArray(data.images)
    ? data.images
        .filter(function (image) {
          return image && typeof image.url === "string" && image.url;
        })
        .map(function (image) {
          return {
            url: image.url,
            thumbUrl:
              typeof image.thumbUrl === "string" && image.thumbUrl
                ? image.thumbUrl
                : thumbPath(image.url),
            alt: typeof image.alt === "string" ? image.alt : "",
          };
        })
    : [];

  return {
    id: documentSnapshot.id,
    title: data.title,
    eventName: typeof data.eventName === "string" ? data.eventName : "",
    year: data.year,
    coverImageUrl:
      typeof data.coverImageUrl === "string" ? data.coverImageUrl : "",
    images,
  };
}

function buildCover(album) {
  if (!album.coverImageUrl) {
    return null;
  }

  const image = document.createElement("img");
  image.className = "gallery-album-cover";
  image.src = thumbPath(album.coverImageUrl);
  image.alt = "";
  image.width = 400;
  image.height = 267;
  image.loading = "lazy";
  image.addEventListener("error", function () {
    image.replaceWith(buildCoverFallback());
  });
  return image;
}

function buildAlbum(album) {
  const card = document.createElement("article");
  card.className = "gallery-album";

  const cover = buildCover(album);
  if (cover) {
    card.appendChild(cover);
  } else {
    card.appendChild(buildCoverFallback());
  }

  const cardContent = document.createElement("div");
  cardContent.className = "gallery-album-card-content";

  const title = document.createElement("h3");
  title.className = "gallery-album-title";
  title.textContent = album.title;
  cardContent.appendChild(title);

  if (album.eventName) {
    const eventName = document.createElement("p");
    eventName.className = "gallery-album-event";
    eventName.textContent = album.eventName;
    cardContent.appendChild(eventName);
  }

  const count = document.createElement("p");
  count.className = "gallery-album-count";
  count.textContent = imageCountText(album.images.length);
  cardContent.appendChild(count);

  if (album.images.length > 0) {
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button button-secondary gallery-album-view";
    viewButton.textContent = translated("galleryViewAlbum");
    viewButton.setAttribute(
      "aria-label",
      translated("galleryViewAlbumLabel").replace("{title}", album.title),
    );
    viewButton.addEventListener("click", function () {
      openLightbox(album.images, 0, album.title, viewButton);
    });
    cardContent.appendChild(viewButton);
  } else {
    const noImages = document.createElement("p");
    noImages.className = "gallery-album-empty";
    noImages.textContent = translated("galleryAlbumEmpty");
    cardContent.appendChild(noImages);
  }

  card.appendChild(cardContent);
  return card;
}

function renderAlbums(albums) {
  const albumsByYear = new Map();
  albums.forEach(function (album) {
    if (!albumsByYear.has(album.year)) {
      albumsByYear.set(album.year, []);
    }
    albumsByYear.get(album.year).push(album);
  });

  [...albumsByYear.keys()]
    .sort(function (first, second) {
      return second - first;
    })
    .forEach(function (year) {
      const yearSection = document.createElement("section");
      yearSection.className = "gallery-year";
      yearSection.setAttribute("aria-labelledby", "galleryYear" + year);

      const heading = document.createElement("h2");
      heading.className = "gallery-year-heading";
      heading.id = "galleryYear" + year;
      heading.textContent = String(year);
      yearSection.appendChild(heading);

      const albumList = document.createElement("div");
      albumList.className = "gallery-album-list";
      albumsByYear.get(year).forEach(function (album) {
        albumList.appendChild(buildAlbum(album));
      });
      yearSection.appendChild(albumList);
      yearsContainer.appendChild(yearSection);
    });
}

function updateLightboxControls() {
  previousButton.disabled = activeImageIndex <= 0;
  nextButton.disabled =
    activeImageIndex < 0 || activeImageIndex >= activeImages.length - 1;
}

function showLightboxImage() {
  const image = activeImages[activeImageIndex];
  if (!image) {
    return;
  }

  lightboxImage.src = image.url;
  lightboxImage.alt = image.alt;
  lightboxImage.hidden = false;
  lightboxFallback.hidden = true;
  lightboxPosition.textContent = translated("galleryImagePosition")
    .replace("{current}", String(activeImageIndex + 1))
    .replace("{total}", String(activeImages.length));
  updateLightboxControls();
}

function openLightbox(images, imageIndex, albumTitle, opener) {
  activeImages = images;
  activeImageIndex = imageIndex;
  lightboxOpener = opener;
  lightboxTitle.textContent = albumTitle;
  lightbox.hidden = false;
  document.body.classList.add("gallery-lightbox-open");

  inertElements = Array.from(document.body.children).filter(function (element) {
    return element !== lightbox;
  });
  inertElements.forEach(function (element) {
    element.inert = true;
  });

  showLightboxImage();
  closeButton.focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.removeAttribute("src");
  lightboxImage.alt = "";
  lightboxImage.hidden = false;
  lightboxFallback.hidden = true;
  lightboxPosition.textContent = "";
  document.body.classList.remove("gallery-lightbox-open");
  inertElements.forEach(function (element) {
    element.inert = false;
  });
  inertElements = [];
  activeImages = [];
  activeImageIndex = -1;
  updateLightboxControls();

  if (lightboxOpener) {
    lightboxOpener.focus();
  }
  lightboxOpener = null;
}

function moveLightboxImage(step) {
  const nextIndex = activeImageIndex + step;
  if (nextIndex < 0 || nextIndex >= activeImages.length) {
    return;
  }
  activeImageIndex = nextIndex;
  showLightboxImage();
}

function setUpLightbox() {
  lightboxImage.addEventListener("error", function () {
    lightboxImage.hidden = true;
    lightboxFallback.hidden = false;
  });

  closeButton.addEventListener("click", closeLightbox);
  previousButton.addEventListener("click", function () {
    moveLightboxImage(-1);
  });
  nextButton.addEventListener("click", function () {
    moveLightboxImage(1);
  });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveLightboxImage(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveLightboxImage(1);
      return;
    }

    if (event.key === "Tab") {
      const focusable = [closeButton, previousButton, nextButton].filter(
        function (element) {
          return !element.disabled;
        },
      );
      if (focusable.length === 0) {
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      let nextFocusIndex = currentIndex + 1;
      if (event.shiftKey) {
        nextFocusIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
      } else if (currentIndex === focusable.length - 1) {
        nextFocusIndex = 0;
      }
      event.preventDefault();
      focusable[nextFocusIndex].focus();
    }
  });
}

// The stored type values and the translation key each one renders through.
// A value outside this map is left out of the meta line rather than shown
// raw.
const MEDIA_TYPE_KEYS = {
  television: "galleryMediaTypeTelevision",
  radio: "galleryMediaTypeRadio",
  newspaper: "galleryMediaTypeNewspaper",
  article: "galleryMediaTypeArticle",
  "online video": "galleryMediaTypeOnlineVideo",
  "live stream": "galleryMediaTypeLiveStream",
  "visit and live stream": "galleryMediaTypeVisitAndLiveStream",
};

// A host matches a domain when it is the domain or a subdomain of it, so
// www.youtube.com counts as youtube.com the same way youtube.com does.
function hostMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

// A link's label comes from its host, per SCHEMA.md. An address that cannot
// be parsed as a URL has no host to match, so it gets no link at all rather
// than a guessed label.
function mediaLinkKey(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch (error) {
    return null;
  }
  if (hostMatches(host, "omny.fm")) {
    return "galleryMediaListenOmny";
  }
  if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) {
    return "galleryMediaWatchYouTube";
  }
  if (hostMatches(host, "citizen.co.za")) {
    return "galleryMediaReadRekord";
  }
  return "galleryMediaOpenLink";
}

// Dates are stored as YYYY-MM-DD and shown the way the old hardcoded list
// showed them, for example 3 Nov 2025. The month stays in English because
// names, shows and topics are not translated.
const MEDIA_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMediaDate(value) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) {
    return "";
  }
  const month = MEDIA_MONTHS[Number(parts[2]) - 1] || parts[2];
  return Number(parts[3]) + " " + month + " " + parts[1];
}

function normaliseMedia(documentSnapshot) {
  const data = documentSnapshot.data();
  if (typeof data.outlet !== "string" || !data.outlet.trim()) {
    return null;
  }

  const type = typeof data.type === "string" ? data.type : "";
  return {
    outlet: data.outlet.trim(),
    typeKey: MEDIA_TYPE_KEYS[type] || null,
    date: typeof data.date === "string" ? data.date : "",
    panel: typeof data.panel === "string" ? data.panel.trim() : "",
    topic: typeof data.topic === "string" ? data.topic.trim() : "",
    url: typeof data.url === "string" ? data.url.trim() : "",
  };
}

// Dated entries newest first, then undated entries, so no composite index
// is needed. The string comparison works because every date is YYYY-MM-DD:
// the same characters in the same order sort the way the calendar does.
function sortMedia(entries) {
  return entries.slice().sort(function (first, second) {
    if (first.date && second.date) {
      if (first.date !== second.date) {
        return first.date < second.date ? 1 : -1;
      }
      return 0;
    }
    if (first.date) {
      return -1;
    }
    if (second.date) {
      return 1;
    }
    return 0;
  });
}

// A span carrying data-i18n, so applyLanguage retranslates it when the
// visitor switches language on an open page. The text is set as well,
// because an entry renders after applyLanguage has already run once.
function translatedSpan(key) {
  const span = document.createElement("span");
  span.setAttribute("data-i18n", key);
  span.textContent = translated(key);
  return span;
}

// The same shape the old hardcoded list used: an outlet heading, a meta
// line, and the optional panel, topic and link. Everything goes in through
// textContent, so nothing an admin types can run as markup. The labels
// carry data-i18n and the names and topics stay plain text, so a language
// switch retranslates the one without touching the other.
function buildMediaEntry(entry) {
  const item = document.createElement("li");
  item.className = "media-item";

  const outlet = document.createElement("h3");
  outlet.className = "media-outlet";
  outlet.textContent = entry.outlet;
  item.appendChild(outlet);

  // The date itself stays in English, because names, shows and topics are
  // not translated.
  const meta = document.createElement("p");
  meta.className = "media-meta";
  if (entry.date) {
    meta.append(formatMediaDate(entry.date));
  } else {
    meta.appendChild(translatedSpan("galleryMediaUndated"));
  }
  if (entry.typeKey) {
    meta.append(" \u00b7 ");
    meta.appendChild(translatedSpan(entry.typeKey));
  }
  item.appendChild(meta);

  if (entry.panel) {
    const panel = document.createElement("p");
    panel.className = "media-panel";
    panel.appendChild(translatedSpan("galleryMediaPanelWith"));
    panel.append(" " + entry.panel);
    item.appendChild(panel);
  }

  if (entry.topic) {
    const topic = document.createElement("p");
    topic.className = "media-topic";
    topic.textContent = entry.topic;
    item.appendChild(topic);
  }

  if (entry.url) {
    const labelKey = mediaLinkKey(entry.url);
    if (labelKey) {
      const linkParagraph = document.createElement("p");
      linkParagraph.className = "media-link";
      const link = document.createElement("a");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("data-i18n", labelKey);
      link.textContent = translated(labelKey);
      linkParagraph.appendChild(link);
      item.appendChild(linkParagraph);
    }
  }

  return item;
}

async function loadMedia() {
  const snapshot = await getDocs(
    query(collection(db, "media"), where("published", "==", true)),
  );
  return sortMedia(
    snapshot.docs
      .map(normaliseMedia)
      .filter(function (entry) {
        return entry !== null;
      }),
  );
}

async function loadGallery() {
  const snapshot = await getDocs(collection(db, "galleries"));
  return snapshot.docs
    .map(normaliseAlbum)
    .filter(function (album) {
      return album !== null;
    });
}

// The tab list sits above everything the album code touches, so wiring it
// here keeps one script per page. A missing list means the page was changed;
// the albums still load under whatever markup replaced it.
const tabList = document.getElementById("galleryTabList");
if (tabList) {
  setUpTabs(tabList);
}

setUpLightbox();

loadGallery()
  .then(function (albums) {
    loadingState.hidden = true;
    if (albums.length === 0) {
      setState(emptyState, true);
      return;
    }
    renderAlbums(albums);
  })
  .catch(function () {
    loadingState.hidden = true;
    setState(errorState, true);
  });

// Its own chain, so a denied or failed media query cannot take the album
// loading down with it. Each tab stands or falls on its own query.
loadMedia()
  .then(function (entries) {
    mediaLoading.hidden = true;
    if (entries.length === 0) {
      setState(mediaEmpty, true);
      return;
    }
    entries.forEach(function (entry) {
      mediaList.appendChild(buildMediaEntry(entry));
    });
  })
  .catch(function () {
    mediaLoading.hidden = true;
    setState(mediaError, true);
  });
