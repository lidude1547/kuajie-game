@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 1) 會開啟兩個視窗：遊戲伺服器、https 通道。
echo 2) 請在「通道」視窗找到 https://xxxx.trycloudflare.com 開頭的網址並複製。
echo 3) 到主持人畫面左側 QR 卡片下方，貼上網址按「套用」，QR code 就會改成 https。
start "遊戲伺服器" cmd /k node server.js
start "https通道" cmd /k cloudflared tunnel --url http://localhost:3000
timeout /t 3 >nul
start "" http://localhost:3000/host
