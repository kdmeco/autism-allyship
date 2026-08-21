// Shop page behaviour. The Paystack Storefront URL stays empty until the
// foundation confirms the store platform and supplies the live link. When that
// happens, set PAYSTACK_STOREFRONT_URL below and the Visit our store button
// appears automatically. No Firestore field is invented for this.

const PAYSTACK_STOREFRONT_URL = "";

const storefrontLink = document.getElementById("shopStorefrontLink");
const storefrontPending = document.getElementById("shopStorefrontPending");

if (storefrontLink && storefrontPending) {
  if (PAYSTACK_STOREFRONT_URL) {
    storefrontLink.href = PAYSTACK_STOREFRONT_URL;
    storefrontLink.hidden = false;
    storefrontPending.hidden = true;
  } else {
    storefrontLink.hidden = true;
    storefrontPending.hidden = false;
  }
}
