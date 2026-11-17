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
    heroBlue: '#1a44c8', heroSky: '#2f8fe6', heroPink: '#d81b72', tint: '#d81b72', busLane: '#38c6b8',
  };
  const PALETTE = [['paper', '紙底'], ['ink', '墨線'], ['sea', '水面'], ['wave', '水紋'], ['hill', '山　底色'], ['wood', '山　圖案線條'], ['lawn', '草地'], ['lawnLine', '草地條紋'],
    ['major', '大馬路'], ['minor', '街道'], ['lane', '巷道'], ['foot', '步道'], ['wall', '建築'], ['tint', '市場周邊的房子'], ['deck', '高架橋'], ['busLane', '公車專用道'], ['key2', '地標／天橋'],
    ['heroBlue', '市場　深藍'], ['heroSky', '市場　淺藍'], ['heroPink', '市場　杜鵑']];
  const STORE = 'atlas-palette-' + S.id;
  // data/style.js 裡可以覆蓋預設的顏色、時間、天氣
  const STYLE = window.ATLAS_STYLE || {};
  const LIVE = Object.assign({}, BASE, STYLE.palette || {});
  const C = Object.assign({}, LIVE);
  // 私下編輯：直接在自己電腦上打開 index.html（或用 localhost 預覽）時才成立。發布到網路上的版本沒有調色、Render、時間天氣這些工具
  const EDIT = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (EDIT) { try { Object.assign(C, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* 讀不到就用檔案裡的 */ } }
  const mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  if (!LIVE.hill) LIVE.hill = mix(LIVE.wood, '#fffdf2', 0.8);                      // 山的底色沒設定時，由線條色調淡
  if (!C.hill) C.hill = LIVE.hill;
  // 山的圖案：wave 波紋、paver 斜格鋪面、loops 草葉小圈、stripes 橫條點線
  const HILLS = [['wave', '波紋'], ['paver', '斜格'], ['loops', '草圈'], ['stripes', '橫條']];
  let hillKind = STYLE.hillPattern || 'wave';
  if (EDIT) { try { hillKind = localStorage.getItem(STORE + '-hill') || hillKind; } catch (e) { /* 用檔案裡的 */ } }
  if (!HILLS.some((h) => h[0] === hillKind)) hillKind = 'wave';
  // 樹：地圖資料自動種的，加上手動加的（add），扣掉手動移掉的（cut）。發布的版本讀 data/trees.js；自己電腦上編輯時先存在瀏覽器裡
  const TREES = { add: ((window.ATLAS_TREES || {}).add || []).slice(), cut: ((window.ATLAS_TREES || {}).cut || []).slice() };
  if (EDIT) { try { const v = JSON.parse(localStorage.getItem(STORE + '-trees') || 'null'); if (v) { TREES.add = v.add || []; TREES.cut = v.cut || []; } } catch (e) { /* 用檔案裡的 */ } }
  let treeSet = (STYLE.trees || []).filter((k) => k >= 0 && k < 12), treeBrush = -1;   // treeSet：地圖上用哪幾種樹；treeBrush：種樹時指定種哪一種（-1 是隨機）
  if (EDIT) { try { const v = JSON.parse(localStorage.getItem(STORE + '-treeset') || 'null'); if (v && v.length) treeSet = v; } catch (e) { /* 用檔案裡的 */ } }
  if (!treeSet.length) treeSet = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  // 一片一種：同一座山是同一種樹，大馬路的行道樹是一種、街道的行道樹是另一種，每塊草地各一種，其餘零星的樹依所在的街區分
  const treeZone = (t) => {
    if (t[4]) { const i = D.wood.findIndex((r) => inside({ x: t[0], y: t[1] }, r[0])); return 40 + (i < 0 ? 0 : i) * 5; }
    let big = 1e9, mid = 1e9;
    ((D.flows || {}).car || []).forEach((l) => {
      if (l[0] < 1.4) return;
      const q = l[1];
      for (let i = 0; i + 3 < q.length; i += 2) {
        const dx = q[i + 2] - q[i], dy = q[i + 3] - q[i + 1], k = Math.max(0, Math.min(1, ((t[0] - q[i]) * dx + (t[1] - q[i + 1]) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(t[0] - q[i] - dx * k, t[1] - q[i + 1] - dy * k);
        if (l[0] >= 2.4) big = Math.min(big, d); else mid = Math.min(mid, d);
      }
    });
    if (big < 24) return 3;
    if (mid < 13) return 7;
    const lawn = D.lawn.findIndex((r) => inside({ x: t[0], y: t[1] }, r[0]));
    if (lawn >= 0) return 11 + lawn * 3;
    return 5 + Math.floor((t[0] + 2000) / 130) * 7 + Math.floor((t[1] + 2000) / 130) * 13;
  };
  const treeKind = (t) => (t[3] >= 100 ? t[3] - 100 : treeSet[treeZone(t) % treeSet.length]);   // 這棵樹是圖鑑裡的哪一種（手動指定的優先）
  let treeTool = '', treeShown = { flat: [], hill: [] };                        // treeTool：'' 沒在用、'add' 種樹、'cut' 移除
  function treeList() {
    const gone = (t) => TREES.cut.some((c) => Math.abs(c[0] - t[0]) < 0.6 && Math.abs(c[1] - t[1]) < 0.6);
    const flat = D.trees.filter((t) => !t[4] && !gone(t)), hill = D.trees.filter((t, i) => t[5] > 0 && i % 5 === 0 && !gone(t));
    TREES.add.forEach((t, n) => {
      const lv = (D.hills || []).reduce((c, level) => c + (inAny({ x: t[0], y: t[1] }, level) ? 1 : 0), 0);   // 種在山上的要站到那一階上
      (lv ? hill : flat).push([t[0], t[1], t[2], t[3], lv ? 1 : 0, lv, n + 1]);                           // 最後一格：這是手動加的第幾棵
    });
    return (treeShown = { flat, hill });
  }
  let peopleStyle = STYLE.people === 'water' ? 'water' : 'crayon';               // 人物畫法：crayon 蠟筆插畫、water 水彩剪影
  if (EDIT) { try { const v = localStorage.getItem(STORE + '-people'); if (v) peopleStyle = v; } catch (e) { /* 用檔案裡的 */ } }
  let wc = STYLE.watercolor !== false;                                           // 水彩濾鏡：畫面邊緣微微暈開，疊一層紙的斑駁
  if (EDIT) { try { const v = localStorage.getItem(STORE + '-wc'); if (v) wc = v === '1'; } catch (e) { /* 用檔案裡的 */ } }
  function derive() {                                                           // 由主色推出深淺變化
    C.woodDark = mix(C.wood, '#000000', 0.28); C.woodLight = mix(C.wood, '#ffffff', 0.25);
    C.walls = [C.wall, mix(C.wall, '#000000', 0.04), mix(C.wall, '#ffffff', 0.4), mix(C.wall, '#000000', 0.09)];
    C.near = [mix(C.tint, '#ffffff', 0.58), mix(C.tint, '#ffffff', 0.7), mix(C.tint, '#ffffff', 0.46)];   // 市場四周的房子：tint 調淡。跟主體的杜鵑色分開，改這個不會動到主體
    C.mid = [mix(C.tint, '#ffffff', 0.82), mix(C.tint, '#fff3d6', 0.86), mix(C.tint, '#ffffff', 0.76)];
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

  // 山與樹林：植栽配置圖的填紋，四種擇一（hillKind）。底色 C.hill，線條 C.wood
  const texWood = () => tile(sheet(256, 256, (g, w, h) => {
    g.fillStyle = C.hill; g.fillRect(0, 0, w, h);
    g.strokeStyle = C.wood; g.lineCap = 'round';
    if (hillKind === 'paver') {                                                 // 斜格鋪面：兩個方向的斜線，間距不等
      g.lineWidth = 2.4; g.globalAlpha = 0.8;
      [1, -1].forEach((dir) => {
        for (let c = 0; c < w; c += 16 + Math.floor(rnd() * 3) * 8) {
          for (let o = -w; o <= w; o += w) { g.beginPath(); g.moveTo(c + o, 0); g.lineTo(c + o + dir * w, h); g.stroke(); }
        }
      });
      g.globalAlpha = 1;
    } else if (hillKind === 'loops') {                                          // 草葉：一排一排的小圈
      g.lineWidth = 1.7;
      for (let y = 14, r = 0; y < h + 2; y += 16, r++) {
        g.beginPath();
        for (let x = (r % 2) * 4; x < w; x += 8) { const t = 9 + rnd() * 4; g.moveTo(x, y); g.bezierCurveTo(x + 1, y - t * 1.3, x + 7, y - t * 1.3, x + 5, y - 1); }
        g.stroke();
      }
    } else if (hillKind === 'stripes') {                                        // 橫條：深淺相間，中間一條點線
      for (let y = 0; y < h; y += 16) {
        g.fillStyle = mix(C.hill, '#ffffff', 0.55); g.fillRect(0, y + 8, w, 8);
        g.fillStyle = C.wood; for (let x = 2; x < w; x += 8) g.fillRect(x, y + 3, 3.4, 2);
      }
    } else {                                                                    // 波紋
      g.lineWidth = 2.6;
      for (let y = 16; y < h; y += 32) {
        g.beginPath();
        for (let x = -4; x <= w + 4; x += 4) g.lineTo(x, y + Math.sin((x / 64) * Math.PI * 2 + (y / 32) * 1.7) * 5);
        g.stroke();
      }
    }
  }), 30);

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

  // ---------- 蠟筆與水彩的筆觸：畫好一格之後疊上去 ----------
  function crayon(c, w, h) {                                                    // 蠟筆：一撇一撇深淺不一，偶爾露出紙的白點
    c.globalCompositeOperation = 'source-atop'; c.lineCap = 'round';
    for (let i = 0; i < 300; i++) {
      const x = rnd() * w, y = rnd() * h, l = 4 + rnd() * 10;
      c.strokeStyle = rnd() < 0.6 ? 'rgba(255,255,255,.2)' : 'rgba(40,25,20,.1)'; c.lineWidth = 1 + rnd() * 1.6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + l * 0.8, y - l); c.stroke();
    }
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
    for (let i = 0; i < 80; i++) c.fillRect(rnd() * w, rnd() * h, 1.2, 1.2 + rnd() * 2);
    c.globalCompositeOperation = 'source-over';
  }
  function watery(c, w, h) {                                                    // 水彩：上面淡、下面積得濃，顏料不均勻
    c.globalCompositeOperation = 'source-atop';
    const wash = c.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, 'rgba(255,250,240,.26)'); wash.addColorStop(0.6, 'rgba(255,250,240,0)'); wash.addColorStop(1, 'rgba(40,30,10,.14)');
    c.fillStyle = wash; c.fillRect(0, 0, w, h);
    for (let n = 0; n < 22; n++) { c.fillStyle = rnd() < 0.55 ? 'rgba(255,250,238,.16)' : 'rgba(40,40,20,.1)'; c.beginPath(); c.arc(rnd() * w, rnd() * h, 6 + rnd() * 22, 0, Math.PI * 2); c.fill(); }
    c.globalCompositeOperation = 'source-over';
  }

  // ---------- 樹的圖鑑：十二種水彩畫的樹，排成 6 × 2。地圖上用哪幾種由 treeSet 決定 ----------
  const TREE_NAMES = ['水滴', '同心圓', '葉片', '橫紋', '圓葉', '針葉', '層疊', '松', '藍水滴', '枯枝', '秋色', '淡黃'];
  const TW = 160, TH = 256;
  function treeCell(kind) {
    return sheet(TW, TH, (g) => {
      const cx = TW / 2, G = TH - 4;
      g.lineCap = g.lineJoin = 'round';
      const ell = (x, y, rx, ry, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); };
      const line = (col, wd, ...pts) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); };
      const inside = (path, draw) => { g.save(); path(); g.clip(); draw(); g.restore(); };
      const drop = (top, bot, r) => { g.beginPath(); g.moveTo(cx, top); g.bezierCurveTo(cx + r * 0.42, top + (bot - top) * 0.34, cx + r, bot - r * 1.5, cx + r, bot - r); g.arc(cx, bot - r, r, 0, Math.PI); g.bezierCurveTo(cx - r, bot - r * 1.5, cx - r * 0.42, top + (bot - top) * 0.34, cx, top); g.closePath(); };
      const waves = (col, wd, y0, y1, gap, amp) => { g.strokeStyle = col; g.lineWidth = wd; for (let y = y0; y < y1; y += gap) { g.beginPath(); for (let x = 0; x <= TW; x += 6) g.lineTo(x, y + Math.sin(x / 11 + y) * amp); g.stroke(); } };
      [
        () => { drop(10, G - 40, 62); g.fillStyle = '#9fbf7a'; g.fill(); line('#fbfaf2', 5, [cx, G], [cx, 62]); [0, 1, 2, 3].forEach((i) => { const y = G - 74 - i * 34, l = 46 * (1 - i * 0.17), sd = i % 2 ? 1 : -1; line('#fbfaf2', 3.4, [cx, y], [cx + sd * l, y - l * 0.9]); line('#fbfaf2', 3, [cx, y + 14], [cx - sd * l * 0.7, y + 14 - l * 0.62]); }); },
        () => { ell(cx, 92, 64, 78); g.fillStyle = '#d3e3b6'; g.fill(); [0.84, 0.64, 0.44, 0.24].forEach((k) => { ell(cx, 96, 64 * k, 78 * k); g.strokeStyle = '#6f9a5c'; g.lineWidth = 3; g.stroke(); }); line('#8a5a3a', 9, [cx, G], [cx, 118]); line('#8a5a3a', 5, [cx, 150], [cx - 24, 112]); line('#8a5a3a', 5, [cx, 140], [cx + 22, 104]); },
        () => { line('#7a5236', 9, [cx, G], [cx, 120]); ell(cx, 94, 54, 80); g.fillStyle = '#86b060'; g.fill(); inside(() => ell(cx, 94, 54, 80), () => { g.strokeStyle = '#3f7a3a'; g.lineWidth = 3; for (let i = 0; i < 110; i++) { const x = rnd() * TW, y = rnd() * 180; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 7); g.stroke(); } }); line('#7a5236', 6, [cx, 170], [cx, 60]); },
        () => { ell(cx, 88, 52, 74); g.fillStyle = '#cfe0a2'; g.fill(); inside(() => ell(cx, 88, 52, 74), () => waves('#8fb05c', 3, 20, 170, 12, 3)); line('#f1ede2', 10, [cx, G], [cx, 128]); for (let y = 140; y < G; y += 14) line('#5c5348', 2.4, [cx - 4, y], [cx + 2, y + 2]); },
        () => { line('#d9a441', 7, [cx, G], [cx, 96]); line('#d9a441', 4, [cx, 150], [cx - 30, 104]); line('#d9a441', 4, [cx, 136], [cx + 30, 96]); ell(cx, 82, 72, 52); g.fillStyle = '#a3bcad'; g.fill(); [[40, 70], [70, 56], [104, 62], [124, 88], [56, 100], [90, 92], [30, 92]].forEach(([x, y], i) => { ell(x, y, 9, 4.5, i * 0.9); g.fillStyle = '#3f5f55'; g.fill(); }); },
        () => { line('#8a8478', 10, [cx, G], [cx, 206]); g.beginPath(); g.moveTo(cx, 12); g.quadraticCurveTo(cx + 34, 110, cx + 54, 204); g.quadraticCurveTo(cx, 222, cx - 54, 204); g.quadraticCurveTo(cx - 34, 110, cx, 12); g.closePath(); g.fillStyle = '#3f7d62'; g.fill(); g.fillStyle = '#cfe3d2'; [[80, 60], [66, 96], [96, 104], [56, 140], [84, 142], [108, 150], [44, 182], [74, 184], [102, 188], [124, 192]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }); },
        () => { line('#a0522d', 6, [cx, G], [cx, 50]); [[58, 34, 17], [112, 44, 19], [170, 56, 25]].forEach(([y, rx, ry]) => { ell(cx, y, rx, ry); g.fillStyle = '#4f8a5a'; g.fill(); inside(() => ell(cx, y, rx, ry), () => { g.strokeStyle = '#2f6340'; g.lineWidth = 2.4; for (let x = 10; x < TW; x += 8) { g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x, y + 30); g.stroke(); } }); }); },
        () => { line('#8a4a2e', 7, [cx, G], [cx, 84]); line('#8a4a2e', 4, [cx, 190], [44, 160]); line('#8a4a2e', 4, [cx, 200], [120, 176]); [[cx, 66, 36, 44], [40, 150, 24, 22], [122, 168, 22, 20]].forEach(([x, y, rx, ry]) => { ell(x, y, rx, ry); g.fillStyle = '#4f8a6a'; g.fill(); g.strokeStyle = '#2c5a44'; g.lineWidth = 2; for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; g.beginPath(); g.moveTo(x, y + ry * 0.5); g.lineTo(x + Math.cos(t) * rx * 0.9, y + Math.sin(t) * ry * 0.9); g.stroke(); } }); },
        () => { drop(14, G - 30, 58); g.fillStyle = '#a6cddb'; g.fill(); g.save(); g.translate(cx, G - 88); [0.8, 0.6].forEach((k) => { g.save(); g.scale(k, k); g.translate(-cx, -(G - 88)); drop(14, G - 30, 58); g.strokeStyle = '#4f86a0'; g.lineWidth = 3 / k; g.stroke(); g.restore(); }); g.restore(); line('#7a5a3a', 8, [cx, G], [cx, 70]); line('#7a5a3a', 4, [cx, 170], [cx - 22, 130]); line('#7a5a3a', 4, [cx, 150], [cx + 20, 110]); line('#7a5a3a', 3, [cx, 120], [cx - 14, 92]); },
        () => { line('#a9703c', 11, [cx, G], [cx, 110]); [[-34, 50, 7], [34, 44, 7], [-14, 26, 5], [16, 20, 5]].forEach(([dx, y, wd]) => line('#a9703c', wd, [cx, 120 + Math.abs(dx)], [cx + dx, y])); line('#a9703c', 4, [cx - 22, 100], [cx - 46, 76]); line('#a9703c', 4, [cx + 22, 96], [cx + 48, 70]); for (let y = 130; y < G; y += 12) line('#7a4a22', 2, [cx - 5, y], [cx + 5, y + 1]); },
        () => { line('#5c5c4a', 10, [cx, G], [cx, 100]); for (let y = 120; y < G; y += 16) line('#d8d2b4', 3, [cx - 5, y], [cx + 5, y - 4]); line('#5c5c4a', 4, [cx, 140], [cx - 24, 104]); line('#5c5c4a', 4, [cx, 132], [cx + 24, 100]); ell(cx, 76, 68, 50); g.fillStyle = '#f2a93b'; g.fill(); inside(() => ell(cx, 76, 68, 50), () => waves('#d9801e', 3, 30, 130, 11, 3)); },
        () => { g.beginPath(); g.moveTo(34, 36); g.quadraticCurveTo(cx, 26, 128, 38); g.quadraticCurveTo(140, 96, 126, 150); g.quadraticCurveTo(cx, 160, 32, 150); g.quadraticCurveTo(20, 92, 34, 36); g.closePath(); g.fillStyle = '#eef0b8'; g.fill(); line('#4a4438', 8, [cx, G], [cx, 56]); [[190, -26, 150], [176, 24, 138], [146, -30, 104], [128, 28, 88], [100, -20, 70]].forEach(([y, dx, y2]) => line('#4a4438', 4, [cx, y], [cx + dx, y2])); },
      ][kind]();
      watery(g, TW, TH);
    });
  }
  function texTrees() {
    const t = new T.CanvasTexture(sheet(TW * 6, TH * 2, (g) => { for (let k = 0; k < 12; k++) g.drawImage(treeCell(k), (k % 6) * TW, Math.floor(k / 6) * TH); }));
    t.anisotropy = 4;
    return t;
  }

  // ---------- 模式用的登記簿 ----------
  const fills = [], inks = [], solidOnly = [], heightOnly = [], roofOnly = [], crowd = [], colorOnly = [], paleOnly = [], hillOnly = [], issueObj = [[], [], []], eventObj = [[], [], []];
  const lensObj = { walk: [], car: [], shop: [], art: [], issue: [], height: [], reach: [] };
  const fill = (m) => { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; fills.push(m); return m; };   // 有顏色的面
  const ink = (opacity) => { const m = new T.LineBasicMaterial({ color: C.ink, transparent: true, opacity }); m.userData.base = opacity; inks.push(m); return m; };
  let mode = 'a', lens = 'map', bare = false, issueAt = 0, issueSide = 'find';                                   // 議題：find 是事件（現況），fix 是方法（改善）                                  // lens：分析模式
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
    const side = mix(C.hill, C.wood, 0.22);
    (D.hills || []).forEach((level, i) => {
      const g = new T.ExtrudeGeometry(shapes(level), { depth: RISE, bevelEnabled: false, curveSegments: 1 });
      const mat = fill(new T.MeshLambertMaterial({ map: tex, color: base.clone().lerp(tip, i / 11) }));
      const wall = fill(new T.MeshLambertMaterial({ color: side }));              // 側面不貼圖案，只用一個素色，免得圖案被拉扯
      const m = new T.Mesh(up(g), [mat, wall]);
      m.position.y = 0.2 + i * RISE; m.castShadow = m.receiveShadow = true;
      scene.add(m); hillOnly.push(m);
      hillOnly.push(outline(level, 0.25 + (i + 1) * RISE, 0.6));
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

  if (S.hide) D.buildings = D.buildings.filter((b) => !S.hide.includes(b.n));       // 場域設定裡指定不畫的建築
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
      const halo = new T.LineSegments(rg, new T.LineBasicMaterial({ color: C.tint }));
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
    const faded = new T.Mesh(mass((b) => !b.hero, true), fill(new T.MeshLambertMaterial({ color: '#ffffff', emissive: '#8f8f8f', side: T.DoubleSide })));   // 議題：周邊全部淡成白色（自己帶一點亮度，背光的牆才不會變成深灰）
    faded.castShadow = faded.receiveShadow = true;
    solidOnly.push(solid); heightOnly.push(tall); paleOnly.push(faded);
    edge.length = 0;                                                            // 基地模不描框線，只有主體留著稜線
    const eg = new T.BufferGeometry();
    eg.setAttribute('position', new T.Float32BufferAttribute(edge, 3));
    const lines = new T.LineSegments(eg, ink(0.8));
    lines.renderOrder = 3;
    town = new T.Group(); town.add(solid, tall, faded, lines); scene.add(town);
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
      slope(x0, y0, z0, x1, y1, z1, hw, th) {                                   // 斜板：從 (x0, y0) 高 z0 斜到 (x1, y1) 高 z1
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, px = (-dy / len) * hw, py = (dx / len) * hw;
        const lo = [[x0 - px, z0, -(y0 - py)], [x0 + px, z0, -(y0 + py)], [x1 + px, z1, -(y1 + py)], [x1 - px, z1, -(y1 - py)]], hi = lo.map((q) => [q[0], q[1] + th, q[2]]);
        const mid = [(x0 + x1) / 2, (z0 + z1) / 2 + th / 2, -(y0 + y1) / 2];
        face(hi, mid); face(lo, mid);
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; face([lo[i], lo[j], hi[j], hi[i]], mid); line(hi[i], hi[j]); }
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
        if (n === 0) {                                                          // 一樓中央的電扶梯：兩道並排，黑色踏階、玻璃扶手，通往二樓
          const top = f.to - 0.15;
          [-0.9, 0.9].forEach((o) => {
            const a0 = at(o, -5.5), a1 = at(o, 5.5);
            k.tone('#30343b'); k.slope(a0[0], a0[1], f.from + 0.15, a1[0], a1[1], top, 0.55, 0.3);
            [-0.62, 0.62].forEach((e) => { const b0 = at(o + e, -5.5), b1 = at(o + e, 5.5); k.tone('#bfe3ef'); k.slope(b0[0], b0[1], f.from + 0.45, b1[0], b1[1], top + 0.3, 0.05, 0.95); });
          });
        }
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
    const rail = '#f4f8fc', deck = '#e8eef5', blue = '#4f86c6';                      // 白色欄杆、藍色的橋墩與橋身側邊
    let q = at(len / 2, 0);
    k.tone(deck); k.box(q[0], q[1], ang, len / 2, W, H - 0.45, H);                                   // 橋面
    [-1, 1].forEach((side) => {                                                                      // 欄杆：上下兩道橫桿加立柱
      q = at(len / 2, side * (W - 0.08));
      k.tone(rail); k.box(q[0], q[1], ang, len / 2, 0.07, H + 1.0, H + 1.15); k.box(q[0], q[1], ang, len / 2, 0.05, H + 0.5, H + 0.58);
      k.tone('#f4f8fc'); for (let s = 0.4; s < len; s += 2.2) { const t = at(s, side * (W - 0.08)); k.box(t[0], t[1], ang, 0.06, 0.06, H, H + 1.0); }
      k.tone('#cfe6f2'); k.box(q[0], q[1], ang, len / 2, 0.025, H + 0.08, H + 0.5);                 // 玻璃護欄
      q = at(len / 2, side * (W + 0.03)); k.tone(blue); k.box(q[0], q[1], ang, len / 2, 0.04, H - 0.5, H);
    });
    k.tone(blue); [3.2, len / 2, len - 3.2].forEach((s) => { [-0.9, 0.9].forEach((o) => { q = at(s, o); k.box(q[0], q[1], ang, 0.5, 0.5, 0, H - 0.9); }); q = at(s, 0); k.box(q[0], q[1], ang, 0.75, W * 0.9, H - 0.9, H - 0.45); });   // 兩根一組的藍色橋墩
    k.tone('#14275e'); q = at(-0.2, 0); k.box(q[0], q[1], ang, 0.25, W, H, H + 2.8);                 // 接進二樓的門口
    // 樓梯：沿著人行道直直往下，中間一個平台。s 是橋上的起點，dir 是往下走的方向（1 或 -1，跟橋垂直）
    const stairs = (s, dir) => {
      const steps = 18, rise = H / steps, run = 0.62;
      q = at(s, dir * (W + 1.3)); k.tone(deck); k.box(q[0], q[1], ang, 1.3, 1.3, H - 0.3, H);       // 橋邊的平台
      for (let i = 0; i < steps; i++) {
        const top = H - (i + 1) * rise, o = dir * (W + 2.6 + i * run + (i >= steps / 2 ? 1.6 : 0) + run / 2);
        q = at(s, o);
        k.tone(i % 2 ? '#dfe6ee' : deck); k.box(q[0], q[1], ang, 1.3, run / 2, Math.max(0, top - 0.45), top);
        if (i % 3 === 0) { k.tone(rail); [-1.25, 1.25].forEach((e) => { const r = at(s + e, o); k.box(r[0], r[1], ang, 0.05, 0.05, top, top + 1.05); }); }
      }
      q = at(s, dir * (W + 2.6 + (steps / 2) * run + 0.8)); k.tone(deck); k.box(q[0], q[1], ang, 1.3, 0.8, H / 2 - 0.3, H / 2);   // 中間的平台
      k.tone(blue); k.box(q[0], q[1], ang, 0.35, 0.35, 0, H / 2 - 0.3);
    };
    stairs(len - 1.5, -1); stairs(6.5, -1); stairs(6.5, 1);                                          // 對街一座，市場門口往兩邊各一座
    spots.sky = { at, len, W, H, ang };
    skyHolder = lift(k.mesh());
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
  // 小人：蠟筆畫的人，有頭髮、上衣、褲子或裙子。8 × 3 共 24 種；其中一格是小孩、一格是狗
  function texPeopleCrayon() {
    const CW = 96, CH = 128;
    const SKIN = ['#f2c9a8', '#e8b08a', '#c98d62', '#8d5a3b', '#f6d7c0'], HAIR = ['#2b2622', '#6b4a2e', '#c9742e', '#d9b25a', '#9a9a9a', '#b5412c'];
    const TOP = ['#2f2c2c', '#b9b3ab', '#6f7f4a', '#3f8f86', '#c8a13a', '#e9a7b4', '#9db7dc', '#8a5a3a', '#f4f1e8', '#d8553a', '#5f6fb0', '#c98f6a'];
    const BOT = ['#9db7dc', '#2f4f9a', '#c8962e', '#e0559a', '#8c2f34', '#6f8a3a', '#2f2c2c', '#b7a48c', '#f0d24a', '#c4b8e0'];
    const figure = (g, i) => {
      const cx = CW / 2, skin = SKIN[i % 5], hair = HAIR[(i * 5 + 1) % 6], top = TOP[(i * 7 + 3) % 12], bot = BOT[(i * 3 + 2) % 10], type = i % 4;
      const rr = (x, y, w, h, r, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); g.fill(); };
      const dot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      if (i === 23) {                                                           // 狗
        rr(22, 74, 46, 20, 9, '#c9a06a'); rr(60, 58, 20, 20, 8, '#c9a06a'); rr(74, 66, 12, 9, 4, '#c9a06a');
        [26, 36, 54, 62].forEach((x) => rr(x, 90, 6, 30, 3, '#c9a06a')); g.fillStyle = '#9a7444'; g.beginPath(); g.moveTo(62, 60); g.lineTo(60, 48); g.lineTo(69, 58); g.fill();
        g.strokeStyle = '#c9a06a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(24, 78); g.lineTo(12, 66); g.stroke(); dot(74, 64, 1.6, '#2b2622');
        return;
      }
      if (i === 7) { g.translate(cx * 0.34, CH * 0.34); g.scale(0.66, 0.66); }  // 小孩
      const sw = type === 3 ? 19 : 15;                                          // 肩寬：穿大外套的寬一點
      if (type === 1) {                                                         // 裙子
        rr(cx - 9, 92, 6, 26, 3, skin); rr(cx + 3, 92, 6, 26, 3, skin);
        g.fillStyle = bot; g.beginPath(); g.moveTo(cx - 13, 70); g.lineTo(cx + 13, 70); g.lineTo(cx + 19, 98); g.lineTo(cx - 19, 98); g.closePath(); g.fill();
      } else if (type === 2) {                                                  // 走路：兩腳前後分開
        g.fillStyle = bot; [[-1, -16], [1, 14]].forEach(([sd, dx]) => { g.beginPath(); g.moveTo(cx + sd * 2 - 6, 70); g.lineTo(cx + sd * 2 + 6, 70); g.lineTo(cx + dx + 6, 119); g.lineTo(cx + dx - 5, 119); g.closePath(); g.fill(); });
      } else { rr(cx - 13, 70, 12, 49, 4, bot); rr(cx + 1, 70, 12, 49, 4, bot); }
      [type === 2 ? -16 : -8, type === 2 ? 14 : 8].forEach((dx) => rr(cx + dx - 6, 116, 12, 6, 3, i % 3 ? '#3a3230' : '#c9a23a'));   // 鞋子
      rr(cx - sw - 6, 37, 8, 36, 4, top); rr(cx + sw - 2, 37, 8, 36, 4, top);    // 手臂
      dot(cx - sw - 2, 75, 3.6, skin); dot(cx + sw + 2, 75, 3.6, skin);
      rr(cx - sw, 33, sw * 2, type === 3 ? 48 : 41, 8, top);                     // 上衣
      if (i % 3 === 0) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; for (let y = 40; y < 70; y += 7) { g.beginPath(); g.moveTo(cx - sw + 3, y); g.lineTo(cx + sw - 3, y); g.stroke(); } }   // 條紋
      else if (i % 3 === 1) { for (let n = 0; n < 9; n++) dot(cx - sw + 5 + ((n * 11) % (sw * 2 - 8)), 40 + ((n * 17) % 28), 1.8, 'rgba(30,20,20,.45)'); }                                              // 點點
      if (i === 15) rr(cx + sw + 1, 74, 13, 15, 3, '#d9b25a');                   // 提袋
      dot(cx, 22, 10.5, skin);                                                  // 頭
      g.fillStyle = hair; g.beginPath(); g.arc(cx, 20, 11, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
      if (i % 4 === 1) { rr(cx - 12, 16, 6, 22, 3, hair); rr(cx + 6, 16, 6, 22, 3, hair); } else if (i % 4 === 3) dot(cx, 8, 5, hair);   // 長髮、包頭
      dot(cx - 4, 23, 1.3, '#2b2622'); dot(cx + 4, 23, 1.3, '#2b2622'); dot(cx - 7, 27, 2.2, 'rgba(230,110,110,.5)'); dot(cx + 7, 27, 2.2, 'rgba(230,110,110,.5)');
    };
    const t = new T.CanvasTexture(sheet(CW * 8, CH * 3, (g) => {
      for (let i = 0; i < 24; i++) g.drawImage(sheet(CW, CH, (c) => { c.save(); figure(c, i); c.restore(); crayon(c, CW, CH); }), (i % 8) * CW, Math.floor(i / 8) * CH);
    }));
    t.anisotropy = 4;
    return t;
  }
  // 小人的另一種畫法：水彩筆觸的剪影。八種正在做事的姿勢（走路、提菜、講電話、騎車、推菜籃車、撐傘、牽小孩、遛狗）× 三排顏色
  const PEOPLE_HUE = ['#7d4a3a', '#b06a2c', '#6f6a66', '#8c3b3f', '#8a7a35', '#5d4b70', '#a3543a', '#4f6150', '#c08a4a', '#93505c', '#3f4a5a', '#9a6b4f', '#b5503c', '#6b5a48', '#77803f', '#a56a7a', '#4a5f6e', '#c79a5a', '#8a4f33', '#5a4a44', '#9c7b3a', '#7a3f4f', '#55664f', '#b9794e'];
  function texPeopleWater() {
    const CW = 96, CH = 128;
    const figure = (g, i) => {
      g.fillStyle = g.strokeStyle = '#000'; g.lineCap = g.lineJoin = 'round';
      const L = (wd, ...pts) => { g.lineWidth = wd * 1.28; g.beginPath(); pts.forEach((q, n) => (n ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); };
      const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r * 1.08, 0, Math.PI * 2); g.fill(); };
      const walker = (d, arms) => {
        dot(50 + d, 15, 8.5); L(15, [49 + d, 33], [47 + d, 66]);
        L(8, [47 + d, 66], [56 + d, 94], [60 + d, 121]); L(8, [47 + d, 66], [38 + d, 94], [28 + d, 119]);
        L(6, [60 + d, 122], [67 + d, 122]); L(6, [28 + d, 120], [35 + d, 123]);
        if (arms) { L(6, [49 + d, 35], [40 + d, 52], [34 + d, 64]); L(6, [49 + d, 35], [57 + d, 52], [63 + d, 62]); }
      };
      const stand = (d, top) => { dot(48 + d, top, 8.5); L(15, [48 + d, top + 18], [48 + d, top + 52]); L(8, [48 + d, top + 52], [44 + d, 122]); L(8, [48 + d, top + 52], [53 + d, 122]); };
      [
        () => walker(0, true),
        () => { walker(0, true); g.fillRect(24, 64, 16, 19); g.fillRect(56, 62, 15, 18); },
        () => { stand(0, 15); L(6, [48, 35], [60, 48], [55, 24]); L(6, [48, 35], [40, 54], [41, 70]); },
        () => {
          g.lineWidth = 3.6; [22, 74].forEach((x) => { g.beginPath(); g.arc(x, 105, 16, 0, Math.PI * 2); g.stroke(); });
          L(3, [22, 105], [40, 84], [62, 84], [74, 105]); L(3, [40, 84], [48, 105], [62, 84]); L(3, [40, 84], [38, 74]); L(3, [62, 84], [64, 70], [71, 68]);
          dot(61, 29, 8.5); L(13, [38, 70], [54, 45]); L(5.5, [54, 47], [62, 60], [69, 68]); L(7, [38, 70], [53, 87], [48, 104]); L(7, [38, 70], [46, 86], [40, 98]);
        },
        () => {
          dot(35, 17, 8.5); L(15, [33, 35], [29, 68]); L(8, [29, 68], [37, 96], [39, 121]); L(8, [29, 68], [21, 96], [11, 119]); L(6, [39, 122], [46, 122]); L(6, [11, 120], [18, 123]);
          L(6, [33, 38], [47, 52], [59, 56]); L(3, [59, 56], [63, 70]); g.fillRect(61, 66, 28, 27); L(3, [65, 92], [65, 112]); L(3, [85, 92], [85, 112]); dot(65, 117, 5); dot(85, 117, 5);
        },
        () => {
          stand(-2, 32); g.beginPath(); g.ellipse(54, 18, 36, 14, 0, Math.PI, 0); g.closePath(); g.fill();
          L(2.6, [56, 18], [56, 54]); L(6, [46, 52], [53, 62], [56, 52]); L(6, [46, 52], [38, 68], [39, 84]);
        },
        () => {
          walker(-12, false); L(6, [37, 35], [28, 52], [22, 64]); L(5.5, [37, 35], [50, 56], [62, 74]);
          dot(73, 64, 6.5); L(11, [73, 78], [73, 98]); L(6, [73, 98], [69, 122]); L(6, [73, 98], [78, 122]); L(4.5, [73, 80], [62, 74]);
        },
        () => {
          walker(-16, false); L(6, [33, 35], [24, 52], [18, 64]); L(6, [33, 35], [42, 52], [48, 62]);
          L(2.2, [48, 62], [72, 102]); L(9, [68, 108], [85, 108]); dot(89, 101, 5.5); L(3, [69, 108], [68, 122]); L(3, [84, 108], [85, 122]); L(3, [67, 106], [60, 98]);
        },
      ][i]();
    };
    const t = new T.CanvasTexture(sheet(CW * 8, CH * 3, (g) => {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) {
        g.drawImage(sheet(CW, CH, (c) => {
          figure(c, i);
          c.globalCompositeOperation = 'source-in'; c.fillStyle = PEOPLE_HUE[row * 8 + i]; c.fillRect(0, 0, CW, CH);
          watery(c, CW, CH);
        }), i * CW, row * CH);
      }
    }));
    t.anisotropy = 4;
    return t;
  }
  const texPeople = () => (peopleStyle === 'water' ? texPeopleWater() : texPeopleCrayon());

  // 車：蠟筆畫的側面。六格：橘車、杏色車、橘色機車（事件用），藍車、薄荷綠車、粉紅車（改善後用）
  function texCars() {
    const CW = 192, CH = 128, TONE = ['#f08a3c', '#f4b26a', '#f08a3c', '#6f9fd8', '#8fcdb4', '#f0a7bd'];
    const t = new T.CanvasTexture(sheet(CW * 6, CH, (g) => {
      TONE.forEach((tone, i) => g.drawImage(sheet(CW, CH, (c) => {
        const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
        const poly = (col, ...pts) => { c.fillStyle = col; c.beginPath(); pts.forEach((q, n) => (n ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); };
        if (i === 2) {                                                          // 機車和騎士
          dot(58, 104, 14, '#3a3230'); dot(134, 104, 14, '#3a3230'); dot(58, 104, 5, '#d8d2c4'); dot(134, 104, 5, '#d8d2c4');
          poly(tone, [50, 92], [70, 70], [112, 70], [126, 58], [136, 62], [130, 96], [70, 98]);
          poly('#5f6fb0', [84, 70], [80, 38], [102, 34], [112, 70]); poly('#5f6fb0', [100, 40], [128, 56], [124, 62], [98, 50]);   // 騎士的身體和手
          poly('#2f4f9a', [84, 68], [112, 68], [118, 96], [104, 98], [100, 80], [84, 80]);
          dot(92, 24, 12, '#f4f1e8'); poly('#2b2622', [86, 26], [104, 22], [104, 28], [88, 31]);
        } else {
          dot(52, 100, 15, '#3a3230'); dot(142, 100, 15, '#3a3230'); dot(52, 100, 6, '#d8d2c4'); dot(142, 100, 6, '#d8d2c4');
          poly(tone, [12, 96], [14, 70], [34, 60], [164, 60], [180, 72], [182, 96]);                                             // 車身
          poly(tone, [44, 62], [60, 30], [128, 30], [150, 62]);                                                                   // 車頂
          poly('#dff0f4', [54, 58], [66, 37], [92, 37], [92, 58]); poly('#dff0f4', [98, 58], [98, 37], [124, 37], [140, 58]);     // 車窗
          dot(174, 76, 4, '#fff3a8'); dot(18, 78, 3.5, '#d8553a');
        }
        crayon(c, CW, CH);
      }), i * CW, 0));
    }));
    t.anisotropy = 4;
    return t;
  }

  // ---------- 街道細部：羅斯福路的車道線、公車專用道、斑馬線、中央公車站、路邊的公車亭與停靠區 ----------
  const X = window.ATLAS_DETAIL || {};
  const inBox = (q, m) => Math.abs(q[0]) < HW - (m || 0) && Math.abs(q[1]) < HH - (m || 0);
  const onRoad = (x, y) => { const p = { x, y }; return inAny(p, D.major) || inAny(p, D.minor) || inAny(p, D.lane); };
  const spots = {}, busStops = [];                                              // spots：議題要用到的幾個位置
  let stalls = null, forceStalls = false;
  const nightTime = () => sky.time >= 17.5 || sky.time < 1;
  function ribbon(pos, line, half, off, dash) {                                 // 沿著折線鋪一條平的帶子。off：往右偏；dash：[實, 空]
    let run = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      const ux = dx / len, uy = dy / len, rx = uy, ry = -ux;
      const quad = (s0, s1) => {
        const p = [[s0, -half], [s1, -half], [s1, half], [s0, half]].map(([t, o]) => [a[0] + ux * t + rx * (off + o), a[1] + uy * t + ry * (off + o)]);
        if (!p.every((q) => inBox(q))) return;
        [0, 1, 2, 0, 2, 3].forEach((k) => pos.push(p[k][0], 0, -p[k][1]));
      };
      if (!dash) quad(0, len);
      else { const per = dash[0] + dash[1]; for (let t = -(run % per); t < len; t += per) { const s0 = Math.max(0, t), s1 = Math.min(len, t + dash[0]); if (s1 > s0) quad(s0, s1); } }
      run += len;
    }
  }
  function paint(pos, color, y, opt) {                                          // 把一堆平的三角形變成一層；opt 有給就是不受光影響的半透明色
    if (!pos.length) return null;
    const g = new T.BufferGeometry(), nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    const m = new T.Mesh(g, opt ? new T.MeshBasicMaterial(Object.assign({ color, side: T.DoubleSide, transparent: true, depthWrite: false }, opt)) : fill(new T.MeshLambertMaterial({ color, side: T.DoubleSide })));
    m.position.y = y; m.receiveShadow = !opt; if (opt) m.renderOrder = 2;
    scene.add(m);
    return m;
  }
  function shelter(k, x, y, a, nx, ny) {                                        // 公車亭：白色頂棚、玻璃背板、藍色站名、木頭長椅、廣告燈箱。(nx, ny) 指向背對馬路的那一側
    const cx = Math.cos(a), cy = Math.sin(a);
    k.tone('#f1f3f4'); k.box(x, y, a, 3.7, 1.5, 3.3, 3.5);
    k.tone('#cfe3ea'); k.box(x + nx * 1.3, y + ny * 1.3, a, 3.5, 0.05, 0.9, 3.3);
    k.tone('#2a6fd0'); k.box(x + nx * 1.22 + cx * 1.1, y + ny * 1.22 + cy * 1.1, a, 2.3, 0.07, 2.5, 3.1);
    k.tone('#f2c230'); [-3.5, 3.5].forEach((e) => k.box(x + cx * e + nx * 1.3, y + cy * e + ny * 1.3, a, 0.1, 0.1, 0.5, 3.3));
    k.tone('#c58a4a'); k.box(x + cx * 1.3 + nx * 0.7, y + cy * 1.3 + ny * 0.7, a, 1.7, 0.3, 1.0, 1.13);
    k.tone('#e9523a'); k.box(x - cx * 4.7 + nx * 0.9, y - cy * 4.7 + ny * 0.9, a, 0.9, 0.1, 0.9, 2.9);
  }
  function streets() {
    const white = [], lane = [], zebra = [], LW = 3.3, busText = [];
    (X.roads || []).forEach((r) => {
      const w = (r.n * LW) / 2;
      [-w, w].forEach((o) => ribbon(white, r.p, 0.16, o));
      for (let i = 1; i < r.n; i++) ribbon(white, r.p, 0.14, -w + i * LW, [4, 6]);
    });
    (X.bus || []).forEach((p) => {                                            // 公車專用道：整條換一個顏色、兩邊粗白線，每隔一段寫上字
      ribbon(lane, p, 1.95, 0); [-1.95, 1.95].forEach((o) => ribbon(white, p, 0.3, o));
      let run = 55;
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], b = p[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (; run < len; run += 120) { const x = a[0] + ((b[0] - a[0]) * run) / len, y = a[1] + ((b[1] - a[1]) * run) / len; if (inBox([x, y], 30) && !busText.some((q) => Math.hypot(q[0] - x, q[1] - y) < 60)) { busText.push([x, y]); words.push(sign('公車專用道', x, y, Math.atan2(b[1] - a[1], b[0] - a[0]), 3)); } }
        run -= len;
      }
    });
    const bars = (line, half) => {                                              // 斑馬線：一條一條跟車行方向平行的白線
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        for (let t = 0.5; t < len; t += 1.3) {
          const x = a[0] + ux * t, y = a[1] + uy * t;
          if (!inBox([x, y], 4) || !onRoad(x, y)) continue;
          const p = [[-0.32, -half], [0.32, -half], [0.32, half], [-0.32, half]].map(([d, o]) => [x + ux * d + uy * o, y + uy * d - ux * o]);
          [0, 1, 2, 0, 2, 3].forEach((n) => zebra.push(p[n][0], 0, -p[n][1]));
        }
      }
    };
    (X.cross || []).forEach((l) => bars(l, 2.2));
    spots.cross = (X.cross || []).filter((l) => inBox(l[0], 4));
    busStops.length = 0;
    if (heroSpan && heroRing) {
      // 以天橋為基準：u 是跨過馬路的方向（正的是對街），t 是沿著路（正的往東南）
      const p = heroSpan, a = nearRing(p[0], heroRing) < nearRing(p[p.length - 1], heroRing) ? p[0] : p[p.length - 1], b = a === p[0] ? p[p.length - 1] : p[0];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      let sx = uy, sy = -ux; if (sx < 0) { sx = -sx; sy = -sy; }
      const ang = Math.atan2(sy, sx), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const at = (u, t) => [mid[0] + ux * u + sx * t, mid[1] + uy * u + sy * t];
      bars([at(-len / 2 - 3, -15), at(len / 2 + 3, -15)], 2.6);                 // 天橋西北邊、九十巷口的行人穿越道
      spots.cross.push([at(-len / 2 - 3, -15), at(len / 2 + 3, -15)]);
      let sum = 0, cnt = 0;                                                     // 公車專用道在路中間的哪裡
      (X.bus || []).forEach((l) => l.forEach((q) => { if (Math.hypot(q[0] - mid[0], q[1] - mid[1]) < 70) { sum += (q[0] - mid[0]) * ux + (q[1] - mid[1]) * uy; cnt++; } }));
      const uc = cnt ? sum / cnt : 0, up = uc + 5.4, k = kit();
      // 中央的公車站：月台從天橋下面穿過，上面是深色的玻璃頂棚
      let q = at(up, 0);
      k.tone('#f6f3ea'); k.box(q[0], q[1], ang, 36, 1.7, 0.45, 0.8);
      k.tone('#a9c6d6'); k.box(q[0], q[1], ang, 32, 2, 3.5, 3.66);                                  // 玻璃頂棚：淺藍灰
      k.tone('#ffffff'); for (let t = -30; t <= 30; t += 6) { q = at(up + 1.4, t); k.box(q[0], q[1], ang, 0.12, 0.12, 0.8, 3.5); }
      q = at(up + 1.5, 0); k.tone('#d6ebf3'); k.box(q[0], q[1], ang, 32, 0.05, 0.9, 2.7);
      spots.platform = at(up, 0);
      // 對街往東南約九十公尺：路邊的公車亭與畫在路面上的公車停靠區（現在沒有公車停靠）
      let d = 2; while (d < 40 && onRoad(at(d, 92)[0], at(d, 92)[1])) d += 0.5;
      const c = at(d - 2, 92), box = [[-12, -1.7], [12, -1.7], [12, 1.7], [-12, 1.7], [-12, -1.7]].map(([t, o]) => [c[0] + sx * t + ux * o, c[1] + sy * t + uy * o]);
      ribbon(white, box, 0.16, 0);
      words.push(sign('公車停靠區', c[0], c[1], ang, 2.6));
      q = at(d + 2.8, 92); shelter(k, q[0], q[1], ang, ux, uy); busStops.push(q);
      spots.layby = { c, ang, sx, sy, ux, uy, stop: q };
      spots.frame = { at, len, uc };
      const grp = lift(k.mesh()); scene.add(grp);
    }
    paint(lane, C.busLane, 0.455);
    paint(white, '#fffdf6', 0.47);
    paint(zebra, '#fffdf6', 0.48);
  }
  // 公館夜市的攤位：推車加上彩色的棚子和一盞燈，傍晚五點半以後才出來
  function nightMarket() {
    stalls = null;
    const poly = (X.night || [])[0];
    if (!poly) return;
    const k = kit(), glow = [], tones = ['#c98f84', '#d8c08a', '#9db4c2', '#a9bfa3', '#d3ab88'];   // 棚子用低彩度的顏色
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]), x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
    const near = D.buildings.filter((b) => b.p.some((q) => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1)), placed = [];
    let n = 0;
    near.forEach((b) => {                                                       // 攤位貼著房子的牆邊擺，路中間留給人走
      for (let i = 0; i < b.p.length; i++) {
        const p0 = b.p[i], p1 = b.p[(i + 1) % b.p.length], dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
        if (len < 3) continue;
        const ux = dx / len, uy = dy / len, a = Math.atan2(dy, dx);
        for (let t = 1.6 + rnd() * 1.5; t < len - 1.2; t += 4.7 + rnd() * 1.2) {
          let hit = null;
          [1, -1].forEach((sd) => {                                             // 牆的哪一邊是街上
            const px = p0[0] + ux * t + uy * sd * 2.1, py = p0[1] + uy * t - ux * sd * 2.1, pt = { x: px, y: py };
            if (!hit && inside(pt, poly) && !inAny(pt, D.major) && !near.some((o) => inside(pt, o.p))) hit = [px, py];
          });
          if (!hit || placed.some((q) => Math.hypot(q[0] - hit[0], q[1] - hit[1]) < 4.2)) continue;
          placed.push(hit);
          const px = hit[0], py = hit[1];
          k.tone('#efe9dc'); k.box(px, py, a, 1.3, 0.8, 0.5, 1.5);
          k.tone('#9a9287'); [[-1.5, -1], [1.5, -1], [1.5, 1], [-1.5, 1]].forEach(([e, o]) => k.box(px + Math.cos(a) * e - Math.sin(a) * o, py + Math.sin(a) * e + Math.cos(a) * o, a, 0.06, 0.06, 0.5, 2.6));
          k.tone(tones[n++ % tones.length]); k.box(px, py, a, 1.75, 1.2, 2.6, 2.85);
          k.tone('#f6ecc0'); k.box(px, py, a, 0.26, 0.26, 2.25, 2.6);
          for (let j = 0; j < 14; j++) { const a0 = (j / 14) * Math.PI * 2, a1 = ((j + 1) / 14) * Math.PI * 2; glow.push(px, 0, -py, px + Math.cos(a0) * 3.6, 0, -py + Math.sin(a0) * 3.6, px + Math.cos(a1) * 3.6, 0, -py + Math.sin(a1) * 3.6); }
        }
      }
    });
    stalls = k.mesh();
    stalls.children[0].material = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide });   // 不吃光：晚上棚子和燈還是亮的
    stalls.children[0].castShadow = false;
    const g = paint(glow, '#ffe2a0', 0.62, { opacity: 0.2 });
    if (g) { scene.remove(g); stalls.add(g); }
    scene.add(stalls);
    spots.night = { poly, c: [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length], count: n };
    stalls.visible = (forceStalls || nightTime()) && !survey;
  }

  // ---------- 街上的白模：公車亭 ----------
  const inAny = (p, list) => list.some((rings) => inside(p, rings[0]) && !rings.slice(1).some((r) => inside(p, r)));
  function traffic() {
    const k = kit(), F = (D.flows || {}).car || [], white = '#fcfbf7', grey = '#e4e5e3';
    const road = (p) => inAny(p, D.major) || inAny(p, D.minor) || inAny(p, D.lane);
    const built = (p) => D.buildings.some((b) => inside(p, b.p));
    const stops = busStops;                                                     // 已經照實際位置放好的公車亭附近不再放
    F.forEach((l) => {
      const w = l[0], q = l[1];
      if (w < 1.4) return;
      let stopAt = 60 + rnd() * 80;
      for (let i = 0; i + 3 < q.length; i += 2) {
        const dx = q[i + 2] - q[i], dy = q[i + 3] - q[i + 1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, a = Math.atan2(dy, dx);
        if (w >= 2.4) {
          for (; stopAt < len; stopAt += 170 + rnd() * 60) {                     // 往右找到路緣，公車亭放在人行道上
            const px = q[i] + ux * stopAt, py = q[i + 1] + uy * stopAt;
            let d = 4; while (d < 34 && road({ x: px + uy * d, y: py - ux * d })) d += 1;
            const x = px + uy * (d + 2.6), y = py - ux * (d + 2.6);
            if (d >= 34 || Math.abs(x) > HW - 12 || Math.abs(y) > HH - 12 || built({ x, y }) || stops.some((o) => Math.hypot(o[0] - x, o[1] - y) < 90)) continue;
            stops.push([x, y]);
            k.tone(white); k.box(x, y, a, 4.4, 1.5, 3.4, 3.7);                                                   // 頂棚
            k.tone(grey); k.box(x + uy * 1.2, y - ux * 1.2, a, 4.2, 0.12, 0.5, 3.4);                              // 背板
            k.tone(white); [-4, 4].forEach((e) => k.box(x + ux * e - uy * 1.2, y + uy * e + ux * 1.2, a, 0.14, 0.14, 0.5, 3.4));   // 前柱
            k.box(x + uy * 0.5, y - ux * 0.5, a, 2.6, 0.4, 0.5, 1.15);                                            // 長椅
            k.box(x + ux * 6 - uy * 1, y + uy * 6 + ux * 1, a, 0.13, 0.13, 0.5, 4.6); k.tone(C.key2); k.box(x + ux * 6 - uy * 1, y + uy * 6 + ux * 1, a, 0.7, 0.16, 3.7, 4.7);   // 站牌
          }
          stopAt -= len;
        }
      }
    });
    const grp = k.mesh(); scene.add(grp); crowd.push(grp);
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
    const pin = (zh, en, x, y, lift, lens, issue, color, side) => {                    // 只在某個分析模式（或某一則議題）才出現的標籤
      const el = document.createElement('div');
      el.className = 'note note-lens'; el.innerHTML = '<i></i><span><b></b></span>';
      el.querySelector('b').textContent = zh; el.querySelector('span').appendChild(document.createTextNode(en || ''));
      if (color) el.style.setProperty('--tone', color);
      el.style.display = 'none'; tags.appendChild(el);
      pins.push({ el, stem: el.firstChild, at: { x, y }, lift, lens, issue, side });
    };
    const hero = S.notes.find((n) => n.mark === 'main');
    (S.zones || []).forEach((z) => {
      const ring = z.use === 'night' ? (X.night || [])[0] : z.poly, c = z.use === 'hero' && hero ? [hero.at.x + 30, hero.at.y - 30] : ring ? [ring.reduce((t, q) => t + q[0], 0) / ring.length, ring.reduce((t, q) => t + q[1], 0) / ring.length] : null;
      if (c) pin(z.zh, z.note || '', z.at ? z.at[0] : c[0], z.at ? z.at[1] : c[1], 46, 'shop', null, z.color);
    });
    if (S.arts) {
      S.arts.nodes.forEach((n) => { const q = toXY(n); pin(n.zh, n.en || '', q.x, q.y, (n.h || 6) + 34, 'art', null, C.heroPink); });
      (S.arts.links || []).forEach(([i, j, fest]) => { if (!fest) return; const a = toXY(S.arts.nodes[i]), b = toXY(S.arts.nodes[j]); pin(fest, '', (a.x + b.x) / 2, (a.y + b.y) / 2, 95, 'art', null, C.key2); });
    }
    const L = spots.layby, sk = spots.sky, N = spots.night;
    const warn = '#e8452c';
    if (L) {
      pin('家長臨時接送區', '閒置的公車停靠區改用', L.c[0], L.c[1], 22, 'issue', 0, C.heroPink, 'fix'); pin('公車亭', '水源市場站', L.stop[0], L.stop[1], 14, 'issue', 0);
      pin('閒置的公車停靠區', '現在沒有公車停靠', L.c[0], L.c[1], 22, 'issue', 0, '#8a8a8a', 'find');
      if (spots.jam) pin('臨時接送佔用車道', '上下學時間', spots.jam[0], spots.jam[1], 16, 'issue', 0, warn, 'find');
    }
    if (sk) {
      let q = sk.at(sk.len - 1.5, sk.W + 1.5); pin('天橋電梯（新增）', '無障礙上下天橋', q[0], q[1], 24, 'issue', 1, C.heroPink, 'fix');
      q = sk.at(5, -9); pin('橋下空間改善', '一樓橋下與樓梯下方', q[0], q[1], 12, 'issue', 1, C.heroPink, 'fix');
      q = sk.at(6.5, sk.W + 9); pin('只有樓梯', '推車、輪椅、提重物都不方便', q[0], q[1], 18, 'issue', 1, warn, 'find');
      q = sk.at(5, -9); pin('橋下空間零碎', '一樓橋下與樓梯下方', q[0], q[1], 12, 'issue', 1, '#8a8a8a', 'find');
    }
    if (N) {
      pin('夜間行人徒步區', '晚上 6:00–9:00 車輛不進入', N.c[0], N.c[1], 40, 'issue', 2, C.heroPink, 'fix');
      pin('人車混雜', '攤位、行人與汽機車擠在同一條路', N.c[0], N.c[1], 40, 'issue', 2, warn, 'find');
    }
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
    document.getElementById('shot-close').addEventListener('click', () => { document.getElementById('atlas-shot').hidden = true; });
    const bar = document.getElementById('atlas-lens');
    Object.keys(LENS).forEach((k) => {
      const b = document.createElement('button');
      b.dataset.lens = k; b.textContent = LENS[k][0];
      b.addEventListener('click', () => (k === 'issue' ? setIssue(issueAt) : setMode('a', k)));
      bar.appendChild(b);
    });
    const tabs = document.getElementById('issue-tabs');
    (S.issues || []).forEach((it, i) => {
      const b = document.createElement('button');
      b.textContent = '議題 ' + (i + 1); b.addEventListener('click', () => setIssue(i));
      tabs.appendChild(b);
    });
    [...document.getElementById('issue-side').children].forEach((b) => b.addEventListener('click', () => { issueSide = b.dataset.side; setMode('a', 'issue'); }));
    if (!(S.issues || []).length) bar.querySelector('[data-lens="issue"]').hidden = true;
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
  const clockNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const sky = { time: clockNow(), weather: STYLE.weather || 'sun', manual: false };   // 時間跟著看的人當下的時刻走；manual 是編輯時手動拉過時間軸
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
    const cut = day ? w.cut : w.cut * 0.55, dim = day ? w.dim : 0.96;
    sun.intensity = Math.min(0.72, cut / up);
    amb.intensity = dim - sun.intensity * up;
    if (day) {
      sun.color.set('#ffffff').lerp(tint.set('#ffb070'), low * 0.7);
      amb.color.set(dull ? '#e6ebf2' : '#ffffff').lerp(tint.set('#ffe2c4'), low * 0.45);
    } else {
      sun.color.set('#dfe5ff'); amb.color.set('#c9d2f6');                     // 晚上：淡淡的藍，但顏色還看得清楚
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
    const hand = document.getElementById('dial-hour');                         // 手繪時鐘的指針
    if (hand) {
      hand.setAttribute('transform', 'rotate(' + ((t % 12) * 30).toFixed(1) + ' 100 100)');
      document.getElementById('dial-min').setAttribute('transform', 'rotate(' + ((t % 1) * 360).toFixed(1) + ' 100 100)');
      [...document.getElementById('set-ampm').children].forEach((b) => b.classList.toggle('on', (b.dataset.pm === '1') === (t >= 12)));
    }
    if (stalls) stalls.visible = (forceStalls || nightTime()) && !survey;
    renderer.shadowMap.needsUpdate = true; dirty = true;
  }

  // ---------- 設定面板：時間與天氣 ----------
  function settings() {
    const panel = document.getElementById('atlas-panel'), time = document.getElementById('set-time'), wx = document.getElementById('set-weather');
    setInterval(() => { if (!sky.manual) { sky.time = clockNow(); time.value = sky.time; applySky(); } }, 60000);   // 每分鐘對一次時
    const setBtn = document.getElementById('atlas-set');
    setBtn.textContent = EDIT ? '編輯' : '時間・天氣';                          // 時間與天氣大家都能調；調色和 Render 只有自己電腦上才有
    setBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    document.getElementById('set-close').addEventListener('click', () => { panel.hidden = true; });
    // 手繪時鐘：紅色蠟筆的數字、藍色的指針。在鐘面上拖曳可以調時間，下面選上午或下午
    const dial = document.getElementById('set-dial'), nums = document.getElementById('dial-nums');
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2, el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('x', (100 + Math.sin(a) * 80).toFixed(1)); el.setAttribute('y', (100 - Math.cos(a) * 80 + 8).toFixed(1));
      el.setAttribute('transform', 'rotate(' + ((n * 37) % 17 - 8) + ' ' + (100 + Math.sin(a) * 80).toFixed(1) + ' ' + (100 - Math.cos(a) * 80).toFixed(1) + ')');
      el.textContent = n; nums.appendChild(el);
    }
    const setFrom = (h) => { sky.manual = true; sky.time = Math.min(23.75, h); time.value = sky.time; applySky(); };
    let turning = false;
    const turn = (e) => {
      const r = dial.getBoundingClientRect(), a = Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2));
      setFrom((Math.round((((a / (Math.PI * 2)) * 12 + 12) % 12) * 4) / 4) % 12 + (sky.time >= 12 ? 12 : 0));
    };
    dial.addEventListener('pointerdown', (e) => { turning = true; dial.setPointerCapture(e.pointerId); turn(e); });
    dial.addEventListener('pointermove', (e) => { if (turning) turn(e); });
    dial.addEventListener('pointerup', () => { turning = false; }); dial.addEventListener('pointercancel', () => { turning = false; });
    [...document.getElementById('set-ampm').children].forEach((b) => b.addEventListener('click', () => setFrom((sky.time % 12) + (b.dataset.pm === '1' ? 12 : 0))));
    time.value = sky.time;
    time.addEventListener('input', () => { sky.manual = true; sky.time = +time.value; applySky(); });
    document.getElementById('set-now').addEventListener('click', () => { sky.manual = false; sky.time = clockNow(); time.value = sky.time; applySky(); });   // 回到現在的時刻
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
    if (!EDIT) return;                                                         // 發布出去的網站到這裡為止，沒有調色與輸出的介面
    panel.insertAdjacentHTML('beforeend', '<div id="set-edit"><h2>輸出</h2><button id="atlas-render" title="把現在的角度存成 PNG；按住 Shift 再按，背景透明">Render 存成 PNG</button>' +
      '<p class="set-tip">存的是現在畫面的角度。按住 Shift 再按，背景是透明的。</p><h2>畫面</h2><button id="set-wc"></button><button id="set-people"></button><h2>樹</h2><div id="set-tree" class="set-pick"><button data-tool="add">種樹</button><button data-tool="cut">移除樹</button></div>' +
      '<p class="set-tip" id="set-tree-tip"></p><div id="set-tree-lib"></div><p class="set-tip">樹的圖鑑：亮著的是地圖上會出現的種類，點一下開或關。按了「種樹」之後再點其中一種，就只種那一種（再點一次回到隨機）。</p><button id="set-tree-copy">複製 trees.js 的內容</button><textarea id="set-tree-out" rows="3" readonly></textarea><button id="set-tree-reset">回到檔案裡的樹</button><h2>山的圖案</h2><div id="set-hill" class="set-pick"></div><h2>顏色</h2><div id="set-colors"></div><button id="set-reset">回到檔案裡的顏色</button>' +
      '<p class="set-tip">這一區只有在自己電腦上預覽時才會出現。調好之後跟 Claude 說「存顏色」，或按下面的按鈕複製，貼到 data/style.js 蓋掉原本的內容再上傳。</p>' +
      '<button id="set-copy">複製 style.js 的內容</button><textarea id="set-out" rows="5" readonly></textarea></div>');
    const list = document.getElementById('set-colors'), out = document.getElementById('set-out');
    document.getElementById('atlas-render').addEventListener('click', (e) => shot(e.shiftKey));
    const text = () => {
      const lines = PALETTE.concat([['slab', '底座側邊'], ['pier', '橋墩']]).map(([k, label]) => "    " + k + ": '" + C[k] + "',".padEnd(22) + '// ' + label);
      return '// 網站的顏色與天氣。由頁面上的調色面板產生。時間不用設定，網站會跟著看的人當下的時刻走。\nwindow.ATLAS_STYLE = {\n  palette: {\n' + lines.join('\n') + '\n  },\n  people: \'' + peopleStyle + '\',\n  trees: [' + treeSet.join(', ') + '],\n  watercolor: ' + wc + ',\n  hillPattern: \'' + hillKind + '\',\n  weather: \'' + sky.weather + '\',\n};\n';
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
    const wcBtn = document.getElementById('set-wc'), wcShow = () => { wcBtn.textContent = '水彩濾鏡：' + (wc ? '開' : '關'); stage.classList.toggle('wc', wc); };
    wcBtn.addEventListener('click', () => { wc = !wc; try { localStorage.setItem(STORE + '-wc', wc ? '1' : '0'); } catch (e) { /* 只留在這一次 */ } wcShow(); out.value = text(); });
    wcShow();
    const ppBtn = document.getElementById('set-people'), ppShow = () => { ppBtn.textContent = '人物：' + (peopleStyle === 'water' ? '水彩' : '插畫（蠟筆）'); };
    ppBtn.addEventListener('click', () => { peopleStyle = peopleStyle === 'water' ? 'crayon' : 'water'; try { localStorage.setItem(STORE + '-people', peopleStyle); } catch (e) { /* 只留在這一次 */ } ppShow(); out.value = text(); build(); });
    ppShow();
    const treeOut = document.getElementById('set-tree-out'), treeTip = document.getElementById('set-tree-tip'), treeBtns = [...document.getElementById('set-tree').children];
    treeSaved = () => {
      treeOut.value = '// 手動加的樹（add：x, y, 大小, 顏色 0–5）和移掉的樹（cut：x, y）。由頁面上的種樹工具產生。\nwindow.ATLAS_TREES = ' + JSON.stringify(TREES) + ';\n';
      treeTip.textContent = (treeTool === 'add' ? '種樹中：在地圖上點一下種一棵（拖曳還是可以轉動畫面）。' : treeTool === 'cut' ? '移除中：點一棵樹把它移掉。' : '按「種樹」或「移除樹」後到地圖上點。再按一次同一顆按鈕結束。') + '　目前加了 ' + TREES.add.length + ' 棵、移掉 ' + TREES.cut.length + ' 棵。';
    };
    treeBtns.forEach((b) => b.addEventListener('click', () => {
      treeTool = treeTool === b.dataset.tool ? '' : b.dataset.tool;
      treeBtns.forEach((c) => c.classList.toggle('on', c.dataset.tool === treeTool));
      canvas.style.cursor = treeTool ? 'crosshair' : ''; treeSaved();
    }));
    document.getElementById('set-tree-copy').addEventListener('click', () => { treeOut.select(); if (navigator.clipboard) navigator.clipboard.writeText(treeOut.value).catch(() => {}); });
    document.getElementById('set-tree-reset').addEventListener('click', () => {
      const f = window.ATLAS_TREES || {}; TREES.add = (f.add || []).slice(); TREES.cut = (f.cut || []).slice();
      try { localStorage.removeItem(STORE + '-trees'); } catch (e) { /* 沒關係 */ }
      treeSaved(); build();
    });
    const lib = document.getElementById('set-tree-lib');
    const libShow = () => [...lib.children].forEach((b, k) => { b.classList.toggle('on', treeSet.includes(k)); b.classList.toggle('brush', treeBrush === k); });
    TREE_NAMES.forEach((name, k) => {
      const b = document.createElement('button'), im = document.createElement('img');
      im.src = treeCell(k).toDataURL(); im.alt = name; b.append(im, name);
      b.addEventListener('click', () => {
        if (treeTool === 'add') { treeBrush = treeBrush === k ? -1 : k; libShow(); return; }
        if (treeSet.includes(k)) { if (treeSet.length > 1) treeSet = treeSet.filter((v) => v !== k); } else treeSet = treeSet.concat(k).sort((x, y) => x - y);
        try { localStorage.setItem(STORE + '-treeset', JSON.stringify(treeSet)); } catch (e) { /* 只留在這一次 */ }
        libShow(); out.value = text(); clearTimeout(wait); wait = setTimeout(build, 140);
      });
      lib.appendChild(b);
    });
    libShow();
    treeSaved();
    const hillBox = document.getElementById('set-hill');
    HILLS.forEach(([k, label]) => {
      const b = document.createElement('button');
      b.textContent = label; b.classList.toggle('on', k === hillKind);
      b.addEventListener('click', () => {
        hillKind = k; [...hillBox.children].forEach((c) => c.classList.toggle('on', c === b));
        try { localStorage.setItem(STORE + '-hill', k); } catch (e) { /* 只留在這一次 */ }
        out.value = text(); build();
      });
      hillBox.appendChild(b);
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
        [].concat(n.material || []).forEach((m) => { if (m.map) m.map.dispose(); if (m.uniforms && m.uniforms.map) m.uniforms.map.value.dispose(); m.dispose(); });   // 山有兩個材質（頂面、側面）
      });
    });
    slices.length = 0;
    [fills, inks, solidOnly, heightOnly, roofOnly, crowd, colorOnly, paleOnly, hillOnly, issueObj[0], issueObj[1], issueObj[2], eventObj[0], eventObj[1], eventObj[2], lensObj.shop, lensObj.art, lensObj.issue, growers, words, blobs, lensObj.walk, lensObj.car, lensObj.height, lensObj.reach].forEach((a) => { a.length = 0; });
    flock.length = 0;
    derive(); seed = 11;
    heroSpan = null;
    ground(); buildings(); bridges(); skywalk(); streets(); nightMarket(); hills();
    const leaf = texTrees();
    const tr = treeList();
    const kinded = (list) => list.map((t) => [t[0], t[1], t[2], treeKind(t), t[4], t[5]]);
    colorOnly.push(standees(kinded(tr.flat), 9, 14.5, 6, 2, leaf, 3.4));
    colorOnly.push(standees(kinded(tr.hill), 9, 14.5, 6, 2, leaf, 3.4, (t) => 0.2 + t[5] * RISE));   // 山上只留一些樹
    crowd.push(standees(D.people.map((t, i) => [t[0], t[1], t[2], (i * 5 + t[3]) % 24]), 3.45, 4.6, 8, 3, texPeople(), 0.9));
    traffic();
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
    if (on === survey || !slices.length) return;
    if (grow < 1) { grow = 1; town.scale.y = 1; growers.forEach((m) => { m.uniforms.grow.value = 1; }); renderer.shadowMap.needsUpdate = true; }   // 開場動畫還沒跑完就點了：直接跳到結束
    survey = on;
    const hero = S.notes.find((n) => n.mark === 'main'), keep = slices.map((sl) => sl.g).concat(skyHolder ? [skyHolder] : []);
    scene.children.forEach((o) => { if (!o.isLight && o !== sun.target && o !== town) o.visible = !on; });
    town.children.forEach((o) => { o.visible = !on || keep.includes(o); });
    base.forEach((o) => { o.visible = on; });
    stage.classList.toggle('survey', on);
    document.getElementById('atlas-floor-btn').textContent = on ? '回到地圖' : '樓層測繪圖';
    if (on) {
      before = { tx: view.tx, tz: view.tz, ty: 0, size: view.size, az: view.az, el: view.el };
      const asp = stage.clientWidth / stage.clientHeight, size = Math.max(84, 62 / asp), az = 1.75, shift = Math.min(size * asp * (asp < 0.8 ? 0.5 : 0.3), 34);   // 把主體往左放，右邊留給引線的字；直式畫面要讓得更多
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
      el.style.setProperty('--room', Math.max(64, w - bx - (w < 720 ? 44 : 130)) + 'px');   // 字最多可以多寬，才不會跑出畫面
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
    car: ['車流', '大的點是汽車：紅是幹道與高架、橘是次要道路、黃是巷弄。小的藍點是機車，數量比汽車多、速度也快。依道路分級推估，不是實測車流量。'],
    walk: ['人流', '桃紅是人行道上的行人，黃色是行人穿越道，橘色是沒有人行道、人車共用的巷弄。越靠近市場、捷運出口與寶藏巖越密。依路網與距離推估，不是實測人數。'],
    shop: ['商圈', '藍色是公館商圈（羅斯福路與汀州路之間的店面街區），黃色是公館夜市（傍晚以後的攤商），桃紅是水源市場（白天的傳統市場）。範圍是示意，不是正式劃定的界線。'],
    art: ['藝文網絡', '水源市場與樓上的水源劇場、寶藏巖國際藝術村、蟾蜍山煥民新村，加上公館巷弄藝術節串起的公館商圈，彼此都在步行可到的距離內。'],
    issue: ['議題', ''],
    height: ['建築高度', '淡黃是低樓層，越往桃紅、紫色越高。高度多半由樓層數換算，缺資料的是估計值。'],
    reach: ['步行圈', '以水源市場為圓心的直線距離：200、400、800 公尺，步行大約 3、5、10 分鐘。實際路程會比直線遠。'],
  };
  function setMode(m, l) {
    mode = 'a'; if (l) lens = l;
    const study = lens !== 'map', tall = lens === 'height', issue = lens === 'issue';
    solidOnly.forEach((o) => { o.visible = !tall && !issue; });
    heightOnly.forEach((o) => { o.visible = tall; });
    paleOnly.forEach((o) => { o.visible = issue; });
    hillOnly.concat(colorOnly).forEach((o) => { if (o) o.visible = !issue; });   // 議題：山、樹也收起來，只留羅斯福路和主體有顏色
    crowd.forEach((o) => { o.visible = lens !== 'walk' && lens !== 'car'; });   // 人流、車流時把裝飾的小人收起來，免得跟流動的點混在一起
    Object.keys(lensObj).forEach((k) => lensObj[k].forEach((o) => { o.visible = lens === k; }));
    issueObj.forEach((list, i) => list.forEach((o) => { o.visible = issue && i === issueAt && issueSide === 'fix'; }));
    eventObj.forEach((list, i) => list.forEach((o) => { o.visible = issue && i === issueAt && issueSide === 'find'; }));
    forceStalls = issue && issueAt === 2;                                     // 夜市那一則：不管幾點都把攤位擺出來
    pins.forEach((p) => { if (p.lens) p.el.style.display = p.lens === lens && (p.issue == null || p.issue === issueAt) && (!p.side || p.side === issueSide) ? '' : 'none'; });
    words.forEach((o) => { o.visible = !bare; });
    [...document.getElementById('atlas-lens').children].forEach((b) => b.classList.toggle('on', b.dataset.lens === lens));
    const note = document.getElementById('lens-note');
    note.textContent = study ? LENS[lens][1] : ''; note.hidden = !study || !LENS[lens][1];
    const card = document.getElementById('issue-card'), it = (S.issues || [])[issueAt];
    card.hidden = !issue || !it;
    if (it) {
      document.getElementById('issue-title').textContent = it.title;
      document.getElementById('issue-text').textContent = it[issueSide];
      [...document.getElementById('issue-side').children].forEach((b) => b.classList.toggle('on', b.dataset.side === issueSide));
      [...document.getElementById('issue-tabs').children].forEach((b, i) => b.classList.toggle('on', i === issueAt));
    }
    applySky();
  }
  function issueSpot(i) {                                                       // 每一則議題要看的地方
    const sk = spots.sky, c = i === 0 && spots.layby ? spots.layby.c : i === 1 && sk ? sk.at(sk.len / 2, 0) : i === 2 && spots.night ? spots.night.c : null;
    return c ? { x: c[0], y: c[1], size: i === 2 ? 110 : 62, az: i === 1 ? 2.2 : HOME.az } : null;   // 天橋要從對街那一側看，才不會被主體擋住
  }
  function setIssue(i) {
    issueAt = i; issueSide = 'find'; setMode('a', 'issue');                    // 換一則議題：先看事件
    const t = issueSpot(i);
    if (t) { view.az = ((view.az - t.az + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI + t.az; fly({ tx: t.x, tz: -t.y, ty: 0, size: t.size, az: t.az, el: 0.7 }); }
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
  const lift = (grp, e) => { grp.children[0].material.emissive = new T.Color(e || '#474747'); return grp; };   // 白模自己帶一點亮度，背光或晚上才不會灰灰暗暗的
  const tint3 = (mesh, opacity) => { mesh.children[0].material = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: opacity < 1, opacity }); mesh.children[0].castShadow = false; return mesh; };
  // 商圈類型：三塊範圍各蓋一層顏色
  function zones() {
    const hero = S.notes.find((n) => n.mark === 'main');
    (S.zones || []).forEach((z) => {
      const list = z.use === 'night' ? (X.night || []).map((r) => [r]) : z.poly ? [[z.poly]] : [];
      if (list.length) wash(list, z.color, z.use === 'night' ? 0.85 : 0.38, z.use === 'night' ? 0.64 : 0.6, 'shop');
      if (z.use === 'hero' && hero) {
        const m = new T.Mesh(up(new T.CircleGeometry(40, 48)), new T.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.5, depthWrite: false }));
        m.position.set(hero.at.x, 0.68, -hero.at.y); m.renderOrder = 1; scene.add(m); lensObj.shop.push(m);
      }
    });
  }
  // 藝文網絡：幾個據點各一個圓，據點之間用拱起來的線連著
  function network() {
    const A = S.arts;
    if (!A) return;
    const pts = A.nodes.map((n) => { const q = toXY(n); return [q.x, q.y, n.h || 6]; });
    pts.forEach((q, i) => {
      [[22, 0.3], [9, 0.9]].forEach(([r, o]) => {
        const m = new T.Mesh(up(new T.CircleGeometry(r, 40)), new T.MeshBasicMaterial({ color: i ? C.heroPink : C.key2, transparent: true, opacity: o, depthWrite: false }));
        m.position.set(q[0], 0.7, -q[1]); m.renderOrder = 1; scene.add(m); lensObj.art.push(m);
      });
    });
    (A.links || []).forEach(([i, j, fest]) => {
      const a = pts[i], b = pts[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const curve = new T.QuadraticBezierCurve3(new T.Vector3(a[0], a[2], -a[1]), new T.Vector3((a[0] + b[0]) / 2, Math.max(a[2], b[2]) + 30 + d * 0.28, -(a[1] + b[1]) / 2), new T.Vector3(b[0], b[2], -b[1]));
      const m = new T.Mesh(new T.TubeGeometry(curve, 48, fest ? 1.7 : 1.1, 6), new T.MeshBasicMaterial({ color: fest ? C.key2 : C.heroPink }));
      scene.add(m); lensObj.art.push(m);
    });
  }
  // 議題：整張圖淡成白色，只留羅斯福路和主體有顏色；每一則議題再標出它的改善位置
  function issues() {
    const fade = [-HW, 0, HH, HW, 0, HH, HW, 0, -HH, -HW, 0, HH, HW, 0, -HH, -HW, 0, -HH];
    lensObj.issue.push(paint(fade, '#ffffff', 0.7, { opacity: 0.74 }));
    const road = [];
    (X.roads || []).forEach((r) => ribbon(road, r.p, r.n * 1.72, 0));
    (X.bus || []).forEach((l) => ribbon(road, l, 1.9, 0));
    const hi = paint(road, mix(C.major, '#e8452c', 0.45), 0.76, { opacity: 0.95 }); if (hi) lensObj.issue.push(hi);
    const pink = C.heroPink, L = spots.layby, sk = spots.sky, N = spots.night, warn = '#e8452c', grey = '#8a8a8a', carTex = texCars();
    const cars = (items) => standees(items, 7.4, 4.9, 6, 1, carTex, 1.7);     // 蠟筆畫的車：一張一張立起來的紙片，永遠面向鏡頭
    if (L) {                                                                    // 事件一：接送的車停在車道上，旁邊的停靠區空著
      const strip = [], box = [], c0 = L.c;                    // 車子停在緊貼路緣的那一條車道上，就在停靠區前面
      ribbon(strip, [[c0[0] - L.sx * 66, c0[1] - L.sy * 66], [c0[0] - L.sx * 16, c0[1] - L.sy * 16]], 1.7, 0);
      eventObj[0].push(paint(strip, warn, 0.82, { opacity: 0.6 }));
      ribbon(box, [[-12, -1.7], [12, -1.7], [12, 1.7], [-12, 1.7], [-12, -1.7]].map(([t, o]) => [L.c[0] + L.sx * t + L.ux * o, L.c[1] + L.sy * t + L.uy * o]), 0.22, 0, [1.4, 1]);
      eventObj[0].push(paint(box, grey, 0.82, { opacity: 0.95 }));
      eventObj[0].push(cars([-60, -51, -42, -33, -24].map((t, n) => [c0[0] + L.sx * t, c0[1] + L.sy * t, 1, n % 2]).filter((q) => onRoad(q[0], q[1]))));
      spots.jam = [c0[0] - L.sx * 44, c0[1] - L.sy * 44];
    }
    if (sk) {                                                                   // 事件二：上下天橋只有樓梯，橋下的空間零碎
      const st = [], under = [], W = sk.W;
      [[6.5, 1], [6.5, -1], [sk.len - 1.5, -1]].forEach(([s0, d]) => ribbon(st, [sk.at(s0, d * (W + 1)), sk.at(s0, d * (W + 15.5))], 1.6, 0));
      eventObj[1].push(paint(st, warn, 0.84, { opacity: 0.75 }));
      [[-1, 12, 15], [sk.len - 7, sk.len + 2, 15]].forEach(([s0, s1, o]) => ribbon(under, [sk.at(s0, 0), sk.at(s1, 0)], o, 0));
      eventObj[1].push(paint(under, grey, 0.82, { opacity: 0.4 }));
    }
    if (N) {                                                                    // 事件三：夜市的巷道裡攤位、行人、汽機車混在一起
      const m = new T.Mesh(up(new T.ShapeGeometry(shapes([[N.poly]]))), new T.MeshBasicMaterial({ color: warn, transparent: true, opacity: 0.38, depthWrite: false }));
      m.position.y = 0.82; m.renderOrder = 2; scene.add(m); eventObj[2].push(m);
      const xs = N.poly.map((q) => q[0]), ys = N.poly.map((q) => q[1]), put = [];
      const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      for (let n = 0; n < 500 && put.length < 11; n++) {                        // 隨機找位置，最多十一台
        const x = bx + rnd() * bw, y = by + rnd() * bh, pt = { x, y };
        if (!inside(pt, N.poly) || D.buildings.some((b) => inside(pt, b.p))) continue;
        let best = 1e9, a = 0;                                                  // 離街邊最近的那一段：車頭順著它，而且只放在街的中間
        for (let i = 0; i + 1 < N.poly.length; i++) {
          const p0 = N.poly[i], p1 = N.poly[i + 1], dx = p1[0] - p0[0], dy = p1[1] - p0[1], t = Math.max(0, Math.min(1, ((x - p0[0]) * dx + (y - p0[1]) * dy) / (dx * dx + dy * dy || 1)));
          const dist = Math.hypot(x - p0[0] - dx * t, y - p0[1] - dy * t);
          if (dist < best) { best = dist; a = Math.atan2(dy, dx); }
        }
        if (best < 3.2 || put.some((q) => Math.hypot(q[0] - x, q[1] - y) < 13)) continue;
        put.push([x, y]);
      }
      eventObj[2].push(cars(put.map((q, n) => [q[0], q[1], n % 4 === 3 ? 0.8 : 1, n % 4 === 3 ? 2 : n % 2])));   // 四台裡三台是汽車、一台是機車
    }
    if (L) {                                                                    // 一：閒置的公車停靠區改成家長臨時接送區
      const box = [];
      ribbon(box, [[L.c[0] - L.sx * 12, L.c[1] - L.sy * 12], [L.c[0] + L.sx * 12, L.c[1] + L.sy * 12]], 1.7, 0);
      issueObj[0].push(paint(box, pink, 0.82, { opacity: 0.8 }));
      issueObj[0].push(cars([-7.5, 0, 7.5].map((t, n) => [L.c[0] + L.sx * t, L.c[1] + L.sy * t, 1, 3 + n])));
    }
    if (sk) {                                                                   // 二：橋下空間改善、兩端加電梯
      const under = [], k = kit(), W = sk.W, H = sk.H;
      [[-1, 12, 15], [sk.len - 7, sk.len + 2, 15]].forEach(([s0, s1, o]) => { const a = sk.at(s0, 0), b = sk.at(s1, 0); ribbon(under, [a, b], o, 0); });
      issueObj[1].push(paint(under, pink, 0.82, { opacity: 0.42 }));
      [[2.6, W + 1.5], [sk.len - 1.5, W + 1.5]].forEach(([s0, o]) => { const q = sk.at(s0, o); k.tone(pink); k.box(q[0], q[1], sk.ang, 1.25, 1.25, 0.5, H + 3.2); k.tone('#ffffff'); k.box(q[0], q[1], sk.ang, 1.35, 1.35, H + 3.2, H + 3.5); });
      const g = tint3(k.mesh(), 0.8); scene.add(g); issueObj[1].push(g);
    }
    if (N) {                                                                    // 三：夜市的街道晚上改成行人徒步區
      const m = new T.Mesh(up(new T.ShapeGeometry(shapes([[N.poly]]))), new T.MeshBasicMaterial({ color: pink, transparent: true, opacity: 0.62, depthWrite: false }));
      m.position.y = 0.82; m.renderOrder = 2; scene.add(m); issueObj[2].push(m);
    }
  }
  function lenses() {
    const F = D.flows || { car: [], walk: [] };
    const flat = (l, y) => { const p = []; for (let i = 0; i < l[1].length; i += 2) p.push([l[1][i], l[1][i + 1], y]); return p; };
    // 車流：道路依等級上色，車子是沿路跑的點（高架橋上的跟著橋面走）
    wash(D.major, '#e2553f', 0.5, 0.62, 'car'); wash(D.minor, '#f09a4a', 0.45, 0.6, 'car'); wash(D.lane, '#f3cf6a', 0.4, 0.58, 'car');
    const cars = F.car.map((l) => ({ w: l[0], p: flat(l, 1.3) }))
      .concat((D.bridges || []).filter((b) => b.k === 'car' && b.f).map((b) => ({ w: b.f, p: b.p.map((q) => [q[0], q[1], q[2] + 1.2]) })));
    stream('car', cars, (w) => 9 + w * 7, (w) => (w >= 2.4 ? '#c8261a' : w >= 1.4 ? '#e8752a' : '#d8a516'), 5.5, 55);
    stream('car', cars.filter((l) => l.w >= 0.7).map((l) => ({ w: l.w, p: l.p.map((q) => [q[0], q[1], q[2] - 0.3]) })), (w) => 13 + w * 8, () => '#2b4fd6', 3.2, 30);   // 機車：小的藍點，比汽車多也比較快
    // 人流：步道上色，行人越靠近幾個會聚集人的地方越密
    const hubs = S.notes.filter((n) => n.crowd).map((n) => ({ x: n.at.x, y: n.at.y, k: n.crowd }));
    const pull = (x, y) => 0.18 + hubs.reduce((s, h) => s + h.k * Math.exp(-Math.hypot(x - h.x, y - h.y) / 150), 0);
    wash(D.foot, C.heroPink, 0.4, 0.6, 'walk'); wash(D.lane, '#f08a2c', 0.5, 0.58, 'walk');   // 人行道是桃紅；沒有人行道的巷弄是橘色
    const zeb = []; (spots.cross || []).forEach((l) => ribbon(zeb, l, 2.6, 0));
    const zm = paint(zeb, '#ffd23f', 0.64, { opacity: 0.92 }); if (zm) lensObj.walk.push(zm);          // 行人穿越道是黃色
    hubs.forEach((h) => {                                                       // 聚集點：一圈由濃到淡的光暈
      const m = new T.Mesh(up(new T.CircleGeometry(150 * Math.sqrt(h.k), 48)), new T.MeshBasicMaterial({ map: haloTex(), transparent: true, opacity: 0.6, depthWrite: false }));
      m.position.set(h.x, 0.66, -h.y); m.renderOrder = 1; scene.add(m); lensObj.walk.push(m);
    });
    const walks = F.walk.map((l) => { const p = flat(l, 1.6), mid = p[p.length >> 1]; return { w: l[0] * pull(mid[0], mid[1]), p }; })
      .concat((D.bridges || []).filter((b) => b.k === 'foot').map((b) => { const mid = b.p[b.p.length >> 1]; return { w: pull(mid[0], mid[1]), p: b.p.map((q) => [q[0], q[1], q[2] + 1.5]) }; }));
    stream('walk', walks, () => 5.5, (w) => mix('#f29ac0', '#8c1257', Math.min(1, w / 1.2)), 4.6, 26);
    const alley = F.car.filter((l) => l[0] < 1).map((l) => { const p = flat(l, 1.6), mid = p[p.length >> 1]; return { w: 0.7 * pull(mid[0], mid[1]), p }; });
    stream('walk', alley, () => 5, () => '#d9620f', 4.6, 34);                 // 走在巷弄車道上的人
    zones(); network(); issues();
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
      if (treeTool) { treeTap(ray, e.clientX - r.left, e.clientY - r.top, r); return; }
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

  // ---------- 種樹工具（只有自己電腦上的編輯模式有）：點一下種一棵，或點一棵樹把它移掉 ----------
  let treeWait = null, treeSaved = () => {};
  function treeTap(ray, px, py, rect) {
    if (treeTool === 'add') {
      const hits = ray.intersectObjects(hillOnly.filter((o) => o && o.isMesh)), pt = hits.length ? hits[0].point : ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
      if (!pt || Math.abs(pt.x) > HW - 2 || Math.abs(pt.z) > HH - 2) return;
      if (D.buildings.some((b) => inside({ x: pt.x, y: -pt.z }, b.p))) return;      // 點到房子的位置不種（樹會被房子蓋住）
      TREES.add.push([+pt.x.toFixed(1), +(-pt.z).toFixed(1), +(0.8 + Math.random() * 0.5).toFixed(2), treeBrush >= 0 ? 100 + treeBrush : Math.floor(Math.random() * 6)]);
    } else {
      let best = null, bd = 30;                                                 // 在畫面上找離點擊位置最近的那棵（30 像素內）
      treeShown.flat.concat(treeShown.hill).forEach((t) => {
        v.set(t[0], 0.5 + (t[5] ? 0.2 + t[5] * RISE : 0) + 7 * t[2], -t[1]).project(camera);
        const d = Math.hypot((v.x + 1) / 2 * rect.width - px, (1 - v.y) / 2 * rect.height - py);
        if (d < bd) { bd = d; best = t; }
      });
      if (!best) return;
      if (best[6]) TREES.add.splice(best[6] - 1, 1); else TREES.cut.push([best[0], best[1]]);
    }
    try { localStorage.setItem(STORE + '-trees', JSON.stringify(TREES)); } catch (e) { /* 只留在這一次 */ }
    treeSaved();
    clearTimeout(treeWait); treeWait = setTimeout(build, 120);
  }

  // ---------- 開始 ----------
  function start() {
    sun.castShadow = true;
    const sc = sun.shadow.camera, span = Math.hypot(HW, HH) + 80;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 100; sc.far = 3200;
    const cap = renderer.capabilities.maxTextureSize;
    const shade = Math.min(cap, Math.min(window.innerWidth, window.innerHeight) < 700 ? 2048 : 4096);   // 手機用小一點的陰影圖，比較不吃力
    sun.shadow.mapSize.set(shade, shade);
    sun.shadow.bias = -0.0012;
    scene.add(amb, sun, sun.target);

    stage.classList.toggle('wc', wc);
    build(); markers(); legend(); controls(); settings(); floorsUi();
    setMode(mode);
    fit = fitSize();
    view.size = fit;
    const market = S.notes.find((n) => n.mark === 'main');
    if (market && stage.clientWidth / stage.clientHeight < 0.8) {             // 直式的手機：一打開先看市場這一帶，整張圖太小了
      view.size = fit * 0.5; view.tx = market.at.x; view.tz = -market.at.y;
    }
    document.getElementById('atlas-count').textContent = D.buildings.length + ' 棟建築　' + D.trees.length + ' 棵樹　' + D.people.length + ' 個人';
    requestAnimationFrame(loop);
    window.ATLAS = { view, fly, setMode, setIssue, spots, setFloor, setSurvey, palette: () => PALETTE.reduce((o, [k]) => { o[k] = C[k]; return o; }, {}), sky, applySky, redraw: () => { dirty = true; } };          // 給主控台用：ATLAS.fly({ tx, tz, size, az, el })
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dirty = true; });
  }
  start();
})();
