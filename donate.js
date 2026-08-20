// Public donation form. Validates in the browser, asks the api Worker to
// initialise a Paystack transaction, then opens Paystack's own popup to
// resume it. Paystack handles collecting card details entirely inside its
// own iframe, so no payment detail ever reaches this script. The popup's
// onSuccess callback is not treated as proof of payment on its own: it only
// carries the visitor across to donate-success.html, which confirms the
// outcome with the Worker's verify endpoint the same way donate-result.js
// does whenever that page is reached, including a direct visit or a reload.

import { API_DONATE_INITIALIZE_URL } from "./api.js";
import { translated } from "./shared.js";

const donateForm = document.getElementById("donateForm");
const amountInput = document.getElementById("donateAmount");
const amountOptions = document.querySelectorAll('input[name="amountChoice"]');
const submitButton = document.getElementById("donateSubmitButton");
const paymentError = document.getElementById("donatePaymentError");

const fields = {
  amount: amountInput,
  name: document.getElementById("donorName"),
  email: document.getElementById("donorEmail"),
  popia: document.getElementById("donorPopia"),
};
const errors = {
  amount: document.getElementById("donateAmountError"),
  name: document.getElementById("donorNameError"),
  email: document.getElementById("donorEmailError"),
  popia: document.getElementById("donorPopiaError"),
};

amountOptions.forEach(function (option) {
  option.addEventListener("change", function () {
    if (option.value !== "custom") {
      amountInput.value = option.value;
    }
    amountInput.focus();
  });
});

function clearErrors() {
  Object.values(errors).forEach(function (error) {
    error.hidden = true;
  });
  Object.values(fields).forEach(function (field) {
    field.removeAttribute("aria-invalid");
  });
  paymentError.hidden = true;
}

function validateForm() {
  let valid = true;

  if (!Number.isFinite(Number(fields.amount.value)) || Number(fields.amount.value) <= 0) {
    errors.amount.hidden = false;
    fields.amount.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.name.value.trim()) {
    errors.name.hidden = false;
    fields.name.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.email.validity.valid || !fields.email.value.trim()) {
    errors.email.hidden = false;
    fields.email.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!fields.popia.checked) {
    errors.popia.hidden = false;
    fields.popia.setAttribute("aria-invalid", "true");
    valid = false;
  }

  return valid;
}

function showPaymentError(message) {
  paymentError.textContent = message || translated("donatePaymentError");
  paymentError.hidden = false;
}

function resetSubmitButton() {
  submitButton.disabled = false;
  submitButton.textContent = translated("donateContinueButton");
}

donateForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearErrors();

  if (!validateForm()) {
    const firstInvalid = donateForm.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  const donation = {
    amount: Number(fields.amount.value),
    donorName: fields.name.value.trim(),
    donorEmail: fields.email.value.trim(),
    message: document.getElementById("donorMessage").value.trim(),
  };

  submitButton.disabled = true;
  submitButton.textContent = translated("donateProcessing");

  try {
    const response = await fetch(API_DONATE_INITIALIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(donation),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      showPaymentError(result.error);
      resetSubmitButton();
      return;
    }

    if (typeof PaystackPop === "undefined") {
      // The Paystack script failed to load, most likely an ad blocker or a
      // network problem, since the tag itself is never conditional.
      showPaymentError(translated("donatePaymentError"));
      resetSubmitButton();
      return;
    }

    const popup = new PaystackPop();
    popup.resumeTransaction(result.accessCode, {
      onSuccess: function () {
        window.location.href =
          "donate-success.html?reference=" + encodeURIComponent(result.reference);
      },
      // Closing the popup unpaid and a popup-level error both leave a real
      // reference behind, one Paystack already knows the true state of. Send
      // either case to the failed page rather than resetting the form
      // silently: donate-result.js asks Paystack what actually happened and
      // resolves the pending Firestore record either way, so nothing is left
      // stuck as "pending" forever just because someone closed the popup.
      onCancel: function () {
        window.location.href =
          "donate-failed.html?reference=" + encodeURIComponent(result.reference);
      },
      onError: function (error) {
        console.error("Paystack popup error:", error && error.message);
        window.location.href =
          "donate-failed.html?reference=" + encodeURIComponent(result.reference);
      },
    });
  } catch (error) {
    console.error("Donation initialize failed:", error);
    showPaymentError(translated("donatePaymentError"));
    resetSubmitButton();
  }
});
