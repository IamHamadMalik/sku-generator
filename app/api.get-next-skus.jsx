import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { shopifyApiClient } from "../shopify.server";

const SKU_PREFIX = "LA";

const SKU_EXISTS_QUERY = `
  query skuExists($query: String!) {
    productVariants(first: 1, query: $query) {
      edges {
        node {
          id
          sku
        }
      }
    }
  }
`;

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const count = parseInt(formData.get("count") || "1");

    const storeCounter = await prisma.storeCounter.findUnique({ where: { shop } });
    if (!storeCounter) {
      throw new Error(`StoreCounter not initialized for shop ${shop}`);
    }

    const admin = new shopifyApiClient.clients.Graphql({
      session: { shop, accessToken: session.accessToken },
    });

    const availableSkus = [];
    let nextSkuToTry = storeCounter.currentSku;

    while (availableSkus.length < count) {
      const fullSkuToCheck = `${SKU_PREFIX}${nextSkuToTry}`;
      const skuExistsResponse = await admin.query({
        data: {
          query: SKU_EXISTS_QUERY,
          variables: { query: `sku:${fullSkuToCheck}` },
        },
      });

      if (skuExistsResponse.body.data.productVariants.edges.length === 0) {
        availableSkus.push(fullSkuToCheck);
      }
      nextSkuToTry++;
    }

    return json({ success: true, skus: availableSkus });
  } catch (error) {
    console.error(`Error fetching next SKUs: ${error.message}`);
    return json({ success: false, message: error.message }, { status: 500 });
  }
};