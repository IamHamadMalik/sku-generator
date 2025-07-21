document.addEventListener("DOMContentLoaded", function () {
  if (window.location.pathname.includes("/admin/products/new")) {
    const skuFields = document.querySelectorAll('input[name$="[sku]"]');
    const variantCount = skuFields.length || 1;

    fetch("https://sku-generator-eight.vercel.app/api/get-next-skus", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `count=${variantCount}`,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && data.skus) {
          skuFields.forEach((field, index) => {
            if (data.skus[index]) {
              field.value = data.skus[index];
            }
          });
        } else {
          console.error("Error fetching SKUs:", data.message);
        }
      })
      .catch((error) => console.error("Error fetching SKUs:", error));
  }
});