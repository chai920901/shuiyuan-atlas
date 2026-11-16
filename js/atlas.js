// 純地圖：把場域包（ATLAS_DATA + ATLAS_SITE）畫成可以旋轉、縮放的等角建築圖。按 Esc 可以把字全部藏起來。
// 沒有相機、沒有定位、沒有血量。座標：X 向東，Y 向上，Z 向南（資料裡的 y 向北，所以 z = -y）。
(function () {
  const T = THREE, D = window.ATLAS_DATA, S = window.ATLAS_SITE;
  const FONT = '"Noto Sans TC", "PingFang TC", sans-serif';
  // 調色盤：BASE 是預設值，使用者在「設定」裡改過的顏色存在瀏覽器裡，下次打開還在
  const BASE = {
    paper: '#efe7d2', slab: '#cdbd9c', ink: '#4a3b30',
    sea: '#f1ecdd', wave: '#6d8796',
    wood: '#3f6c49', lawn: '#d3dfae', lawnLine: '#4f8e58',
    major: '#c4776b', minor: '#d79c8f', lane: '#e6c4b5', foot: '#f9f3e6',
    wall: '#f3e8cb', deck: '#b9655a', pier: '#d8ccb2', key: '#d93a1e', key2: '#e9b44c',
    heroBlue: '#1a44c8', heroSky: '#2f8fe6', heroPink: '#d81b72',
  };
  const PALETTE = [['paper', '紙底'], ['ink', '墨線'], ['sea', '水面'], ['wave', '水紋'], ['wood', '樹林／山'], ['lawn', '草地'], ['lawnLine', '草地條紋'],
    ['major', '大馬路'], ['minor', '街道'], ['lane', '巷道'], ['foot', '步道'], ['wall', '建築'], ['deck', '高架橋'], ['key2', '地標／天橋'],
    ['heroBlue', '市場　深藍'], ['heroSky', '市場　淺藍'], ['heroPink', '市場　杜鵑']];
  const STORE = 'atlas-palette-' + S.id;
  // data/style.js 裡可以覆蓋預設的顏色、時間、天氣
  const STYLE = window.ATLAS_STYLE || {};
  const LIVE = Object.assign({}, BASE, STYLE.palette || {});
  const C = Object.assign({}, LIVE);
  const EDIT = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);         // 調色面板只在自己電腦上預覽時出現，發布出去的網站沒有
  if (EDIT) { try { Object.assign(C, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* 讀不到就用檔案裡的 */ } }
  const mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  function derive() {                                                           // 由主色推出深淺變化
    C.woodDark = mix(C.wood, '#000000', 0.28); C.woodLight = mix(C.wood, '#ffffff', 0.25);
    C.walls = [C.wall, mix(C.wall, '#000000', 0.04), mix(C.wall, '#ffffff', 0.4), mix(C.wall, '#000000', 0.09)];
    C.near = [mix(C.heroPink, '#ffffff', 0.58), mix(C.heroPink, '#ffffff', 0.7), mix(C.heroPink, '#ffffff', 0.46)];   // 市場四周的房子：杜鵑花的淡色
    C.mid = [mix(C.heroPink, '#ffffff', 0.82), mix(C.heroPink, '#fff3d6', 0.86), mix(C.heroPink, '#ffffff', 0.76)];
  }
  derive();
  const HW = D.half[0], HH = D.half[1];
  const KX = 111320 * Math.cos((D.center.lat * Math.PI) / 180), KY = 110540;
  const toXY = (p) => ({ x: (p.lng - D.center.lng) * KX, y: (p.lat - D.center.lat) * KY });
  const LIGHT = new T.Vector3(0.7, -0.9, 0.42).normalize();                      // 光的方向，跟著時間變（見 applySky）

  const stage = document.getElementById('atlas'), canvas = document.getElementById('atlas-gl'), tags = document.getElementById('atlas-tags');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;                                         // 樓層介紹要把主體從某一層以上切掉
  const slices = [];                                                            // 主體切成一層一片，爆炸圖時各自往上移
  let heroSrc = [], skyHolder = null, survey = false, floorAt = -1;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  const HOME = { az: -0.62, el: 0.66 };
  const view = { az: HOME.az, el: HOME.el, size: 420, tx: 0, tz: 0, ty: 0 };
  let dirty = true, grow = 0, tween = null, fit = 420;

  // ---------- 紋理 ----------
  function sheet(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  function tile(c, metres) {                                                    // 一張紋理鋪多少公尺
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(1 / metres, 1 / (metres * c.height / c.width));
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const texPaper = () => tile(sheet(256, 256, (g, w, h) => {
    g.fillStyle = C.paper; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,96,60,.07)' : 'rgba(255,255,255,.22)';
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
  }), 60);

  // 水：青海波。每個波是一疊同心圓，下一排蓋住上一排的下半部
  const texWaves = () => tile(sheet(256, 128, (g, w, h) => {
    const R = w / 2;
    g.fillStyle = C.sea; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.wave; g.lineWidth = 2.2;
    for (let j = -1; j <= 4; j++) {
      for (let i = -1; i <= 2; i++) {
        const cx = i * w + (j % 2 ? R : 0), cy = j * (h / 2);
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = C.sea; g.fill();
        for (let k = 0; k < 6; k++) {
          const r = R * (1 - k * 0.165);
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        }
        g.beginPath(); g.arc(cx - R * 0.02, cy, R * 0.07, Math.PI * 0.2, Math.PI * 1.7); g.stroke();   // 波心的小捲
      }
    }
  }), 30);

  const texWood = () => tile(sheet(256, 256, (g, w, h) => {
    g.fillStyle = C.wood; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() < 0.62 ? C.woodDark : C.woodLight;
      const r = 0.6 + rnd() * 1.5;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
    }
  }), 44);

  const texLawn = () => tile(sheet(64, 64, (g, w, h) => {
    g.fillStyle = C.lawn; g.fillRect(0, 0, w, h);
    g.fillStyle = C.lawnLine;
    for (let x = 0; x < w; x += 16) g.fillRect(x + 3, 0, 5, h);
  }), 9);

  const texRoad = (base) => tile(sheet(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      for (let x = (y / 8) % 2 ? 0 : 8; x < w; x += 16) {
        g.fillStyle = 'rgba(110,50,40,.16)'; g.fillRect(x, y + 3, 9, 1.6);
        g.fillStyle = 'rgba(255,240,225,.2)'; g.fillRect(x + 2, y + 6, 6, 1.2);
      }
    }
  }), 16);

  // 建築表面的細線：樓層線加上直條，貼在牆上是窗帶，貼在屋頂是格線
  const texPanel = () => tile(sheet(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,60,40,.34)';
    g.fillRect(0, 0, w, 3); g.fillRect(0, 64, w, 3);
    g.fillStyle = 'rgba(90,60,40,.17)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
  }), 6.4);

  // 樹：水滴形的樹冠、點描、白色枝條。六種顏色排成 3 × 2
  const TREE_FILL = ['#c6bd55', '#9fbf7a', '#6fae9c', '#86aecb', '#d7cf74', '#4f978b'];
  const TREE_DOT = ['#e3dc8c', '#c9dba5', '#a7d2c4', '#b9d3e6', '#f0ebb0', '#86c0b3'];
  const TREE_SPECK = ['#b0577a', '#557f4a', '#3f7f76', '#c25f86', '#a39a3c', '#2f6f69'];
  function texTrees() {
    const CW = 160, CH = 256;
    const c = sheet(CW * 3, CH * 2, (g) => {
      for (let v = 0; v < 6; v++) {
        g.save(); g.translate((v % 3) * CW, Math.floor(v / 3) * CH);
        const cx = CW / 2, top = 10, bot = CH - 44, r = CW * 0.4;
        const crown = () => {
          g.beginPath(); g.moveTo(cx, top);
          g.bezierCurveTo(cx + r * 0.42, top + (bot - top) * 0.34, cx + r, bot - r * 1.5, cx + r, bot - r);
          g.arc(cx, bot - r, r, 0, Math.PI);
          g.bezierCurveTo(cx - r, bot - r * 1.5, cx - r * 0.42, top + (bot - top) * 0.34, cx, top);
          g.closePath();
        };
        crown(); g.fillStyle = TREE_FILL[v]; g.fill();
        g.save(); crown(); g.clip();
        for (let i = 0; i < 420; i++) {
          const k = rnd();
          g.fillStyle = k < 0.6 ? TREE_DOT[v] : k < 0.86 ? TREE_SPECK[v] : '#ffffff';
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.fillRect(rnd() * CW, rnd() * CH, 2 + rnd() * 3, 2 + rnd() * 3);
        }
        g.restore();
        g.globalAlpha = 1; g.strokeStyle = '#fbfaf2'; g.lineCap = 'round';
        const limb = (x1, y1, x2, y2, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
        limb(cx, CH - 4, cx, top + 52, 5);                                      // 樹幹一路往上
        for (let i = 0; i < 4; i++) {                                           // 左右交錯的枝
          const y = bot - r * 0.5 - i * 34, len = (r * 0.78) * (1 - i * 0.17), side = i % 2 ? 1 : -1;
          limb(cx, y, cx + side * len, y - len * 0.9, 3.4);
          limb(cx + side * len * 0.5, y - len * 0.45, cx + side * len * 0.5, y - len * 0.45 - len * 0.5, 2.4);
          limb(cx, y + 14, cx - side * len * 0.7, y + 14 - len * 0.62, 3);
        }
        g.restore();
      }
    });
    const t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ---------- 模式用的登記簿 ----------
  const fills = [], inks = [], solidOnly = [], heightOnly = [], roofOnly = [], crowd = [], colorOnly = [];
  const lensObj = { walk: [], car: [], height: [], reach: [] };
  const fill = (m) => { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; fills.push(m); return m; };   // 有顏色的面
  const ink = (opacity) => { const m = new T.LineBasicMaterial({ color: C.ink, transparent: true, opacity }); m.userData.base = opacity; inks.push(m); return m; };
  let mode = 'a', lens = 'map', bare = false;                                  // lens：分析模式
  const blobs = [];

  // ---------- 地面的各層 ----------
  const up = (geo) => geo.rotateX(-Math.PI / 2);                                // 把畫在 XY 的形狀放平：(x, y) → (x, 0, -y)
  function shapes(list) {
    return list.map((rings) => {
      const s = new T.Shape(rings[0].map((p) => new T.Vector2(p[0], p[1])));
      for (let i = 1; i < rings.length; i++) s.holes.push(new T.Path(rings[i].map((p) => new T.Vector2(p[0], p[1]))));
      return s;
    });
  }
  function layer(list, tex, y) {
    if (!list.length) return;
    const m = new T.Mesh(up(new T.ShapeGeometry(shapes(list))), fill(new T.MeshLambertMaterial({ map: tex })));
    m.position.y = y; m.receiveShadow = true;
    scene.add(m);
  }
  function outline(list, y, opacity) {                                          // 沿著多邊形邊緣描一圈墨線
    const pts = [];
    list.forEach((rings) => rings.forEach((r) => {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if (Math.abs(a[0]) > HW - 0.3 && Math.abs(b[0]) > HW - 0.3) continue;   // 貼著圖框的邊不描
        if (Math.abs(a[1]) > HH - 0.3 && Math.abs(b[1]) > HH - 0.3) continue;
        pts.push(a[0], y, -a[1], b[0], y, -b[1]);
      }
    }));
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const l = new T.LineSegments(g, ink(opacity));
    scene.add(l);
    return l;
  }

  function ground() {
    const slab = new T.Mesh(new T.BoxGeometry(HW * 2, 14, HH * 2), fill(new T.MeshLambertMaterial({ color: C.slab })));
    slab.position.y = -7.05; scene.add(slab);
    const top = new T.Mesh(up(new T.PlaneGeometry(HW * 2, HH * 2)), fill(new T.MeshLambertMaterial({ map: texPaper() })));
    top.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? HH * 2 : HW * 2); });
    top.receiveShadow = true; scene.add(top);
    layer(D.water, texWaves(), 0.06);
    layer(D.lawn, texLawn(), 0.12);
    layer(D.wood, texWood(), 0.18);
    layer(D.foot, texRoad(C.foot), 0.24);
    layer(D.lane, texRoad(C.lane), 0.3);
    layer(D.minor, texRoad(C.minor), 0.36);
    layer(D.major, texRoad(C.major), 0.42);
    outline(D.water, 0.5, 0.55); outline(D.wood, 0.5, 0.45); outline(D.major, 0.5, 0.4); outline(D.minor, 0.5, 0.28); outline(D.foot, 0.5, 0.22);
  }

  // ---------- 山形：樹林一層一層疊高，像等高線模型 ----------
  const RISE = 3.2;
  function hills() {
    const tex = texWood(), base = new T.Color('#ffffff'), tip = new T.Color('#fff3c4');
    (D.hills || []).forEach((level, i) => {
      const g = new T.ExtrudeGeometry(shapes(level), { depth: RISE, bevelEnabled: false, curveSegments: 1 });
      const mat = fill(new T.MeshLambertMaterial({ map: tex, color: base.clone().lerp(tip, i / 11) }));
      const m = new T.Mesh(up(g), mat);
      m.position.y = 0.2 + i * RISE; m.castShadow = m.receiveShadow = true;
      scene.add(m);
      outline(level, 0.25 + (i + 1) * RISE, 0.6);
    });
  }

  // ---------- 建築：一棟一個柱體，全部併成一個網格 ----------
  const inside = (p, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p.y) !== (b[1] > p.y) && p.x < ((b[0] - a[0]) * (p.y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  function houseAt(p, reach) {                                                  // 這個點落在哪一棟上；沒有就找最近的
    let best = null, bd = reach;
    for (const b of D.buildings) {
      if (inside(p, b.p)) return b;
      const cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cy = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // 水源市場的底：淺藍的樓身。立面上的層板、格子、塔樓都是另外疊上去的積木（見 roofs）
  function texFacade() {
    const t = new T.CanvasTexture(sheet(1024, 512, (g) => {
      g.fillStyle = C.heroSky; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = mix(C.heroSky, C.heroBlue, 0.5); g.fillRect(0, 412, 1024, 100);       // 底層
      g.fillStyle = '#dfe5ec'; g.fillRect(846, 0, 28, 512);                                // 屋頂
    }));
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function heroMesh(b, edge) {
    const pos = [], nor = [], uv = [];
    let ring = b.p, area = 0;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; area += a[0] * c[1] - c[0] * a[1]; }
    if (area < 0) ring = ring.slice().reverse();
    const h = b.h;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const u = len >= 26 ? [0.006, 0.594] : len >= 11 ? [0.633, 0.817] : [0.868, 0.994];   // 牆越寬，用越熱鬧的那一區
      pos.push(a[0], 0, -a[1], c[0], 0, -c[1], c[0], h, -c[1], a[0], 0, -a[1], c[0], h, -c[1], a[0], h, -a[1]);
      uv.push(u[0], 0, u[1], 0, u[1], 1, u[0], 0, u[1], 1, u[0], 1);
      for (let k = 0; k < 6; k++) nor.push(dy / len, 0, dx / len);
      edge.push(a[0], h, -a[1], c[0], h, -c[1], a[0], 0.5, -a[1], c[0], 0.5, -c[1], a[0], 0.5, -a[1], a[0], h, -a[1]);
    }
    T.ShapeUtils.triangulateShape(ring.map((p) => new T.Vector2(p[0], p[1])), []).forEach((f) => {
      f.forEach((i) => { pos.push(ring[i][0], h, -ring[i][1]); nor.push(0, 1, 0); uv.push(0.84, 0.5); });
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return new T.Mesh(g, fill(new T.MeshLambertMaterial({ map: texFacade(), side: T.DoubleSide })));
  }

  const FLOORS = S.floors || [];                                                // 主體的樓層（由下往上），高度以公尺計
  let town;
  function buildings() {
    let hero = null;
    D.buildings.forEach((b) => { delete b.tone; });
    S.notes.forEach((s) => {
      s.at = toXY(s);
      const b = s.mark && houseAt(s.at, 60);
      if (b && !b.tone) { b.tone = s.mark === 'main' ? C.key : C.key2; s.h = b.h; if (s.mark === 'main') { hero = s; b.hero = true; b.h = FLOORS.length ? FLOORS[FLOORS.length - 1].to : Math.max(b.h, 40); s.h = b.h; } }
    });
    if (hero) {                                                                 // 主體四周的房子染成暖色，越近越濃；再遠的維持米色
      D.buildings.forEach((b, n) => {
        const d = Math.hypot(b.p[0][0] - hero.at.x, b.p[0][1] - hero.at.y);
        if (!b.tone && d < 150) b.tone = d < 85 ? C.near[n % C.near.length] : C.mid[n % C.mid.length];
      });
      const ring = [];
      for (let k = 0; k < 96; k += 2) {
        const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
        ring.push(hero.at.x + Math.cos(a0) * 150, 0.8, -hero.at.y + Math.sin(a0) * 150, hero.at.x + Math.cos(a1) * 150, 0.8, -hero.at.y + Math.sin(a1) * 150);
      }
      const rg = new T.BufferGeometry();
      rg.setAttribute('position', new T.Float32BufferAttribute(ring, 3));
      const halo = new T.LineSegments(rg, new T.LineBasicMaterial({ color: C.heroPink }));
      scene.add(halo); colorOnly.push(halo);
    }
    const edge = [], white = new T.Color('#ffffff');
    const color = new T.Color(), roof = new T.Color();
    const mass = (pick, pale, ramp) => {                                        // ramp：依高度上色
    const pos = [], nor = [], col = [], uv = [];
    D.buildings.forEach((b, n) => {
      if (!pick(b)) return;
      let ring = b.p;
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; area += a[0] * c[1] - c[0] * a[1]; }
      if (area < 0) ring = ring.slice().reverse();
      const h = b.h;
      color.set(b.tone || C.walls[n % C.walls.length]);
      if (pale) color.lerp(white, 0.45);
      if (ramp) color.set(heightTone(b.h));
      roof.set(b.tone === C.key ? C.roofKey : b.tone || C.walls[n % C.walls.length]).lerp(white, b.hero ? 0 : pale ? 0.6 : b.tone ? 0.12 : 0.3);
      if (ramp) roof.set(heightTone(b.h)).lerp(white, 0.18);
      let run = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, nz = dx / len;
        const bands = b.hero ? 3 : 1;                                           // 主體的牆分成三段顏色，由下往上變亮
        for (let s = 0; s < bands; s++) {
          const y0 = (h * s) / bands, y1 = (h * (s + 1)) / bands;
          if (b.hero) color.set(C.band[s]);
          pos.push(a[0], y0, -a[1], c[0], y0, -c[1], c[0], y1, -c[1], a[0], y0, -a[1], c[0], y1, -c[1], a[0], y1, -a[1]);
          uv.push(run, y0, run + len, y0, run + len, y1, run, y0, run + len, y1, run, y1);
          for (let k = 0; k < 6; k++) { nor.push(nx, 0, nz); col.push(color.r, color.g, color.b); }
          if (s && !pale && !ramp) edge.push(a[0], y0, -a[1], c[0], y0, -c[1]);
        }
        run += len;
        if (pale || ramp) continue;
        edge.push(a[0], h, -a[1], c[0], h, -c[1], a[0], 0.5, -a[1], c[0], 0.5, -c[1]);
        const p = ring[(i + ring.length - 1) % ring.length];                    // 轉角夠明顯才畫直立的稜線
        const turn = Math.abs(Math.atan2(dx * (a[1] - p[1]) - dy * (a[0] - p[0]), dx * (a[0] - p[0]) + dy * (a[1] - p[1])));
        if (turn > 0.4) edge.push(a[0], 0.5, -a[1], a[0], h, -a[1]);
      }
      T.ShapeUtils.triangulateShape(ring.map((p) => new T.Vector2(p[0], p[1])), []).forEach((f) => {
        f.forEach((i) => {
          pos.push(ring[i][0], h, -ring[i][1]); nor.push(0, 1, 0); col.push(roof.r, roof.g, roof.b);
          uv.push(ring[i][0], ring[i][1]);
        });
      });
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
    };
    const panel = texPanel(), solidMat = fill(new T.MeshLambertMaterial({ vertexColors: true, map: panel, side: T.DoubleSide }));
    const solid = new T.Mesh(mass((b) => !b.hero, false), solidMat);            // 標準：不透明的量體
    const tall = new T.Mesh(mass((b) => !b.hero, false, true), fill(new T.MeshLambertMaterial({ vertexColors: true, map: panel, side: T.DoubleSide })));   // 分析：依高度上色
    const heroEdge = [], main = heroMesh(D.buildings.find((b) => b.hero), heroEdge);   // 主體：自己一組稜線，樓層介紹時才能一起切掉
    const hg = new T.BufferGeometry();
    hg.setAttribute('position', new T.Float32BufferAttribute(heroEdge, 3));
    const heroLines = new T.LineSegments(hg, ink(0.8)); heroLines.renderOrder = 3;
    heroSrc = [main, heroLines];
    [solid, main, tall].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    solidOnly.push(solid); heightOnly.push(tall);
    const eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
    const lines = new T.LineSegments(eg, ink(0.8));
    lines.renderOrder = 3;
    town = new T.Group(); town.add(solid, tall, lines); scene.add(town);
    heroRing = D.buildings.find((b) => b.hero).p;
    roofs();
  }

  // 依高度上色的色階：矮的淡黃，越高越往桃紅、紫
  const RAMP = [[0, '#fdf3c8'], [10, '#fbd791'], [18, '#f7a76f'], [28, '#ea6a7c'], [42, '#b8408f'], [70, '#6b2a86']];
  function heightTone(h) {
    for (let i = 1; i < RAMP.length; i++) if (h <= RAMP[i][0]) return mix(RAMP[i - 1][1], RAMP[i][1], (h - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
    return RAMP[RAMP.length - 1][1];
  }

  // ---------- 小零件的積木：盒子、斜屋頂、水塔。每個面自己算法線，一律朝外 ----------
  function kit() {
    const pos = [], nor = [], col = [], edge = [], c = new T.Color();
    const face = (pts, mid) => {                                                // 一個平面（三或四個點），朝離 mid 遠的那一側
      const a = pts[0], b = pts[1], d = pts[2];
      let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      const out = (a[0] - mid[0]) * nx + (a[1] - mid[1]) * ny + (a[2] - mid[2]) * nz < 0;
      if (out) { nx = -nx; ny = -ny; nz = -nz; }
      const order = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
      (out ? order.slice().reverse() : order).forEach((i) => { pos.push(pts[i][0], pts[i][1], pts[i][2]); nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); });
    };
    const line = (a, b) => edge.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    // (x, y) 是資料座標的中心，a 是長邊的方向，hu / hv 是半長、半寬
    const corners = (x, y, a, hu, hv, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
      [x + Math.cos(a) * hu * i - Math.sin(a) * hv * j, h, -(y + Math.sin(a) * hu * i + Math.cos(a) * hv * j)]);
    return {
      tone: (hex) => c.set(hex),
      box(x, y, a, hu, hv, y0, y1) {
        const lo = corners(x, y, a, hu, hv, y0), hi = corners(x, y, a, hu, hv, y1), mid = [x, (y0 + y1) / 2, -y];
        face(hi, mid);
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; face([lo[i], lo[j], hi[j], hi[i]], mid); line(hi[i], hi[j]); line(lo[i], hi[i]); }
      },
      roof(x, y, a, hu, hv, y0, rise, lean) {                                   // 屋脊沿著長邊；lean = 0 是兩坡，接近 1 是鋸齒
        const lo = corners(x, y, a, hu, hv, y0), top = corners(x, y, a, hu, hv * lean, y0 + rise), r0 = top[3], r1 = top[2], mid = [x, y0 + rise * 0.3, -y];
        face([lo[0], lo[1], r1, r0], mid); face([lo[3], lo[2], r1, r0], mid);
        face([lo[0], lo[3], r0], mid); face([lo[1], lo[2], r1], mid);
        line(r0, r1); line(lo[0], r0); line(lo[3], r0); line(lo[1], r1); line(lo[2], r1); line(lo[0], lo[1]); line(lo[3], lo[2]);
      },
      tank(x, y, r, y0, y1) {
        const ring = [], mid = [x, (y0 + y1) / 2, -y];
        for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2; ring.push([x + Math.cos(t) * r, -y + Math.sin(t) * r]); }
        ring.forEach((p, k) => {
          const q = ring[(k + 1) % 10];
          face([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], mid);
          face([[x, y1, -y], [p[0], y1, p[1]], [q[0], y1, q[1]]], mid);
          line([p[0], y1, p[1]], [q[0], y1, q[1]]);
        });
      },
      mesh() {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        const m = new T.Mesh(g, fill(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
        m.castShadow = m.receiveShadow = true;
        const eg = new T.BufferGeometry();
        eg.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
        const l = new T.LineSegments(eg, ink(0.7)); l.renderOrder = 3;
        const grp = new T.Group(); grp.add(m, l);
        return grp;
      },
    };
  }

  // ---------- 水源市場的細部：只有主體有，其他量體保持乾淨的方塊 ----------
  // 沿著每一面牆疊積木：寬牆是正面（層板、杜鵑花格子、兩側深藍塔樓、底層的雨遮與店面），
  // 中等的牆是側面（一層一層粉紫色塊與窗帶），窄牆是深藍的柱子。屋頂有女兒牆、機房、水塔、旗子。
  function roofs() {
    const b = D.buildings.find((x) => x.hero);
    if (!b) return;
    const k = kit(), blue = C.heroBlue, sky = C.heroSky, pink = C.heroPink, soft = mix(pink, '#ffffff', 0.6), lilac = mix(mix(sky, '#ffffff', 0.62), pink, 0.14), white = '#f6f9ff';
    let ring = b.p, area = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; area += a[0] * c[1] - c[0] * a[1]; cx += a[0]; cy += a[1]; }
    if (area < 0) ring = ring.slice().reverse();
    cx /= ring.length; cy /= ring.length;
    const h = b.h, FLOOR = 3.4;
    let wide = null;
    ring.forEach((a, i) => {
      const c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 0.8) return;
      const ang = Math.atan2(dy, dx), ux = dx / len, uy = dy / len, nx = uy, ny = -ux;       // (nx, ny)：這面牆朝外的方向
      // 貼在牆上的盒子：從牆的起點算 s0 到 s1 公尺，往外凸 out 公尺，高度 y0 到 y1
      const slab = (s0, s1, out, y0, y1) => { const m = (s0 + s1) / 2; k.box(a[0] + ux * m + nx * out / 2, a[1] + uy * m + ny * out / 2, ang, (s1 - s0) / 2, out / 2, y0, y1); };
      k.tone(mix(sky, '#ffffff', 0.25)); k.box((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, ang, len / 2, 0.22, h, h + 1.1);   // 女兒牆
      if (len >= 26) {
        if (!wide || len > wide.len) wide = { len, ang };
        const e = len * 0.085;
        k.tone(blue); slab(0, e, 1.1, 0, h + 3); slab(len - e, len, 1.1, 0, h + 3);                      // 兩側的深藍塔樓
        k.tone('#2f9c8a'); slab(e, len - e, 2.6, 4.7, 5.1);                                              // 雨遮
        k.tone('#14275e'); for (let s = e + 1.5; s + 4 < len - e; s += 6.2) slab(s, s + 4.4, 0.3, 0.6, 4.3);   // 店面
        k.tone(white); slab(len * 0.22, len * 0.52, 0.35, 6.1, 7.5);                                     // 招牌
        for (let y = 9.2; y + 2 < h - 1.5; y += FLOOR) {                                                 // 一層一層的層板，越往中間越淡
          k.tone(mix(sky, '#ffffff', 0.18)); slab(e, len - e, 0.55, y, y + 0.4);
          k.tone(mix(sky, '#ffffff', 0.45)); slab(len * 0.2, len * 0.8, 0.8, y + 0.4, y + 1.5);
          k.tone(lilac); slab(len * 0.31, len * 0.69, 1.05, y + 0.4, y + 2.1);
        }
        const p0 = len * 0.385, cols = 10, cw = (len * 0.23) / cols, y0 = h * 0.3, rows = 12, ch = (h * 0.52) / rows;   // 杜鵑花格子
        for (let col = 0; col < cols; col++) {
          for (let r = 0; r < rows; r++) {
            const v = rnd();
            k.tone(col % 2 ? (v < 0.5 ? white : v < 0.85 ? soft : pink) : (v < 0.62 ? pink : v < 0.9 ? soft : blue));
            slab(p0 + col * cw, p0 + (col + 1) * cw, col % 2 ? 1.5 : 1.9, y0 + r * ch, y0 + (r + 1) * ch);
          }
        }
      } else if (len >= 11) {
        k.tone(blue); slab(0, 1.6, 0.7, 0, h + 1.6); slab(len - 1.6, len, 0.7, 0, h + 1.6);
        k.tone('#14275e'); slab(2.4, len - 2.4, 0.3, 0.6, 4.2);
        for (let y = 8.4; y + 3 < h - 1; y += FLOOR) {
          k.tone('#1b2c5c'); slab(2, len - 2, 0.25, y + 1.5, y + 2.9);                                   // 窗帶
          for (let s0 = 2; s0 < len - 2.2;) {                                                            // 一排粉紫色塊
            const w = Math.min(1.4 + rnd() * 3, len - 2 - s0), v = rnd();
            k.tone(v < 0.34 ? pink : v < 0.62 ? soft : v < 0.8 ? lilac : v < 0.9 ? '#f1d98a' : white);
            slab(s0, s0 + w, 0.55, y, y + 1.4); s0 += w;
          }
        }
      } else if (len >= 3) {
        k.tone(blue); slab(0, len, 0.45, 0, h + 2.2);                                                    // 窄牆：深藍柱子，一串粉色短條
        for (let y = 7; y + 2 < h; y += FLOOR * 2) { k.tone(((y / FLOOR) | 0) % 2 ? pink : soft); slab(len / 2 - 0.6, len / 2 + 0.6, 0.75, y, y + 1.9); }
      }
    });
    // 屋頂：灰白的機房加斜屋頂、水塔、太陽能板、旗子
    const ang = wide ? wide.ang : 0, cu = Math.cos(ang), su = Math.sin(ang), at = (u, v) => [cx + cu * u - su * v, cy + su * u + cu * v];
    const ok = (u, v, hu, hv) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => { const q = at(u + i * (hu + 1), v + j * (hv + 1)); return inside({ x: q[0], y: q[1] }, ring); });
    let hu = 16, hv = 9;
    while (hu > 4 && !ok(0, 0, hu, hv)) { hu *= 0.85; hv *= 0.85; }
    if (ok(0, 0, hu, hv)) {
      k.tone('#e9edf2'); k.box(cx, cy, ang, hu, hv, h, h + 4.2);
      k.tone('#c9d1da'); k.roof(cx, cy, ang, hu + 0.5, hv + 0.5, h + 4.2, 2.4, 0);
      k.tone('#14275e'); for (let u = -hu + 2; u < hu - 2; u += 4) { const q = at(u, -hv - 0.08); k.box(q[0], q[1], ang, 1.2, 0.1, h + 1.2, h + 3); }
    }
    [[-1, -1], [1, 1], [1, -1], [-1, 1]].forEach(([i, j], n) => {
      const u = i * (hu + 5), v = j * (hv + 4);
      if (n < 2 && ok(u, v, 1.9, 1.9)) { const q = at(u, v); k.tone('#9fb1bf'); k.tank(q[0], q[1], 1.8, h + 0.6, h + 3.6); k.tone('#7c8c99'); k.box(q[0], q[1], ang, 1.5, 1.5, h, h + 0.6); }
      else if (n >= 2 && ok(u, v, 3.4, 2.2)) { k.tone('#56677a'); [-1.2, 1.2].forEach((o) => { const q = at(u, v + o); k.box(q[0], q[1], ang, 3.2, 0.85, h + 0.3, h + 0.55); }); }
    });
    if (ok(0, -hv - 3, 0.3, 0.3)) { const q = at(0, -hv - 3); k.tone('#6b7885'); k.box(q[0], q[1], ang, 0.12, 0.12, h, h + 8); k.tone('#d93a1e'); const f = at(1.3, -hv - 3); k.box(f[0], f[1], ang, 1.2, 0.06, h + 6.2, h + 7.8); }
    // 每一層的樓板和一點室內：市場是一格一格的攤位，辦公樓層是隔間，劇場是舞台和階梯座位。平常藏在樓裡，樓層介紹切開才看得到
    const tones = { market: mix(pink, '#ffffff', 0.78), office: '#e3ecf7', theatre: '#e6dcf0' };
    const stall = [soft, '#f1d98a', '#9fd3c7', white, '#f29a6b', lilac];
    const plate = new T.Shape(ring.map((q) => new T.Vector2(q[0], q[1]))), plates = [];
    FLOORS.forEach((f, n) => {
      const m = new T.Mesh(up(new T.ShapeGeometry(plate)), fill(new T.MeshLambertMaterial({ color: tones[f.kind] || tones.office })));
      m.position.y = f.from + 0.08; m.receiveShadow = true; plates.push(m);
      if (f.kind === 'market') {
        let i = n;
        for (let u = -22; u <= 22; u += 4.6) for (let v = -22; v <= 22; v += 4.6) {
          if (!ok(u, v, 1.5, 1.5) || (Math.abs(u) < 2 && Math.abs(v) < 6)) continue;      // 中間留一條走道
          const q = at(u, v); k.tone(stall[i++ % stall.length]); k.box(q[0], q[1], ang, 1.5, 1.5, f.from + 0.1, f.from + 1.3);
        }
      } else if (f.kind === 'theatre') {
        if (ok(-13, 0, 3, 9)) { const q = at(-13, 0); k.tone('#3b2a2a'); k.box(q[0], q[1], ang, 3, 9, f.from + 0.1, f.from + 1.1); }
        for (let i = 0; i < 8; i++) { const u = -6 + i * 2.6; if (ok(u, 0, 1, 9)) { const q = at(u, 0); k.tone(mix('#7a4a8c', '#ffffff', (i % 2) * 0.15)); k.box(q[0], q[1], ang, 1, 9, f.from + 0.1, f.from + 0.5 + i * 0.35); } }
      } else {
        for (let u = -18; u <= 18; u += 7) if (ok(u, 0, 0.15, 10)) { const q = at(u, 0); k.tone('#b9c7d8'); k.box(q[0], q[1], ang, 0.12, 10, f.from + 0.1, f.from + 2.3); }
        for (let u = -15; u <= 15; u += 7) for (let v = -8; v <= 8; v += 5.5) if (ok(u, v, 1.2, 0.7)) { const q = at(u, v); k.tone('#d9c3a0'); k.box(q[0], q[1], ang, 1.2, 0.7, f.from + 0.1, f.from + 0.85); }
      }
    });
    const grp = k.mesh(), src = heroSrc.concat(grp.children);
    const levels = FLOORS.length ? FLOORS.map((f, i) => ({ from: i ? f.from : -5, to: i === FLOORS.length - 1 ? f.to - 0.02 : f.to, mid: (f.from + f.to) / 2 })) : [{ from: -5, to: h - 0.02, mid: h / 2 }];
    levels.push({ from: h - 0.02, to: 9999, mid: h + 3 });                      // 最上面一片是屋頂
    levels.forEach((lv, i) => {
      const g = new T.Group(), lo = new T.Plane(new T.Vector3(0, 1, 0), 0), hi = new T.Plane(new T.Vector3(0, -1, 0), 0);
      src.forEach((o) => { const c = o.clone(); c.material = o.material.clone(); c.material.clippingPlanes = [lo, hi]; c.castShadow = o.castShadow && i === 0; g.add(c); });
      if (plates[i]) g.add(plates[i]);
      town.add(g); slices.push({ g, lo, hi, from: lv.from, to: lv.to, mid: lv.mid, at: 0 });
    });
    layoutHero(1);
  }

  // ---------- 天橋：從市場二樓接出去，跨過羅斯福路。橋面、欄杆、橋墩、兩端的樓梯 ----------
  function skywalk() {
    const p = heroSpan, second = FLOORS[1];
    if (!p) return;
    const k = kit(), H = second ? second.from : 5, a = heroRing && nearRing(p[0], heroRing) < nearRing(p[p.length - 1], heroRing) ? p[0] : p[p.length - 1], b = a === p[0] ? p[p.length - 1] : p[0];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, ang = Math.atan2(uy, ux), W = 1.8;
    const at = (s, o) => [a[0] + ux * s - uy * o, a[1] + uy * s + ux * o];
    const rail = C.heroSky, deck = '#e8eef5';
    let q = at(len / 2, 0);
    k.tone(deck); k.box(q[0], q[1], ang, len / 2, W, H - 0.45, H);                                   // 橋面
    [-1, 1].forEach((side) => {                                                                      // 欄杆：上下兩道橫桿加立柱
      q = at(len / 2, side * (W - 0.08));
      k.tone(rail); k.box(q[0], q[1], ang, len / 2, 0.07, H + 1.0, H + 1.15); k.box(q[0], q[1], ang, len / 2, 0.05, H + 0.5, H + 0.58);
      k.tone('#f4f8fc'); for (let s = 0.4; s < len; s += 2.2) { const t = at(s, side * (W - 0.08)); k.box(t[0], t[1], ang, 0.06, 0.06, H, H + 1.0); }
    });
    k.tone(C.pier); for (let s = 7; s < len - 2; s += 9) { q = at(s, 0); k.box(q[0], q[1], ang, 0.45, 0.45, 0, H - 0.45); k.box(q[0], q[1], ang, 0.7, W * 0.8, H - 0.9, H - 0.45); }
    k.tone('#14275e'); q = at(-0.2, 0); k.box(q[0], q[1], ang, 0.25, W, H, H + 2.8);                 // 接進二樓的門口
    // 樓梯：一階一階往下，中間一個平台轉向。start 是橋上的起點，dir 是往下走的方向（1 或 -1，沿著跟橋垂直的方向）
    const stairs = (s, dir) => {
      const steps = 16, rise = H / steps, run = 0.55, half = steps / 2;
      q = at(s, dir * (W + 1.3)); k.tone(deck); k.box(q[0], q[1], ang, 1.3, 1.3, H - 0.3, H);       // 橋邊的平台
      for (let i = 0; i < steps; i++) {
        const top = H - (i + 1) * rise, first = i < half, o = dir * (W + 2.6 + (first ? i : steps - 1 - i) * run + run / 2), back = first ? 0 : 2.8;
        q = at(s + back, o);
        k.tone(i % 2 ? '#dfe6ee' : deck); k.box(q[0], q[1], ang, 1.3, run / 2, Math.max(0, top - 0.5), top);
      }
      q = at(s + 1.4, dir * (W + 2.6 + half * run + 1.3)); k.tone(deck); k.box(q[0], q[1], ang, 2.7, 1.3, H / 2 - 0.3, H / 2);   // 轉向的平台
      k.tone(C.pier); k.box(q[0], q[1], ang, 0.3, 0.3, 0, H / 2 - 0.3);
      k.tone(rail); [[s - 1.3, 0], [s + 4.1, 2.8]].forEach(([e]) => { const r = at(e, dir * (W + 2.6 + half * run / 2)); k.box(r[0], r[1], ang, 0.05, half * run / 2, H * 0.75 + 0.9, H * 0.75 + 1.0); });
    };
    stairs(len - 1.5, 1); stairs(len - 1.5, -1); stairs(6.5, -1);                                    // 對街兩座，市場門口一座
    skyHolder = k.mesh();
    town.add(skyHolder);
  }

  // ---------- 橋：高架橋與天橋。橋面是一條有厚度的帶子，下面每隔一段立橋墩 ----------
  let heroRing = null, heroSpan = null;
  function nearRing(q, ring) {                                                  // 點到多邊形邊緣的距離
    let best = 1e9;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t));
    }
    return best;
  }
  function bridges() {
    const pos = [], nor = [], col = [], edge = [], c = new T.Color();
    const tri = (a, b, d, n) => {                                               // 三角形一律朝 n 那一面
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
      (flip ? [a, d, b] : [a, b, d]).forEach((q) => { pos.push(q[0], q[1], q[2]); nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b); });
    };
    const quad = (a, b, d, e, n) => { tri(a, b, d, n); tri(a, d, e, n); };
    (D.bridges || []).forEach((b) => {
      const p = b.p, foot = b.k === 'foot', thick = foot ? 0.7 : 1.5, top = foot ? C.key2 : C.deck, side = foot ? '#f6efdc' : C.pier;
      if (p.length < 2 || Math.max(...p.map((q) => q[2])) < 2.5) return;
      if (foot && heroRing && [p[0], p[p.length - 1]].some((q) => nearRing(q, heroRing) < 4)) { heroSpan = p; return; }   // 接在市場上的天橋另外細做
      const L = [], R = [];
      p.forEach((q, i) => {
        const a = p[Math.max(0, i - 1)], d = p[Math.min(p.length - 1, i + 1)], len = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1;
        const nx = -(d[1] - a[1]) / len, ny = (d[0] - a[0]) / len, y = Math.max(0.6, q[2]);
        L.push([q[0] + nx * b.w, y, -(q[1] + ny * b.w), nx, -ny]); R.push([q[0] - nx * b.w, y, -(q[1] - ny * b.w)]);
      });
      let run = 0;
      for (let i = 0; i < p.length - 1; i++) {
        const l0 = L[i], l1 = L[i + 1], r0 = R[i], r1 = R[i + 1], low = (q) => [q[0], Math.max(0.5, q[1] - thick), q[2]];
        c.set(top); quad(l0, r0, r1, l1, [0, 1, 0]);
        c.set(side); quad(l0, l1, low(l1), low(l0), [l0[3], 0, l0[4]]); quad(r0, r1, low(r1), low(r0), [-l0[3], 0, -l0[4]]);
        edge.push(l0[0], l0[1], l0[2], l1[0], l1[1], l1[2], r0[0], r0[1], r0[2], r1[0], r1[1], r1[2]);
        edge.push(l0[0], low(l0)[1], l0[2], l1[0], low(l1)[1], l1[2], r0[0], low(r0)[1], r0[2], r1[0], low(r1)[1], r1[2]);
        if (i === 0 || i === p.length - 2) {                                    // 兩端各補一個圓，跟下一段橋接起來才不會有缺口
          const e = i === 0 ? p[0] : p[p.length - 1], ey = Math.max(0.6, e[2]);
          c.set(top);
          for (let t = 0; t < 12; t++) {
            const a0 = (t / 12) * Math.PI * 2, a1 = ((t + 1) / 12) * Math.PI * 2;
            tri([e[0], ey, -e[1]], [e[0] + Math.cos(a0) * b.w, ey, -e[1] + Math.sin(a0) * b.w], [e[0] + Math.cos(a1) * b.w, ey, -e[1] + Math.sin(a1) * b.w], [0, 1, 0]);
          }
          c.set(side);
          for (let t = 0; t < 12; t++) {
            const a0 = (t / 12) * Math.PI * 2, a1 = ((t + 1) / 12) * Math.PI * 2, low = Math.max(0.5, ey - thick);
            const q0 = [e[0] + Math.cos(a0) * b.w, -e[1] + Math.sin(a0) * b.w], q1 = [e[0] + Math.cos(a1) * b.w, -e[1] + Math.sin(a1) * b.w];
            quad([q0[0], ey, q0[1]], [q1[0], ey, q1[1]], [q1[0], low, q1[1]], [q0[0], low, q0[1]], [Math.cos(a0), 0, Math.sin(a0)]);
          }
        }
        run += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        if (run > (foot ? 16 : 30) && p[i + 1][2] > 3.5) {                      // 橋墩
          run = 0; c.set(C.pier);
          const h = p[i + 1][2] - thick, r = foot ? 0.45 : 1.1;
          (foot || b.w < 5 ? [0] : [-0.55, 0.55]).forEach((k) => {
            const x = p[i + 1][0] + l1[3] * b.w * k, z = -p[i + 1][1] + l1[4] * b.w * k;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ax, az]) => {
              const sx = az * r, sz = ax * r, ox = x + ax * r, oz = z + az * r;
              quad([ox - sx, 0, oz - sz], [ox + sx, 0, oz + sz], [ox + sx, h, oz + sz], [ox - sx, h, oz - sz], [ax, 0, az]);
            });
          });
        }
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const mesh = new T.Mesh(g, fill(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })));
    mesh.castShadow = mesh.receiveShadow = true;
    const eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
    const bl = new T.LineSegments(eg, ink(0.8)); bl.renderOrder = 3;
    town.add(mesh, bl);
  }

  // ---------- 樹與小人：永遠面向鏡頭、直立的紙片，各自併成一個網格 ----------
  const growers = [];
  function standees(items, w, h, cols, rows, tex, shadow, lift) {
    const pos = [], corner = [], uv = [], idx = [], shade = [], sidx = [];
    items.forEach((t, i) => {
      const u0 = (t[3] % cols) / cols, v0 = 1 - (Math.floor(t[3] / cols) + 1) / rows;
      [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]].forEach((q) => {
        pos.push(t[0], 0.5 + (lift ? lift(t) : 0), -t[1]); corner.push(q[0] * w * t[2], q[1] * h * t[2]); uv.push(u0 + q[2] / cols, v0 + q[3] / rows);
      });
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      const r = shadow * t[2], cx = t[0], cz = -t[1], sy = 0.55 + (lift ? lift(t) : 0), base = shade.length / 3;   // 地上的影子（整片再依光的方向平移）
      shade.push(cx, sy, cz);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        shade.push(cx + Math.cos(a) * r * 1.25, sy, cz + Math.sin(a) * r * 0.8);
        sidx.push(base, base + 1 + ((k + 1) % 10), base + 1 + k);
      }
    });
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.Float32BufferAttribute(shade, 3)); sg.setIndex(sidx);
    const grp = new T.Group();
    const blob = new T.Mesh(sg, new T.MeshBasicMaterial({ color: '#23382c', transparent: true, opacity: 0.24, depthWrite: false }));
    blobs.push({ mesh: blob, k: shadow * 1.6 });
    grp.add(blob);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('corner', new T.Float32BufferAttribute(corner, 2));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new T.ShaderMaterial({
      uniforms: { map: { value: tex }, grow: { value: 0 } },
      vertexShader: 'attribute vec2 corner; uniform float grow; varying vec2 vUv;' +
        'void main(){ vUv = uv; vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);' +
        'vec3 p = position + right * corner.x * grow + vec3(0.0, corner.y * grow, 0.0);' +
        'gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv;' +
        'void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb, 1.0); }',
    });
    const m = new T.Mesh(g, mat); m.frustumCulled = false;
    grp.add(m); scene.add(grp); growers.push(mat);
    return grp;
  }
  // 小人：四種剪影（深色、白、紅、黃），比真人大一點，遠看才看得到
  function texPeople() {
    const CW = 64, CH = 128, fills = [C.ink, '#fbf7ee', C.key, C.key2];
    const t = new T.CanvasTexture(sheet(CW * 4, CH, (g) => {
      fills.forEach((f, v) => {
        g.save(); g.translate(v * CW, 0);
        const cx = CW / 2, lean = v % 2 ? 4 : -4;
        g.fillStyle = f; g.strokeStyle = C.ink; g.lineWidth = 3; g.lineJoin = 'round';
        g.beginPath();                                                          // 身體：肩寬、往下收，兩條腿分開
        g.moveTo(cx - 13, 40); g.lineTo(cx + 13, 40); g.lineTo(cx + 10, 82);
        g.lineTo(cx + 12 + lean, 124); g.lineTo(cx + 3 + lean, 124); g.lineTo(cx, 90);
        g.lineTo(cx - 3 - lean, 124); g.lineTo(cx - 12 - lean, 124); g.lineTo(cx - 10, 82);
        g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.arc(cx, 22, 13, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
      });
    }));
    t.anisotropy = 4;
    return t;
  }

  // ---------- 寫在路面上的路名 ----------
  const words = [];
  function sign(text, x, y, angle, hgt) {                                       // 平躺在地上的一行字
    const n = [...text].length, c = sheet(66 * n + 40, 96, (g, w, h) => {
      g.font = '700 56px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = 'rgba(250,244,230,.9)';
      const x0 = w / 2 - ((n - 1) * 66) / 2;
      [...text].forEach((ch, i) => { g.strokeText(ch, x0 + i * 66, h / 2); });
      g.fillStyle = C.ink;
      [...text].forEach((ch, i) => { g.fillText(ch, x0 + i * 66, h / 2); });
    });
    let a = angle;
    while (a > Math.PI / 2) a -= Math.PI;
    while (a <= -Math.PI / 2) a += Math.PI;
    const m = new T.Mesh(up(new T.PlaneGeometry((hgt * c.width) / c.height, hgt)), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    m.rotation.y = a; m.position.set(x, 1, -y); m.renderOrder = 5;
    scene.add(m);
    return m;
  }
  function roadNames() {
    D.labels.filter((l) => S.roads.includes(l.n)).forEach((l) => { words.push(sign(l.n, l.x, l.y, l.a, 9.5)); });
  }

  // ---------- 地標：虛線引線加上兩行小字 ----------
  const pins = [];
  function markers() {
    S.notes.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'note'; el.innerHTML = '<i></i><span><b>' + s.zh + '</b>' + s.en + '</span>';
      tags.appendChild(el);
      pins.push({ el, stem: el.firstChild, at: s.at, lift: (s.h || 0) + 40 });
    });
  }
  const v = new T.Vector3();
  function place() {
    const w = stage.clientWidth, h = stage.clientHeight;
    pins.forEach((p) => {
      v.set(p.at.x, 0, -p.at.y).project(camera);
      const x = (v.x + 1) / 2 * w, y0 = (1 - v.y) / 2 * h;
      v.set(p.at.x, p.lift * grow, -p.at.y).project(camera);
      const y1 = (1 - v.y) / 2 * h;
      p.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y1.toFixed(1) + 'px)';
      p.stem.style.height = Math.max(0, y0 - y1).toFixed(1) + 'px';
    });
  }

  // ---------- 圖名與文字開關：按 Esc 把所有字藏起來，再按一次叫回來 ----------
  function legend() {
    document.getElementById('atlas-home').addEventListener('click', () => { if (survey) setSurvey(false, true); fit = fitSize(); view.az = ((view.az - HOME.az + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI + HOME.az; fly({ az: HOME.az, el: HOME.el, size: fit, tx: 0, tz: 0, ty: 0 }); });
    document.getElementById('atlas-render').addEventListener('click', (e) => shot(e.shiftKey));
    document.getElementById('shot-close').addEventListener('click', () => { document.getElementById('atlas-shot').hidden = true; });
    const bar = document.getElementById('atlas-lens');
    Object.keys(LENS).forEach((k) => {
      const b = document.createElement('button');
      b.dataset.lens = k; b.textContent = LENS[k][0];
      b.addEventListener('click', () => setMode('a', k));
      bar.appendChild(b);
    });
    document.getElementById('atlas-turn').addEventListener('click', () => fly({ az: view.az + Math.PI / 2 }));
    document.getElementById('atlas-top').addEventListener('click', () => fly({ el: view.el > 1.2 ? (survey ? 0.6155 : HOME.el) : 1.5 }));
    document.getElementById('atlas-name').textContent = S.name.zh;
    document.getElementById('atlas-name-en').textContent = S.name.en;
    document.getElementById('atlas-sub').textContent = S.sub.zh;
    document.getElementById('atlas-place').textContent = S.place.zh;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const box = document.getElementById('atlas-shot');
      if (!box.hidden) { box.hidden = true; return; }
      const open = ['atlas-panel', 'atlas-sources'].map((id) => document.getElementById(id)).filter((el) => !el.hidden);
      if (open.length) { open.forEach((el) => { el.hidden = true; }); return; }   // 有面板開著：Esc 先關面板
      if (survey) { setSurvey(false); return; }                               // 測繪圖開著時，Esc 先回到地圖                         // 輸出預覽開著時，Esc 先關掉它
      bare = stage.classList.toggle('bare');
      setMode(mode);
    });
  }

  // ---------- 輸出：把現在的角度畫成一張大圖存下來（最長邊 4096）。按住 Shift 再按，背景是透明的 ----------
  // ---------- 時間與天氣：決定光從哪裡來、影子多深、天空什麼顏色，還有太陽和月亮在哪裡 ----------
  const sky = { time: STYLE.time == null ? 15.5 : STYLE.time, weather: STYLE.weather || 'sun' };
  const WEATHER = { sun: { label: '晴', cut: 0.4, dim: 1 }, cloud: { label: '多雲', cut: 0.26, dim: 1 }, grey: { label: '陰', cut: 0.1, dim: 0.97 }, rain: { label: '雨', cut: 0.06, dim: 0.92 } };
  const amb = new T.AmbientLight(0xffffff, 0.6), sun = new T.DirectionalLight(0xffffff, 0.5), tint = new T.Color();
  let skyTop = BASE.paper;
  function applySky() {
    const t = sky.time, day = t >= 6 && t < 18, th = ((day ? t - 6 : t >= 18 ? t - 18 : t + 6) / 12) * Math.PI;
    const high = Math.sin(th), low = 1 - Math.min(1, high / 0.5), w = WEATHER[sky.weather], dull = sky.weather === 'grey' || sky.weather === 'rain';
    // 太陽（或月亮）從東邊升起、在西邊落下，走夏天偏北的路徑，影子才會落在看得到的這一側；太低時墊高一點，影子不會拉到無限長
    sun.position.set(Math.cos(th), Math.max(0.24, high), -0.3).normalize();
    LIGHT.copy(sun.position).multiplyScalar(-1);
    const up = sun.position.y;
    sun.position.multiplyScalar(1500);
    // 朝上的面（地面、屋頂）收到的光永遠加總成 dim，顏色不會因為太陽低就整片變暗；影子的深淺是 cut
    const cut = day ? w.cut : w.cut * 0.55, dim = day ? w.dim : 0.86;
    sun.intensity = Math.min(0.72, cut / up);
    amb.intensity = dim - sun.intensity * up;
    if (day) {
      sun.color.set('#ffffff').lerp(tint.set('#ffb070'), low * 0.7);
      amb.color.set(dull ? '#e6ebf2' : '#ffffff').lerp(tint.set('#ffe2c4'), low * 0.45);
    } else {
      sun.color.set('#c9d3ff'); amb.color.set('#a9b6f2');
    }
    const reach = Math.min(2.4, Math.hypot(LIGHT.x, LIGHT.z) / Math.abs(LIGHT.y)), len = Math.hypot(LIGHT.x, LIGHT.z) || 1;
    blobs.forEach((b) => { b.mesh.position.set((LIGHT.x / len) * reach * b.k, 0, (LIGHT.z / len) * reach * b.k); b.mesh.material.opacity = 0.08 + w.cut * 0.45; });
    // 天空
    let top = '#f4eedd', bottom = '#d9cfb6';
    if (!day) { top = '#2b3566'; bottom = '#131834'; }
    else if (dull) { top = mix('#e4e6e6', '#f2c9a4', low * 0.5); bottom = '#b7bec6'; }
    else { top = mix(top, '#ffdcb4', low); bottom = mix(bottom, '#f0a184', low); }
    skyTop = top;
    stage.style.background = survey ? '' : 'radial-gradient(120% 90% at 50% 40%, ' + top + ' 0%, ' + bottom + ' 100%)';
    stage.classList.toggle('night', !day && !survey);
    stage.dataset.weather = sky.weather;
    const orb = document.getElementById(day ? 'sky-sun' : 'sky-moon'), other = document.getElementById(day ? 'sky-moon' : 'sky-sun');
    other.style.opacity = 0; orb.style.opacity = 1;
    orb.style.left = (50 + 40 * Math.cos(th)) + '%'; orb.style.top = (60 - 48 * high) + '%';
    const cloud = document.getElementById('sky-cloud');
    cloud.style.opacity = sky.weather === 'sun' ? 0 : 1; cloud.style.left = orb.style.left; cloud.style.top = orb.style.top;
    const hh = Math.floor(t) % 24, mm = Math.round((t - Math.floor(t)) * 60);
    const clock = document.getElementById('set-clock');
    if (clock) clock.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + '　' + w.label;
    renderer.shadowMap.needsUpdate = true; dirty = true;
  }

  // ---------- 設定面板：時間與天氣 ----------
  function settings() {
    const panel = document.getElementById('atlas-panel'), time = document.getElementById('set-time'), wx = document.getElementById('set-weather');
    document.getElementById('atlas-set').addEventListener('click', () => { panel.hidden = !panel.hidden; });
    document.getElementById('set-close').addEventListener('click', () => { panel.hidden = true; });
    time.value = sky.time;
    time.addEventListener('input', () => { sky.time = +time.value; applySky(); });
    Object.keys(WEATHER).forEach((k) => {
      const b = document.createElement('button');
      b.textContent = WEATHER[k].label; b.classList.toggle('on', k === sky.weather);
      b.addEventListener('click', () => { sky.weather = k; [...wx.children].forEach((c) => c.classList.toggle('on', c === b)); applySky(); });
      wx.appendChild(b);
    });
    // 資料來源
    const src = document.getElementById('atlas-sources'), srcList = document.getElementById('src-list');
    (S.sources || []).forEach((it) => {
      const li = document.createElement('li'), a = document.createElement(it.url ? 'a' : 'b');
      a.textContent = it.label; if (it.url) { a.href = it.url; a.target = '_blank'; a.rel = 'noopener'; }
      li.appendChild(a); if (it.note) li.appendChild(document.createTextNode('　' + it.note));
      srcList.appendChild(li);
    });
    document.getElementById('atlas-src').addEventListener('click', () => { src.hidden = !src.hidden; });
    document.getElementById('src-close').addEventListener('click', () => { src.hidden = true; });
    // 調色
    if (!EDIT) return;                                                         // 發布出去的網站到這裡為止，沒有調色的介面
    panel.insertAdjacentHTML('beforeend', '<div id="set-edit"><h2>顏色</h2><div id="set-colors"></div><button id="set-reset">回到檔案裡的顏色</button>' +
      '<p class="set-tip">這一區只有在自己電腦上預覽時才會出現。調好之後跟 Claude 說「存顏色」，或按下面的按鈕複製，貼到 data/style.js 蓋掉原本的內容再上傳。</p>' +
      '<button id="set-copy">複製 style.js 的內容</button><textarea id="set-out" rows="5" readonly></textarea></div>');
    const list = document.getElementById('set-colors'), out = document.getElementById('set-out');
    const text = () => {
      const lines = PALETTE.concat([['slab', '底座側邊'], ['pier', '橋墩']]).map(([k, label]) => "    " + k + ": '" + C[k] + "',".padEnd(22) + '// ' + label);
      return '// 網站的顏色、預設的時間與天氣。由頁面上的調色面板產生。\nwindow.ATLAS_STYLE = {\n  palette: {\n' + lines.join('\n') + '\n  },\n  time: ' + sky.time + ',\n  weather: \'' + sky.weather + '\',\n};\n';
    };
    let wait = null;
    const inputs = {}, store = () => {
      const saved = {};
      PALETTE.forEach(([k]) => { if (C[k] !== LIVE[k]) saved[k] = C[k]; });
      try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) { /* 存不了就只留在這一次 */ }
      out.value = text();
    };
    PALETTE.forEach(([key, label]) => {
      const row = document.createElement('label'), inp = document.createElement('input');
      inp.type = 'color'; inp.value = C[key]; inputs[key] = inp;
      inp.addEventListener('input', () => { C[key] = inp.value; store(); clearTimeout(wait); wait = setTimeout(build, 140); });   // 改顏色：稍等一下再整張重畫
      row.append(inp, label); list.appendChild(row);
    });
    out.value = text();
    document.getElementById('set-reset').addEventListener('click', () => {
      PALETTE.forEach(([k]) => { C[k] = LIVE[k]; inputs[k].value = LIVE[k]; });
      try { localStorage.removeItem(STORE); } catch (e) { /* 沒關係 */ }
      out.value = text(); build();
    });
    document.getElementById('set-copy').addEventListener('click', () => { out.select(); if (navigator.clipboard) navigator.clipboard.writeText(out.value).catch(() => {}); });
  }

  // ---------- 整張圖重畫：第一次、以及每次換顏色之後 ----------
  function build() {
    [...scene.children].forEach((o) => {
      if (o.isLight || o === sun.target) return;
      scene.remove(o);
      o.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        const m = n.material;
        if (m) { if (m.map) m.map.dispose(); if (m.uniforms && m.uniforms.map) m.uniforms.map.value.dispose(); m.dispose(); }
      });
    });
    slices.length = 0;
    [fills, inks, solidOnly, heightOnly, roofOnly, crowd, colorOnly, growers, words, blobs, lensObj.walk, lensObj.car, lensObj.height, lensObj.reach].forEach((a) => { a.length = 0; });
    flock.length = 0;
    derive(); seed = 11;
    heroSpan = null;
    ground(); buildings(); bridges(); skywalk(); hills();
    const leaf = texTrees();
    colorOnly.push(standees(D.trees.filter((t) => !t[4]), 9, 14.5, 3, 2, leaf, 3.4));
    colorOnly.push(standees(D.trees.filter((t, i) => t[5] > 0 && i % 5 === 0), 9, 14.5, 3, 2, leaf, 3.4, (t) => 0.2 + t[5] * RISE));   // 山上只留一些樹
    crowd.push(standees(D.people, 2.3, 4.6, 4, 1, texPeople(), 0.9));
    roadNames(); lenses(); surveyBase();
    town.scale.y = Math.max(0.001, ease(grow));
    growers.forEach((m) => { m.uniforms.grow.value = ease(Math.max(0, grow * 1.4 - 0.4)); });
    setMode(mode);
    if (survey) { survey = false; setSurvey(true); }                          // 重畫之後回到測繪圖
  }

  // ---------- 測繪圖：點水源市場，其他東西收起來，主體一層一層拉開成爆炸圖，每一層拉一條黑線寫用途 ----------
  const GAP = 7, EXTRA = 13;                                                    // 每層之間拉開幾公尺；選中的那一層上面再多拉開一點
  function layoutHero(k) {                                                      // 把每一片移到該在的高度；k 是這一格要靠近目標多少（1 = 直接到位）
    let moving = false;
    slices.forEach((sl, i) => {
      const want = survey ? i * GAP + (floorAt >= 0 && i > floorAt ? EXTRA : 0) : 0;
      sl.at += (want - sl.at) * k;
      if (Math.abs(want - sl.at) < 0.02) sl.at = want; else moving = true;
      sl.g.position.y = sl.at;
      const open = grow < 1;                                                   // 開場動畫時先不切，整棟一起長高
      sl.lo.constant = open ? 9999 : -(sl.from + sl.at); sl.hi.constant = open ? 9999 : sl.to + sl.at;
    });
    if (skyHolder && slices[1]) skyHolder.position.y = slices[1].at;           // 天橋跟著二樓走
    return moving;
  }
  let before = null;
  const base = [];                                                              // 測繪圖底下的那塊底板
  function setSurvey(on, stay) {                                                // stay：離開時鏡頭不要飛回進來前的位置（呼叫的人自己會決定去哪）
    if (on === survey || !slices.length || grow < 1) return;
    survey = on;
    const hero = S.notes.find((n) => n.mark === 'main'), keep = slices.map((sl) => sl.g).concat(skyHolder ? [skyHolder] : []);
    scene.children.forEach((o) => { if (!o.isLight && o !== sun.target && o !== town) o.visible = !on; });
    town.children.forEach((o) => { o.visible = !on || keep.includes(o); });
    base.forEach((o) => { o.visible = on; });
    stage.classList.toggle('survey', on);
    document.getElementById('atlas-floor-btn').textContent = on ? '回到地圖' : '樓層測繪圖';
    if (on) {
      before = { tx: view.tx, tz: view.tz, ty: 0, size: view.size, az: view.az, el: view.el };
      const asp = stage.clientWidth / stage.clientHeight, size = Math.max(84, 62 / asp), az = 1.75, shift = Math.min(size * asp * 0.3, 34);
      view.az = ((view.az - az + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI + az;
      fly({ tx: hero.at.x + Math.cos(az) * shift, tz: -hero.at.y - Math.sin(az) * shift, ty: 52, size, az, el: 0.6155 });   // 等角：俯角 35.26 度
      setTimeout(() => { if (survey) document.getElementById('survey-tags').classList.add('on'); }, 500);
    } else {
      setMode(mode, lens);
      document.getElementById('survey-tags').classList.remove('on');
      floorAt = -1; markFloor();
      if (before && !stay) fly(before); else if (stay) fly({ ty: 0 });
      before = null;
    }
    applySky();
  }
  function markFloor() {
    [...document.getElementById('survey-tags').children].forEach((b) => b.classList.toggle('pick', +b.dataset.i === floorAt));
  }
  function setFloor(i) { floorAt = i === floorAt ? -1 : i; markFloor(); dirty = true; }
  const leaders = [];
  function floorsUi() {
    const tagBox = document.getElementById('survey-tags'), hero = S.notes.find((n) => n.mark === 'main');
    if (!FLOORS.length || !hero) { document.getElementById('atlas-floor-btn').hidden = true; return; }
    const rows = FLOORS.map((f, i) => ({ i, id: f.id, name: f.name, text: f.text })).concat([{ i: FLOORS.length, id: 'RF', name: '屋頂', text: S.roofText || '機房、水塔、太陽能板。' }]);
    rows.forEach((r) => {                                                      // 每層一條黑線加說明
      const el = document.createElement('button');
      el.className = 'leader'; el.dataset.i = r.i; el.style.setProperty('--wait', r.i * 0.05 + 's');
      el.innerHTML = '<i></i><span><b>' + r.id + '　' + r.name + '</b><em>' + r.text + '</em></span>';
      el.addEventListener('click', () => setFloor(r.i));
      tagBox.appendChild(el); leaders.push(el);
    });
    document.getElementById('atlas-floor-btn').addEventListener('click', () => setSurvey(!survey));
  }
  function placeLeaders() {                                                     // 黑線的起點：這一層在畫面上最靠右的那個角
    if (!survey || !heroRing) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    leaders.forEach((el, i) => {
      const sl = slices[i];
      if (!sl) return;
      let bx = -1e9, by = 0;
      heroRing.forEach((q) => { v.set(q[0], sl.mid + sl.at, -q[1]).project(camera); const x = (v.x + 1) / 2 * w; if (x > bx) { bx = x; by = (1 - v.y) / 2 * h; } });
      el.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px)';
    });
  }
  function surveyBase() {                                                       // 測繪圖用的底板：一個圓盤加一圈墨線
    base.length = 0;
    const hero = S.notes.find((n) => n.mark === 'main');
    if (!hero) return;
    const disc = new T.Mesh(up(new T.CircleGeometry(74, 72)), new T.MeshLambertMaterial({ color: mix(C.paper, '#ffffff', 0.35) }));
    disc.position.set(hero.at.x, 0.3, -hero.at.y); disc.receiveShadow = true;
    const pts = [];
    for (let k = 0; k < 96; k++) { const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2; pts.push(hero.at.x + Math.cos(a0) * 74, 0.4, -hero.at.y + Math.sin(a0) * 74, hero.at.x + Math.cos(a1) * 74, 0.4, -hero.at.y + Math.sin(a1) * 74); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const ringLine = new T.LineSegments(g, new T.LineBasicMaterial({ color: C.ink }));
    [disc, ringLine].forEach((o) => { o.visible = survey; scene.add(o); base.push(o); });
  }

  // ---------- 分析模式（lens）。量體永遠是標準的不透明樣子，只有「建築高度」會換成依高度上色 ----------
  const LENS = {
    map: ['地圖', ''],
    walk: ['人流', '粉色的點是行人，越靠近市場、捷運出口與寶藏巖越密。依步行路網與距離推估，不是實測人數。'],
    car: ['車流', '點的顏色與數量代表道路等級：紅是幹道與高架，橘是次要道路，黃是巷弄。依道路分級推估，不是實測車流量。'],
    height: ['建築高度', '淡黃是低樓層，越往桃紅、紫色越高。高度多半由樓層數換算，缺資料的是估計值。'],
    reach: ['步行圈', '以水源市場為圓心的直線距離：200、400、800 公尺，步行大約 3、5、10 分鐘。實際路程會比直線遠。'],
  };
  function setMode(m, l) {
    mode = 'a'; if (l) lens = l;
    const study = lens !== 'map', tall = lens === 'height';
    solidOnly.forEach((o) => { o.visible = !tall; });
    heightOnly.forEach((o) => { o.visible = tall; });
    crowd.forEach((o) => { o.visible = lens !== 'walk' && lens !== 'car'; });   // 人流、車流時把裝飾的小人收起來，免得跟流動的點混在一起
    Object.keys(lensObj).forEach((k) => lensObj[k].forEach((o) => { o.visible = lens === k; }));
    words.forEach((o) => { o.visible = !bare; });
    [...document.getElementById('atlas-lens').children].forEach((b) => b.classList.toggle('on', b.dataset.lens === lens));
    const note = document.getElementById('lens-note');
    note.textContent = study ? LENS[lens][1] : ''; note.hidden = !study;
    applySky();
  }

  // ---------- 分析模式的圖層 ----------
  const flock = [];                                                             // 會動的點：{ points, lines, items }
  function dotTex() {
    return new T.CanvasTexture(sheet(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill(); }));
  }
  function wash(list, color, opacity, y, key) {                                 // 把某一層地面蓋上半透明的顏色
    if (!list.length) return;
    const m = new T.Mesh(up(new T.ShapeGeometry(shapes(list))), new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.y = y; m.renderOrder = 1; scene.add(m); lensObj[key].push(m);
  }
  function stream(key, lines, speed, tones, size, per) {                       // 沿著路線跑的點。lines：[{ w, p: [[x, y, z]…] }]
    const paths = lines.map((l) => {
      const cum = [0];
      for (let i = 1; i < l.p.length; i++) cum.push(cum[i - 1] + Math.hypot(l.p[i][0] - l.p[i - 1][0], l.p[i][1] - l.p[i - 1][1]));
      return { p: l.p, cum, len: cum[cum.length - 1], w: l.w };
    }).filter((l) => l.len > 1);
    const items = [], col = [], c = new T.Color();
    paths.forEach((l, li) => {
      const n = Math.max(0, Math.round((l.len * l.w) / per + rnd() - 0.5));
      for (let k = 0; k < n; k++) {
        items.push({ li, at: rnd() * l.len, v: speed(l.w) * (0.75 + rnd() * 0.5) * (key === 'walk' && rnd() < 0.5 ? -1 : 1) });
        c.set(tones(l.w)); col.push(c.r, c.g, c.b);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(items.length * 3), 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const pts = new T.Points(g, new T.PointsMaterial({ size: size * renderer.getPixelRatio(), sizeAttenuation: false, vertexColors: true, map: dotTex(), alphaTest: 0.5 }));
    pts.frustumCulled = false; pts.renderOrder = 4;
    scene.add(pts); lensObj[key].push(pts);
    flock.push({ key, pts, paths, items });
  }
  function drift(dt) {                                                          // 每一格把點往前推
    flock.forEach((f) => {
      if (f.key !== lens) return;
      const arr = f.pts.geometry.attributes.position.array;
      f.items.forEach((it, i) => {
        const l = f.paths[it.li];
        it.at = ((it.at + it.v * dt) % l.len + l.len) % l.len;
        let s = 1;
        while (s < l.cum.length - 1 && l.cum[s] < it.at) s++;
        const k = (it.at - l.cum[s - 1]) / (l.cum[s] - l.cum[s - 1] || 1), a = l.p[s - 1], b = l.p[s];
        arr[i * 3] = a[0] + (b[0] - a[0]) * k; arr[i * 3 + 1] = a[2] + (b[2] - a[2]) * k; arr[i * 3 + 2] = -(a[1] + (b[1] - a[1]) * k);
      });
      f.pts.geometry.attributes.position.needsUpdate = true;
    });
  }
  function lenses() {
    const F = D.flows || { car: [], walk: [] };
    const flat = (l, y) => { const p = []; for (let i = 0; i < l[1].length; i += 2) p.push([l[1][i], l[1][i + 1], y]); return p; };
    // 車流：道路依等級上色，車子是沿路跑的點（高架橋上的跟著橋面走）
    wash(D.major, '#e2553f', 0.5, 0.62, 'car'); wash(D.minor, '#f09a4a', 0.45, 0.6, 'car'); wash(D.lane, '#f3cf6a', 0.4, 0.58, 'car');
    const cars = F.car.map((l) => ({ w: l[0], p: flat(l, 1.3) }))
      .concat((D.bridges || []).filter((b) => b.k === 'car' && b.f).map((b) => ({ w: b.f, p: b.p.map((q) => [q[0], q[1], q[2] + 1.2]) })));
    stream('car', cars, (w) => 9 + w * 7, (w) => (w >= 2.4 ? '#c8261a' : w >= 1.4 ? '#e8752a' : '#d8a516'), 5.5, 55);
    // 人流：步道上色，行人越靠近幾個會聚集人的地方越密
    const hubs = S.notes.filter((n) => n.crowd).map((n) => ({ x: n.at.x, y: n.at.y, k: n.crowd }));
    const pull = (x, y) => 0.18 + hubs.reduce((s, h) => s + h.k * Math.exp(-Math.hypot(x - h.x, y - h.y) / 150), 0);
    wash(D.foot, C.heroPink, 0.4, 0.6, 'walk'); wash(D.lane, C.heroPink, 0.22, 0.58, 'walk');
    hubs.forEach((h) => {                                                       // 聚集點：一圈由濃到淡的光暈
      const m = new T.Mesh(up(new T.CircleGeometry(150 * Math.sqrt(h.k), 48)), new T.MeshBasicMaterial({ map: haloTex(), transparent: true, opacity: 0.6, depthWrite: false }));
      m.position.set(h.x, 0.66, -h.y); m.renderOrder = 1; scene.add(m); lensObj.walk.push(m);
    });
    const walks = F.walk.map((l) => { const p = flat(l, 1.6), mid = p[p.length >> 1]; return { w: l[0] * pull(mid[0], mid[1]), p }; })
      .concat((D.bridges || []).filter((b) => b.k === 'foot').map((b) => { const mid = b.p[b.p.length >> 1]; return { w: pull(mid[0], mid[1]), p: b.p.map((q) => [q[0], q[1], q[2] + 1.5]) }; }));
    stream('walk', walks, () => 5.5, (w) => mix('#f29ac0', '#8c1257', Math.min(1, w / 1.2)), 4.6, 26);
    // 步行圈：以市場為圓心的三圈
    const hero = S.notes.find((n) => n.mark === 'main');
    if (hero) {
      [[200, '200 m　約 3 分鐘'], [400, '400 m　約 5 分鐘'], [800, '800 m　約 10 分鐘']].forEach(([r, text]) => {
        const pos = [];
        for (let k = 0; k < 180; k++) {
          const a0 = (k / 180) * Math.PI * 2, a1 = ((k + 1) / 180) * Math.PI * 2;
          const q = [[r - 3, a0], [r + 3, a0], [r + 3, a1], [r - 3, a1]].map(([d, a]) => [hero.at.x + Math.cos(a) * d, -hero.at.y + Math.sin(a) * d]);
          if (q.some((v) => Math.abs(v[0]) > HW || Math.abs(v[1]) > HH)) continue;         // 超出圖框的那一段不畫
          [0, 1, 2, 0, 2, 3].forEach((i) => pos.push(q[i][0], 0.9, q[i][1]));
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: C.heroPink, side: T.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }));
        m.renderOrder = 2; scene.add(m); lensObj.reach.push(m);
        const lx = hero.at.x - r * 0.7071, ly = hero.at.y - r * 0.7071;
        if (Math.abs(lx) < HW - 30 && Math.abs(ly) < HH - 20) lensObj.reach.push(sign(text, lx, ly - 9, -Math.PI / 4, 11));
      });
    }
  }
  function haloTex() {
    return new T.CanvasTexture(sheet(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 2, 64, 64, 64), c = new T.Color(C.heroPink), rgb = Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255);
      r.addColorStop(0, 'rgba(' + rgb + ',.85)'); r.addColorStop(0.5, 'rgba(' + rgb + ',.3)'); r.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }));
  }

  let shotUrl = null;
  function shot(clear) {
    drift(0);
    const w = stage.clientWidth, h = stage.clientHeight, k = Math.min(4, 4096 / Math.max(w, h)), ratio = renderer.getPixelRatio();
    frame();
    renderer.setPixelRatio(1); renderer.setSize(Math.round(w * k), Math.round(h * k), false);
    scene.background = clear ? null : new T.Color(skyTop);
    renderer.render(scene, camera);
    const back = () => { scene.background = null; renderer.setPixelRatio(ratio); dirty = true; };
    canvas.toBlob((blob) => {
      back();
      if (!blob) return;
      const d = new Date(), two = (n) => String(n).padStart(2, '0'), box = document.getElementById('atlas-shot');
      const name = S.id + '-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '.png';
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(blob);
      // 有些瀏覽器（例如內嵌的預覽視窗）不會自動下載，所以先把成品秀出來，再讓人自己按存檔
      document.getElementById('shot-img').src = shotUrl;
      document.getElementById('shot-size').textContent = Math.round(w * k) + ' × ' + Math.round(h * k) + ' px　' + (blob.size / 1048576).toFixed(1) + ' MB' + (clear ? '　透明背景' : '');
      const save = document.getElementById('shot-save');
      save.href = shotUrl; save.download = name;
      document.getElementById('shot-open').href = shotUrl;
      box.hidden = false;
    }, 'image/png');
  }

  // ---------- 鏡頭 ----------
  function frame() {
    const w = stage.clientWidth, h = stage.clientHeight, asp = w / h;
    if (!w || !h) return false;                                                 // 視窗還沒有大小（例如分頁在背景）：先不畫
    if (!isFinite(view.size) || !isFinite(fit)) { fit = fitSize(); view.size = fit; }
    renderer.setSize(w, h, false);
    const el = Math.max(0.28, Math.min(1.5, view.el));
    view.el = el;
    view.size = Math.max(survey ? 30 : 45, Math.min(survey ? 150 : fit * 1.5, view.size));   // 測繪圖裡不讓人拉得太遠，字才不會全擠在一起
    view.tx = Math.max(-HW, Math.min(HW, view.tx)); view.tz = Math.max(-HH, Math.min(HH, view.tz));
    camera.left = -view.size * asp; camera.right = view.size * asp; camera.top = view.size; camera.bottom = -view.size;
    camera.position.set(view.tx + Math.sin(view.az) * Math.cos(el) * 2600, Math.sin(el) * 2600, view.tz + Math.cos(view.az) * Math.cos(el) * 2600);
    camera.position.y += view.ty;
    camera.lookAt(view.tx, view.ty, view.tz);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    return true;
  }
  function fitSize() {                                                          // 預設視角下，剛好放進整張圖的大小
    const asp = stage.clientWidth / stage.clientHeight, ca = Math.cos(HOME.az), sa = Math.sin(HOME.az);
    let mx = 0, my = 0;
    [[HW, HH], [HW, -HH], [-HW, HH], [-HW, -HH]].forEach(([x, z]) => {
      mx = Math.max(mx, Math.abs(x * ca - z * sa)); my = Math.max(my, Math.abs(x * sa + z * ca) * Math.sin(HOME.el));
    });
    return Math.max(my + 60, mx / asp) * 1.06;
  }
  function fly(to) {
    const from = { az: view.az, el: view.el, size: view.size, tx: view.tx, tz: view.tz, ty: view.ty || 0 };
    if (!isFinite(from.size)) from.size = fit = fitSize();
    if (!isFinite(from.size)) return;
    tween = { from, to, t: 0 };
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const keys = new Set();
  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (grow < 1) {                                                             // 開場：建築長高、樹長出來
      grow = Math.min(1, grow + dt / 1.6);
      const k = ease(grow);
      town.scale.y = Math.max(0.001, k); growers.forEach((m) => { m.uniforms.grow.value = ease(Math.max(0, grow * 1.4 - 0.4)); });
      renderer.shadowMap.needsUpdate = true; dirty = true;
    }
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const k = ease(tween.t);
      for (const key in tween.to) view[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * k;
      if (tween.t >= 1) tween = null;
      dirty = true;
    }
    if (lens === 'walk' || lens === 'car') { drift(dt); dirty = true; }       // 人流、車流：點一直在跑
    if (keys.size) {                                                            // WASD 或方向鍵平移，Q / E 旋轉，按住 Shift 加快
      const v = stage.clientHeight * 0.75 * dt * (keys.has('shift') ? 2.5 : 1);
      const dx = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
      const dy = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
      if (dx || dy || turn) { pan(dx * v, dy * v); view.az += turn * dt * 1.2; tween = null; dirty = true; }
    }
    if (layoutHero(Math.min(1, dt * 6))) dirty = true;                        // 樓層還在移動就繼續畫
    if (dirty && frame()) { dirty = false; renderer.render(scene, camera); place(); placeLeaders(); }
    requestAnimationFrame(loop);
  }

  // ---------- 操作：單指拖曳旋轉，雙指縮放與平移；滑鼠滾輪縮放，右鍵或 Shift 拖曳平移；WASD 平移，Q / E 旋轉 ----------
  function pan(dx, dy) {
    const k = (view.size * 2) / stage.clientHeight;
    view.tx -= Math.cos(view.az) * dx * k; view.tz += Math.sin(view.az) * dx * k;
    const f = (dy * k) / Math.sin(view.el);
    view.tx -= Math.sin(view.az) * f; view.tz -= Math.cos(view.az) * f;
  }
  function controls() {
    const pts = new Map();
    let gap = 0, mid = null, moved = 0;
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, alt: e.button === 2 || e.shiftKey });
      if (pts.size === 2) { const t = two(); gap = t.d; mid = t; }
      moved = 0; tween = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (p.alt) pan(dx, dy);
        else { view.az -= dx * 0.006; view.el += dy * 0.005; }
      } else if (pts.size === 2) {
        const t = two();
        if (gap > 0) view.size *= gap / t.d;
        pan(t.x - mid.x, t.y - mid.y);
        gap = t.d; mid = t;
      }
      dirty = true;
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) gap = 0; };
    const ray = new T.Raycaster(), tap = new T.Vector2();
    canvas.addEventListener('pointerup', (e) => {                              // 沒拖動的點一下：點到水源市場就進測繪圖
      end(e);
      if (moved > 6 || survey || !slices.length) return;
      const r = canvas.getBoundingClientRect();
      tap.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(tap, camera);
      if (ray.intersectObjects(slices.map((sl) => sl.g.children[0])).length) setSurvey(true);
    });
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.size *= Math.exp(e.deltaY * 0.0012); tween = null; dirty = true; }, { passive: false });
    window.addEventListener('resize', () => { dirty = true; });
    const MOVE = ['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!MOVE.includes(k) || e.metaKey || e.ctrlKey || e.altKey) return;
      keys.add(k); if (k.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => keys.clear());
  }

  // ---------- 開始 ----------
  function start() {
    sun.castShadow = true;
    const sc = sun.shadow.camera, span = Math.hypot(HW, HH) + 80;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 100; sc.far = 3200;
    const cap = renderer.capabilities.maxTextureSize;
    sun.shadow.mapSize.set(Math.min(4096, cap), Math.min(4096, cap));
    sun.shadow.bias = -0.0012;
    scene.add(amb, sun, sun.target);

    build(); markers(); legend(); controls(); settings(); floorsUi();
    fit = fitSize();
    view.size = fit;
    document.getElementById('atlas-count').textContent = D.buildings.length + ' 棟建築　' + D.trees.length + ' 棵樹　' + D.people.length + ' 個人';
    requestAnimationFrame(loop);
    window.ATLAS = { view, fly, setMode, setFloor, setSurvey, palette: () => PALETTE.reduce((o, [k]) => { o[k] = C[k]; return o; }, {}), sky, applySky, redraw: () => { dirty = true; } };          // 給主控台用：ATLAS.fly({ tx, tz, size, az, el })
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
  }
  start();
})();
