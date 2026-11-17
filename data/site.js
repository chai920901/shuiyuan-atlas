// 場域包：水源市場周邊（公館）。純地圖版本，沒有 AR、沒有血量。
// 地形與建築在 atlas.js（由 tools/build-atlas.py 產生）；這裡只放圖名、地標與要顯示的路名。
// 公開網站的顏色、時間、天氣在 style.js。

window.ATLAS_SITE = {
  id: 'shuiyuan',
  name: { zh: '水源市場', en: 'Shuiyuan Market' },
  sub: { zh: '周邊地圖', en: 'Neighbourhood Map' },
  place: { zh: '臺北市中正區　公館', en: 'Gongguan, Taipei' },

  // 地標：用引線標在地圖上。mark: 'main' 是主體（水源市場），mark: true 把所在的建築塗成黃色。
  // crowd：人流分析裡這個點會聚集多少人（相對值，是推估不是實測）。
  notes: [
    { zh: '水源市場', en: 'Shuiyuan Market', lat: 25.01353, lng: 121.53506, mark: 'main', crowd: 1.2 },
    { zh: '公館站', en: 'MRT Gongguan', lat: 25.014437, lng: 121.53442, crowd: 1 },   // 一號出口旁的人行道上
    { zh: '新店溪', en: 'Xindian River', lat: 25.00965, lng: 121.53010 },
    { zh: '寶藏巖', en: 'Treasure Hill', lat: 25.01055, lng: 121.53330, mark: true, crowd: 0.5 },
    { zh: '自來水園區', en: 'Museum of Drinking Water', lat: 25.01256, lng: 121.53020, mark: true, crowd: 0.35 },
    { zh: '蟾蜍山', en: 'Chanchu Hill', lat: 25.00900, lng: 121.53800 },
    { zh: '臺灣大學', en: 'National Taiwan University', lat: 25.01560, lng: 121.53760, crowd: 0.5 },
  ],

  // 水源市場各樓層（由下往上）。from / to 是這一層的地板與天花板高度（公尺），天橋接在第二層的地板高度。
  // kind 決定切開後裡面畫什麼：market 是攤位，office 是隔間，theatre 是舞台與座位。
  // name 和 text 可以直接改。目前只有一、二樓和十樓查得到資料，三到九樓的單位待補。
  floors: [
    { id: '1F', from: 0, to: 5, kind: 'market', name: '水源市場　一樓', text: '小吃與餐飲、蔬果、南北雜貨。中央兩道電扶梯從這裡上二樓。' },
    { id: '2F', from: 5, to: 9.5, kind: 'market', name: '水源市場　二樓', text: '肉品、海鮮，還有縫補、生活百貨的攤位。跨過羅斯福路的天橋從這一層接進來。' },
    { id: '3F', from: 9.5, to: 13, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '4F', from: 13, to: 16.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '5F', from: 16.5, to: 20, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '6F', from: 20, to: 23.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '7F', from: 23.5, to: 27, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '8F', from: 27, to: 30.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '9F', from: 30.5, to: 34, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '10F', from: 34, to: 40, kind: 'theatre', name: '水源劇場', text: '大約五百席的表演場地，前身是兵役單位的禮堂。' },
  ],

  // 商圈類型（「商圈」模式）。poly 是範圍，座標是以圖心為原點的公尺（東、北為正）；use: 'night' 用地圖上的公館夜市範圍，use: 'hero' 是水源市場本身。
  // 範圍是依一般認知畫的示意，不是正式劃定的界線。
  zones: [
    { zh: '公館商圈', note: '店面街區：服飾、餐飲、書店', color: '#4d9de0', at: [-60, 215],
      poly: [[-229.9, 266], [-96.4, 121], [24.4, -8], [115, -104.7], [145.5, -160.5], [220.5, -139.5], [121.8, 50.5], [-14, 198], [-151.3, 346.5]] },
    { zh: '公館夜市', note: '傍晚以後的攤商', color: '#ffb92e', use: 'night' },
    { zh: '水源市場', note: '白天的傳統市場', color: '#ec3cb4', use: 'hero' },
  ],

  // 藝文網絡（「藝文網絡」模式）。nodes 是據點，h 是標籤離地的高度；links 是哪兩個據點連在一起，第三個字是這條線的名字（公館巷弄藝術節）。
  arts: {
    nodes: [
      { zh: '水源市場・水源劇場', en: 'Shuiyuan Market / Wellspring Theater', lat: 25.01353, lng: 121.53506, h: 42 },
      { zh: '寶藏巖國際藝術村', en: 'Treasure Hill Artist Village', lat: 25.01055, lng: 121.53330, h: 14 },
      { zh: '蟾蜍山煥民新村', en: 'Huanmin New Village, Chanchu Hill', lat: 25.01030, lng: 121.53890, h: 14 },
      { zh: '公館商圈', en: 'Gongguan shopping district', lat: 25.01470, lng: 121.53400, h: 10 },
    ],
    links: [[0, 1], [0, 2], [1, 2], [0, 3, '公館巷弄藝術節']],
  },

  // 議題發現（「議題」模式）。一則一個分頁：title 標題、find 發現了什麼、fix 改善方法。
  issues: [
    { title: '校園停車問題（臨時接送）', find: '上下學時間家長的車停在羅斯福路邊臨時接送，佔用車道。', fix: '對街閒置的公車停靠區改為家長臨時接送區，車子停進停靠區，不佔車道。' },
    { title: '水源市場與天橋', find: '天橋是從對街進市場二樓的主要動線，但只有樓梯；一樓橋下與樓梯下方的空間零碎。', fix: '整理一樓的橋下空間，並在天橋兩端加設電梯。' },
    { title: '公館夜市人車混雜', find: '夜市的巷道沒有人行道，攤位、行人與汽機車擠在同一條路上。', fix: '夜間改為行人徒步區（晚上 6:00–9:00），車輛不進入。' },
  ],

  // 不要畫出來的建築（用 OpenStreetMap 上的名稱）。公館站是地下車站，地圖資料把它的範圍當成一棟房子，會蓋在羅斯福路上
  hide: ['公館站'],
  roofText: '機房、水塔、太陽能板。',

  // 資料來源：顯示在頁面右下角的「資料來源」裡。url 可以不寫。
  sources: [
    { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', note: '建築、道路、橋、水域與綠地的圖資（ODbL 授權）。建築高度多由樓層數換算，缺資料的是估計值。' },
    { label: '維基百科：Wellspring Theater', url: 'https://en.wikipedia.org/wiki/Wellspring_Theater', note: '水源劇場位於十樓、大樓沿革。' },
    { label: '關鍵評論網：水源劇場專訪', url: 'https://www.thenewslens.com/article/52689', note: '劇場約五百席，前身為兵役單位禮堂，與市場、公家機關同棟。' },
    { label: 'etnet：水源市場介紹', url: 'https://www.etnet.com.hk/www/tc/health/101920', note: '一、二樓市場的攤位類型。' },
    { label: '本站推估', note: '車道線、公車專用道與斑馬線取自 OpenStreetMap；中央公車站、路邊公車亭與停靠區的位置依現場照片推估。商圈範圍、藝文網絡的連線與三則議題是本站的分析與提案。人流、車流是依路網與道路等級推估的示意，不是實測。山的高度、各樓層的高度與室內配置為示意。三到九樓的使用單位待補。' },
  ],

  // 要寫在路面上的路名
  roads: ['羅斯福路四段', '汀州路三段', '基隆路四段', '思源街', '福和橋', '永福橋', '舟山路'],
};
