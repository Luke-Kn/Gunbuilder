// ---------- Catalog (sample data). t = platform, v = 3D variant ----------
const products = (name, brand, price, image, platform = "all", v) => ({
  n,
  b,
  p,
  i,
  t,
  v,
});
let addBtns = '';
async function fetchProducts(categoryId) {
  let data = await fetch(
    `https://taktikairsoft.com/wp-json/site/v1/parts?category=${categoryId}`,
  ).then((response) => {
    if (!response.ok) throw new Error(`Failed to load parts for ${categoryId}`);

    return response.json();
  });

  return data;
}

function renderProductRow(product) {
  return `<div class="opt">
            <div class="row">
            <div>
            </div>
            <span class="part">
              <b>${product.name}</b>
              <small>${product.brand}</small>
            </span>
            <span class="price">${product.price}$</span>
              </div>
            <button class="pick addBtn" >Add</button>
          </div>
          `;
}

async function populateModal(categoryID) {
  let products = await fetchProducts(categoryID);
  let content = ` 
        <div class="box">
            <div class="dh">
              <h2 id="dt"></h2>
              <input
                id="q"
                type="search"
                placeholder="Search parts or brands"
                aria-label="Search parts"
              />
              </div>
              <div class="opts" id="options">`;
  products.forEach((product) => {
    content += renderProductRow(product);
  });

  content += `</div>
            </div>
          </div>
          `;

  let modal_content = document.getElementById("modal-content");
  modal_content.innerHTML = ``;
  modal_content.innerHTML += content;

   addBtns = document.querySelectorAll(".addBtn");

   addBtns.forEach((btn)=>{
    btn.addEventListener('click', ()=>{
      let current_category = document.getElementById('category-'+categoryID)
      
      current_category.children[0].style.display = 'none'

       current_category.children[1].innerHTML = btn.parentNode.children[0].innerHTML ;

      current_category.children[1].style.display = 'flex'

     
    })
   })
}

function renderCategory(category) {
  return `
   <div id="category-${category[1]}">
          <div class="row"  >          
            <span class="slot-name">${category[0]}</span>
            <button class="pick js-modal-trigger" onclick="populateModal(${category[1]})" data-target="modal-js-example">Choose ${category[0]}</button>
            <span class="price"></span>
            <span></span>
          </div> 

          <div class="row" style="display:none;>        
            <span class="slot-name">${category[0]}</span>
            <span class="part">
              <b>M4 Full Metal AEG</b>
              <small>ICS</small>
            </span>
            <span class="price">$289.00</span>
            <button class="x" aria-label="Remove Base replica">
              ×
            </button>
          </div>  
          </div>     
  `;


}

let aegComponents = [
  ["Base", 120],
  ["Barrel", 472],
  ["Hop-up & bucking", 111],
  ["Gears", 110],
  ["Motor", 112],
  ["Cylinder & piston", 109],
  ["Nozzle", 113],
  ["Recoil spring", 116],
  ["Magazine", 69],
  ["Battery", 66],
  ["Optic", 74],
  ["Stock", 68],
  ["Eye & face protection", 72],
  ["BBs", 65],
];

let gbbComponents = [
  ["Base", 120],
  ["Barrel", 472],
  ["Hop-up & bucking", 111],
  ["Nozzle", 113],
  ["Recoil spring", 116],
  ["Magazine", 69],
  ["Optic", 74],
  ["Eye & face protection", 72],
  ["BBs", 65],
];
/*let rifles = fetchProducts(120);
let barrel = fetchProducts(472);
let hop = fetchProducts(111);
let gears = fetchProducts(110);
let motor = fetchProducts(112);
let cylinder = fetchProducts(109);
let nozzle = fetchProducts(113);
let spring = fetchProducts(116);
let magazines = fetchProducts(69);
let batteries = fetchProducts(66);
let optics = fetchProducts(74);
let stocks = fetchProducts(68);
let protection = fetchProducts(72);
let bbs = fetchProducts(65);
*/
function appendCategories(type) {
  let list = $(".list")[0];
  let components = [];
  switch (type) {
    case "AEG": {
      components = gbbComponents;
      break;
    }
    case "GBB": {
      components = aegComponents;
      break;
    }
    default: {
      console.error("invalid gun type type");
      break;
    }
  }

  list.innerHTML = `
<div class="row head" bis_skin_checked="1">
          <span>Component</span>
          <span>Selection</span>
          <span style="text-align: right">Price</span>
          <span></span>
        </div>
`;

  components.forEach((category) => {
    list.innerHTML += renderCategory(category);
  });
}

