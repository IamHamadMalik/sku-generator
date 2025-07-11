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

// ✅ Create the Remix app instance
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },

  // ✅ Webhook definitions
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

  // ✅ Register webhooks after auth
  hooks: {
    afterAuth: async ({ session }) => {
      await shopify.registerWebhooks({ session });
    },
  },
});

export const shopifyApiClient = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  hostName: new URL(process.env.SHOPIFY_APP_URL).host,
});

// ✅ Exports you use elsewhere
export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;
