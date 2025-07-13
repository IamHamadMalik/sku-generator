import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";

// ✅ Polaris
import { AppProvider, Page, Card, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

// ✅ ADD A LOADER to get the current value
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const counter = await prisma.storeCounter.findUnique({
    where: { shop },
  });

  return json({ currentSku: counter?.currentSku || "" });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = session.shop;
  const baseNumber = parseInt(formData.get("baseNumber"));

  if (isNaN(baseNumber)) {
    return json({ success: false, message: "Invalid number" });
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
      <Page title="Set Starting SKU Number">
        <Card sectioned>
          <fetcher.Form method="post">
            <TextField
              label="Starting SKU Number"
              value={number}
              onChange={setNumber}
              type="number"
              name="baseNumber"
              // ✅ ADDED: Display the "LA" prefix in the input field.
              prefix="LA"
            />
            <Button submit primary>
              Set SKU Number
            </Button>
          </fetcher.Form>
          {/* ✅ MODIFIED: Make the success message clearer. */}
          {fetcher.data?.success && (
            <p>
              SKU number updated. New SKUs will start from: LA{fetcher.data.currentSku}
            </p>
          )}
        </Card>
      </Page>
    </AppProvider>
  );
}