// app/routes/api/webhooks/products-create.jsx
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { shopifyApiClient, authenticate } from "../shopify.server";

// GraphQL query to check if a variant with a specific SKU exists.
// It's efficient as it only asks for 1 result.
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
    // ✅ Verify HMAC + get payload
    const { shop, payload } = await authenticate.webhook(request);
    console.log(`✅ Received PRODUCTS_CREATE webhook for shop: ${shop}`);
    
    const product = payload;

    // ✅ IDEMPOTENCY CHECK: Prevents duplicate runs for the same webhook event.
    const existingSkus = await prisma.productSKU.findFirst({
      where: {
        shop,
        productId: String(product.id),
      },
    });

    if (existingSkus) {
      console.log(`✅ SKUs already generated for product ${product.id}. Skipping duplicate webhook run.`);
      return json({ status: "skipped", message: "SKUs already exist for this product." });
    }

    console.log(`✅ Payload: ${JSON.stringify(payload)}`);
    
    // ✅ Get stored access token
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

    // ✅ Get SKU counter
    const storeCounter = await prisma.storeCounter.findUnique({ where: { shop } });
    if (!storeCounter) {
      throw new Error(`❌ StoreCounter not initialized for shop ${shop}`);
    }
    
    // =======================================================================
    // ✅ NEW: SKU UNIQUENESS VALIDATION LOGIC
    // Phase 1: Find enough available SKUs before assigning anything.
    // =======================================================================
    const skusNeeded = variants.length;
    const availableSkus = [];
    let nextSkuToTry = storeCounter.currentSku;

    console.log(`🔍 Searching for ${skusNeeded} unique SKUs, starting from ${nextSkuToTry}...`);

    while (availableSkus.length < skusNeeded) {
      // Query Shopify to see if a variant with this SKU already exists
      const skuExistsResponse = await admin.query({
        data: {
          query: SKU_EXISTS_QUERY,
          variables: { query: `sku:${nextSkuToTry}` },
        },
      });

      const variantsWithSku = skuExistsResponse.body.data.productVariants.edges;

      if (variantsWithSku.length === 0) {
        // SKU is available. Add it to our list.
        console.log(`👍 SKU ${nextSkuToTry} is available.`);
        availableSkus.push(nextSkuToTry);
      } else {
        // SKU is taken. Log it and the loop will try the next number.
        console.log(`👎 SKU ${nextSkuToTry} is already in use. Skipping.`);
      }
      
      // Increment to check the next number in the sequence.
      nextSkuToTry++;
    }

    console.log(`✅ Found ${skusNeeded} unique SKUs: ${availableSkus.join(', ')}`);

    // =======================================================================
    // Phase 2: Assign the guaranteed-unique SKUs to the variants.
    // =======================================================================

    // ✅ Build GraphQL mutation for metafields
    const graphqlVariants = variants.map((variant, i) => ({
      id: `gid://shopify/ProductVariant/${variant.id}`,
      metafields: [
        {
          namespace: "custom",
          key: "generated_sku",
          value: String(availableSkus[i]), // Use the unique SKU from our list
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
      // Even if this fails, we continue to the REST update as it's more critical.
    } else {
      console.log("✅ Metafields added to all variants");
    }

    // ✅ REST: update native SKU and log to our DB
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const newSku = availableSkus[i]; // Get the assigned unique SKU

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
              sku: String(newSku),
            },
          }),
        }
      );

      if (restResponse.ok) {
        console.log(`✅ Native SKU ${newSku} updated for variant ${variant.id}`);
      } else {
        const errorText = await restResponse.text();
        console.error(`❌ Failed to update native SKU for variant ${variant.id}: ${errorText}`);
      }

      // Log the generated SKU to our database for the idempotency check.
      await prisma.productSKU.create({
        data: {
          shop,
          productId: String(product.id),
          variantId: String(variant.id),
          skuNumber: newSku,
        },
      });
    }

    // =======================================================================
    // Phase 3: Update the counter to the next available number.
    // =======================================================================
    await prisma.storeCounter.update({
      where: { shop },
      data: { currentSku: nextSkuToTry }, // `nextSkuToTry` is already incremented to the next open spot
    });

    console.log(`✅ SKU counter updated to ${nextSkuToTry} for shop ${shop}`);
    return json({ status: "ok", nextSku: nextSkuToTry });

  } catch (error) {
    console.error(`❌ Error in PRODUCTS_CREATE webhook: ${error.message}`);
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};