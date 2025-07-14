import { Page, Layout } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="SKU Generator" />
      <Layout>
        <Layout.Section>
          {/* Main content for your SKU Generator will go here */}
          <p>Welcome to SKU Generator. Use the navigation to manage your SKU settings.</p>
        </Layout.Section>
      </Layout>
    </Page>
  );
}