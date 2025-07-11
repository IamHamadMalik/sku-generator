import { json } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { authenticate } from "/shopify.server";
import { useFetcher } from "@remix-run/react";
import { useState } from "react";

// ✅ Polaris
import { AppProvider, Page, Card, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

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
  const fetcher = useFetcher();
  const [number, setNumber] = useState("");

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
            />
            <Button submit primary>
              Set SKU Number
            </Button>
          </fetcher.Form>
          {fetcher.data?.success && (
            <p>SKU number updated to: {fetcher.data.currentSku}</p>
          )}
        </Card>
      </Page>
    </AppProvider>
  );
}
