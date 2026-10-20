<?php


/*
Plugin Name: Gunbuilder
Description: A plugin to display index.php
Version: 1.0

*/

// Hook for adding admin menus
//var_dump($products); 
add_action('admin_menu', 'part_selector_menu');

// Action function for the above hook
function part_selector_menu()
{
    add_menu_page(
        'Part Selector',
        'Part Selector',
        'manage_options',
        'part-selector',
        'part_selector_display_page'
    );
}

// Add a Customize Button next to the Add to Cart Button
add_action('woocommerce_after_add_to_cart_button', 'add_customize_button');

function add_customize_button()
{
    global $product;
    $product_id = $product->get_id();
    echo '<button type="button" class="customize-button button alt" style="background-color: #f39c12; border-color: #e67e22; color: #fff; margin-left: 10px;" data-product-id="' . $product_id . '" onmouseover="this.style.backgroundColor=\'#e67e22\'; this.style.borderColor=\'#d35400\';" onmouseout="this.style.backgroundColor=\'#f39c12\'; this.style.borderColor=\'#e67e22\';">Customize</button>';
}

// Enqueue Custom Scripts
add_action('wp_enqueue_scripts', 'enqueue_customize_button_script');

function enqueue_customize_button_script()
{
    // Enqueue the script from the plugin's folder
    wp_enqueue_script('customize-button-script', plugin_dir_url(__FILE__) . 'js/customize-button.js', array('jquery'), null, true);
}


// Function to enqueue scripts and styles in admin
function part_selector_enqueue_assets_admin()
{
    $plugin_url = plugin_dir_url(__FILE__);

    // Uncomment if you have specific admin styles or scripts
    // wp_enqueue_style('part-selector-css', $plugin_url . 'css/style.css');
    // wp_enqueue_script('part-selector-js', $plugin_url . 'js/script.js', array('jquery'), null, true);
}
add_action('admin_enqueue_scripts', 'part_selector_enqueue_assets_admin');





// Function to enqueue scripts and styles in frontend
function part_selector_enqueue_assets_frontend()
{
    $plugin_url = plugin_dir_url(__FILE__);

    //wp_enqueue_style('part-selector-css', $plugin_url . 'css/style.css');
    //wp_enqueue_script('part-selector-js', $plugin_url . 'js/script.js', array('jquery'), null, true);
    wp_localize_script('part-selector-js', 'partSelectorAjax', array(
        'ajax_url' => admin_url('admin-ajax.php')
    ));
}

add_action('wp_enqueue_scripts', 'part_selector_enqueue_assets_frontend');

// Shortcode function to display the index.php content on frontend
function part_selector_shortcode()
{
    $plugin_url = plugin_dir_url(__FILE__);
    $index_php = file_get_contents(plugin_dir_path(__FILE__) . 'template.php');
    // Update the paths in index.php for CSS, JS, and image resources
    $index_php = str_replace('href="css/', 'href="' . $plugin_url . 'css/', $index_php);
    $index_php = str_replace('src="js/', 'src="' . $plugin_url . 'js/', $index_php);
    $index_php = str_replace('src="img/', 'src="' . $plugin_url . 'img/', $index_php);

    // Retrieve product URLs from WooCommerce for Scopes
    $scopes_urls = get_product_urls(0, 100, 'Dots, Scopes, Sights, Flashlights');
    // Retrieve product URLs from WooCommerce for Silencers
    //$silencers_urls = get_product_urls(0, 100, ' Flash hider, Silencers');
    // Inject product URLs into the index.php content
    $index_php = str_replace('<!-- MEDIA_IMAGES_PLACEHOLDER for Scopes -->', $scopes_urls, $index_php);
    // $index_php = str_replace('<!-- MEDIA_IMAGES_PLACEHOLDER for Silencers -->', $silencers_urls, $index_php);

    // Retrieve product_id from URL query parameters
    if (isset($_GET['product_id'])) {
        $product_id = intval($_GET['product_id']);
        $product_image_url = get_product_image_url($product_id);
        // Inject the product image URL into the index.php content
        $index_php = str_replace('<!-- PRODUCT_IMAGE_PLACEHOLDER -->', $product_image_url, $index_php);
        $index_php = str_replace('<!-- PRODUCT_ID -->', $product_id, $index_php);
    }

    return $index_php;
}

