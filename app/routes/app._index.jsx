import { Page, Layout, Card, Heading, Text, List } from "@shopify/polaris";
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
          <Card sectioned>
            <Heading element="h1" variant="headingXl">
              Welcome to SKU Generator
            </Heading>
            <Text variant="bodyMd" as="p" color="subdued">
              Automate your product SKU generation with our powerful tool. Follow the instructions below to get started.
            </Text>
          </Card>

          <Card sectioned>
            <Heading element="h2" variant="headingLg">
              How to Use SKU Generator
            </Heading>
            
            <List type="number">
              <List.Item>
                <Text variant="bodyMd" fontWeight="bold">
                  Configure Starting SKU
                </Text>
                <Text variant="bodyMd" as="p">
                  Navigate to "Set SKU Number" and enter your desired starting number in the field provided.
                </Text>
              </List.Item>
              
              <List.Item>
                <Text variant="bodyMd" fontWeight="bold">
                  Save Settings
                </Text>
                <Text variant="bodyMd" as="p">
                  Click "Save Settings" to store your SKU configuration.
                </Text>
              </List.Item>
              
              <List.Item>
                <Text variant="bodyMd" fontWeight="bold">
                  Create Products
                </Text>
                <Text variant="bodyMd" as="p">
                  Generate products with at least one variant in your Shopify admin.
                </Text>
              </List.Item>
              
              <List.Item>
                <Text variant="bodyMd" fontWeight="bold">
                  Automatic SKU Assignment
                </Text>
                <Text variant="bodyMd" as="p">
                  New variants will automatically receive SKUs with the "LA" prefix (e.g., LA123456).
                </Text>
              </List.Item>
              
              <List.Item>
                <Text variant="bodyMd" fontWeight="bold">
                  Sequential Numbering
                </Text>
                <Text variant="bodyMd" as="p">
                  Each new product variant will receive the next sequential number in your SKU sequence.
                </Text>
              </List.Item>
            </List>
          </Card>

          <Card sectioned>
            <Heading element="h2" variant="headingLg">
              Best Practices
            </Heading>
            <List>
              <List.Item>
                Start with a number high enough to accommodate future product growth
              </List.Item>
              <List.Item>
                Use the same SKU sequence for all products to maintain consistency
              </List.Item>
            </List>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}