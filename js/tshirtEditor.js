var canvas;
var a;
var b;

$(document).ready(function() {
    // Setup front side canvas 
    canvas = new fabric.Canvas('tcanvas', {
        hoverCursor: 'pointer',
        selection: true,
        selectionBorderColor: 'blue'
    });

    canvas.setWidth(document.getElementById('drawingArea').clientWidth);
    canvas.setHeight(document.getElementById('drawingArea').clientHeight);

    // Function to get query parameters
    function getQueryParams() {
        var params = {};
        var pairs = window.location.search.substring(1).split("&");
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split("=");
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
        }
        return params;
    }

    // Get the product_id from the URL
    var params = getQueryParams();
    var productId = params.product_id;

    console.log(productId);

    // Load and center the background image
    // EMG_Helios_Sniper.png
    // Nuprol_G17_Pink.png
    if (productImageUrl) {
        fabric.Image.fromURL(productImageUrl, function(image) {
            var scale = 0;
            if (window.innerWidth > 1300) {
                scale = 1;
            } else if (window.innerWidth > 650) {
                scale = 0.5;
            } else {
                scale = 0.25;
            }
            console.log(window.innerWidth);
            image.set({
                left: canvas.width / 2,
                top: canvas.height / 2,
                scaleX: scale,
                scaleY: scale,
                lockMovementX: true,
                lockMovementY: true,
                lockScalingX: true,
                lockScalingY: true,
                selectable: false
            });
            canvas.add(image);
        });
    }

    // Resize the canvas when the window is resized
    window.addEventListener('resize', function() {
        canvas.setWidth(document.getElementById('drawingArea').clientWidth);
        canvas.setHeight(document.getElementById('drawingArea').clientHeight);
        canvas.renderAll();
    });


    // Adding event listeners to the canvas
    canvas.on({
        'object:moving': function(e) {
            e.target.opacity = 0.5;
        },
        'object:modified': function(e) {
            e.target.opacity = 1;
        },
        'object:selected': onObjectSelected,
        'selection:cleared': onSelectedCleared,
    });


    $(".img-polaroid").click(function(e) {
        var el = e.target;
        var offset = 50;
        var left = fabric.util.getRandomInt(0 + offset, 200 - offset);
        var top = fabric.util.getRandomInt(0 + offset, 400 - offset);
        var angle = fabric.util.getRandomInt(-20, 40);

        var scale = (window.innerWidth < 650) ? 0.25 : 0.5;

        fabric.Image.fromURL(el.src, function(image) {
            image.set({
                left: left,
                top: top,
                angle: 0,
                padding: 10,
                cornersize: 10,
                hasRotatingPoint: false,
                hasControls: false,
                lockRotation: true,
                lockScalingX: true,
                lockScalingY: true,
                scaleX: scale,
                scaleY: scale,
            });
            //image.scaleToWidth(150);
            //image.scaleToHeight(150);
            canvas.add(image);
        });
    });

    document.getElementById('remove-selected').onclick = function() {		  
        var activeObject = canvas.getActiveObject(),
            activeGroup = canvas.getActiveGroup();
        if (activeObject) {
            canvas.remove(activeObject);
        } else if (activeGroup) {
            var objectsInGroup = activeGroup.getObjects();
            canvas.discardActiveGroup();
            objectsInGroup.forEach(function(object) {
                canvas.remove(object);
            });
        }
    };

    document.getElementById('bring-to-front').onclick = function() {		  
        var activeObject = canvas.getActiveObject();
        if (activeObject) {
            activeObject.bringToFront();
        }
    };

    document.getElementById('send-to-back').onclick = function() {		  
        var activeObject = canvas.getActiveObject();
        if (activeObject) {
            activeObject.sendToBack();
        }
    };
	
    // Add the event listener for the save button
    document.getElementById('save-canvas').onclick = saveCanvasAsImage;
});

function onObjectSelected(e) {	 
    var selectedObject = e.target;
    if (selectedObject && selectedObject.type === 'image') {
        // Display image editor
        $("#imageeditor").css('display', 'block');
    }
}

function onSelectedCleared(e) {
    $("#imageeditor").css('display', 'none');
}

function saveCanvasAsImage() {
    // Render the canvas with the background image
    canvas.backgroundImage.opacity = 1;
    canvas.renderAll();

    // Convert the canvas to a data URL
    var dataURL = canvas.toDataURL('image/png');
    
    // Create a link element and trigger a download
    var link = document.createElement('a');
    link.href = dataURL;
    link.download = 'canvas.png';
    link.click();
}
