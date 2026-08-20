import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { thumbPath, translated } from "./shared.js";

const loadingState = document.getElementById("galleryLoading");
const yearsContainer = document.getElementById("galleryYears");
const emptyState = document.getElementById("galleryEmpty");
const errorState = document.getElementById("galleryError");
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

function buildImageButton(image, imageIndex, album) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gallery-image-button";
  button.setAttribute(
    "aria-label",
    translated("galleryOpenImage")
      .replace("{number}", String(imageIndex + 1))
      .replace("{title}", album.title),
  );
  button.dataset.fullUrl = image.url;
  button.dataset.imageAlt = image.alt;
  button.dataset.albumTitle = album.title;
  button.dataset.imageIndex = String(imageIndex);

  const thumbnail = document.createElement("img");
  thumbnail.src = image.thumbUrl;
  thumbnail.alt = image.alt;
  thumbnail.width = 400;
  thumbnail.height = 267;
  // Not lazy: these sit inside a closed details element until someone opens
  // the album, and a lazy image that starts inside a hidden ancestor is not
  // reliably picked up by the browser once it becomes visible.
  thumbnail.addEventListener("error", function () {
    button.remove();
    const imageGrid = button.parentElement;
    if (imageGrid && imageGrid.children.length === 0) {
      const unavailable = document.createElement("p");
      unavailable.className = "gallery-album-empty";
      unavailable.textContent = translated("galleryImagesUnavailable");
      imageGrid.replaceWith(unavailable);
    }
  });
  button.appendChild(thumbnail);

  button.addEventListener("click", function () {
    openLightbox(album.images, imageIndex, album.title, button);
  });

  return button;
}

function buildAlbum(album) {
  const details = document.createElement("details");
  details.className = "gallery-album";

  const summary = document.createElement("summary");
  summary.className = "gallery-album-summary";

  const cover = buildCover(album);
  if (cover) {
    summary.appendChild(cover);
  } else {
    summary.appendChild(buildCoverFallback());
  }

  const summaryContent = document.createElement("span");
  summaryContent.className = "gallery-album-summary-content";

  const title = document.createElement("span");
  title.className = "gallery-album-title";
  title.textContent = album.title;
  summaryContent.appendChild(title);

  if (album.eventName) {
    const eventName = document.createElement("span");
    eventName.className = "gallery-album-event";
    eventName.textContent = album.eventName;
    summaryContent.appendChild(eventName);
  }

  const count = document.createElement("span");
  count.className = "gallery-album-count";
  count.textContent = imageCountText(album.images.length);
  summaryContent.appendChild(count);

  summary.appendChild(summaryContent);
  details.appendChild(summary);

  const content = document.createElement("div");
  content.className = "gallery-album-content";

  if (album.images.length > 0) {
    const imageGrid = document.createElement("div");
    imageGrid.className = "gallery-image-grid";
    imageGrid.setAttribute("aria-label", album.title);
    album.images.forEach(function (image, imageIndex) {
      imageGrid.appendChild(buildImageButton(image, imageIndex, album));
    });
    content.appendChild(imageGrid);
  } else {
    const noImages = document.createElement("p");
    noImages.className = "gallery-album-empty";
    noImages.textContent = translated("galleryAlbumEmpty");
    content.appendChild(noImages);
  }

  details.appendChild(content);
  return details;
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

async function loadGallery() {
  const snapshot = await getDocs(collection(db, "galleries"));
  return snapshot.docs
    .map(normaliseAlbum)
    .filter(function (album) {
      return album !== null;
    });
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
