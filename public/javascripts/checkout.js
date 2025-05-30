document.addEventListener("DOMContentLoaded", function () {
  const checkoutForm = document.getElementById("checkout-form");
  const paySection = document.getElementById("pay");
  const totalInput = document.getElementById("totalAmount");
  const totalAmount = totalInput ? parseFloat(totalInput.value) : 0;

  // Toggle Stripe button visibility
  document.querySelectorAll('input[name="Radio"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (document.getElementById("Radio1").checked) {
        paySection.classList.remove("not_selected");
      } else {
        paySection.classList.add("not_selected");
      }
    });
  });

  const stripeButton = document.getElementById("stripe-button");

  if (stripeButton) {
    stripeButton.addEventListener("click", async (e) => {
      e.preventDefault();

      const formData = new FormData(checkoutForm);

      const body = {
        name: formData.get("name"),
        address: formData.get("address"),
        city: formData.get("city"),
        state: formData.get("state"),
        zip: formData.get("zip"),
        total: totalAmount
      };

      try {
        const res = await fetch("/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const data = await res.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          alert("Failed to create Stripe session.");
        }
      } catch (err) {
        console.error("Stripe error:", err);
        alert("An error occurred. Please try again.");
      }
    });
  }
});
