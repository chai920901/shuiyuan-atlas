# 水源市場　周邊地圖

水源市場（臺北公館）周邊的立體地圖，用 Three.js 畫成可以旋轉、縮放的等角建築圖。沒有後端，整個資料夾就是一個靜態網站，入口是 `index.html`。

## 有什麼

- 地圖：水源市場是細緻的主體模型，周邊是乾淨的量體；樹林做成一層層隆起的山，高架橋與天橋有高度和橋墩。
- 時間與天氣：預設跟著當下的時刻，也可以自己拉時間軸、換天氣；影子的方向、深淺和天色跟著變。
- 分析模式：人流、車流、建築高度、步行圈。
- 樓層測繪圖：點水源市場，其他東西收起來，主體變成等角的爆炸圖，每一層拉一條黑線寫用途；點某一層的文字會展開說明。按「回到地圖」、「回到全圖」或 Esc 離開。

## 私下修改顏色、輸出圖

在 Finder 裡對 `index.html` 按兩下，用瀏覽器打開。這樣開的時候右上角的「時間・天氣」會變成「編輯」，裡面多了：

- 顏色：點色塊調整，畫面即時更新。調好後按「複製 style.js 的內容」，把 `data/style.js` 的內容整個換掉、存檔，再用 GitHub Desktop commit 並 push。
- 時間與天氣：預覽不同時段的光影。
- Render 存成 PNG：把現在的角度輸出成大圖（按住 Shift 是透明背景）。

發布在網路上的版本只有時間與天氣可以調，沒有調色和 Render。時間預設跟著看的人當下的時刻，拉過時間軸之後可以按「回到現在的時間」。

樓層的名稱和介紹文字在 `data/site.js` 的 `floors`，頁面上的資料來源在同一個檔案的 `sources`。

## 一鍵發布

對資料夾裡的「編輯地圖.command」按兩下，瀏覽器會打開 `http://localhost:8138`（只有這台電腦連得到）。
調好顏色、種好樹、放好人之後，按「編輯」面板最上面的「發布到網站」：它會把顏色寫進 `data/style.js`、樹和人寫進 `data/trees.js`，commit 並 push 到 GitHub。

第一次要讓這台電腦記住 GitHub 的登入資訊（只要做一次）：

1. 在 GitHub 網站 Settings → Developer settings → Personal access tokens 建一個 token，權限勾 `repo`。
2. 打開「終端機」，執行 `cd ~/Desktop/shuiyuan-atlas && git push`，Username 填 GitHub 帳號，Password 貼上 token。
3. 之後「發布到網站」就會直接上傳。沒做這一步的話，按鈕還是會存檔並 commit，只是最後要到 GitHub Desktop 按一次「Push origin」。

## 檔案

- `data/atlas.js`：地形、建築、橋、樹、路網（由 `tools/build-atlas.py` 從 OpenStreetMap 產生）
- `data/site.js`：圖名、地標、要顯示的路名、人流聚集點、水源市場各樓層的介紹
- `data/style.js`：所有顏色、預設的時間與天氣
- `js/atlas.js`：繪圖程式
- `tools/build-atlas.py`：重新產生 `data/atlas.js`（需要 Python 與 shapely，用法寫在檔案開頭）

## 分析模式的資料來源

人流與車流是依路網推估的示意，不是實測：車流看道路等級，人流看步行路網與離市場、捷運出口等聚集點的距離。建築高度多半由樓層數換算，缺資料的是估計值。步行圈是直線距離。

地圖資料 © OpenStreetMap contributors（ODbL）。

改了 `js/atlas.js` 或 `css/atlas.css` 之後，記得把 `index.html` 裡這兩個檔案後面的 `?v=` 數字加一，瀏覽器才會抓新的。
