function createEndScreen() {
  if (document.getElementById("endOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "endOverlay";
  overlay.className = "end-overlay hidden";
  overlay.innerHTML = `
    <div class="end-card">
      <button id="endClose" class="end-close">×</button>
      <div id="endKicker" class="end-kicker">Match Complete</div>
      <div id="endTitle" class="end-title">You Won</div>
      <div id="endScore" class="end-score">0.0 - 0.0</div>
      <p id="endSub" class="end-sub">Run it back or return to the arena.</p>
      <div class="end-actions">
        <button id="endRematch" class="end-primary">Rematch</button>
        <button id="endLobby" class="end-secondary">Back to Lobby</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("endClose").onclick = hideEndScreen;
  document.getElementById("endLobby").onclick = hideEndScreen;
  document.getElementById("endRematch").onclick = () => {
    hideEndScreen();
    const mode = window.__lastMode || "normal";
    if (typeof join === "function") join(mode);
  };
}

function showEndScreen(data) {
  createEndScreen();
  const overlay = document.getElementById("endOverlay");
  const title = document.getElementById("endTitle");
  const score = document.getElementById("endScore");
  const sub = document.getElementById("endSub");
  const kicker = document.getElementById("endKicker");

  const yourScore = Number(data.yourScore || 0).toFixed(1);
  const oppScore = Number(data.opponentScore || 0).toFixed(1);
  score.textContent = `${yourScore} - ${oppScore}`;

  title.classList.remove("loss", "draw");
  if (data.draw) {
    title.textContent = "Draw";
    title.classList.add("draw");
    kicker.textContent = "No one survived harder";
    sub.textContent = "Same melt energy. Queue again and settle it.";
  } else if (data.win) {
    title.textContent = "Brutalized";
    kicker.textContent = "Victory";
    sub.textContent = "Your melt cleared the arena. Run it back?";
  } else {
    title.textContent = "Destroyed";
    title.classList.add("loss");
    kicker.textContent = "Defeat";
    sub.textContent = "You got out-melted. Rematch and recover.";
  }

  overlay.classList.remove("hidden");
}

function hideEndScreen() {
  const overlay = document.getElementById("endOverlay");
  if (overlay) overlay.classList.add("hidden");
}

const oldJoinForEnd = join;
join = function(mode) {
  window.__lastMode = mode;
  hideEndScreen();
  oldJoinForEnd(mode);
};

const oldEndOnMessage = ws.onmessage;
ws.onmessage = async function(event) {
  const data = JSON.parse(event.data);
  await oldEndOnMessage(event);
  if (data.type === "result") showEndScreen(data);
};

window.addEventListener("load", createEndScreen);
