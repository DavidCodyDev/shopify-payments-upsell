import prisma from "./db.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: { id: string } },
  ) => Promise<Response>;
};

export const DEFAULT_OFFER_TITLE =
  "It's not too late to add this to your order";
export const DEFAULT_OFFER_BODY =
  "Add this product to your order. You'll be charged with the same payment method.";

export type UpsellOfferRecord = {
  shop: string;
  enabled: boolean;
  productId: string | null;
  variantId: string | null;
  variantLegacyId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  productDescription: string | null;
  discountPercent: number;
  offerTitle: string;
  offerBody: string;
};

export type ChangesetChange = {
  type: "add_variant";
  variantID: number;
  quantity: number;
  discount?: {
    value: number;
    valueType: "percentage";
    title: string;
  };
};

export type PostPurchaseOffer = {
  id: string;
  title: string;
  productTitle: string;
  productImageURL: string;
  productDescription: string[];
  originalPrice: string;
  changes: ChangesetChange[];
};

type CheckoutAuth = {
  sessionToken?: { dest?: string };
  session?: { shop?: string };
};

type ProductLookup = {
  productId: string;
  variantId: string;
  variantLegacyId: string;
  productTitle: string;
  productImageUrl: string;
  productDescription: string;
  price: string;
  availableForSale: boolean;
};

const PRODUCT_QUERY = `#graphql
  query UpsellOfferProduct($id: ID!) {
    product(id: $id) {
      id
      title
      description
      featuredMedia {
        preview {
          image {
            url
          }
        }
      }
      variants(first: 25) {
        nodes {
          id
          title
          price
          availableForSale
          legacyResourceId
          image {
            url
          }
        }
      }
    }
  }
`;

export function shopFromCheckoutAuth(auth: CheckoutAuth): string {
  if (auth.session?.shop) {
    return auth.session.shop;
  }

  const dest = auth.sessionToken?.dest;
  if (!dest) {
    throw new Error("Checkout session token is missing shop destination");
  }

  return dest.replace(/^https?:\/\//, "").split("/")[0];
}

export async function getOffer(shop: string): Promise<UpsellOfferRecord> {
  const existing = await prisma.upsellOffer.findUnique({ where: { shop } });
  if (existing) {
    return existing;
  }

  return {
    shop,
    enabled: false,
    productId: null,
    variantId: null,
    variantLegacyId: null,
    productTitle: null,
    productImageUrl: null,
    productDescription: null,
    discountPercent: 0,
    offerTitle: DEFAULT_OFFER_TITLE,
    offerBody: DEFAULT_OFFER_BODY,
  };
}

export async function saveOffer(
  shop: string,
  data: Omit<UpsellOfferRecord, "shop">,
): Promise<UpsellOfferRecord> {
  return prisma.upsellOffer.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}

export async function deleteShopData(shop: string) {
  await prisma.upsellEvent.deleteMany({ where: { shop } });
  await prisma.upsellOffer.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
}

export async function logUpsellEvent(
  shop: string,
  referenceId: string,
  action: "shown" | "accept" | "decline" | "skip",
) {
  await prisma.upsellEvent.create({
    data: { shop, referenceId, action },
  });
}

export function buildChanges(
  variantLegacyId: string,
  discountPercent: number,
): ChangesetChange[] {
  const change: ChangesetChange = {
    type: "add_variant",
    variantID: Number(variantLegacyId),
    quantity: 1,
  };

  if (discountPercent > 0) {
    change.discount = {
      value: discountPercent,
      valueType: "percentage",
      title: `${discountPercent}% off`,
    };
  }

  return [change];
}

function descriptionLines(text: string | null | undefined): string[] {
  if (!text?.trim()) {
    return [];
  }
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function lookupProduct(
  admin: AdminGraphqlClient,
  productId: string,
  preferredVariantId?: string | null,
): Promise<ProductLookup | null> {
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  });
  const json = (await response.json()) as {
    data?: {
      product?: {
        id: string;
        title: string;
        description?: string | null;
        featuredMedia?: {
          preview?: { image?: { url?: string } | null } | null;
        } | null;
        variants?: {
          nodes?: Array<{
            id: string;
            title: string;
            price: string;
            availableForSale: boolean;
            legacyResourceId: string;
            image?: { url?: string } | null;
          }>;
        };
      } | null;
    };
  };
  const product = json.data?.product;
  if (!product) {
    return null;
  }

  const variants: Array<{
    id: string;
    title: string;
    price: string;
    availableForSale: boolean;
    legacyResourceId: string;
    image?: { url?: string } | null;
  }> = product.variants?.nodes ?? [];

  const variant =
    variants.find((item) => item.id === preferredVariantId) ??
    variants.find((item) => item.availableForSale) ??
    variants[0];

  if (!variant?.legacyResourceId) {
    return null;
  }

  return {
    productId: product.id,
    variantId: variant.id,
    variantLegacyId: String(variant.legacyResourceId),
    productTitle: product.title,
    productImageUrl:
      variant.image?.url || product.featuredMedia?.preview?.image?.url || "",
    productDescription: product.description || "",
    price: variant.price,
    availableForSale: Boolean(variant.availableForSale),
  };
}

export async function getPostPurchaseOffers({
  admin,
  shop,
  referenceId,
  purchasedVariantIds = [],
}: {
  admin: AdminGraphqlClient;
  shop: string;
  referenceId: string;
  purchasedVariantIds?: string[];
}): Promise<PostPurchaseOffer[]> {
  const offer = await getOffer(shop);
  if (!offer.enabled || !offer.productId) {
    await logUpsellEvent(shop, referenceId, "skip");
    return [];
  }

  const product = await lookupProduct(admin, offer.productId, offer.variantId);
  if (!product?.availableForSale) {
    await logUpsellEvent(shop, referenceId, "skip");
    return [];
  }

  const alreadyPurchased = purchasedVariantIds.some((id) => {
    const numericId = id.includes("/") ? id.split("/").pop() : id;
    return (
      id === product.variantId ||
      numericId === product.variantLegacyId ||
      id === product.variantLegacyId
    );
  });
  if (alreadyPurchased) {
    await logUpsellEvent(shop, referenceId, "skip");
    return [];
  }

  const title = offer.offerTitle || DEFAULT_OFFER_TITLE;
  const body = offer.offerBody || product.productDescription || DEFAULT_OFFER_BODY;
  await logUpsellEvent(shop, referenceId, "shown");

  return [
    {
      id: "default",
      title,
      productTitle: product.productTitle,
      productImageURL: product.productImageUrl,
      productDescription: descriptionLines(body).length
        ? descriptionLines(body)
        : [body],
      originalPrice: product.price,
      changes: buildChanges(product.variantLegacyId, offer.discountPercent),
    },
  ];
}

export async function getSignedOfferChanges(
  shop: string,
  admin?: AdminGraphqlClient,
) {
  const offer = await getOffer(shop);
  if (!offer.enabled || !offer.productId) {
    return null;
  }

  if (admin) {
    const product = await lookupProduct(admin, offer.productId, offer.variantId);
    if (!product?.availableForSale) {
      return null;
    }
    return buildChanges(product.variantLegacyId, offer.discountPercent);
  }

  if (!offer.variantLegacyId) {
    return null;
  }

  return buildChanges(offer.variantLegacyId, offer.discountPercent);
}
