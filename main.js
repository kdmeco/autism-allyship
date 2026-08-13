// Everything the shell needs on every page: the three comfort settings, the
// language selector, the Community dropdown, the mobile menu and the shrinking
// header. Loaded with `defer`, so the DOM is ready by the time this runs.
//
// A small copy of the settings logic also lives inline in _head.html. That copy
// exists purely to apply saved settings before the page paints, so returning
// visitors don't see a flash of the wrong theme. If you change a storage key
// here, change it there too.
//
// The strings for the language selector live in translations.js, which is
// loaded first.

const STORAGE_KEYS = {
  theme: "aaf-theme",
  textSize: "aaf-text-size",
  sensory: "aaf-sensory-mode",
  plainText: "aaf-plain-text",
  language: "aaf-language",
};

const root = document.documentElement;

// localStorage throws in a few situations we can't control: Safari private
// browsing, and Chrome when a page is opened directly off the file system.
// Wrapping it means a failed save never takes the rest of the page down with it.
function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Nothing useful to do here. The setting still works for this page view,
    // it just won't be remembered on the next one.
  }
}

// Translating a page means walking every element that carries a data-i18n
// attribute and swapping its text for the matching entry in translations.js.
// Two extra attributes cover the cases where the words aren't visible text:
// data-i18n-aria-label and data-i18n-placeholder.
function applyLanguage(languageCode) {
  const dictionary = translations[languageCode] || translations.en;

  function lookUp(key) {
    const value = dictionary[key];

    // An empty string means a translator hasn't filled that entry in yet.
    // Either way we show the English rather than a blank label.
    if (value) {
      return value;
    }

    if (value === undefined) {
      console.warn(
        'No "' + key + '" key exists in the ' + languageCode + " translations.",
      );
    }

    return translations.en[key];
  }

  document.querySelectorAll("[data-i18n]").forEach(function (element) {
    const text = lookUp(element.dataset.i18n);
    if (text !== undefined) {
      element.textContent = text;
    }
  });

  document
    .querySelectorAll("[data-i18n-aria-label]")
    .forEach(function (element) {
      const text = lookUp(element.dataset.i18nAriaLabel);
      if (text !== undefined) {
        element.setAttribute("aria-label", text);
      }
    });

  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach(function (element) {
      const text = lookUp(element.dataset.i18nPlaceholder);
      if (text !== undefined) {
        element.setAttribute("placeholder", text);
      }
    });

  // Screen readers use this to pick the right pronunciation.
  root.setAttribute("lang", languageCode);
}

function setUpLanguagePicker() {
  const picker = document.getElementById("languageSelect");
  if (!picker) {
    return;
  }

  const savedLanguage = readSetting(STORAGE_KEYS.language) || "en";
  picker.value = savedLanguage;
  applyLanguage(savedLanguage);

  picker.addEventListener("change", function () {
    applyLanguage(picker.value);
    saveSetting(STORAGE_KEYS.language, picker.value);
  });
}

// The theme-color meta tags in _head.html use a media attribute, which follows
// the operating system rather than the visitor's own choice. Someone on a light
// phone who switches the site to dark would get a dark page with a white browser
// bar. Dropping the media attribute and setting the value directly keeps the
// browser chrome in step with what is actually on screen.
function updateBrowserBarColour() {
  const barColour = root.dataset.theme === "dark" ? "#141213" : "#FBFAFA";

  document.querySelectorAll('meta[name="theme-color"]').forEach(function (tag) {
    tag.removeAttribute("media");
    tag.setAttribute("content", barColour);
  });
}

// Dark mode follows the device setting until the visitor picks something, and
// their pick is remembered from then on. The inline script in the header has
// already resolved this into a data-theme attribute, so here we only need to
// keep the button in sync and handle clicks.
function setUpDarkModeToggle() {
  const toggle = document.getElementById("darkModeToggle");
  if (!toggle) {
    return;
  }

  toggle.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  updateBrowserBarColour();

  toggle.addEventListener("click", function () {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    toggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
    saveSetting(STORAGE_KEYS.theme, nextTheme);
    updateBrowserBarColour();
  });

  // If the visitor has never chosen, keep following the device. Someone whose
  // phone switches to dark at sunset should see the site switch with it.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", function (event) {
      if (readSetting(STORAGE_KEYS.theme)) {
        return;
      }
      root.dataset.theme = event.matches ? "dark" : "light";
      toggle.setAttribute("aria-pressed", String(event.matches));
      updateBrowserBarColour();
    });
}

