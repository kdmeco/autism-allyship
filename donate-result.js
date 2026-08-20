// Shared by donate-success.html and donate-failed.html. Confirms the
// payment with the Worker's verify endpoint every time either page loads,
// rather than trusting the popup's own callback: a client-side callback is
// never proof of payment on its own, only the server-side verify call is.
// If the confirmed outcome does not match the page reached, this replaces
// the address with the correct one, so a stale bookmark, a reload after the
// status changed, or a guessed query string cannot show the wrong result.

import { API_DONATE_VERIFY_URL } from "./api.js";
import { translated } from "./shared.js";

const reference = new URLSearchParams(window.location.search).get(
  "reference",
);
const isSuccessPage = !!document.getElementById("donateSuccessHeading");

const lede = document.getElementById(
  isSuccessPage ? "donateSuccessLede" : "donateFailedLede",
);
const referenceSection = document.getElementById("donateReferenceSection");
const referenceSlot = document.getElementById(
  isSuccessPage ? "donateReferenceValue" : "donateFailedReference",
);
const amountSlot = document.getElementById("donateAmountValue");
const reasonSlot = document.getElementById("donateFailedReason");

function formatAmount(amount) {
  return Number(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function revealReference(text) {
  if (referenceSection) {
    referenceSection.hidden = false;
  }
  if (referenceSlot) {
    referenceSlot.textContent = text;
    referenceSlot.hidden = false;
  }
}

function showUnknown() {
  if (lede) {
    lede.textContent = translated("donateVerifyUnknown");
  }
  if (reference) {
    revealReference(reference);
  }
}

function showSuccess(result) {
  if (lede) {
    lede.textContent = result.donorName
      ? translated("donateSuccessThanksNamed").replace(
          "{name}",
          result.donorName,
        )
      : translated("donateSuccessText");
  }
  revealReference(result.reference);
  if (amountSlot) {
    amountSlot.textContent = translated("donateAmountDonated").replace(
      "{amount}",
      formatAmount(result.amount),
    );
    amountSlot.hidden = false;
  }
}

function showFailed(result) {
  if (lede) {
    lede.textContent = translated("donateFailedConfirmed");
  }
  revealReference(result.reference);
  if (reasonSlot && result.gatewayResponse) {
    reasonSlot.textContent =
      translated("donateFailedReasonLabel") + " " + result.gatewayResponse;
    reasonSlot.hidden = false;
  }
}

if (reference) {
  if (lede) {
    lede.textContent = translated("donateVerifying");
  }

  fetch(API_DONATE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference }),
  })
    .then(async function (response) {
      const result = await response.json();
      if (!response.ok || !result.ok) {
        showUnknown();
        return;
      }

      const isSuccess = result.status === "success";
      if (isSuccess && !isSuccessPage) {
        window.location.replace(
          "donate-success.html?reference=" + encodeURIComponent(reference),
        );
        return;
      }
      if (!isSuccess && isSuccessPage) {
        window.location.replace(
          "donate-failed.html?reference=" + encodeURIComponent(reference),
        );
        return;
      }

      if (isSuccess) {
        showSuccess(result);
      } else {
        showFailed(result);
      }
    })
    .catch(function (error) {
      console.error("Donation verify failed:", error);
      showUnknown();
    });
}
