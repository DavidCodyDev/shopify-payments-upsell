import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  getPostPurchaseOffers,
  shopFromCheckoutAuth,
} from "../offer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authenticate.public.checkout(request);
  const { cors } = auth;
  const shop = shopFromCheckoutAuth(auth);

  let referenceId = "";
  let purchasedVariantIds: string[] = [];
  try {
    const body = await request.json();
    referenceId = String(body?.referenceId || "");
    const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];
    purchasedVariantIds = lineItems
      .map((item: { variantId?: string; product?: { id?: string } }) =>
        String(item?.variantId || item?.product?.id || ""),
      )
      .filter(Boolean);
  } catch {
    purchasedVariantIds = [];
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const offers = await getPostPurchaseOffers({
      admin,
      shop,
      referenceId,
      purchasedVariantIds,
    });
    return cors(Response.json({ offers }));
  } catch (error) {
    console.error("Failed to load post-purchase offer", error);
    return cors(Response.json({ offers: [] }));
  }
};
