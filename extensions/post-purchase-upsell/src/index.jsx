import { useEffect, useState } from "react";
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  Text,
  TextContainer,
  Separator,
  Tiles,
  TextBlock,
  Layout,
} from "@shopify/post-purchase-ui-extensions-react";

// Shopify CLI inlines SHOPIFY_APP_URL at build time from `.env` / `shopify app dev`.
const APP_URL = process.env.SHOPIFY_APP_URL;

extend("Checkout::PostPurchase::ShouldRender", async ({ inputData, storage }) => {
  if (!APP_URL) {
    return { render: false };
  }

  try {
    const postPurchaseOffer = await fetch(`${APP_URL}/api/offer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inputData.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        referenceId: inputData.initialPurchase.referenceId,
        lineItems: (inputData.initialPurchase.lineItems || []).map((item) => ({
          variantId: item.variantId || item.product?.id,
        })),
      }),
    }).then((response) => response.json());

    const offers = postPurchaseOffer?.offers || [];
    await storage.update({ offers });
    return { render: offers.length > 0 };
  } catch (error) {
    console.log("Failed to load post-purchase offer", error);
    return { render: false };
  }
});

render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  const [loading, setLoading] = useState(true);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [error, setError] = useState("");

  const { offers } = storage.initialData || { offers: [] };
  const purchaseOption = offers?.[0];

  useEffect(() => {
    async function calculatePurchase() {
      if (!purchaseOption?.changes) {
        setLoading(false);
        return;
      }

      const result = await calculateChangeset({
        changes: purchaseOption.changes,
      });
      setCalculatedPurchase(result.calculatedPurchase);
      setLoading(false);
    }

    calculatePurchase();
  }, [calculateChangeset, purchaseOption?.changes]);

  if (!purchaseOption) {
    return (
      <BlockStack spacing="loose">
        <CalloutBanner title="No offer available">
          <TextBlock>Continue to your order confirmation.</TextBlock>
        </CalloutBanner>
        <Button onPress={() => done()} submit>
          Continue
        </Button>
      </BlockStack>
    );
  }

  const shipping =
    calculatedPurchase?.addedShippingLines?.[0]?.priceSet?.presentmentMoney
      ?.amount;
  const taxes =
    calculatedPurchase?.addedTaxLines?.[0]?.priceSet?.presentmentMoney?.amount;
  const total =
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.amount;
  const currency =
    calculatedPurchase?.totalOutstandingSet?.presentmentMoney?.currencyCode ||
    "USD";
  const discountedPrice =
    calculatedPurchase?.updatedLineItems?.[0]?.totalPriceSet?.presentmentMoney
      ?.amount;
  const originalPrice =
    calculatedPurchase?.updatedLineItems?.[0]?.priceSet?.presentmentMoney
      ?.amount || purchaseOption.originalPrice;
  const discountTitle = purchaseOption.changes?.[0]?.discount?.title;

  async function acceptOffer() {
    setLoading(true);
    setError("");

    try {
      const token = await fetch(`${APP_URL}/api/sign-changeset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${inputData.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceId: inputData.initialPurchase.referenceId,
          changes: purchaseOption.id,
        }),
      })
        .then((response) => response.json())
        .then((response) => response.token);

      if (!token) {
        throw new Error("Missing changeset token");
      }

      await applyChangeset(token);
      done();
    } catch (acceptError) {
      console.log(acceptError);
      setError("Could not add this item. You can decline and continue.");
      setLoading(false);
    }
  }

  async function declineOffer() {
    setLoading(true);
    try {
      await fetch(`${APP_URL}/api/decline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${inputData.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceId: inputData.initialPurchase.referenceId,
        }),
      });
    } catch (declineError) {
      console.log(declineError);
    }
    done();
  }

  return (
    <BlockStack spacing="loose">
      <CalloutBanner>
        <BlockStack spacing="tight">
          <TextContainer>
            <Text size="medium" emphasized>
              {purchaseOption.title}
            </Text>
          </TextContainer>
          <TextContainer>
            <Text size="medium">
              Add the {purchaseOption.productTitle} to your order
              {discountTitle ? " and " : "."}
            </Text>
            {discountTitle ? (
              <Text size="medium" emphasized>
                {discountTitle}
              </Text>
            ) : null}
          </TextContainer>
        </BlockStack>
      </CalloutBanner>
      <Layout
        media={[
          { viewportSize: "small", sizes: [1, 0, 1], maxInlineSize: 0.9 },
          { viewportSize: "medium", sizes: [532, 0, 1], maxInlineSize: 420 },
          { viewportSize: "large", sizes: [560, 38, 340] },
        ]}
      >
        <Image
          description={purchaseOption.productTitle}
          source={
            purchaseOption.productImageURL ||
            "https://cdn.shopify.com/static/images/examples/img-placeholder-1120x1120.png"
          }
        />
        <BlockStack />
        <BlockStack>
          <Heading>{purchaseOption.productTitle}</Heading>
          <PriceHeader
            discountedPrice={discountedPrice}
            originalPrice={originalPrice}
            currency={currency}
            loading={!calculatedPurchase}
          />
          <ProductDescription textLines={purchaseOption.productDescription} />
          <BlockStack spacing="tight">
            <Separator />
            <MoneyLine
              label="Subtotal"
              amount={discountedPrice}
              currency={currency}
              loading={!calculatedPurchase}
            />
            <MoneyLine
              label="Shipping"
              amount={shipping}
              currency={currency}
              loading={!calculatedPurchase}
            />
            <MoneyLine
              label="Taxes"
              amount={taxes}
              currency={currency}
              loading={!calculatedPurchase}
            />
            <Separator />
            <MoneySummary label="Total" amount={total} currency={currency} />
          </BlockStack>
          {error ? (
            <TextContainer>
              <Text appearance="critical">{error}</Text>
            </TextContainer>
          ) : null}
          <BlockStack>
            <Button onPress={acceptOffer} submit loading={loading}>
              Pay now · {formatCurrency(total, currency)}
            </Button>
            <Button onPress={declineOffer} subdued loading={loading}>
              Decline this offer
            </Button>
          </BlockStack>
        </BlockStack>
      </Layout>
    </BlockStack>
  );
}

function PriceHeader({ discountedPrice, originalPrice, currency, loading }) {
  const showOriginal =
    originalPrice &&
    discountedPrice &&
    Number(originalPrice) !== Number(discountedPrice);

  return (
    <TextContainer alignment="leading" spacing="loose">
      {showOriginal ? (
        <Text role="deletion" size="large">
          {!loading && formatCurrency(originalPrice, currency)}
        </Text>
      ) : null}
      <Text emphasized size="large" appearance="critical">
        {" "}
        {!loading && formatCurrency(discountedPrice, currency)}
      </Text>
    </TextContainer>
  );
}

function ProductDescription({ textLines }) {
  if (!textLines?.length) {
    return null;
  }

  return (
    <BlockStack spacing="xtight">
      {textLines.map((text, index) => (
        <TextBlock key={index} subdued>
          {text}
        </TextBlock>
      ))}
    </BlockStack>
  );
}

function MoneyLine({ label, amount, currency, loading = false }) {
  return (
    <Tiles>
      <TextBlock size="small">{label}</TextBlock>
      <TextContainer alignment="trailing">
        <TextBlock emphasized size="small">
          {loading ? "-" : formatCurrency(amount, currency)}
        </TextBlock>
      </TextContainer>
    </Tiles>
  );
}

function MoneySummary({ label, amount, currency }) {
  return (
    <Tiles>
      <TextBlock size="medium" emphasized>
        {label}
      </TextBlock>
      <TextContainer alignment="trailing">
        <TextBlock emphasized size="medium">
          {formatCurrency(amount, currency)}
        </TextBlock>
      </TextContainer>
    </Tiles>
  );
}

function formatCurrency(amount, currency = "USD") {
  if (amount === undefined || amount === null || Number(amount) === 0) {
    return "Free";
  }

  const numeric = Number(amount);
  if (Number.isNaN(numeric)) {
    return String(amount);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}
