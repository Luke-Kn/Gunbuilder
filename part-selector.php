<?php
/*
Plugin Name: Part Selector
Description: A plugin to display index.html
Version: 1.0
Author: MTL New Media
*/

// Hook for adding admin menus
add_action('admin_menu', 'part_selector_menu');

// Action function for the above hook
function part_selector_menu() {
    add_menu_page('Part Selector', 'Part Selector', 'manage_options', 'part-selector', 'part_selector_display_page');
}

// Add a Customize Button next to the Add to Cart Button
add_action('woocommerce_after_add_to_cart_button', 'add_customize_button');

function add_customize_button() {
    global $product;
    $product_id = $product->get_id();
    echo '<button type="button" class="customize-button button alt" style="background-color: #f39c12; border-color: #e67e22; color: #fff; margin-left: 10px;" data-product-id="' . $product_id . '" onmouseover="this.style.backgroundColor=\'#e67e22\'; this.style.borderColor=\'#d35400\';" onmouseout="this.style.backgroundColor=\'#f39c12\'; this.style.borderColor=\'#e67e22\';">Customize</button>';
}

// Enqueue Custom Scripts
add_action('wp_enqueue_scripts', 'enqueue_customize_button_script');

function enqueue_customize_button_script() {
    // Enqueue the script from the plugin's folder
    wp_enqueue_script('customize-button-script', plugin_dir_url(__FILE__) . 'js/customize-button.js', array('jquery'), null, true);
}


// Function to enqueue scripts and styles in admin
function part_selector_enqueue_assets_admin() {
    $plugin_url = plugin_dir_url(__FILE__);

    // Uncomment if you have specific admin styles or scripts
    // wp_enqueue_style('part-selector-css', $plugin_url . 'css/style.css');
    // wp_enqueue_script('part-selector-js', $plugin_url . 'js/script.js', array('jquery'), null, true);
}
add_action('admin_enqueue_scripts', 'part_selector_enqueue_assets_admin');


// Function to display the plugin page
function part_selector_display_page() {
    $plugin_url = plugin_dir_url(__FILE__);
    $index_html = file_get_contents(plugin_dir_path(__FILE__) . 'index.html');
    
    // Update the paths in index.html for CSS, JS, and image resources
    $index_html = str_replace('href="css/', 'href="' . $plugin_url . 'css/', $index_html);
    $index_html = str_replace('src="js/', 'src="' . $plugin_url . 'js/', $index_html);
    $index_html = str_replace('src="img/', 'src="' . $plugin_url . 'img/', $index_html);

    echo $index_html;
}


// Function to enqueue scripts and styles in frontend
function part_selector_enqueue_assets_frontend() {
    $plugin_url = plugin_dir_url(__FILE__);

    //wp_enqueue_style('part-selector-css', $plugin_url . 'css/style.css');
    //wp_enqueue_script('part-selector-js', $plugin_url . 'js/script.js', array('jquery'), null, true);
    wp_localize_script('part-selector-js', 'partSelectorAjax', array(
        'ajax_url' => admin_url('admin-ajax.php')
    ));
}

add_action('wp_enqueue_scripts', 'part_selector_enqueue_assets_frontend');

// Shortcode function to display the index.html content on frontend
function part_selector_shortcode() {
    $plugin_url = plugin_dir_url(__FILE__);
    $index_html = file_get_contents(plugin_dir_path(__FILE__) . 'index.html');
    
    // Update the paths in index.html for CSS, JS, and image resources
    $index_html = str_replace('href="css/', 'href="' . $plugin_url . 'css/', $index_html);
    $index_html = str_replace('src="js/', 'src="' . $plugin_url . 'js/', $index_html);
    $index_html = str_replace('src="img/', 'src="' . $plugin_url . 'img/', $index_html);

    // Retrieve product URLs from WooCommerce for Scopes
    $scopes_urls = get_product_urls(0, 100, 'Scopes');
    // Retrieve product URLs from WooCommerce for Silencers
    $silencers_urls = get_product_urls(0, 100, 'Flash hider, Silencers');

    // Inject product URLs into the index.html content
    $index_html = str_replace('<!-- MEDIA_IMAGES_PLACEHOLDER for Scopes -->', $scopes_urls, $index_html);
    $index_html = str_replace('<!-- MEDIA_IMAGES_PLACEHOLDER for Silencers -->', $silencers_urls, $index_html);

    // Retrieve product_id from URL query parameters
    if (isset($_GET['product_id'])) {
        $product_id = intval($_GET['product_id']);
        $product_image_url = get_product_image_url($product_id);

        // Inject the product image URL into the index.html content
        $index_html = str_replace('<!-- PRODUCT_IMAGE_PLACEHOLDER -->', $product_image_url, $index_html);
        $index_html = str_replace('<!-- PRODUCT_ID -->', $product_id, $index_html);

    }

    return $index_html;
}
add_shortcode('part_selector', 'part_selector_shortcode');

