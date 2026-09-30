jQuery(document).ready(function($) {
    var selectedProducts = [bg_productId];

    // Image selection handling
    $('.avatar-container img').on('click', function() {
        var productId = $(this).data('product-id');
        if ($(this).hasClass('selected')) {
            $(this).removeClass('selected');
            selectedProducts = selectedProducts.filter(function(id) {
                return id !== productId;
            });
        } else {
            $(this).addClass('selected');
            selectedProducts.push(productId);
        }
    });

    // Add to cart handling
    $('#addToTheBag').on('click', function() {
        var quantity = 1;
        if (selectedProducts.length > 0) {
            console.log(selectedProducts);
            $.ajax({
                url: partSelectorAjax.ajax_url,
                method: 'POST',
                data: {
                    'action': 'add_to_cart',
                    'products': selectedProducts,
                    'quantity': quantity
                },
                success: function(response) {
                    if (response.success) {
                        alert('Products added to cart!');
                    } else {
                        alert('Failed to add products to cart: ' + response.data);
                    }
                },
                error: function(response) {
                    alert('Failed to add products to cart.');
                }
            });
        } else {
            alert('Please select at least one product.');
        }
    });

});