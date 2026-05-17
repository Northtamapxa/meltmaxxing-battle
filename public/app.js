const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const myScoreEl = document.getElementById("myScore");
const oppScoreEl = document.getElementById("oppScore");
const eloEl = document.getElementById("elo");
const statusEl = document.getElementById("status");
const leaderboardEl = document.getElementById("leaderboard");
const nameInput = document.getElementById("nameInput");

const normalBtn = document.getElementById("normalBtn");
const rankedBtn = document.getElementById("rankedBtn");
const finishBtn = document.getElementById("finishBtn");

let ws = new WebSocket(`ws://${location.host}`);
let pc = null;
let localStream = null;
let smoothedScore = 0;
let elo = Number(localStorage.getItem("elo") || 1000);
let playerName = localStorage.getItem("playerName") || "";

eloEl.textContent = elo;
nameInput.value = playerName;

function status(text) {
  statusEl.textContent = text;
}

function send(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function renderLeaderboard(players) {
  leaderboardEl.innerHTML = "";

  if (!players || players.length === 0) {
    leaderboardEl.innerHTML = "<p>No players yet.</p>";
    return;
  }

  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leader-row";
    row.innerHTML = `<span>#${i + 1} ${p.name}</span><b>${p.elo}</b>`;
    leaderboardEl.appendChild(row);
  });
}

async function setupCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  localVideo.srcObject = localStream;
  await localVideo.play();
}

function createPeerConnection(isInitiator) {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      send({ type: "ice", candidate: event.candidate });
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", offer });
    };
  }
}

async function handleOffer(offer) {
  if (!pc) createPeerConnection(false);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  send({ type: "answer", answer });
}

async function handleAnswer(answer) {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIce(candidate) {
  if (!pc || !candidate) return;

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {}
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getMeltScore(lm) {
  const mouthWidth = distance(lm[61], lm[291]);
  const eyeOpen = distance(lm[159], lm[145]);
  const nose = lm[1];

  const energy = Math.min(mouthWidth * 900, 35);
  const focus = Math.min(eyeOpen * 3200, 35);
  const centered = Math.max(0, 30 - Math.abs(nose.x - 0.5) * 100);

  return Math.min(10, ((energy + focus + centered) / 100) * 10);
}

ws.onopen = () => status("Connected. Choose a mode.");

ws.onmessage = async event => {
  const data = JSON.parse(event.data);

  if (data.type === "waiting") status(`Waiting for ${data.mode} opponent...`);

  if (data.type === "match") {
    status(`${data.mode.toUpperCase()} match found!`);
    createPeerConnection(data.initiator);
  }

  if (data.type === "offer") await handleOffer(data.offer);
  if (data.type === "answer") await handleAnswer(data.answer);
  if (data.type === "ice") await handleIce(data.candidate);

  if (data.type === "opponentScore") {
    oppScoreEl.textContent = Number(data.score).toFixed(1);
  }

  if (data.type === "leaderboard") {
    renderLeaderboard(data.leaderboard);
  }

  if (data.type === "result") {
    elo = data.elo;
    localStorage.setItem("elo", elo);
    eloEl.textContent = elo;

    if (data.draw) status("Draw!");
    else if (data.win) status("You won! +25 ELO");
    else status("You lost! -25 ELO");
  }

  if (data.type === "opponentLeft") {
    status("Opponent left.");
    remoteVideo.srcObject = null;
    oppScoreEl.textContent = "0.0";
  }
};

function join(mode) {
  playerName = nameInput.value.trim() || "Player";
  localStorage.setItem("playerName", playerName);

  send({
    type: "join",
    mode,
    name: playerName,
    elo,
  });

  status(`Joining ${mode}...`);
}

normalBtn.onclick = () => join("normal");
rankedBtn.onclick = () => join("ranked");
finishBtn.onclick = () => send({ type: "finish" });

const faceMesh = new FaceMesh({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

faceMesh.onResults(results => {
  canvas.width = localVideo.videoWidth || 640;
  canvas.height = localVideo.videoHeight || 480;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  const lm = results.multiFaceLandmarks[0];
  const score = getMeltScore(lm);

  smoothedScore = smoothedScore * 0.85 + score * 0.15;
  myScoreEl.textContent = smoothedScore.toFixed(1);

  send({
    type: "score",
    score: Number(smoothedScore.toFixed(1)),
  });

  lm.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#22d3ee";
    ctx.fill();
  });
});

async function startAI() {
  await setupCamera();

  const camera = new Camera(localVideo, {
    onFrame: async () => {
      await faceMesh.send({ image: localVideo });
    },
    width: 640,
    height: 480,
  });

  camera.start();
}

startAI().catch(err => {
  console.error(err);
  status("Camera blocked. Allow webcam/mic permissions.");
});