// Most of sensory-friendly mode is CSS hanging off the .sensory-mode class.
// The part CSS can't do is stop media that plays on its own, which is what this
// handles. Note that animated GIFs can't be paused from JavaScript at all: if a
// page uses one, give the img a still fallback and swap it here.
function stopAutoplayingMedia() {
  document
    .querySelectorAll("video[autoplay], audio[autoplay]")
    .forEach(function (media) {
      media.removeAttribute("autoplay");
      media.autoplay = false;
      media.pause();
    });

  // Embedded players (YouTube and similar) autoplay via their URL, so the only
  // way to stop them from the outside is to reload the frame without the flag.
  document
    .querySelectorAll('iframe[src*="autoplay=1"]')
    .forEach(function (frame) {
      frame.src = frame.src.replace("autoplay=1", "autoplay=0");
    });
}

function setUpSensoryToggle() {
  const toggle = document.getElementById("sensoryToggle");
  if (!toggle) {
    return;
  }

  const sensoryIsOn = root.classList.contains("sensory-mode");
  toggle.setAttribute("aria-pressed", String(sensoryIsOn));

  if (sensoryIsOn) {
    stopAutoplayingMedia();
  }

  toggle.addEventListener("click", function () {
    const turningOn = !root.classList.contains("sensory-mode");
    root.classList.toggle("sensory-mode", turningOn);
    toggle.setAttribute("aria-pressed", String(turningOn));
    saveSetting(STORAGE_KEYS.sensory, turningOn ? "on" : "off");

    if (turningOn) {
      stopAutoplayingMedia();
    }
  });
}

// Strips images and decoration, leaving plain text on a plain background. Five
// of the thirty people we surveyed asked for this. It is separate from the text
// size control, which only changes how big the words are.
function setUpPlainTextToggle() {
  const toggle = document.getElementById("plainTextToggle");
  if (!toggle) {
    return;
  }

  toggle.setAttribute(
    "aria-pressed",
    String(root.classList.contains("plain-text")),
  );

  toggle.addEventListener("click", function () {
    const turningOn = !root.classList.contains("plain-text");
    root.classList.toggle("plain-text", turningOn);
    toggle.setAttribute("aria-pressed", String(turningOn));
    saveSetting(STORAGE_KEYS.plainText, turningOn ? "on" : "off");
  });
}

// Three steps: 1 is 100%, 2 is 125%, 3 is 150%. The percentages live in the
// stylesheet against html[data-text-size]. Because every size in styles.css is
// in rem, changing the root size scales the whole page together.
function setUpTextSizeControls() {
  const buttons = document.querySelectorAll(".text-size-button");
  if (buttons.length === 0) {
    return;
  }

  function showCurrentSize() {
    buttons.forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.textSize === root.dataset.textSize),
      );
    });
  }

  showCurrentSize();

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      root.dataset.textSize = button.dataset.textSize;
      saveSetting(STORAGE_KEYS.textSize, button.dataset.textSize);
      showCurrentSize();
    });
  });
}

// The accessibility controls sit behind one labelled button rather than as a row
// of icons in the header. Same open and close behaviour as the Community menu,
// with one difference: clicking inside the panel does not close it, because
// people usually change two or three settings at once.
function setUpAccessibilityPanel() {
  const trigger = document.getElementById("accessibilityTrigger");
  const panel = document.getElementById("accessibilityPanel");
  if (!trigger || !panel) {
    return;
  }

  function openPanel() {
    panel.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function closePanel(returnFocusToTrigger) {
    panel.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocusToTrigger) {
      trigger.focus();
    }
  }

  trigger.addEventListener("click", function () {
    if (trigger.getAttribute("aria-expanded") === "true") {
      closePanel(false);
    } else {
      openPanel();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      trigger.getAttribute("aria-expanded") === "true"
    ) {
      closePanel(true);
    }
  });

  document.addEventListener("click", function (event) {
    const clickedInside =
      panel.contains(event.target) || trigger.contains(event.target);
    if (!clickedInside && trigger.getAttribute("aria-expanded") === "true") {
      closePanel(false);
    }
  });

  panel.addEventListener("focusout", function (event) {
    const movingWithinPanel =
      panel.contains(event.relatedTarget) ||
      trigger.contains(event.relatedTarget);
    if (!movingWithinPanel) {
      closePanel(false);
    }
  });
}

