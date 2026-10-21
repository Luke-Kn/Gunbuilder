(function () {
	'use strict';

	var data = window.TGB || { categories: [], products: {}, i18n: {} };
	var i18n = data.i18n;

	// ---- State ---------------------------------------------------------
	var state = {
		activeCategory: data.categories.length ? data.categories[0].id : null,
		selection: {} // { categoryId: product }
	};

	// ---- Elements ------------------------------------------------------
	var pillsEl    = document.getElementById('tgb-pills');
	var productsEl = document.getElementById('tgb-products');
	var buildEl    = document.getElementById('tgb-build-list');
	var countEl    = document.getElementById('tgb-count');
	var stageEl    = document.getElementById('tgb-stage');

	if (!pillsEl) { return; }

	var baseChosen = function () { return !!state.selection.base; };

	// ---- Helpers -------------------------------------------------------
	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text != null) { n.textContent = text; }
		return n;
	}

	// ---- Renderers -----------------------------------------------------
	function renderPills() {
		pillsEl.innerHTML = '';
		data.categories.forEach(function (cat, i) {
			var btn = el('button', 'tgb-pill', cat.label);
			btn.type = 'button';
			btn.setAttribute('role', 'tab');
			btn.setAttribute('aria-selected', String(cat.id === state.activeCategory));
			// Everything except the base platform is locked until a base is chosen.
			btn.disabled = i > 0 && !baseChosen();
			btn.addEventListener('click', function () {
				state.activeCategory = cat.id;
				render();
			});
			pillsEl.appendChild(btn);
		});
	}

	function renderProducts() {
		productsEl.innerHTML = '';
		var list = (data.products && data.products[state.activeCategory]) || [];

		if (!list.length) {
			productsEl.appendChild(el('div', 'tgb-placeholder', i18n.noProducts));
			return;
		}

		list.forEach(function (product) {
			var selected = state.selection[state.activeCategory] &&
				state.selection[state.activeCategory].id === product.id;

			var card = el('button', 'tgb-product' + (selected ? ' is-selected' : ''));
			card.type = 'button';
			card.appendChild(el('strong', null, product.name));
			if (product.price) { card.appendChild(el('span', null, product.price)); }

			card.addEventListener('click', function () {
				state.selection[state.activeCategory] = product;
				render();
			});
			productsEl.appendChild(card);
		});
	}

	function renderBuild() {
		var keys = Object.keys(state.selection);
		countEl.textContent = keys.length + ' ' + (keys.length === 1 ? i18n.item : i18n.items);

		if (!keys.length) { return; } // keep the server-rendered placeholder

		buildEl.className = '';
		buildEl.innerHTML = '';
		keys.forEach(function (catId) {
			var product = state.selection[catId];
			var row = el('div', 'tgb-build-item');
			var label = el('div');
			label.appendChild(el('strong', null, product.name));
			var cat = data.categories.filter(function (c) { return c.id === catId; })[0];
			if (cat) { label.appendChild(el('small', null, cat.label)); }
			row.appendChild(label);

			var remove = el('button', null, 'Remove');
			remove.type = 'button';
			remove.addEventListener('click', function () {
				if (catId === 'base') { state.selection = {}; }   // dropping the base resets the build
				else { delete state.selection[catId]; }
				render();
			});
			row.appendChild(remove);
			buildEl.appendChild(row);
		});
	}

	function renderStage() {
		// TODO: swap the empty state for the base gun image + layered
		// component overlays once product images are available.
		var base = state.selection.base;
		if (!base) { return; }
		stageEl.innerHTML = '';
		var wrap = el('div', 'tgb-empty-state');
		wrap.appendChild(el('h2', null, base.name));
		stageEl.appendChild(wrap);
	}

	function render() {
		renderPills();
		renderProducts();
		renderBuild();
		renderStage();
	}

	render();
})();


document.addEventListener('DOMContentLoaded',()=>{

let submit_id =  document.getElementById('submit_id');
let input_id = document.getElementById('input_id');
let stage = document.getElementById('tgb-stage');
let selector = document.getElementById('item_selector');
let display = document.getElementById('item_display');

submit_id.addEventListener('click', async ()=>{
	
	let item = await fetch(`https://taktikairsoft.com/wp-json/site/v1/part?id=${input_id.value}`)
					.then(async(response)=>{
						return await response.json();
					})
					renderItemCreator(item)
				})

function renderItemCreator(item){
	let main_image = document.getElementById("main-image")

	main_image.src = 'https://taktikairsoft.com/'+item.image;
selector.hidden = true;
display.style.display = 'grid';


}
})