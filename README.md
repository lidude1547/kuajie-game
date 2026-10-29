# 跨界溝通大挑戰（互動工作坊遊戲）

學前特教老師、家長、專業人員的現場互動遊戲：入場暖身、溫度計、翻譯機搶答、嵌入大挑戰、溝通小劇場、行動承諾牆、Q&A。

## 方式一：GitHub Pages（免伺服器，已可使用）

- 主持人（講者電腦）開啟：`https://lidude1547.github.io/kuajie-game/?host=1`
  - 畫面上的 QR code 就是給全場的 https 網址（網址尾端有場次代碼）。
  - **主持人分頁必須一直開著**（不要關閉、不要讓電腦休眠）；它就是這場遊戲的「伺服器」。
  - 重新整理主持人頁面不會丟失進度（存在這台電腦的瀏覽器）。
- 觀眾：掃 QR code，用手機的任何網路即可。
- 資料經公用 MQTT 中繼站傳遞（broker.emqx.io、broker.hivemq.com）。場次代碼為隨機，但訊息未加密，請勿在其中輸入個資。
- 活動結束請在「結束」畫面按「匯出紀錄（CSV）」。

## 方式二：自己的伺服器（Render / 本機）

- 零依賴，需要 Node.js 16+：`node server.js`
- 觀眾網址：部署後的 `https://…/`；主持人：`https://…/host?key=你設定的 HOST_KEY`
- 部署到 Render：New → Web Service → 選此儲存庫（已含 `render.yaml`），並設定環境變數 `HOST_KEY`
- 詳細說明見 `使用說明.txt`
