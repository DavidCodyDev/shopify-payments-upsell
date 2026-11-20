import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_OFFER_BODY,
  DEFAULT_OFFER_TITLE,
  getOffer,
  lookupProduct,
  saveOffer,
} from "../offer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getOffer(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();

  const enabled = String(form.get("enabled") || "") === "true";
  const productId = String(form.get("productId") || "").trim();
  const variantId = String(form.get("variantId") || "").trim();
  const offerTitle =
    String(form.get("offerTitle") || "").trim() || DEFAULT_OFFER_TITLE;
  const offerBody =
    String(form.get("offerBody") || "").trim() || DEFAULT_OFFER_BODY;
  const discountPercent = Math.min(
    100,
    Math.max(0, Math.round(Number(form.get("discountPercent") || 0) || 0)),
  );

  if (enabled && !productId) {
    return { ok: false, error: "Pick a product before enabling the offer." };
  }

  let productTitle: string | null = null;
  let productImageUrl: string | null = null;
  let productDescription: string | null = null;
  let resolvedVariantId: string | null = variantId || null;
  let variantLegacyId: string | null = null;

  if (productId) {
    const product = await lookupProduct(admin, productId, resolvedVariantId);
    if (!product) {
      return { ok: false, error: "Could not load that product. Pick another one." };
    }
    productTitle = product.productTitle;
    productImageUrl = product.productImageUrl;
    productDescription = product.productDescription;
    resolvedVariantId = product.variantId;
    variantLegacyId = product.variantLegacyId;
  }

  await saveOffer(session.shop, {
    enabled,
    productId: productId || null,
    variantId: resolvedVariantId,
    variantLegacyId,
    productTitle,
    productImageUrl,
    productDescription,
    discountPercent,
    offerTitle,
    offerBody,
  });

  return { ok: true };
};

type PickedProduct = {
  productId: string;
  variantId: string;
  title: string;
  image: string;
};

function pickedFromOffer(offer: {
  productId: string | null;
  variantId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
}): PickedProduct | null {
  if (!offer.productId) {
    return null;
  }
  return {
    productId: offer.productId,
    variantId: offer.variantId || "",
    title: offer.productTitle || "Selected product",
    image: offer.productImageUrl || "",
  };
}

export default function Index() {
  const offer = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Offer saved");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  return (
    <OfferForm
      key={[
        offer.enabled,
        offer.productId,
        offer.variantId,
        offer.offerTitle,
        offer.offerBody,
        offer.discountPercent,
      ].join("|")}
      offer={offer}
      error={actionData?.error}
    />
  );
}

