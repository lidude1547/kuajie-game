#!/usr/bin/env node
/* 跨界溝通大挑戰：現場互動伺服器（零依賴，只需要 Node.js 16 以上）
 * 用法：node server.js [--port 3000] [--resume]
 * 主持人（講者電腦）開啟  http://localhost:3000/host
 * 觀眾掃描大螢幕上的 QR code，或輸入畫面上顯示的網址。
 */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const PORT = parseInt(argv("--port", process.env.PORT || "3000"), 10);
const RESUME = args.includes("--resume");
const HOST_KEY = String(argv("--key", process.env.HOST_KEY || ""));      // 雲端部署時，用來保護主持人頁面
const PUBLIC_URL = String(argv("--public", process.env.PUBLIC_URL || "")).replace(/\/+$/, ""); // 例如 https://xxxx.trycloudflare.com
const BACKUP = path.join(__dirname, "session-backup.json");

/* ---- 載入與網頁相同的引擎 ---- */
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = html.match(/\/\*ENGINE_START\*\/([\s\S]*?)\/\*ENGINE_END\*\//);
if (!m) { console.error("index.html 缺少引擎區塊"); process.exit(1); }
const E = new Function(m[1] + "\nreturn { createState, reduce, tick, viewCommon, viewMe, exportCsv };")();

let S = E.createState();
if (RESUME && fs.existsSync(BACKUP)) {
  try { S = JSON.parse(fs.readFileSync(BACKUP, "utf8")); console.log("已從 session-backup.json 還原上次進度。"); } catch (e) { console.warn("無法還原備份，改用全新場次。"); }
}

/* ---- 區網網址 ---- */
function lanUrls() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) for (const n of nets[name] || []) {
    if (n.family === "IPv4" && !n.internal) out.push({ name, ip: n.address });
  }
  const score = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3);
  out.sort((a, b) => score(a.ip) - score(b.ip));
  return out.map((o) => "http://" + o.ip + ":" + PORT + "/");
}

const isLoopback = (req) => {
  const a = req.socket.remoteAddress || "";
  const local = a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  // 透過通道（cloudflared、ngrok 等）進來的請求，來源也會是 127.0.0.1，但會帶轉發標頭，必須視為外部觀眾
  const h = req.headers;
  const proxied = !!(h["x-forwarded-for"] || h["x-forwarded-host"] || h["cf-connecting-ip"] || h["forwarded"] || h["x-real-ip"]);
  const hn = String(h.host || "").split(":")[0].replace(/^\[|\]$/g, "");
  return local && !proxied && (hn === "localhost" || hn === "127.0.0.1" || hn === "::1");
};
const isHostReq = (req, key) => isLoopback(req) || (HOST_KEY !== "" && key === HOST_KEY);
const baseUrl = (req) => {
  if (PUBLIC_URL) return PUBLIC_URL + "/";
  const h = req.headers, host = h["x-forwarded-host"] || h.host || "";
  if (host && !/^(localhost|127\.|\[::1\])/.test(host)) return (h["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0] + "://" + host.split(",")[0] + "/";
  return "";
};

/* ---- SSE 客戶端 ---- */
const clients = new Set();
let timer = null;
function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; broadcast(); }, clients.size > 150 ? 350 : 150);
}
function frame(pid, host, cAud, cHost) {
  const me = E.viewMe(S, pid);
  return "data: {\"c\":" + (host ? cHost : cAud) + ",\"me\":" + JSON.stringify(me) + "}\n\n";
}
function broadcast() {
  if (!clients.size) return;
  const now = Date.now();
  const cAud = JSON.stringify(E.viewCommon(S, false, now));
  const cHost = JSON.stringify(E.viewCommon(S, true, now));
  for (const cl of clients) { try { cl.res.write(frame(cl.pid, cl.host, cAud, cHost)); } catch (e) { clients.delete(cl); } }
}
setInterval(() => { if (E.tick(S, Date.now())) schedule(); }, 500);
setInterval(() => { for (const cl of clients) { try { cl.res.write(": ping\n\n"); } catch (e) { clients.delete(cl); } } }, 20000);
setInterval(() => { try { fs.writeFileSync(BACKUP, JSON.stringify(S, (k, v) => (k[0] === "_" ? undefined : v))); } catch (e) {} }, 10000);

