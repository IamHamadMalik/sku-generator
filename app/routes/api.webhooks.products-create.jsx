import { json } from "@remix-run/node";
import prisma from "../db.server";
import { shopifyApiClient, authenticate } from "../shopify.server";

// Define your prefix as a constant for easy access and modification.
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

    console.log(`✅ Payload: ${JSON.stringify(payload)}`);
    
    const session = await prisma.session.findFirst({
      where: { shop, isOnline: false },
    });

    if (!session || !session.accessToken) {
      throw new Error(`❌ No valid session for shop ${shop}`);
    }
    const accessToken = session.accessToken;
    console.log(`✅ Access token found: ${accessToken.slice(0, 8)}...`);

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
    
    // =======================================================================
    // ✅ MODIFIED: SKU UNIQUENESS VALIDATION LOGIC
    // =======================================================================
    const skusNeeded = variants.length;
    const availableSkuNumbers = []; // Stores only the available *numbers*.
    let nextSkuToTry = storeCounter.currentSku;

    console.log(`🔍 Searching for ${skusNeeded} unique SKUs, starting from ${SKU_PREFIX}${nextSkuToTry}...`);

    while (availableSkuNumbers.length < skusNeeded) {
      // Construct the full SKU with the prefix for checking.
      const fullSkuToCheck = `${SKU_PREFIX}${nextSkuToTry}`;
      
      const skuExistsResponse = await admin.query({
        data: {
          query: SKU_EXISTS_QUERY,
          // Use the full, prefixed SKU in the query.
          variables: { query: `sku:${fullSkuToCheck}` },
        },
      });

      const variantsWithSku = skuExistsResponse.body.data.productVariants.edges;

      if (variantsWithSku.length === 0) {
        console.log(`👍 SKU ${fullSkuToCheck} is available.`);
        // Add the available *number* to our list.
        availableSkuNumbers.push(nextSkuToTry);
      } else {
        console.log(`👎 SKU ${fullSkuToCheck} is already in use. Skipping.`);
      }
      
      nextSkuToTry++;
    }

    console.log(`✅ Found ${skusNeeded} unique SKU numbers: ${availableSkuNumbers.join(', ')}`);

    // =======================================================================
    // ✅ MODIFIED: Assign the guaranteed-unique SKUs to the variants.
    // =======================================================================
    const graphqlVariants = variants.map((variant, i) => ({
      id: `gid://shopify/ProductVariant/${variant.id}`,
      metafields: [
        {
          namespace: "custom",
          key: "generated_sku",
          // Prepend the prefix to the unique number before assigning.
          value: `${SKU_PREFIX}${availableSkuNumbers[i]}`,
          type: "single_line_text_field",
        },
      ],
    }));

    const productGID = `gid://shopify/Product/${product.id}`;
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product { id }
          userErrors { field message }
        }
      }
    `;

    const graphqlResponse = await admin.query({
      data: {
        query: mutation,
        variables: {
          productId: productGID,
          variants: graphqlVariants,
        },
      },
    });

    const { userErrors } = graphqlResponse.body.data.productVariantsBulkUpdate;

    if (userErrors.length > 0) {
      console.error("❌ Shopify GraphQL userErrors:", userErrors);
    } else {
      console.log("✅ Metafields added to all variants");
    }

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const newSkuNumber = availableSkuNumbers[i];
      // Construct the full SKU for the REST API update.
      const fullNewSku = `${SKU_PREFIX}${newSkuNumber}`;

      const restResponse = await fetch(
        `https://${shop}/admin/api/2024-07/variants/${variant.id}.json`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            variant: {
              id: variant.id,
              // Use the full, prefixed SKU.
              sku: fullNewSku,
            },
          }),
        }
      );

      if (restResponse.ok) {
        console.log(`✅ Native SKU ${fullNewSku} updated for variant ${variant.id}`);
      } else {
        const errorText = await restResponse.text();
        console.error(`❌ Failed to update native SKU for variant ${variant.id}: ${errorText}`);
      }

      await prisma.productSKU.create({
        data: {
          shop,
          productId: String(product.id),
          variantId: String(variant.id),
          // Store only the number, maintaining data consistency.
          skuNumber: newSkuNumber,
        },
      });
    }

    // =======================================================================
    // Phase 3: Update the counter to the next available number.
    // =======================================================================
    await prisma.storeCounter.update({
      where: { shop },
      data: { currentSku: nextSkuToTry },
    });

    console.log(`✅ SKU counter updated to ${nextSkuToTry} for shop ${shop}`);
    return json({ status: "ok", nextSku: nextSkuToTry });

  } catch (error) {
    console.error(`❌ Error in PRODUCTS_CREATE webhook: ${error.message}`);
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};