const FEATURE_STATE = {
  currentTab: "Global",
  leaderboard: [],
  history: JSON.parse(localStorage.getItem("matchHistory") || "[]"),
  lastMode: "normal",
  quests: JSON.parse(localStorage.getItem("dailyQuests") || "null") || null,
  lastResult: null
};

function featureToday() {
  return new Date().toISOString().slice(0, 10);
}

function ensureQuests() {
  const today = featureToday();
  if (!FEATURE_STATE.quests || FEATURE_STATE.quests.date !== today) {
    FEATURE_STATE.quests = { date: today, play: 0, ranked: 0, score7: 0 };
    localStorage.setItem("dailyQuests", JSON.stringify(FEATURE_STATE.quests));
  }
}

function addFeatureLayout() {
  const profilePanel = document.querySelector(".profile-panel");
  if (profilePanel && !document.querySelector(".profile-big-avatar")) {
    profilePanel.classList.add("pro-panel");
    const avatar = document.createElement("img");
    avatar.className = "profile-big-avatar";
    avatar.src = localStorage.getItem("pfpUrl") || "https://api.dicebear.com/8.x/initials/svg?seed=Player";
    avatar.alt = "Profile";
    profilePanel.prepend(avatar);
  }

  const leaderboardCard = document.querySelector(".leaderboard-card");
  if (leaderboardCard && !document.querySelector(".leader-tabs")) {
    const tabs = document.createElement("div");
    tabs.className = "leader-tabs";
    ["Global", "Today", "This Week", "Friends", "Season"].forEach(tab => {
      const btn = document.createElement("button");
      btn.className = `leader-tab ${tab === FEATURE_STATE.currentTab ? "active" : ""}`;
      btn.textContent = tab;
      btn.onclick = () => {
        FEATURE_STATE.currentTab = tab;
        document.querySelectorAll(".leader-tab").forEach(b => b.classList.toggle("active", b.textContent === tab));
        renderLeaderboard(FEATURE_STATE.leaderboard);
      };
      tabs.appendChild(btn);
    });
    leaderboardCard.insertBefore(tabs, leaderboardCard.querySelector("#leaderboard"));
  }

  const layout = document.querySelector(".layout");
  if (layout && !document.querySelector(".feature-grid")) {
    const grid = document.createElement("section");
    grid.className = "feature-grid";
    grid.innerHTML = `
      <div class="feature-card season-card">
        <h2>Ranked Season</h2>
        <div class="season-strip"><span>Season 1</span><b>Ends in 30d</b></div>
        <p>Climb the ladder before the season resets.</p>
      </div>
      <div class="feature-card">
        <h2>Match History</h2>
        <div id="historyList" class="history-list"></div>
      </div>
      <div class="feature-card">
        <h2>Badges</h2>
        <div id="badgeList" class="badge-list"></div>
      </div>
      <div class="feature-card">
        <h2>Daily Quests</h2>
        <div id="questList" class="quest-list"></div>
      </div>
      <div class="feature-card">
        <h2>Rematch</h2>
        <p>Run it back with the same mode after a match.</p>
        <div class="rematch-bar"><button id="rematchBtn" class="mini-btn">Rematch</button><button id="clearHistoryBtn" class="mini-btn danger">Clear History</button></div>
      </div>
      <div class="feature-card">
        <h2>Profile+</h2>
        <div class="profile-extra">
          <div><small>Peak ELO</small><b id="peakEloText">500</b></div>
          <div><small>Best Melt</small><b id="bestScoreText">0.0</b></div>
          <div><small>Total Matches</small><b id="matchesText">0</b></div>
          <div><small>Favorite Badge</small><b id="favBadgeText">—</b></div>
        </div>
      </div>
    `;
    layout.parentNode.insertBefore(grid, layout.nextSibling);

    const rematchBtn = document.getElementById("rematchBtn");
    if (rematchBtn) rematchBtn.onclick = startRematch;

    const clearHistoryBtn = document.getElementById("clearHistoryBtn");
    if (clearHistoryBtn) clearHistoryBtn.onclick = () => {
      FEATURE_STATE.history = [];
      localStorage.setItem("matchHistory", "[]");
      renderHistory();
    };
  }

  if (!document.getElementById("rematchOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "rematchOverlay";
    overlay.className = "rematch-overlay hidden";
    overlay.innerHTML = `
      <div class="rematch-card">
        <button id="closeRematchOverlay" class="rematch-close">×</button>
        <div id="rematchResult" class="rematch-result">Match Over</div>
        <div id="rematchScores" class="rematch-scores">0.0 - 0.0</div>
        <p id="rematchCopy">Queue again or go back to the lobby.</p>
        <div class="rematch-actions">
          <button id="screenRematchBtn" class="rematch-primary">Rematch</button>
          <button id="screenLobbyBtn" class="rematch-secondary">Back to Lobby</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("screenRematchBtn").onclick = startRematch;
    document.getElementById("screenLobbyBtn").onclick = hideRematchOverlay;
    document.getElementById("closeRematchOverlay").onclick = hideRematchOverlay;
  }
}

function startRematch() {
  hideRematchOverlay();
  if (typeof join === "function") join(FEATURE_STATE.lastMode || "normal");
}

function showRematchOverlay(data) {
  const overlay = document.getElementById("rematchOverlay");
  if (!overlay) return;
  FEATURE_STATE.lastResult = data;
  const result = data.draw ? "➖ Draw" : data.win ? "🏆 You Won" : "💀 You Lost";
  const score = `${Number(data.yourScore || 0).toFixed(1)} - ${Number(data.opponentScore || 0).toFixed(1)}`;
  document.getElementById("rematchResult").textContent = result;
  document.getElementById("rematchScores").textContent = score;
  document.getElementById("rematchCopy").textContent = `Mode: ${(FEATURE_STATE.lastMode || "normal").toUpperCase()} • Want to run it back?`;
  overlay.classList.remove("hidden");
}

function hideRematchOverlay() {
  const overlay = document.getElementById("rematchOverlay");
  if (overlay) overlay.classList.add("hidden");
}

const originalRenderLeaderboard = window.renderLeaderboard || renderLeaderboard;
window.renderLeaderboard = renderLeaderboard = function(players) {
  FEATURE_STATE.leaderboard = players || [];
  if (!leaderboardEl) return;
  leaderboardEl.innerHTML = "";
  let filtered = [...FEATURE_STATE.leaderboard];
  if (FEATURE_STATE.currentTab === "Friends") {
    const me = localStorage.getItem("playerName") || "";
    filtered = filtered.filter(p => p.name === me);
  }
  if (FEATURE_STATE.currentTab === "Today") filtered = filtered.slice(0, 5);
  if (FEATURE_STATE.currentTab === "This Week") filtered = filtered.slice(0, 8);
  if (FEATURE_STATE.currentTab === "Season") filtered = filtered.slice(0, 10);
  if (!filtered.length) {
    leaderboardEl.innerHTML = `<p>No ${FEATURE_STATE.currentTab.toLowerCase()} entries yet.</p>`;
    return;
  }
  filtered.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leader-row";
    row.innerHTML = `<div><span>#${i + 1} ${p.name}</span><small>${rankLabel(p.rank || "Bronze")} • ⭐ Lv ${p.level || 1}</small></div><b>${p.elo}</b>`;
    leaderboardEl.appendChild(row);
  });
};