// Function to get product image URL by product ID
function get_product_image_url($product_id) {
    $product = wc_get_product($product_id);
    if ($product) {
        $image_id = $product->get_image_id();
        if ($image_id) {
            return wp_get_attachment_url($image_id);
        }
    }
    return ''; // Return an empty string if no image found
}


function get_product_urls($offset, $limit, $category) {
    $product_urls = '';

    $args = array(
        'offset' => $offset,
        'limit' => $limit,
        'status' => 'publish',
        'category' => array($category)
    );

    $products = wc_get_products($args);

    if (!empty($products)) {
        foreach ($products as $product) {
            $image_url = wp_get_attachment_url($product->get_image_id());
            $title = $product->get_name();
            $stock = $product->get_stock_quantity();
            $price = $product->get_price();

            // An accessory will not be displayed if there's no inventory
            if ($stock !== null && $stock > 0) {
                $caption = $title . ' (' . $stock . ') $' . $price;
                $product_urls .= '<div class="image-container">';
                $product_urls .= '<img data-product-id="' . esc_attr($product->get_id()) . '" style="cursor:pointer;" class="img-polaroid" src="' . esc_url($image_url) . '" alt="' . esc_attr($title) . '" />';
                $product_urls .= '<div class="caption" style="word-wrap: break-word; white-space: normal; text-align: center;">' . esc_html($caption) . '</div>';
                $product_urls .= '</div>';
            }
        }
    } else {
        $product_urls .= 'No products found.';
    }

    return $product_urls;
}

add_shortcode('part_selector', 'part_selector_shortcode');

add_action('wp_ajax_add_to_cart', 'handle_add_to_cart');
//add_action('wp_ajax_nopriv_add_to_cart', 'handle_add_to_cart');

function handle_add_to_cart() {
    // Check if WooCommerce is active
    if (!class_exists('WooCommerce')) {
        wp_send_json_error('WooCommerce is not active');
    }

    // Get products and quantity from GET request
    $products = isset($_GET['products']) ? $_GET['products'] : [];
    $quantity = isset($_GET['quantity']) ? intval($_GET['quantity']) : 0;

    // Log the received data for debugging
    error_log('Products: ' . print_r($products, true));
    error_log('Quantity: ' . $quantity);

    // Validate products and quantity
    if (empty($products) || $quantity <= 0) {
        wp_send_json_error('Invalid products or quantity');
    }

    // Ensure WooCommerce cart is initialized
    if (!WC()->cart) {
        wp_send_json_error('Cart not initialized');
    }

    // Add products to cart
    foreach ($products as $product_id) {
        $product_id = intval($product_id);
        if ($product_id > 0) {
            WC()->cart->add_to_cart($product_id, $quantity);
        }
    }

    wp_send_json_success('Products added to cart');
}


function enqueue_custom_script() {
    // Enqueue a dummy script
    wp_enqueue_script('custom-script', plugin_dir_url(__FILE__) . 'js/add-to-cart.js', array('jquery'), null, true);

    // Localize script to pass the AJAX URL
    wp_localize_script('custom-script', 'partSelectorAjax', array(
        'ajax_url' => admin_url('admin-ajax.php'),
    ));
}
add_action('wp_enqueue_scripts', 'enqueue_custom_script');



?>
