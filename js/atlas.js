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
  // 後台：網址加上 ?admin=1（或開 admin.html）。公開版只看得到 data/style.js 裡發布的風格；後台還會疊上這台瀏覽器裡還沒發布的修改
  const ADMIN = /[?&]admin=1/.test(location.search), STYLE = window.ATLAS_STYLE || {};
  const LIVE = Object.assign({}, BASE, STYLE.palette || {});
  const C = Object.assign({}, LIVE);
  if (ADMIN) { try { Object.assign(C, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* 讀不到就用發布的版本 */ } }
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
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  const HOME = { az: -0.62, el: 0.66 };
  const view = { az: HOME.az, el: HOME.el, size: 420, tx: 0, tz: 0 };
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
  const fills = [], inks = [], solidOnly = [], ghostOnly = [], veilOnly = [], heightOnly = [], roofOnly = [], crowd = [], colorOnly = [], lineOnly = [];
  const lensObj = { walk: [], car: [], height: [], reach: [] };
  const fill = (m) => { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; fills.push(m); return m; };   // 有顏色的面
  const ink = (opacity) => { const m = new T.LineBasicMaterial({ color: C.ink, transparent: true, opacity }); m.userData.base = opacity; inks.push(m); return m; };
  let mode = 'a', lens = 'map', bare = false;                                  // mode：a 標準、b 淡透明、c 線稿；lens：分析模式
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
    lineOnly.push(outline(D.lawn, 0.5, 0.5), outline(D.lane, 0.5, 0.5));     // 草地與巷道的邊只在線稿裡描
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
  // 水源市場的立面：藍色的樓、中間一塊杜鵑花色的格子。一張圖分四區：正面、側面、屋頂、窄牆
  function texFacade() {
    const blue = C.heroBlue, sky = C.heroSky, pink = C.heroPink, soft = mix(pink, '#ffffff', 0.62), lilac = mix(mix(sky, '#ffffff', 0.6), pink, 0.12);
    const t = new T.CanvasTexture(sheet(1024, 512, (g) => {
      g.fillStyle = sky; g.fillRect(0, 0, 614, 512);                            // 正面
      g.fillStyle = mix(sky, '#ffffff', 0.42); g.fillRect(140, 30, 334, 380);
      g.fillStyle = lilac; g.fillRect(205, 60, 204, 330);
      for (let y = 30; y < 410; y += 38) { g.fillStyle = 'rgba(10,40,130,.32)'; g.fillRect(96, y, 422, 3); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(96, y + 3, 422, 2); }
      for (let c = 0; c < 10; c++) {                                            // 杜鵑花格子
        for (let r = 0; r < 13; r++) {
          const k = rnd(), col = c % 2 ? (k < 0.5 ? '#ffffff' : k < 0.85 ? soft : pink) : (k < 0.62 ? pink : k < 0.9 ? soft : blue);
          g.fillStyle = col; g.fillRect(248 + c * 12, 104 + r * 18, 12, 18);
          if (k > 0.93) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(254 + c * 12, 113 + r * 18, 3.4, 0, Math.PI * 2); g.fill(); }
        }
      }
      g.fillStyle = mix(sky, blue, 0.45); g.fillRect(0, 410, 614, 102);         // 底層
      g.fillStyle = '#eaf2ff'; g.fillRect(150, 426, 190, 12);
      g.fillStyle = blue; g.fillRect(0, 0, 84, 512); g.fillRect(530, 0, 84, 512);   // 兩側的深藍塔樓
      g.fillStyle = mix(sky, blue, 0.3); g.fillRect(645, 0, 195, 512);          // 側面：一排排粉紫色塊
      for (let y = 56; y < 400; y += 34) {
        g.fillStyle = 'rgba(15,25,60,.55)'; g.fillRect(676, y + 22, 134, 7);
        for (let x = 676; x < 810;) {
          const w = 10 + rnd() * 24, k = rnd();
          g.fillStyle = k < 0.34 ? pink : k < 0.62 ? soft : k < 0.8 ? lilac : k < 0.9 ? '#f1d98a' : '#ffffff';
          g.fillRect(x, y, Math.min(w, 810 - x), 22); x += w;
        }
      }
      g.fillStyle = blue; g.fillRect(645, 0, 26, 512); g.fillRect(814, 0, 26, 512);
      g.fillStyle = '#e6e9ee'; g.fillRect(846, 0, 28, 512);                     // 屋頂
      g.fillStyle = blue; g.fillRect(880, 0, 144, 512);                         // 窄牆：深藍，一串粉色短線
      g.fillStyle = mix(blue, sky, 0.3); g.fillRect(930, 0, 44, 512);
      for (let y = 40; y < 420; y += 36) { g.fillStyle = (y / 36) % 2 < 1 ? pink : soft; g.fillRect(946, y, 12, 20); }
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

  let town;
  function buildings() {
    let hero = null;
    D.buildings.forEach((b) => { delete b.tone; });
    S.notes.forEach((s) => {
      s.at = toXY(s);
      const b = s.mark && houseAt(s.at, 60);
      if (b && !b.tone) { b.tone = s.mark === 'main' ? C.key : C.key2; s.h = b.h; if (s.mark === 'main') { hero = s; b.hero = true; b.h = Math.max(b.h, 40); s.h = b.h; } }
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
    const mass = (pick, pale, ramp) => {                                        // pale：淡色版，給半透明量體用；ramp：依高度上色
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
    const main = heroMesh(D.buildings.find((b) => b.hero), edge);                // 主體：每個模式都不透明
    // 淡透明：淡色、半透明。先只寫深度再上色，量體之間才不會互相透來透去，只透出地面
    const paleGeo = mass((b) => !b.hero, true);
    const veil = new T.Mesh(paleGeo, new T.MeshBasicMaterial({ colorWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const ghost = new T.Mesh(paleGeo, fill(new T.MeshLambertMaterial({ vertexColors: true, map: panel, side: T.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false })));
    veil.renderOrder = 1; ghost.renderOrder = 2;
    [solid, main, ghost, tall].forEach((m) => { m.castShadow = m.receiveShadow = true; });
    solidOnly.push(solid); veilOnly.push(veil); ghostOnly.push(ghost); heightOnly.push(tall);
    const eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
    const lines = new T.LineSegments(eg, ink(0.8));
    lines.renderOrder = 3;
    town = new T.Group(); town.add(solid, tall, main, veil, ghost, lines); scene.add(town);
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

  // ---------- 屋頂點綴：比較大的量體和市場周圍的房子，屋頂上放斜屋頂、溫室、菜圃、水塔、樓梯間、太陽能板 ----------
  function roofs() {
    const k = kit(), hero = D.buildings.find((b) => b.hero);
    const hx = hero ? hero.p[0][0] : 0, hy = hero ? hero.p[0][1] : 0;
    const glass = '#eef4f7', soil = '#b78a5f', steel = '#9fb1bf', panel = '#56677a', pink = mix(C.heroPink, '#ffffff', 0.35);
    D.buildings.forEach((b, n) => {
      const ring = b.p;
      let area = 0, cx = 0, cy = 0, best = 0, ang = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        area += a[0] * c[1] - c[0] * a[1]; cx += a[0]; cy += a[1];
        if (len > best) { best = len; ang = Math.atan2(c[1] - a[1], c[0] - a[0]); }
      }
      area = Math.abs(area) / 2; cx /= ring.length; cy /= ring.length;
      const close = Math.hypot(cx - hx, cy - hy) < 170;
      if (b.k === 'roof' || b.k === 'greenhouse' || area < (close ? 110 : 320)) return;
      const cu = Math.cos(ang), su = Math.sin(ang);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      ring.forEach((p) => { const u = (p[0] - cx) * cu + (p[1] - cy) * su, v = -(p[0] - cx) * su + (p[1] - cy) * cu; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const du = u1 - u0, dv = v1 - v0, at = (u, v) => [cx + cu * u - su * v, cy + su * u + cu * v];
      const fits = (u, v, hu, hv) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => { const q = at(u + i * (hu + 0.8), v + j * (hv + 0.8)); return inside({ x: q[0], y: q[1] }, ring); });
      const h = b.h, wall = b.tone || C.walls[n % C.walls.length];
      if (b.hero) {                                                             // 市場：屋頂上一層灰白的機房和兩座水塔
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, q = at(um, vm);
        if (fits(um, vm, du * 0.28, dv * 0.24)) { k.tone('#e9edf2'); k.box(q[0], q[1], ang, du * 0.28, dv * 0.24, h, h + 4.5); k.tone('#cfd6de'); k.roof(q[0], q[1], ang, du * 0.28, dv * 0.24, h + 4.5, 1.6, 0); }
        [[0.36, 0.3], [-0.36, -0.3]].forEach(([fu, fv]) => { const t = at(um + du * fu, vm + dv * fv); if (inside({ x: t[0], y: t[1] }, ring)) { k.tone(steel); k.tank(t[0], t[1], 1.8, h, h + 3.4); } });
        return;
      }
      const boxy = area / (du * dv) > 0.84, um = (u0 + u1) / 2, vm = (v0 + v1) / 2, mid = at(um, vm);
      if (boxy && du < 70 && dv < 34 && n % 4 === 0) {                         // 整棟蓋斜屋頂
        k.tone(close ? pink : mix(wall, '#d97a66', 0.45)); k.roof(mid[0], mid[1], ang, du / 2, dv / 2, h, Math.min(5, dv * 0.3), 0);
        return;
      }
      if (boxy && du > 16 && dv < 40 && n % 4 === 1) {                         // 鋸齒屋頂：一排玻璃斜面
        const teeth = Math.max(2, Math.round(du / 7)), step = du / teeth;
        k.tone(glass);
        for (let i = 0; i < teeth; i++) { const q = at(u0 + step * (i + 0.5), vm); k.roof(q[0], q[1], ang + Math.PI / 2, dv / 2 * 0.96, step / 2, h, 3.2, 0.82); }
        return;
      }
      // 其他：在屋頂上找放得下的位置，依序擺零件
      let made = 0, turn = n;
      const most = Math.min(9, Math.floor(area / 110) + 1);
      for (let u = u0 + 5; u < u1 - 4 && made < most; u += 8.5) {
        for (let v = v0 + 4; v < v1 - 3 && made < most; v += 7) {
          const q = at(u, v), kind = (turn++ * 7 + n) % 6;
          if (kind === 0 && fits(u, v, 2.6, 2.2)) { k.tone(mix(wall, '#ffffff', 0.35)); k.box(q[0], q[1], ang, 2.6, 2.2, h, h + 3); made++; }                     // 樓梯間
          else if (kind === 1 && fits(u, v, 1.4, 1.4)) { k.tone(steel); k.tank(q[0], q[1], 1.3, h, h + 2.6); made++; }                                              // 水塔
          else if (kind === 2 && fits(u, v, 3, 2)) { k.tone(glass); k.box(q[0], q[1], ang, 3, 2, h, h + 1.7); k.roof(q[0], q[1], ang, 3, 2, h + 1.7, 1.3, 0); made++; }   // 溫室
          else if (kind === 3 && fits(u, v, 3.2, 2.4)) {                                                                                                           // 菜圃
            [-1.3, 1.3].forEach((o) => { const t = at(u, v + o); k.tone(soil); k.box(t[0], t[1], ang, 3, 0.9, h, h + 0.45); k.tone(C.lawnLine); k.box(t[0], t[1], ang, 2.7, 0.65, h + 0.45, h + 0.95); });
            made++;
          } else if (kind === 4 && fits(u, v, 3.4, 2.2)) { k.tone(panel); [-1.2, 1.2].forEach((o) => { const t = at(u, v + o); k.box(t[0], t[1], ang, 3.2, 0.85, h + 0.3, h + 0.55); }); made++; }   // 太陽能板
          else if (kind === 5 && close && fits(u, v, 2.6, 2)) { k.tone(pink); k.roof(q[0], q[1], ang, 2.6, 2, h + 2.2, 1, 0); k.tone(mix(wall, '#000000', 0.25)); [[-2.3, -1.7], [2.3, -1.7], [2.3, 1.7], [-2.3, 1.7]].forEach(([i, j]) => { const t = at(u + i, v + j); k.box(t[0], t[1], ang, 0.15, 0.15, h, h + 2.2); }); made++; }   // 粉色棚子
        }
      }
    });
    const grp = k.mesh();
    town.add(grp); roofOnly.push(grp);
  }

  // ---------- 橋：高架橋與天橋。橋面是一條有厚度的帶子，下面每隔一段立橋墩 ----------
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
    document.getElementById('atlas-home').addEventListener('click', () => { fit = fitSize(); view.az = ((view.az - HOME.az + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI + HOME.az; fly({ az: HOME.az, el: HOME.el, size: fit, tx: 0, tz: 0 }); });
    document.getElementById('atlas-render').addEventListener('click', (e) => shot(e.shiftKey));
    document.getElementById('shot-close').addEventListener('click', () => { document.getElementById('atlas-shot').hidden = true; });
    document.getElementById('atlas-mode').addEventListener('click', () => setMode(mode === 'a' ? 'b' : mode === 'b' ? 'c' : 'a'));
    window.addEventListener('keydown', (e) => { const m = { 1: 'a', 2: 'b', 3: 'c' }[e.key]; if (m && ADMIN) setMode(m); });
    const bar = document.getElementById('atlas-lens');
    Object.keys(LENS).forEach((k) => {
      const b = document.createElement('button');
      b.dataset.lens = k; b.textContent = LENS[k][0];
      b.addEventListener('click', () => setMode(mode === 'c' ? 'a' : mode, k));
      bar.appendChild(b);
    });
    stage.classList.toggle('admin', ADMIN);
    document.getElementById('atlas-turn').addEventListener('click', () => fly({ az: view.az + Math.PI / 2 }));
    document.getElementById('atlas-top').addEventListener('click', () => fly({ el: view.el > 1.2 ? HOME.el : 1.5 }));
    document.getElementById('atlas-name').textContent = S.name.zh;
    document.getElementById('atlas-name-en').textContent = S.name.en;
    document.getElementById('atlas-sub').textContent = S.sub.zh;
    document.getElementById('atlas-place').textContent = S.place.zh;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const box = document.getElementById('atlas-shot');
      if (!box.hidden) { box.hidden = true; return; }                         // 輸出預覽開著時，Esc 先關掉它
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
    stage.style.background = mode === 'c' ? '' : 'radial-gradient(120% 90% at 50% 40%, ' + top + ' 0%, ' + bottom + ' 100%)';
    stage.classList.toggle('night', !day && mode !== 'c');
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

  // ---------- 設定面板：時間、天氣、調色 ----------
  function settings() {
    const panel = document.getElementById('atlas-panel'), time = document.getElementById('set-time'), wx = document.getElementById('set-weather'), list = document.getElementById('set-colors');
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
    let wait = null;
    const inputs = {};
    PALETTE.forEach(([key, label]) => {
      const row = document.createElement('label'), inp = document.createElement('input');
      inp.type = 'color'; inp.value = C[key]; inputs[key] = inp;
      inp.addEventListener('input', () => {                                    // 改顏色：存起來，稍等一下再整張重畫
        C[key] = inp.value;
        const saved = {};
        PALETTE.forEach(([k]) => { if (C[k] !== LIVE[k]) saved[k] = C[k]; });
        try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) { /* 存不了就只留在這一次 */ }
        clearTimeout(wait); wait = setTimeout(build, 140);
      });
      row.append(inp, label); list.appendChild(row);
    });
    document.getElementById('set-export').addEventListener('click', () => {    // 把現在的顏色、時間、天氣寫成 data/style.js 的內容
      const palette = {};
      PALETTE.forEach(([k]) => { if (C[k] !== BASE[k]) palette[k] = C[k]; });
      const text = '// 公開網站的風格。由後台「匯出設定」產生，存成 data/style.js 再上傳就會生效。\nwindow.ATLAS_STYLE = ' +
        JSON.stringify({ palette, time: sky.time, weather: sky.weather }, null, 2) + ';\n';
      const out = document.getElementById('set-out');
      out.value = text; out.hidden = false; out.select();
      const a = document.getElementById('set-save');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); a.download = 'style.js'; a.hidden = false;
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    });
    document.getElementById('set-reset').addEventListener('click', () => {
      PALETTE.forEach(([k]) => { C[k] = LIVE[k]; inputs[k].value = LIVE[k]; });
      try { localStorage.removeItem(STORE); } catch (e) { /* 沒關係 */ }
      build();
    });
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
    [fills, inks, solidOnly, ghostOnly, veilOnly, heightOnly, roofOnly, crowd, colorOnly, lineOnly, growers, words, blobs, lensObj.walk, lensObj.car, lensObj.height, lensObj.reach].forEach((a) => { a.length = 0; });
    flock.length = 0;
    derive(); seed = 11;
    ground(); buildings(); bridges(); hills();
    const leaf = texTrees();
    colorOnly.push(standees(D.trees.filter((t) => !t[4]), 9, 14.5, 3, 2, leaf, 3.4));
    colorOnly.push(standees(D.trees.filter((t, i) => t[5] > 0 && i % 5 === 0), 9, 14.5, 3, 2, leaf, 3.4, (t) => 0.2 + t[5] * RISE));   // 山上只留一些樹
    crowd.push(standees(D.people, 2.3, 4.6, 4, 1, texPeople(), 0.9));
    roadNames(); lenses();
    town.scale.y = Math.max(0.001, ease(grow));
    growers.forEach((m) => { m.uniforms.grow.value = ease(Math.max(0, grow * 1.4 - 0.4)); });
    setMode(mode);
  }

  // ---------- 風格（a 標準、b 淡透明、c 線稿）與分析模式（lens） ----------
  const MODES = { a: '標準', b: '淡透明', c: '線稿' };
  const LENS = {
    map: ['地圖', ''],
    walk: ['人流', '粉色的點是行人，越靠近市場、捷運出口與寶藏巖越密。依步行路網與距離推估，不是實測人數。'],
    car: ['車流', '點的顏色與數量代表道路等級：紅是幹道與高架，橘是次要道路，黃是巷弄。依道路分級推估，不是實測車流量。'],
    height: ['建築高度', '淡黃是低樓層，越往桃紅、紫色越高。高度多半由樓層數換算，缺資料的是估計值。'],
    reach: ['步行圈', '以水源市場為圓心的直線距離：200、400、800 公尺，步行大約 3、5、10 分鐘。實際路程會比直線遠。'],
  };
  function setMode(m, l) {
    mode = m; if (l) lens = l;
    const line = m === 'c', study = lens !== 'map' && !line;
    const body = line ? 'veil' : lens === 'height' ? 'height' : (m === 'b' || study) ? 'ghost' : 'solid';
    solidOnly.forEach((o) => { o.visible = body === 'solid'; });
    veilOnly.forEach((o) => { o.visible = body === 'veil' || body === 'ghost'; });
    ghostOnly.forEach((o) => { o.visible = body === 'ghost'; });
    heightOnly.forEach((o) => { o.visible = body === 'height'; });
    roofOnly.forEach((o) => { o.visible = body === 'solid' || body === 'veil'; });
    colorOnly.forEach((o) => { o.visible = !line; });
    crowd.forEach((o) => { o.visible = !line && !study; });
    Object.keys(lensObj).forEach((k) => lensObj[k].forEach((o) => { o.visible = study && lens === k; }));
    lineOnly.forEach((o) => { o.visible = line; });
    words.forEach((o) => { o.visible = !line && !bare; });
    fills.forEach((f) => { f.colorWrite = !line; });                           // 線稿：面只留深度，用來擋住後面的線
    inks.forEach((k) => { k.opacity = line ? 1 : k.userData.base; });
    stage.classList.toggle('ink', line);
    const btn = document.getElementById('atlas-mode');
    if (btn) btn.textContent = '風格：' + MODES[m];
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
    if (mode === 'c') clear = true;
    drift(0);
    const w = stage.clientWidth, h = stage.clientHeight, k = Math.min(4, 4096 / Math.max(w, h)), ratio = renderer.getPixelRatio();
    frame();
    renderer.setPixelRatio(1); renderer.setSize(Math.round(w * k), Math.round(h * k), false);
    scene.background = clear ? null : new T.Color(skyTop);
    if (mode === 'c') {                                                        // 線稿：往四邊各偏一個像素多畫幾次，線才夠粗
      const W = Math.round(w * k), H = Math.round(h * k);
      renderer.autoClear = false; renderer.clear();
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
        camera.setViewOffset(W, H, ox, oy, W, H); renderer.clearDepth(); renderer.render(scene, camera);
      });
      camera.clearViewOffset(); renderer.autoClear = true;
    } else renderer.render(scene, camera);
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
    view.size = Math.max(45, Math.min(fit * 1.5, view.size));
    view.tx = Math.max(-HW, Math.min(HW, view.tx)); view.tz = Math.max(-HH, Math.min(HH, view.tz));
    camera.left = -view.size * asp; camera.right = view.size * asp; camera.top = view.size; camera.bottom = -view.size;
    camera.position.set(view.tx + Math.sin(view.az) * Math.cos(el) * 2600, Math.sin(el) * 2600, view.tz + Math.cos(view.az) * Math.cos(el) * 2600);
    camera.lookAt(view.tx, 0, view.tz);
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
    const from = { az: view.az, el: view.el, size: view.size, tx: view.tx, tz: view.tz };
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
    if (dirty && frame()) { dirty = false; renderer.render(scene, camera); place(); }
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
    canvas.addEventListener('pointerup', end);
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

    build(); markers(); legend(); controls(); settings();
    fit = fitSize();
    view.size = fit;
    document.getElementById('atlas-count').textContent = D.buildings.length + ' 棟建築　' + D.trees.length + ' 棵樹　' + D.people.length + ' 個人';
    requestAnimationFrame(loop);
    window.ATLAS = { view, fly, setMode, sky, applySky, admin: ADMIN, redraw: () => { dirty = true; } };          // 給主控台用：ATLAS.fly({ tx, tz, size, az, el })
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
  }
  start();
})();