// The Community menu opens on click rather than hover, so it works the same way
// for a mouse, a keyboard, a screen reader and a touch screen. This is the
// disclosure pattern: a plain button with aria-expanded controlling a plain list
// of links. Deliberately not role="menu", which is for application menus and
// changes how arrow keys are expected to behave.
function setUpCommunityDropdown() {
  const trigger = document.getElementById("communityTrigger");
  const menu = document.getElementById("communityMenu");
  if (!trigger || !menu) {
    return;
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function closeMenu(returnFocusToTrigger) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocusToTrigger) {
      trigger.focus();
    }
  }

  trigger.addEventListener("click", function () {
    if (trigger.getAttribute("aria-expanded") === "true") {
      closeMenu(false);
    } else {
      openMenu();
    }
  });

  // Down arrow opens the menu and jumps straight to the first link, which is
  // what keyboard users generally expect from a menu button.
  trigger.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
      const firstLink = menu.querySelector("a");
      if (firstLink) {
        firstLink.focus();
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      trigger.getAttribute("aria-expanded") === "true"
    ) {
      closeMenu(true);
    }
  });

  // Clicking anywhere outside the dropdown closes it.
  document.addEventListener("click", function (event) {
    const clickedInside =
      menu.contains(event.target) || trigger.contains(event.target);
    if (!clickedInside && trigger.getAttribute("aria-expanded") === "true") {
      closeMenu(false);
    }
  });

  // Tabbing past the last link closes it too, otherwise it hangs open behind
  // the rest of the page.
  menu.addEventListener("focusout", function (event) {
    const movingWithinMenu =
      menu.contains(event.relatedTarget) ||
      trigger.contains(event.relatedTarget);
    if (!movingWithinMenu) {
      closeMenu(false);
    }
  });
}

// Below 768px the nav and the comfort controls collapse behind this button.
// The button sits after them in the DOM, because that is the order the header
// reads in on a wide screen, so opening the menu moves focus into it by hand.
// Without that, a keyboard user would have to shift-tab backwards to reach the
// links they just opened.
function setUpMobileMenu() {
  const header = document.getElementById("siteHeader");
  const toggle = document.getElementById("menuToggle");
  const nav = document.getElementById("primaryNav");
  if (!header || !toggle || !nav) {
    return;
  }

  function closeMenu(returnFocusToToggle) {
    header.removeAttribute("data-menu");
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocusToToggle) {
      toggle.focus();
    }
  }

  toggle.addEventListener("click", function () {
    const menuIsOpen = toggle.getAttribute("aria-expanded") === "true";

    if (menuIsOpen) {
      closeMenu(false);
      return;
    }

    header.setAttribute("data-menu", "open");
    toggle.setAttribute("aria-expanded", "true");

    const firstLink = nav.querySelector("a, button");
    if (firstLink) {
      firstLink.focus();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      toggle.getAttribute("aria-expanded") === "true"
    ) {
      closeMenu(true);
    }
  });

  // Going back to a wide screen with the menu open would leave the header in a
  // half-open state, so reset it at the breakpoint.
  window
    .matchMedia("(min-width: 768px)")
    .addEventListener("change", function (event) {
      if (event.matches) {
        closeMenu(false);
      }
    });
}

// The header shrinks once the page has scrolled a little. Purely cosmetic, and
// the transition is already switched off by sensory-friendly mode and by the
// operating system's reduced motion setting.
function setUpShrinkingHeader() {
  const header = document.getElementById("siteHeader");
  if (!header) {
    return;
  }

  const shrinkAfterPixels = 24;

  function updateHeader() {
    const shouldShrink = window.scrollY > shrinkAfterPixels;
    // Only touch the class when the answer actually changes, so we aren't
    // writing to the DOM on every single scroll event.
    if (shouldShrink !== header.classList.contains("is-scrolled")) {
      header.classList.toggle("is-scrolled", shouldShrink);
    }
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

// Marks the nav link for the page you're on, so you don't have to set it by
// hand in every copy of the header.
function markCurrentPage() {
  const currentFile = window.location.pathname.split("/").pop() || "index.html";

  // The Donate button sits outside .nav-list, so it has to be named separately
  // or donate.html ends up with nothing marked as the current page.
  document
    .querySelectorAll(".nav-list a, .donate-button")
    .forEach(function (link) {
      const linkFile = link.getAttribute("href");
      if (linkFile === currentFile) {
        link.setAttribute("aria-current", "page");
      }
    });
}

function setUpFooterYear() {
  const yearSlot = document.getElementById("footerYear");
  if (yearSlot) {
    yearSlot.textContent = String(new Date().getFullYear());
  }
}

setUpLanguagePicker();
setUpDarkModeToggle();
setUpSensoryToggle();
setUpPlainTextToggle();
setUpTextSizeControls();
setUpAccessibilityPanel();
setUpCommunityDropdown();
setUpMobileMenu();
setUpShrinkingHeader();
markCurrentPage();
setUpFooterYear();
