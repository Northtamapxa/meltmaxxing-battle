// Firebase Web App config goes here.
// To make real Google login work, replace these empty values with your Firebase Web App config.
// Firebase Console > Project Settings > Your apps > Web app config.
window.firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};

(function () {
  const hasFirebaseConfig = Boolean(window.firebaseConfig && window.firebaseConfig.apiKey);
  let currentUser = null;

  function $(id) {
    return document.getElementById(id);
  }

  function avatarFor(name) {
    const saved = localStorage.getItem("pfpUrl");
    if (saved) return saved;
    return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name || "Player")}`;
  }

  function setLoggedIn(userLike) {
    currentUser = userLike;
    const name = userLike?.displayName || localStorage.getItem("playerName") || "Player";
    const photo = localStorage.getItem("pfpUrl") || userLike?.photoURL || avatarFor(name);

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("playerName", name);
    if (photo) localStorage.setItem("pfpUrl", photo);

    if ($("accountName")) $("accountName").textContent = name;
    if ($("accountStatus")) $("accountStatus").textContent = "Ranked unlocked";
    if ($("profileAvatar")) $("profileAvatar").src = photo;
    if ($("settingsAvatar")) $("settingsAvatar").src = photo;
    if ($("nameInput")) $("nameInput").value = name;
    if ($("profileNameInput")) $("profileNameInput").value = name;
    if ($("pfpInput")) $("pfpInput").value = photo;
    if ($("loginBtn")) $("loginBtn").textContent = "Signed in";
    if ($("rankedBtn")) $("rankedBtn").classList.remove("locked");
  }

  function setLoggedOut() {
    currentUser = null;
    localStorage.removeItem("isLoggedIn");
    if ($("accountName")) $("accountName").textContent = "Guest";
    if ($("accountStatus")) $("accountStatus").textContent = "Ranked locked";
    if ($("profileAvatar")) $("profileAvatar").src = avatarFor("Player");
    if ($("settingsAvatar")) $("settingsAvatar").src = avatarFor("Player");
    if ($("loginBtn")) $("loginBtn").textContent = "Google";
    if ($("rankedBtn")) $("rankedBtn").classList.add("locked");
  }

  async function loginWithGoogle() {
    if (!hasFirebaseConfig || !window.firebase || !firebase.auth) {
      // Demo fallback so the UI works until Firebase web config is added.
      const name = localStorage.getItem("playerName") || $("nameInput")?.value || "Player";
      setLoggedIn({ displayName: name, photoURL: avatarFor(name) });
      alert("Demo login enabled. To use real Google login, add your Firebase Web App config to public/firebase-config.js and enable Google provider in Firebase Authentication.");
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  }

  window.addEventListener("load", () => {
    if (hasFirebaseConfig && window.firebase && firebase.initializeApp) {
      try {
        firebase.initializeApp(window.firebaseConfig);
        firebase.auth().onAuthStateChanged(user => {
          if (user) setLoggedIn(user);
          else if (localStorage.getItem("isLoggedIn") === "true") {
            const name = localStorage.getItem("playerName") || "Player";
            setLoggedIn({ displayName: name, photoURL: avatarFor(name) });
          } else setLoggedOut();
        });
      } catch (err) {
        console.warn("Firebase init failed", err);
        if (localStorage.getItem("isLoggedIn") === "true") setLoggedIn({ displayName: localStorage.getItem("playerName") || "Player", photoURL: avatarFor(localStorage.getItem("playerName") || "Player") });
        else setLoggedOut();
      }
    } else if (localStorage.getItem("isLoggedIn") === "true") {
      setLoggedIn({ displayName: localStorage.getItem("playerName") || "Player", photoURL: avatarFor(localStorage.getItem("playerName") || "Player") });
    } else {
      setLoggedOut();
    }

    const authOverlay = $("authOverlay");
    const rankedBtn = $("rankedBtn");
    const loginBtn = $("loginBtn");
    const googleLoginBtn = $("googleLoginBtn");
    const closeAuthBtn = $("closeAuthBtn");
    const settingsPanel = $("settingsPanel");

    if (rankedBtn) {
      const oldRanked = rankedBtn.onclick;
      rankedBtn.onclick = event => {
        if (localStorage.getItem("isLoggedIn") !== "true") {
          event.preventDefault();
          authOverlay?.classList.remove("hidden");
          return;
        }
        if (typeof oldRanked === "function") oldRanked.call(rankedBtn, event);
      };
    }

    loginBtn && (loginBtn.onclick = loginWithGoogle);
    googleLoginBtn && (googleLoginBtn.onclick = loginWithGoogle);
    closeAuthBtn && (closeAuthBtn.onclick = () => authOverlay?.classList.add("hidden"));

    $("settingsBtn") && ($("settingsBtn").onclick = () => settingsPanel?.classList.remove("hidden"));
    $("closeSettingsBtn") && ($("closeSettingsBtn").onclick = () => settingsPanel?.classList.add("hidden"));

    $("saveProfileBtn") && ($("saveProfileBtn").onclick = () => {
      const name = $("profileNameInput")?.value.trim() || localStorage.getItem("playerName") || "Player";
      const pfp = $("pfpInput")?.value.trim() || avatarFor(name);
      localStorage.setItem("playerName", name);
      localStorage.setItem("pfpUrl", pfp);
      setLoggedIn({ displayName: name, photoURL: pfp });
      settingsPanel?.classList.add("hidden");
    });

    $("logoutBtn") && ($("logoutBtn").onclick = async () => {
      if (hasFirebaseConfig && window.firebase?.auth) {
        await firebase.auth().signOut().catch(() => {});
      }
      setLoggedOut();
      settingsPanel?.classList.add("hidden");
    });
  });
})();
