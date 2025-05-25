// File: public/javascripts/checkout.js

document.addEventListener("DOMContentLoaded", function () {
  const checkoutForm = document.getElementById("checkout-form");
  const paySection = document.getElementById("pay");
  const totalInput = document.getElementById("totalAmount");
  const totalAmount = totalInput ? parseFloat(totalInput.value) : 0;

  // Toggle PayPal container visibility
  document.querySelectorAll('input[name="Radio"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (document.getElementById("Radio1").checked) {
        paySection.classList.remove("not_selected");
      } else {
        paySection.classList.add("not_selected");
      }
    });
  });

  // Initialize PayPal buttons
  paypal.Buttons({
    createOrder: function (data, actions) {
      return actions.order.create({
        purchase_units: [{
          amount: {
            value: totalAmount.toFixed(2), // Must be a string with 2 decimals
            currency_code: "USD"
          }
        }]
      });
    },
    onApprove: function (data, actions) {
      return actions.order.capture().then(function (details) {
        alert('Transaction completed by ' + details.payer.name.given_name);

        // Append hidden input with PayPal order ID and submit the form
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "paypal_order_id";
        input.value = data.orderID;

        checkoutForm.appendChild(input);
        checkoutForm.submit();
      });
    }
  }).render('#paypal-button-container');
});