function renderHistory() {
  const box = document.getElementById("historyList");
  if (!box) return;
  if (!FEATURE_STATE.history.length) {
    box.innerHTML = `<div class="history-row">No matches yet.</div>`;
    return;
  }
  box.innerHTML = FEATURE_STATE.history.slice(0, 8).map(m => `<div class="history-row"><b>${m.result}</b> ${m.score} - ${m.oppScore} <small>${m.mode}</small></div>`).join("");
}

function renderBadges(profile = {}) {
  const box = document.getElementById("badgeList");
  if (!box) return;
  const badges = [
    { name: "First Match", ok: (profile.matches || 0) >= 1 },
    { name: "First Win", ok: (profile.wins || 0) >= 1 },
    { name: "Streaker", ok: (profile.streak || 0) >= 3 },
    { name: "7+ Melt", ok: (profile.bestScore || 0) >= 7 },
    { name: "Ranked Grinder", ok: (profile.elo || 500) >= 900 }
  ];
  box.innerHTML = badges.map(b => `<div class="badge-row ${b.ok ? "" : "locked"}">${b.ok ? "✅" : "🔒"} ${b.name}</div>`).join("");
  const first = badges.find(b => b.ok);
  const fav = document.getElementById("favBadgeText");
  if (fav) fav.textContent = first ? first.name : "—";
}

