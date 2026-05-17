const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const admin = require("firebase-admin");

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("./serviceAccountKey.json");

if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const queues = { normal: [], ranked: [] };

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

async function getLeaderboard() {
  const snap = await db.collection("leaderboard").orderBy("elo", "desc").limit(10).get();
  return snap.docs.map(d => d.data());
}

async function broadcastLeaderboard() {
  const leaderboard = await getLeaderboard();
  wss.clients.forEach(c => send(c, { type: "leaderboard", leaderboard }));
}

function opponent(ws) {
  if (!ws.room) return null;
  return ws.room.a === ws ? ws.room.b : ws.room.a;
}

function match(mode) {
  if (queues[mode].length < 2) return;

  const a = queues[mode].shift();
  const b = queues[mode].shift();

  const room = {
    mode,
    a,
    b,
    aScore: 0,
    bScore: 0,
    finished: false,
  };

  a.room = room;
  b.room = room;

  send(a, { type: "match", mode, initiator: true });
  send(b, { type: "match", mode, initiator: false });
}

wss.on("connection", async ws => {
  ws.name = "Player";
  ws.elo = 1000;
  ws.room = null;

  send(ws, { type: "leaderboard", leaderboard: await getLeaderboard() });

  ws.on("message", async raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "join") {
      ws.name = String(data.name || "Player").slice(0, 20);
      ws.elo = Number(data.elo || 1000);
      ws.mode = data.mode === "ranked" ? "ranked" : "normal";

      queues[ws.mode].push(ws);
      send(ws, { type: "waiting", mode: ws.mode });
      match(ws.mode);
    }

    if (["offer", "answer", "ice"].includes(data.type)) {
      const opp = opponent(ws);
      send(opp, data);
    }

    if (data.type === "score" && ws.room) {
      const score = Number(data.score || 0);
      if (ws.room.a === ws) ws.room.aScore = score;
      else ws.room.bScore = score;

      send(opponent(ws), { type: "opponentScore", score });
    }

    if (data.type === "finish" && ws.room && !ws.room.finished) {
      const room = ws.room;
      room.finished = true;

      const aWin = room.aScore > room.bScore;
      const bWin = room.bScore > room.aScore;

      if (room.mode === "ranked") {
        if (aWin) {
          room.a.elo += 25;
          room.b.elo -= 25;
        } else if (bWin) {
          room.b.elo += 25;
          room.a.elo -= 25;
        }

        room.a.elo = Math.max(0, room.a.elo);
        room.b.elo = Math.max(0, room.b.elo);

        await db.collection("leaderboard").doc(room.a.name).set({
          name: room.a.name,
          elo: room.a.elo,
          updated: Date.now(),
        });

        await db.collection("leaderboard").doc(room.b.name).set({
          name: room.b.name,
          elo: room.b.elo,
          updated: Date.now(),
        });

        await broadcastLeaderboard();
      }

      send(room.a, {
        type: "result",
        win: aWin,
        draw: !aWin && !bWin,
        elo: room.a.elo,
      });

      send(room.b, {
        type: "result",
        win: bWin,
        draw: !aWin && !bWin,
        elo: room.b.elo,
      });
    }
  });

  ws.on("close", () => {
    queues.normal = queues.normal.filter(p => p !== ws);
    queues.ranked = queues.ranked.filter(p => p !== ws);

    const opp = opponent(ws);
    send(opp, { type: "opponentLeft" });
    if (opp) opp.room = null;
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MeltMaxxing Battle running on port ${PORT}`);
});