function addItem(category, product) {
  let current_category = document.getElementById("category-"+category)
  console.log( current_category.children[0])
  return `
  
    <span class="slot-name">${category}</span>
    <span class="part">
      <b>${product.name}</b>
      <small></small>
    </span>
    <span class="price">${product.price}</span>
    <button class="x" >
      ×
    </button>

  `;

  
}

document.addEventListener("DOMContentLoaded", () => {
  

  appendCategories("AEG");
});

// ---------- List UI ----------
let aeg_btn = document.getElementById("AEG_btn");

aeg_btn.addEventListener("click", () => {
  appendCategories("AEG");
});

let gbb_btn = document.getElementById("GBB_btn");

gbb_btn.addEventListener("click", () => {
  appendCategories("GBB");
});

let cur = null;
function openPicker(s) {
  cur = s;
  $("dt").textContent = "Choose " + s.name.toLowerCase();
  $("q").value = "";
  fill();
  $("dlg").showModal();
  $("q").focus();
}
function fill() {
  const q = $("q").value.toLowerCase(),
    box = $("opts");
  box.innerHTML = "";
  const items = cur.parts.filter(
    (p) => fits(p) && (p.n + " " + p.b).toLowerCase().includes(q),
  );
  if (!items.length) {
    box.innerHTML =
      '<div class="empty">No parts match. Clear the search or change your platform.</div>';
    return;
  }
  items.forEach((p) => {
    const d = document.createElement("div");
    d.className = "opt";
    d.innerHTML = `<span class="part"><b>${p.n}</b><small>${p.b}</small></span><span class="price">${money(p.p)}</span>`;
    const b = document.createElement("button");
    b.className = "pick";
    b.textContent = "Add";
    b.onclick = () => {
      state.sel[cur.id] = p;
      $("dlg").close();
      render();
      focusSlot(cur.id);
    };
    d.appendChild(b);
    box.appendChild(d);
  });
}
$("q").oninput = fill;
$("close").onclick = () => $("dlg").close();
$("reset").onclick = () => {
  state.sel = {};
  render();
};
$("copy").onclick = async () => {
  const l = shown()
    .filter((s) => state.sel[s.id])
    .map(
      (s) =>
        `${s.name}: ${state.sel[s.id].b} ${state.sel[s.id].n} (${money(state.sel[s.id].p)})`,
    );
  l.push("Total: " + $("total").textContent);
  const b = $("copy");
  try {
    await navigator.clipboard.writeText(l.join("\n"));
    b.textContent = "Copied";
  } catch (e) {
    b.textContent = "Copy failed";
  }
  setTimeout(() => (b.textContent = "Copy build list"), 1500);
};

// ---------- Offcanvas ----------
let ocOpen = false,
  sceneReady = false,
  sceneFailed = false;
function setOC(open) {
  ocOpen = open;
  $("oc").classList.toggle("open", open);
  $("scrim").classList.toggle("on", open);
  document.body.classList.toggle("oc-open", open);
  $("open3d").setAttribute("aria-expanded", open);
  if (open) {
    if (!sceneReady && !sceneFailed) setTimeout(initScene, 60);
    else if (sceneReady) setTimeout(resize, 270);
    $("close3d").focus();
  } else $("open3d").focus();
}
$("open3d").onclick = () => setOC(!ocOpen);
$("close3d").onclick = () => setOC(false);
$("scrim").onclick = () => setOC(false);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ocOpen && !$("dlg").open) setOC(false);
});

