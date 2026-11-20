import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Shopify Payments post-purchase upsell</h1>
        <p className={styles.text}>
          Offer one extra product after payment. Accept charges the same Shopify
          Payments method; decline continues to the thank-you page.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>One-product offer.</strong> Merchants pick a product, optional
            discount, and copy in the embedded admin.
          </li>
          <li>
            <strong>Same payment method.</strong> Accept adds the item and charges
            the Shopify Payments card already used.
          </li>
          <li>
            <strong>Checkout extensibility.</strong> Requires a Plus or development
            store with post-purchase extensions enabled.
          </li>
        </ul>
      </div>
    </div>
  );
}
