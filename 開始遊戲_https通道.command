#!/bin/bash
cd "$(dirname "$0")"
echo "會啟動遊戲伺服器與 https 通道。請在下方輸出找到 https://xxxx.trycloudflare.com 網址，"
echo "複製後貼到主持人畫面 QR 卡片下方的欄位，按「套用」。"
node server.js &
sleep 1
open http://localhost:3000/host
cloudflared tunnel --url http://localhost:3000
