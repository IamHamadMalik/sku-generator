// app/shopify.server.js

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  DeliveryMethod,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { shopifyApi } from "@shopify/shopify-api";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(",").concat(["write_script_tags"]), // Added write_script_tags
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },

  // Webhook definitions
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/api/webhooks/app-uninstalled",
    },
    PRODUCTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/api/webhooks/products-create",
    },
  },

  // Register webhooks and create ScriptTag after auth
  hooks: {
    afterAuth: async ({ session }) => {
      const { shop, accessToken } = session;

      // Register webhooks
      await shopify.registerWebhooks({ session });

      // Create ScriptTag to inject SKU autofill JavaScript
      try {
        const scriptTagSrc = `${process.env.SHOPIFY_APP_URL}/js/sku-autofill.js`; // Uses https://sku-generator-eight.vercel.app
        const response = await fetch(`https://${shop}/admin/api/2024-07/script_tags.json`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
        });

        const scriptTags = await response.json();
        const existingScriptTag = scriptTags.script_tags.find(
          (tag) => tag.src === scriptTagSrc
        );

        if (!existingScriptTag) {
          await fetch(`https://${shop}/admin/api/2024-07/script_tags.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
              script_tag: {
                event: "onload",
                src: scriptTagSrc, // e.g., https://sku-generator-eight.vercel.app/js/sku-autofill.js
              },
            }),
          });
          console.log(`✅ Created ScriptTag for shop ${shop} with src ${scriptTagSrc}`);
        } else {
          console.log(`✅ ScriptTag already exists for shop ${shop} with src ${scriptTagSrc}`);
        }
      } catch (error) {
        console.error(`❌ Error creating ScriptTag for shop ${shop}: ${error.message}`);
      }
    },
  },
});

export const shopifyApiClient = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  hostName: new URL(process.env.SHOPIFY_APP_URL).host,
});

// Exports
export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;