// ---------- 3D scene ----------
let renderer,
  scene,
  camera,
  sockets = {},
  ray,
  mouse,
  explodeAmt = 0,
  exploded = false;
const orbit = {
  theta: 0.7,
  phi: 1.25,
  radius: 5.6,
  target: new THREE.Vector3(),
};
const mat = (c) =>
  new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.55,
    metalness: 0.35,
  });
const M = {
  body: mat(0x2b2e33),
  dark: mat(0x17181b),
  metal: mat(0x6d747c),
  accent: mat(0xf39c12),
  glass: new THREE.MeshStandardMaterial({
    color: 0x2a7fbf,
    roughness: 0.1,
    metalness: 0.6,
  }),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};
const cyl = (r, len, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), m);
  o.rotation.z = -Math.PI / 2;
  o.position.set(x, y, z);
  return o;
};
const BUILD = {
  barrel: (k) => {
    const L = { stub: 0.8, short: 1, mid: 1.5, long: 2.2 }[k || "stub"],
      g = new THREE.Group();
    g.add(cyl(0.05, L, M.metal, L / 2, 0, 0));
    g.add(cyl(0.075, 0.16, M.dark, L, 0, 0));
    return g;
  },
  mag: (k) => {
    const g = new THREE.Group();
    if (!k) return g;
    const h = { mid: 0.6, hi: 0.8 }[k];
    g.add(box(0.22, h, 0.16, M.dark, 0, -h / 2, 0));
    g.rotation.z = 0.08;
    return g;
  },
  optic: (k) => {
    const g = new THREE.Group();
    if (!k) return g;
    g.add(box(0.5, 0.05, 0.14, M.dark, 0, 0.03, 0));
    if (k === "dot") {
      g.add(box(0.3, 0.16, 0.12, M.body, 0, 0.14, 0));
      g.add(box(0.02, 0.11, 0.1, M.glass, 0.16, 0.14, 0));
    } else {
      g.add(cyl(0.075, 1, M.body, 0, 0.17, 0));
      g.add(cyl(0.1, 0.2, M.dark, 0.55, 0.17, 0));
      g.add(cyl(0.1, 0.16, M.dark, -0.5, 0.17, 0));
    }
    return g;
  },
  stock: (k) => {
    const g = new THREE.Group();
    if (!k) return g;
    if (k === "fixed") {
      g.add(box(0.95, 0.28, 0.18, M.body, -0.48, -0.03, 0));
      g.add(box(0.06, 0.4, 0.2, M.dark, -0.97, -0.06, 0));
    } else {
      g.add(cyl(0.03, 0.8, M.metal, -0.4, 0.06, 0));
      g.add(cyl(0.03, 0.8, M.metal, -0.4, -0.06, 0));
      g.add(box(0.3, 0.22, 0.16, M.body, -0.15, 0, 0));
      g.add(box(0.06, 0.38, 0.2, M.dark, -0.83, 0, 0));
    }
    return g;
  },
};
const shownKey = {};
function sync3D() {
  if (!sceneReady) return;
  SLOTS.filter((s) => s.at).forEach((s) => {
    const v = (state.sel[s.id] && state.sel[s.id].v) || "";
    if (shownKey[s.id] === v) return;
    const first = shownKey[s.id] === undefined;
    shownKey[s.id] = v;
    const sock = sockets[s.id];
    while (sock.children.length) sock.remove(sock.children[0]);
    const part = BUILD[s.id](v || undefined);
    part.traverse((o) => (o.userData.slot = s.id));
    if (!first) {
      part.userData.grow = 0;
      part.scale.setScalar(0.01);
    }
    sock.add(part);
  });
}
function focusSlot(id) {
  const s = SLOTS.find((x) => x.id === id);
  if (!sceneReady || !s || !s.at) return;
  orbit.goal = new THREE.Vector3(...s.at);
  orbit.radiusGoal = 3.4;
}
function initScene() {
  const cv = $("cv");
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      alpha: true,
    });
  } catch (e) {
    sceneFailed = true;
    $("msg").style.display = "grid";
    cv.style.display = "none";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
  d1.position.set(3, 5, 4);
  scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.35);
  d2.position.set(-4, 2, -3);
  scene.add(d2);
  const base = new THREE.Group();
  base.add(box(2.4, 0.34, 0.26, M.body));
  base.add(box(0.9, 0.3, 0.3, M.dark, 0.75, 0.02, 0));
  const grip = box(0.2, 0.55, 0.2, M.dark, -0.45, -0.4, 0);
  grip.rotation.z = 0.3;
  base.add(grip);
  base.add(box(0.03, 0.03, 0.28, M.accent, -0.2, -0.16, 0));
  scene.add(base);
  SLOTS.filter((s) => s.at).forEach((s) => {
    const g = new THREE.Group();
    g.position.set(...s.at);
    scene.add(g);
    sockets[s.id] = g;
  });
  ray = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  sceneReady = true;
  sync3D();
  bindInput(cv);
  resize();
  new ResizeObserver(resize).observe($("stage"));
  requestAnimationFrame(loop);
}
function resize() {
  const st = $("stage"),
    w = st.clientWidth,
    h = st.clientHeight;
  if (!w || !h || !renderer) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function loop() {
  requestAnimationFrame(loop);
  if (!ocOpen) return;
  if (orbit.goal) {
    orbit.target.lerp(orbit.goal, 0.1);
    orbit.radius += (orbit.radiusGoal - orbit.radius) * 0.1;
  }
  explodeAmt += ((exploded ? 1 : 0) - explodeAmt) * 0.12;
  SLOTS.filter((s) => s.at).forEach((s) => {
    const g = sockets[s.id];
    g.position.set(
      s.at[0] + s.axis[0] * 0.9 * explodeAmt,
      s.at[1] + s.axis[1] * 0.9 * explodeAmt,
      s.at[2],
    );
    const p = g.children[0];
    if (p && p.userData.grow !== undefined && p.userData.grow < 1) {
      p.userData.grow = Math.min(1, p.userData.grow + 0.08);
      p.scale.setScalar(0.01 + 0.99 * p.userData.grow);
    }
  });
  const { theta, phi, radius, target } = orbit;
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.cos(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.sin(theta),
  );
  camera.lookAt(target);
  renderer.render(scene, camera);
}
function bindInput(cv) {
  let down = false,
    moved = 0,
    lx = 0,
    ly = 0;
  cv.addEventListener("pointerdown", (e) => {
    down = true;
    moved = 0;
    lx = e.clientX;
    ly = e.clientY;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - lx,
      dy = e.clientY - ly;
    moved += Math.abs(dx) + Math.abs(dy);
    lx = e.clientX;
    ly = e.clientY;
    orbit.theta -= dx * 0.008;
    orbit.phi = Math.max(0.3, Math.min(2.6, orbit.phi - dy * 0.008));
  });
  cv.addEventListener("pointerup", (e) => {
    down = false;
    if (moved < 5) {
      const r = cv.getBoundingClientRect();
      mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(Object.values(sockets), true)[0];
      if (hit && hit.object.userData.slot) {
        const s = SLOTS.find((x) => x.id === hit.object.userData.slot);
        focusSlot(s.id);
        openPicker(s);
      }
    }
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      orbit.radius = Math.max(2, Math.min(9, orbit.radius + e.deltaY * 0.005));
      orbit.radiusGoal = orbit.radius;
    },
    { passive: false },
  );
}
$("explode").onclick = (e) => {
  exploded = !exploded;
  e.currentTarget.setAttribute("aria-pressed", exploded);
};
$("reset3d").onclick = () => {
  orbit.goal = new THREE.Vector3();
  orbit.radiusGoal = 5.6;
  orbit.theta = 0.7;
  orbit.phi = 1.25;
};
