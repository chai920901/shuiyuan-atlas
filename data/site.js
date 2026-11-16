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
    { zh: '公館站', en: 'MRT Gongguan', lat: 25.01435, lng: 121.53432, crowd: 1 },
    { zh: '水源里辦公處', en: 'Shuiyuan Village Office', lat: 25.014546, lng: 121.533706 },
    { zh: '新店溪', en: 'Xindian River', lat: 25.00965, lng: 121.53010 },
    { zh: '寶藏巖', en: 'Treasure Hill', lat: 25.01055, lng: 121.53330, mark: true, crowd: 0.5 },
    { zh: '自來水園區', en: 'Museum of Drinking Water', lat: 25.01256, lng: 121.53020, mark: true, crowd: 0.35 },
    { zh: '蟾蜍山', en: 'Chanchu Hill', lat: 25.00900, lng: 121.53800 },
    { zh: '臺灣大學', en: 'National Taiwan University', lat: 25.01560, lng: 121.53760, crowd: 0.5 },
  ],

  // 要寫在路面上的路名
  roads: ['羅斯福路四段', '汀州路三段', '基隆路四段', '思源街', '福和橋', '永福橋', '舟山路'],
};
