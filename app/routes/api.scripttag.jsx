import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Create a ScriptTag to inject JavaScript into the Shopify admin
    const scriptTag = await admin.rest.resources.ScriptTag.create({
      session,
      script_tag: {
        event: "onload",
        src: "https://your-app-domain.com/js/sku-autofill.js", // Replace with your app's public JS file URL
      },
    });

    return json({ success: true, scriptTag });
  } catch (error) {
    console.error("Error creating ScriptTag:", error);
    return json({ success: false, message: error.message }, { status: 500 });
  }
};