add_shortcode('part_selector', 'part_selector_shortcode');

// Function to get product image URL by product ID
function get_product_image_url($product_id)
{
    $product = wc_get_product($product_id);
    if ($product) {
        $image_id = $product->get_image_id();
        if ($image_id) {
            return wp_get_attachment_url($image_id);
        }
    }
    return ''; // Return an empty string if no image found
}


function get_product_urls($offset, $limit, $category)
{
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

//
add_shortcode('part_selector', 'part_selector_shortcode');

add_action('wp_ajax_add_to_cart', 'handle_add_to_cart');
//add_action('wp_ajax_nopriv_add_to_cart', 'handle_add_to_cart');

function handle_add_to_cart()
{
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


function enqueue_custom_script()
{
    // Enqueue a dummy script
    wp_enqueue_script('custom-script', plugin_dir_url(__FILE__) . 'js/add-to-cart.js', array('jquery'), null, true);

    // Localize script to pass the AJAX URL
    wp_localize_script('custom-script', 'partSelectorAjax', array(
        'ajax_url' => admin_url('admin-ajax.php'),
    ));
}
add_action('wp_enqueue_scripts', 'enqueue_custom_script');
















function part_selector_display_page()
{
    // $plugin_url = plugin_dir_url(__FILE__);
    // $index_php = file_get_contents(plugin_dir_path(__FILE__) . 'index.php');

    // // Update the paths in index.php for CSS, JS, and image resources
    // $index_php = str_replace('href="css/', 'href="' . $plugin_url . 'css/', $index_php);
    // $index_php = str_replace('src="js/', 'src="' . $plugin_url . 'js/', $index_php);
    // $index_php = str_replace('src="img/', 'src="' . $plugin_url . 'img/', $index_php);
    $products = wc_get_products($args)

?>

    <!DOCTYPE html>
    <html lang="en">

    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-EVSTQN3/azprG1Anm3QDgpJLIm9Nao0Yz1ztcQTwFspd3yD65VohhpuuCOmLASjC" crossorigin="anonymous">
        <link rel="stylesheet" href="https://localhost/wordpress/wp-content/plugins/gunbuilder/css/custom.css">
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM" crossorigin="anonymous"></script>
        <title>Gunbuilder index</title>



    </head>

    <body>
        <header>
            <div class="mx-auto" style="width: 200px;">
                <h1 class="mx-auto">Gunbuilder</h1>
            </div>
        </header>

        <div id="category-selector" class="ms-2 row row-cols-auto">
            <div class="col-12">
                <h2> Category</h2>
            </div>
            <div class="col">
                <div class="selector card mb-3">
                    <div class="card-body">
                        <img src="https://taktikairsoft.com/wp-content/uploads/2019/09/placeholder_taktik.jpg" class="card-icon">
                        <h4 class="card-title">PlaceHolder</h4>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="selector card mb-3">
                    <div class="card-body">
                        <img src="https://taktikairsoft.com/wp-content/uploads/2019/09/placeholder_taktik.jpg" class="card-icon">
                        <h4 class="card-title">PlaceHolder</h4>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="selector card mb-3">
                    <div class="card-body">
                        <img src="https://taktikairsoft.com/wp-content/uploads/2019/09/placeholder_taktik.jpg" class="card-icon">
                        <h4 class="card-title">PlaceHolder</h4>
                    </div>
                </div>
            </div>
        </div>
        <div id="component-selector" class="ms-2 row row-cols-auto ">
            <canvas class="main-canvas ms-2 col-8 me-3">


            </canvas>
            <div class="component-details mt-2 ms-2">

                <div id="component-details" class="me-2 position-absolute ">

                </div>
            </div>
        </div>

        <div id="component-selector" class="ms-2 row row-cols-auto component-selector">
            <div class="col-12">
                <h2>Components</h2>
            </div>
            <?php
            foreach ($products as $component) {
            ?>
                <div class="col component">
                    <div class="selector card mb-3">
                        <div class="card-body">
                            <img src="<?= wp_get_attachment_image_url($component->get_image_id()) ?>" class="card-icon">
                            <h4 class="card-title"><?= $component->get_name() ?></h4>
                        </div>
                    </div>
                </div>
            <?php
            }
            ?>
          
        </div>
        </div>




        <footer></footer>
    </body>

    <script>


    </script>

    </html>

<?php

}
