$('input:radio[name=Radio]').change(function(){
    if($(this).attr("value")==="online")
    {
        Stripe.setPublishableKey('pk_test_51RGMvyFR4X8vzQ9iWaBOvL8nVmggoVg1R3tjhb3H0hgRGY3wtGPJNif8PvrjXYr671HipGMy7dUOYxX2K5BWVhop00nXaXVZT0');
        var $form = $('#checkout-form');
        $form.submit(function(event){
        $('#charge-error').addClass('d-none');
        $form.find('button').prop('disabled', true);
        Stripe.card.createToken({
            number: $('#ccnum').val(),
            cvc: $('#cvc').val(),
            exp_month: $('#expmonth').val(),
            exp_year: $('#expyear').val(),
            name: $('#cname').val()
        }, stripeResponseHandler);
        return false;
        });
        function stripeResponseHandler(status, response){
            if(response.error){
                $('#charge-error').text(response.error.message);
                $('#charge-error').removeClass('d-none');
                $form.find('button').prop('disabled', false);
            } else {
                var token = response.id;
                $form.append($('<input type="hidden" name="stripeToken" />').val(token));
                $form.get(0).submit();
            }
        }
    }
});
    
var pay=document.querySelector("#pay");
$('input[type=radio]').click(function()
{
    if($('input[value=online]').prop("checked")) {
        pay.classList.remove("not_selected");

    }else if($('input[value=b]').prop("checked")){
        pay.classList.add("not_selected");
    }
});
