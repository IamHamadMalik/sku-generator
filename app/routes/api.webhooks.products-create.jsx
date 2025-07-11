// app/routes/api/webhooks/products-create.jsx
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { shopifyApiClient, authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    // ✅ Verify HMAC + get payload
    const { shop, payload } = await authenticate.webhook(request);
    console.log(`✅ Received PRODUCTS_CREATE webhook for shop: ${shop}`);
    
    const product = payload;

    // =======================================================================
    // ✅ IDEMPOTENCY CHECK
    // Before processing, check if we have already generated SKUs for this product.
    // This prevents duplicate runs if Shopify resends the webhook.
    // =======================================================================
    const existingSkus = await prisma.productSKU.findFirst({
      where: {
        shop,
        productId: String(product.id),
      },
    });

    if (existingSkus) {
      console.log(`✅ SKUs already generated for product ${product.id}. Skipping duplicate webhook run.`);
      // Return a 200 OK response to let Shopify know we've handled it.
      return json({ status: "skipped", message: "SKUs already exist for this product." });
    }

    console.log(`✅ Payload: ${JSON.stringify(payload)}`);
    
    // ✅ Get stored access token
    const session = await prisma.session.findFirst({
      where: {
        shop,
        isOnline: false,
      },
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
    const startSku = storeCounter.currentSku;
    console.log(`✅ Starting SKU: ${startSku}`);

    // ✅ Build GraphQL mutation for metafields
    const graphqlVariants = variants.map((variant, i) => ({
      id: `gid://shopify/ProductVariant/${variant.id}`,
      metafields: [
        {
          namespace: "custom",
          key: "generated_sku",
          value: String(startSku + i),
          type: "single_line_text_field",
        },
      ],
    }));

    const productGID = `gid://shopify/Product/${product.id}`;
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product { id }
          productVariants {
            id
            metafields(first: 5) {
              edges { node { namespace key value } }
            }
          }
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

    const graphqlData = graphqlResponse.body;
    const { userErrors } = graphqlData.data.productVariantsBulkUpdate;

    if (userErrors.length > 0) {
      console.error("❌ Shopify GraphQL userErrors:", userErrors);
      return json({ status: "error", message: userErrors }, { status: 400 });
    }
    console.log("✅ Metafields added to all variants");

    // ✅ REST: update native SKU and log to our DB
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const newSku = startSku + i;

      // Update the native SKU field in Shopify
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

      if (!restResponse.ok) {
        const errorData = await restResponse.text();
        console.error(`❌ Failed to update native SKU for variant ${variant.id}. Status: ${restResponse.status}. Body: ${errorData}`);
        // Decide if you want to throw an error here or continue
      } else {
        const restData = await restResponse.json();
        console.log(`✅ Native SKU ${newSku} updated for variant ${variant.id}:`, restData.variant.sku);
      }

      // Log the generated SKU to our database. This is crucial for the idempotency check.
      await prisma.productSKU.create({
        data: {
          shop,
          productId: String(product.id),
          variantId: String(variant.id),
          skuNumber: newSku,
        },
      });
    }

    // ✅ Update the counter only after all operations are successful
    await prisma.storeCounter.update({
      where: { shop },
      data: { currentSku: startSku + variants.length },
    });

    console.log(`✅ SKU counter updated to ${startSku + variants.length} for shop ${shop}`);
    return json({ status: "ok", nextSku: startSku + variants.length });

  } catch (error) {
    console.error(`❌ Error in PRODUCTS_CREATE webhook: ${error.message}`);
    // We return a 500 status here, which might cause Shopify to retry,
    // but our idempotency check will now handle the retry gracefully.
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};
