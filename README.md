# 水源市場　周邊地圖

水源市場（臺北公館）周邊的立體地圖，用 Three.js 畫成可以旋轉、縮放的等角建築圖。沒有後端，整個資料夾就是一個靜態網站。

## 兩個入口

| 網址 | 給誰 | 有什麼 |
| --- | --- | --- |
| `index.html` | 公開網站，放在 QR code 上 | 地圖、時間與天氣、分析模式（人流、車流、建築高度、步行圈） |
| `admin.html` | 自己用的後台 | 以上全部，再加調色、風格切換（標準／淡透明／線稿）、Render 輸出 PNG、匯出設定 |

後台沒有密碼。GitHub Pages 上的檔案都是公開的，`admin.html` 只是沒有放連結；知道網址的人打得開，但他改的顏色只會留在他自己的瀏覽器裡，動不到公開網站。

## 怎麼把後台的修改發布出去

1. 開 `admin.html`，在「時間・天氣」面板裡調顏色、時間、天氣。
2. 按「匯出設定」，下載 `style.js`。
3. 用它蓋掉 `data/style.js`，commit 再 push。公開網站一兩分鐘後就會更新。

## 檔案

- `data/atlas.js`：地形、建築、橋、樹、路網（由 `tools/build-atlas.py` 從 OpenStreetMap 產生）
- `data/site.js`：圖名、地標、要顯示的路名、人流聚集點
- `data/style.js`：公開網站的顏色、時間、天氣
- `js/atlas.js`：繪圖程式
- `tools/build-atlas.py`：重新產生 `data/atlas.js`（需要 Python 與 shapely，用法寫在檔案開頭）

## 分析模式的資料來源

人流與車流是依路網推估的示意，不是實測：車流看道路等級，人流看步行路網與離市場、捷運出口等聚集點的距離。建築高度多半由樓層數換算，缺資料的是估計值。步行圈是直線距離。

地圖資料 © OpenStreetMap contributors（ODbL）。
