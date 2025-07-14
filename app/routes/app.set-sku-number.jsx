import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  AppProvider,
  Page,
  Card,
  TextField,
  Button,
  Banner,
  Layout
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const counter = await prisma.storeCounter.findUnique({
    where: { shop },
  });

  return json({ currentSku: counter?.currentSku || 1000 }); // Default to 1000 if not set
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = session.shop;
  const baseNumber = parseInt(formData.get("baseNumber"));

  if (isNaN(baseNumber)) {
    return json({ success: false, message: "Please enter a valid number" });
  }

  await prisma.storeCounter.upsert({
    where: { shop },
    update: { currentSku: baseNumber },
    create: { shop, currentSku: baseNumber },
  });

  return json({ success: true, currentSku: baseNumber });
};

export default function SetSkuNumber() {
  const { currentSku } = useLoaderData();
  const fetcher = useFetcher();
  const [number, setNumber] = useState(currentSku);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="SKU Number Settings">
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <fetcher.Form method="post">
                <TextField
                  label="Starting SKU Number"
                  value={number}
                  onChange={setNumber}
                  type="number"
                  name="baseNumber"
                  prefix="LA"
                  autoComplete="off"
                  min="1"
                />
                <div style={{ marginTop: '16px' }}>
                  <Button submit primary>
                    Save Settings
                  </Button>
                </div>
              </fetcher.Form>
              
              {fetcher.data?.success && (
                <Banner
                  title="Success"
                  status="success"
                  onDismiss={() => {}}
                >
                  SKU settings saved successfully. New products will use SKUs starting from: LA{fetcher.data.currentSku}
                </Banner>
              )}

              {fetcher.data?.success === false && (
                <Banner
                  title="Error"
                  status="critical"
                  onDismiss={() => {}}
                >
                  {fetcher.data.message}
                </Banner>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}