function renderQuests() {
  ensureQuests();
  const box = document.getElementById("questList");
  if (!box) return;
  const quests = [
    { name: "Play 3 matches", value: FEATURE_STATE.quests.play, max: 3 },
    { name: "Play 1 ranked", value: FEATURE_STATE.quests.ranked, max: 1 },
    { name: "Hit 7 melt score", value: FEATURE_STATE.quests.score7, max: 1 }
  ];
  box.innerHTML = quests.map(q => {
    const pct = Math.min(100, (q.value / q.max) * 100);
    return `<div class="quest-row"><b>${q.name}</b><small>${q.value}/${q.max}</small><div class="quest-progress"><div class="quest-fill" style="width:${pct}%"></div></div></div>`;
  }).join("");
}

const oldUpdateProfile = updateProfile;
updateProfile = function(profile) {
  oldUpdateProfile(profile);
  const avatar = document.querySelector(".profile-big-avatar");
  if (avatar) avatar.src = localStorage.getItem("pfpUrl") || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(profile?.name || "Player")}`;
  const peak = document.getElementById("peakEloText");
  const best = document.getElementById("bestScoreText");
  const matches = document.getElementById("matchesText");
  if (peak) peak.textContent = profile?.peakElo || profile?.elo || 500;
  if (best) best.textContent = Number(profile?.bestScore || 0).toFixed(1);
  if (matches) matches.textContent = profile?.matches || 0;
  renderBadges(profile || {});
};

const oldJoin = join;
join = function(mode) {
  FEATURE_STATE.lastMode = mode;
  hideRematchOverlay();
  oldJoin(mode);
};

const oldOnMessage = ws.onmessage;
ws.onmessage = async function(event) {
  const data = JSON.parse(event.data);
  if (data.type === "result") {
    ensureQuests();
    FEATURE_STATE.quests.play = Math.min(3, FEATURE_STATE.quests.play + 1);
    if (FEATURE_STATE.lastMode === "ranked") FEATURE_STATE.quests.ranked = 1;
    if ((data.yourScore || 0) >= 7) FEATURE_STATE.quests.score7 = 1;
    localStorage.setItem("dailyQuests", JSON.stringify(FEATURE_STATE.quests));
    FEATURE_STATE.history.unshift({ result: data.result || (data.win ? "Win" : data.draw ? "Draw" : "Loss"), score: Number(data.yourScore || 0).toFixed(1), oppScore: Number(data.opponentScore || 0).toFixed(1), mode: FEATURE_STATE.lastMode });
    FEATURE_STATE.history = FEATURE_STATE.history.slice(0, 20);
    localStorage.setItem("matchHistory", JSON.stringify(FEATURE_STATE.history));
  }
  await oldOnMessage(event);
  if (data.type === "result") showRematchOverlay(data);
  renderHistory();
  renderQuests();
};

window.addEventListener("load", () => {
  addFeatureLayout();
  renderHistory();
  renderBadges({});
  renderQuests();
});
