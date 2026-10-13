jQuery(document).ready(function($) {
    $('.customize-button').on('click', function() {
        var productId = $(this).data('product-id');
        // Redirect to a customization page with the product ID as a query parameter
        window.location.href = '/select-your-parts?product_id=' + productId;
    });
});