function OfferForm({
  offer,
  error,
}: {
  offer: Awaited<ReturnType<typeof loader>>;
  error?: string;
}) {
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [enabled, setEnabled] = useState(offer.enabled);
  const [offerTitle, setOfferTitle] = useState(offer.offerTitle);
  const [offerBody, setOfferBody] = useState(offer.offerBody);
  const [discountPercent, setDiscountPercent] = useState(
    String(offer.discountPercent),
  );
  const [product, setProduct] = useState<PickedProduct | null>(
    pickedFromOffer(offer),
  );

  const isSaving = navigation.state === "submitting";

  async function pickProduct() {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: false,
      action: "select",
      filter: { variants: true, draft: false, archived: false },
      selectionIds: product?.productId
        ? [
            {
              id: product.productId,
              ...(product.variantId
                ? { variants: [{ id: product.variantId }] }
                : {}),
            },
          ]
        : undefined,
    });

    if (!selected || selected.length === 0) {
      return;
    }

    const picked = selected[0] as {
      id: string;
      title: string;
      images?: Array<{ originalSrc?: string; url?: string }>;
      variants?: Array<{ id: string }>;
    };
    const variant = picked.variants?.[0];
    setProduct({
      productId: picked.id,
      variantId: variant?.id || "",
      title: picked.title,
      image: picked.images?.[0]?.originalSrc || picked.images?.[0]?.url || "",
    });
  }

  return (
    <s-page heading="Post-purchase upsell">
      <s-banner heading="Checkout extensibility required" tone="warning">
        This offer appears after payment and charges the same Shopify Payments
        method. It only runs on stores with checkout extensibility (Shopify Plus
        or a development store with checkout extensions). Post-purchase
        extensions are in beta; live stores need access from the Dev Dashboard.
      </s-banner>

      {error ? (
        <s-banner heading="Could not save" tone="critical">
          {error}
        </s-banner>
      ) : null}

      <Form method="post" data-save-bar>
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
        <input type="hidden" name="productId" value={product?.productId || ""} />
        <input type="hidden" name="variantId" value={product?.variantId || ""} />

        <s-section heading="Offer">
          <s-stack direction="block" gap="base">
            <s-switch
              label="Enable post-purchase offer"
              checked={enabled}
              onChange={(event: Event) => {
                const target = event.currentTarget as HTMLElement & {
                  checked?: boolean;
                };
                setEnabled(Boolean(target.checked));
              }}
            />
            <s-paragraph>
              Buyers who pay with Shopify Payments see this one-product offer
              after checkout. Accept adds the item and charges the card already
              used. Decline continues to the thank-you page.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Product">
          <s-stack direction="block" gap="base">
            {product ? (
              <s-stack direction="inline" gap="base">
                {product.image ? (
                  <img
                    src={product.image}
                    alt=""
                    width={64}
                    height={64}
                    style={{
                      borderRadius: 8,
                      objectFit: "cover",
                      background: "#f1f1f1",
                    }}
                  />
                ) : null}
                <s-stack direction="block" gap="none">
                  <s-text>{product.title}</s-text>
                  <s-text color="subdued">
                    {product.variantId
                      ? "First or selected variant will be offered"
                      : "The first available variant will be offered"}
                  </s-text>
                </s-stack>
              </s-stack>
            ) : (
              <s-paragraph>No product selected yet.</s-paragraph>
            )}
            <s-stack direction="inline" gap="base">
              <s-button onClick={pickProduct} variant="secondary">
                {product ? "Change product" : "Pick a product"}
              </s-button>
              {product ? (
                <s-button
                  variant="tertiary"
                  onClick={() => setProduct(null)}
                  tone="critical"
                >
                  Clear
                </s-button>
              ) : null}
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Copy and discount">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Offer title"
              name="offerTitle"
              value={offerTitle}
              details="Shown in the post-purchase banner."
              onInput={(event: Event) => {
                setOfferTitle(
                  (event.currentTarget as HTMLInputElement).value,
                );
              }}
            />
            <s-text-area
              label="Offer body"
              name="offerBody"
              value={offerBody}
              rows={3}
              details="Short description under the product title."
              onInput={(event: Event) => {
                setOfferBody((event.currentTarget as HTMLTextAreaElement).value);
              }}
            />
            <s-number-field
              label="Discount percent"
              name="discountPercent"
              min={0}
              max={100}
              value={discountPercent}
              suffix="%"
              details="Optional. Use 0 for no discount."
              onInput={(event: Event) => {
                setDiscountPercent(
                  (event.currentTarget as HTMLInputElement).value,
                );
              }}
            />
          </s-stack>
        </s-section>

        <s-section>
          <s-button
            type="submit"
            variant="primary"
            {...(isSaving ? { loading: true } : {})}
          >
            Save offer
          </s-button>
        </s-section>
      </Form>

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>
            Payment succeeds with Shopify Payments, Shop Pay, or the Bogus
            gateway in development.
          </s-list-item>
          <s-list-item>
            The post-purchase extension asks this app for the offer and shows
            accept or decline.
          </s-list-item>
          <s-list-item>
            Accept signs a changeset on the server and charges the same payment
            method.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
