# Shopify Payments post-purchase upsell

A Shopify app that shows one extra product after a successful Shopify Payments checkout. Accept adds the item to the order and charges the same payment method. Decline continues to the thank-you page.

## Requirements

Post-purchase checkout UI extensions need **checkout extensibility**:

- A [development store](https://shopify.dev/docs/apps/tools/development-stores) with checkout extensions enabled, or
- A **Shopify Plus** store

The extension is in beta. On a live store you must [request post-purchase access](https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-post-purchase-offer#step-6-request-access) in the Dev Dashboard. Shopify only shows the page for Shopify Payments, Shop Pay, and the Bogus test gateway.

Do not invent Partner API keys. Run `shopify app dev` and let the CLI create or link the app.

## What v1 does

1. Merchant installs the embedded admin app and picks one product.
2. Optional percentage discount, offer title/body, and an enable toggle are saved in Prisma.
3. After payment, the `post_purchase` checkout UI extension asks `/api/offer` whether to render.
4. Accept calls `/api/sign-changeset`. The server verifies the post-purchase token, prices the offer from stored settings, and signs the changeset. Shopify charges the original payment method.
5. Decline calls `/api/decline` and continues to the order status page.

## Local preview (no payment)

Open a static mock of the post-purchase screen without a store, checkout, or card charge. It copies the extension layout in `extensions/post-purchase-upsell/src/index.jsx` with a fake product, price, and 20% discount. Accept and decline only switch mock states. Production checkout is unchanged.

```bash
npm run preview:upsell
```

Then open [http://127.0.0.1:4173/upsell.html](http://127.0.0.1:4173/upsell.html). The file is `preview/upsell.html`.

## Local development

### Prerequisites

- Node.js 22.12+
- A Shopify Partner account and a development store with checkout extensibility
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) (`@shopify/cli`), or use the local binary via npm scripts

```bash
npm install
npx prisma generate
cp .env.example .env   # then fill values from the CLI, or skip and let `shopify app dev` write them
npm run dev
# equivalent: npx shopify app dev
```

The first `shopify app dev` logs you in, creates or links the app in the Dev Dashboard, writes `.env` (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`), tunnels the app, and serves the extension.

Then:

1. Press **P** to open the Dev Console and install the app on your store.
2. In **Upsell offer**, pick a product, set copy/discount, and enable the offer.
3. Install the [Checkout editor / post-purchase preview](https://shopify.dev/docs/apps/build/checkout/test-checkout-ui-extensions) browser helper if the CLI asks for it.
4. Place a test order (Bogus gateway is fine in development). After payment, the upsell should appear before the thank-you page.

`SHOPIFY_APP_URL` is inlined into the extension at build time. `shopify app dev` sets it to the tunnel URL. For a production deploy, set it to the hosted app URL before `shopify app deploy`.

## Configuration

Scopes in `shopify.app.toml`:

- `read_products` — product picker and live price/availability lookup

GDPR / App Store compliance webhooks:

- `app/uninstalled`
- `app/scopes_update`
- `customers/data_request`
- `customers/redact`
- `shop/redact`

## App Store listing placeholders

Replace these before you submit:

- Support email: `support@example.com`
- Privacy policy: `https://example.com/privacy`
- App website: `https://example.com`

This app stores shop-scoped offer settings and order reference IDs for accept/decline logs. It does not store customer names, emails, or payment details. Payment data stays on Shopify.

## Production deploy

```bash
npm run build
npx shopify app deploy
```

Host the React Router server (Fly, Render, Cloud Run, or similar) with `NODE_ENV=production` and the same env vars as `.env.example`. SQLite is fine for a single instance; switch Prisma to Postgres if you run more than one replica.

## Still needs a real store

You cannot fully test post-purchase charging in this workspace:

- Partner login, app client ID/secret, and `shopify app dev` linking
- A Plus or checkout-extensibility development store
- Shopify Payments (or Bogus gateway) test checkout
- Post-purchase access request for live stores
- Confirming that accept adds the line item and captures the original card

## License

MIT (from the official Shopify React Router app template).
