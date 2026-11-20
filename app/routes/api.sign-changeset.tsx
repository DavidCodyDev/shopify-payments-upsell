import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import jwt from "jsonwebtoken";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  getSignedOfferChanges,
  logUpsellEvent,
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
  const body = await request.json();
  const referenceId = String(body?.referenceId || "");

  let changes = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    changes = await getSignedOfferChanges(shop, admin);
  } catch (error) {
    console.error("Failed to price post-purchase offer", error);
  }
  if (!changes) {
    return cors(
      Response.json({ error: "No active offer to apply" }, { status: 400 }),
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return cors(
      Response.json({ error: "App credentials are not configured" }, { status: 500 }),
    );
  }

  const payload = {
    iss: apiKey,
    jti: crypto.randomUUID(),
    iat: Date.now(),
    sub: referenceId,
    changes,
  };

  const token = jwt.sign(payload, apiSecret);
  await logUpsellEvent(shop, referenceId, "accept");
  return cors(Response.json({ token }));
};
