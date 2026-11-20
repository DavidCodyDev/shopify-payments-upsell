import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logUpsellEvent, shopFromCheckoutAuth } from "../offer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authenticate.public.checkout(request);
  const { cors } = auth;
  const shop = shopFromCheckoutAuth(auth);
  const body = await request.json().catch(() => ({}));
  const referenceId = String(body?.referenceId || "");

  await logUpsellEvent(shop, referenceId, "decline");
  return cors(Response.json({ ok: true }));
};