/* ---- HTTP ---- */
function readBody(req, cb) {
  let n = 0; const parts = [];
  req.on("data", (d) => { n += d.length; if (n > 10000) { req.destroy(); return; } parts.push(d); });
  req.on("end", () => { try { cb(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}")); } catch (e) { cb(null); } });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };

  if (req.method === "GET" && (p === "/" || p === "/host")) {
    if (p === "/host" && !isHostReq(req, url.searchParams.get("key"))) return send(403, "text/plain; charset=utf-8", "主持人頁面只能在執行 server.js 的這台電腦上開啟（http://localhost:" + PORT + "/host）；雲端部署則需在網址後加 ?key=你設定的金鑰。觀眾請掃描 QR code。");
    return send(200, "text/html; charset=utf-8", html);
  }
  if (req.method === "GET" && p === "/info") { const b = baseUrl(req); return send(200, "application/json", JSON.stringify({ urls: b ? [b] : lanUrls(), port: PORT })); }
  if (req.method === "GET" && p === "/health") return send(200, "text/plain", "ok");
  if (req.method === "GET" && p === "/export.csv") {
    if (!isHostReq(req, url.searchParams.get("key"))) return send(403, "text/plain", "forbidden");
    return send(200, "text/csv; charset=utf-8", E.exportCsv(S));
  }
  if (req.method === "GET" && p === "/events") {
    const host = url.searchParams.get("host") === "1";
    if (host && !isHostReq(req, url.searchParams.get("key"))) return send(403, "text/plain", "forbidden");
    const pid = String(url.searchParams.get("pid") || "").slice(0, 40);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write("retry: 2000\n\n");
    const cl = { res, pid, host };
    clients.add(cl);
    const now = Date.now();
    res.write(frame(pid, host, JSON.stringify(E.viewCommon(S, false, now)), JSON.stringify(E.viewCommon(S, true, now))));
    req.on("close", () => clients.delete(cl));
    return;
  }
  if (req.method === "POST" && p === "/act") {
    return readBody(req, (b) => {
      if (!b || !b.a) return send(400, "application/json", '{"err":"bad"}');
      const host = !!b.host && isHostReq(req, b.key);
      const act = Object.assign({}, b.a, { pid: b.pid });
      let r; try { r = E.reduce(S, act, Date.now(), host); } catch (e) { r = { err: "server" }; }
      if (r.ok) schedule();
      send(200, "application/json", JSON.stringify(r));
    });
  }
  send(404, "text/plain; charset=utf-8", "not found");
});
server.on("clientError", (e, sock) => { try { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch (_) {} });
server.listen(PORT, "0.0.0.0", () => {
  const urls = lanUrls();
  console.log("\n  跨界溝通大挑戰 互動伺服器已啟動\n");
  console.log("  主持人（這台電腦）：http://localhost:" + PORT + "/host" + (HOST_KEY ? "（雲端：/host?key=" + HOST_KEY + "）" : ""));
  console.log("  觀眾加入網址：" + (PUBLIC_URL ? PUBLIC_URL + "/" : urls.length ? urls.join("   ") : "（找不到區網 IP，請確認已連上 Wi-Fi 或開啟手機熱點）"));
  console.log("\n  提醒：觀眾手機要與這台電腦在同一個 Wi-Fi；活動場地 Wi-Fi 若有「用戶隔離」，請改用手機熱點或自備分享器。");
  console.log("  結束請按 Ctrl+C。紀錄可在結束畫面按「匯出紀錄」。\n");
});
const bye = () => { try { fs.writeFileSync(BACKUP, JSON.stringify(S, (k, v) => (k[0] === "_" ? undefined : v))); } catch (e) {} process.exit(0); };
process.on("SIGINT", bye); process.on("SIGTERM", bye);
