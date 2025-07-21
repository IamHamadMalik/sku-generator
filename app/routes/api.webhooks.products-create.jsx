import { json } from "@remix-run/node";
import prisma from "../db.server";
import { shopifyApiClient, authenticate } from "../shopify.server";

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
    const { shop, payload } = await authenticate.webhook(request);
    console.log(`✅ Received PRODUCTS_CREATE webhook for shop: ${shop}`);
    
    const product = payload;

    const existingSkus = await prisma.productSKU.findFirst({
      where: {
        shop,
        productId: String(product.id),
      },
    });

    if (existingSkus) {
      console.log(`✅ SKUs already generated for product ${product.id}. Skipping.`);
      return json({ status: "skipped", message: "SKUs already exist for this product." });
    }

    const session = await prisma.session.findFirst({
      where: { shop, isOnline: false },
    });

    if (!session || !session.accessToken) {
      throw new Error(`❌ No valid session for shop ${shop}`);
    }
    const accessToken = session.accessToken;

    const admin = new shopifyApiClient.clients.Graphql({
      session: { shop, accessToken },
    });
    
    const variants = product.variants || [];
    if (variants.length === 0) {
      console.error("❌ No variants found in product payload");
      return json({ status: "error", message: "No variants found" }, { status: 400 });
    }

    const storeCounter = await prisma.storeCounter.findUnique({ where: { shop } });
    if (!storeCounter) {
      throw new Error(`❌ StoreCounter not initialized for shop ${shop}`);
    }

    const availableSkuNumbers = [];
    let nextSkuToTry = storeCounter.currentSku;

    // Check which variants need new SKUs
    const variantsToUpdate = [];
    for (const variant of variants) {
      if (variant.sku && variant.sku.startsWith(SKU_PREFIX)) {
        const skuNumber = parseInt(variant.sku.replace(SKU_PREFIX, ""));
        if (!isNaN(skuNumber)) {
          availableSkuNumbers.push(skuNumber);
          await prisma.productSKU.create({
            data: {
              shop,
              productId: String(product.id),
              variantId: String(variant.id),
              skuNumber,
            },
          });
          continue;
        }
      }
      variantsToUpdate.push(variant);
    }

    // Generate SKUs for variants that need them
    while (availableSkuNumbers.length < variants.length) {
      const fullSkuToCheck = `${SKU_PREFIX}${nextSkuToTry}`;
      const skuExistsResponse = await admin.query({
        data: {
          query: SKU_EXISTS_QUERY,
          variables: { query: `sku:${fullSkuToCheck}` },
        },
      });

      if (skuExistsResponse.body.data.productVariants.edges.length === 0) {
        availableSkuNumbers.push(nextSkuToTry);
      }
      nextSkuToTry++;
    }

    // ... (rest of the webhook logic for updating variants and counter)
  } catch (error) {
    console.error(`❌ Error in PRODUCTS_CREATE webhook: ${error.message}`);
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};
