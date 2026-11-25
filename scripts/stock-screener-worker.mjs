/** Run after `npm run build:packages && npm run build -w @rarebird/api` on Node 22+. */
import { stockFeedConfig, fetchStockFrame, readStockClock, parseStockBar, parseStockQuote, STOCK_SYMBOLS } from "../apps/api/dist/lib/stock-screener-provider.js";
import { runStockScreener } from "../apps/api/dist/lib/stock-screener-store.js";
import { closeDb } from "@rarebird/db";

const config = stockFeedConfig();
if (!config.configured || !process.env.DATABASE_URL || typeof WebSocket === "undefined") {
  console.error("Stock worker needs Node 22+, DATABASE_URL, ALPACA_API_KEY and ALPACA_SECRET_KEY. Feed must be iex or entitled sip.");
  process.exit(2);
}
let stopped = false, socket, frame, busy = false, reconnect, failures = 0, authenticated = false;
const timers = new Set();
const every = (fn, ms) => { const timer = setInterval(() => { void fn().catch(() => console.warn("Stock worker refresh deferred.")); }, ms); timers.add(timer); };
const refreshClock = async () => {
  try { if (frame) Object.assign(frame, await readStockClock()); }
  catch { if (frame) frame.session_checked_at = new Date(0).toISOString(); }
};
const scan = async () => {
  if (busy || stopped || !frame) return;
  busy = true;
  try {
    const snapshot = structuredClone(frame);
    snapshot.mode = "streaming";
    snapshot.received_at = authenticated ? new Date().toISOString() : new Date(0).toISOString();
    await runStockScreener({ frame: snapshot });
  } catch { console.warn("Stock worker scan deferred; public reads will show a data hold when measurements age."); }
  finally { busy = false; }
};
async function connect() {
  if (stopped) return;
  try {
    // Bootstrap gaps through the same entitled feed. First-observed bars in storage stay immutable.
    frame = await fetchStockFrame();
    socket = new WebSocket(`wss://stream.data.alpaca.markets/v2/${config.feed}`);
    const handshake = setTimeout(() => { if (!authenticated) socket.close(); }, 10000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ action: "auth", key: config.key, secret: config.secret })));
    socket.addEventListener("message", event => {
      try {
        const messages = JSON.parse(String(event.data));
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          if (message.T === "error") {
            console.warn("Stock stream unavailable; check credentials and feed entitlement.");
            socket.close();
            continue;
          }
          if (message.T === "success" && message.msg === "authenticated") {
            authenticated = true; failures = 0;
            socket.send(JSON.stringify({ action: "subscribe", quotes: STOCK_SYMBOLS, bars: STOCK_SYMBOLS }));
            console.log(`Stock screener connected to ${config.feed}; screening closed one-minute bars.`);
          }
          const asset = frame?.instruments[message.S];
          if (!asset || !authenticated) continue;
          if (message.T === "q") {
            const quote = parseStockQuote(message);
            if (Number.isFinite(quote.time) && (!asset.quote || quote.time >= asset.quote.time)) asset.quote = quote;
          } else if (message.T === "b") {
            const bar = { ...parseStockBar(message), observed_at: Date.now() };
            // Late updatedBars are not silently substituted for first-observed prices.
            if (!asset.bars.some(b => b.time === bar.time)) asset.bars.push(bar);
            asset.bars = asset.bars.filter(b => b.time >= Date.now() - 24 * 3600000);
            if (!reconnect) {
              // Coalesce independently arriving stock and SPY bars before screening.
              reconnect = setTimeout(() => { reconnect = undefined; void scan(); }, 2500);
            }
          }
        }
      } catch { console.warn("Ignored an invalid stock stream message."); }
    });
    const disconnected = () => {
      clearTimeout(handshake);
      authenticated = false;
      if (reconnect) clearTimeout(reconnect);
      reconnect = undefined;
      void scan();
      if (!stopped) reconnect = setTimeout(() => { reconnect = undefined; void connect(); }, Math.min(60000, 2000 * 2 ** Math.min(5, failures++)));
    };
    socket.addEventListener("close", disconnected, { once: true });
    socket.addEventListener("error", () => socket.close());
  } catch {
    console.warn("Stock stream bootstrap unavailable; retrying with backoff.");
    if (!stopped) reconnect = setTimeout(() => { reconnect = undefined; void connect(); }, Math.min(60000, 2000 * 2 ** Math.min(5, failures++)));
  }
}
async function stop() {
  stopped = true;
  for (const timer of timers) clearInterval(timer);
  if (reconnect) clearTimeout(reconnect);
  socket?.close();
  await closeDb();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
every(refreshClock, 45000);
every(scan, 30000);
await connect();
