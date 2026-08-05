(() => {
  const ADMIN_EMAIL = "grovescience24@gmail.com";
  const isLocalOffice = ["localhost", "127.0.0.1"].includes(location.hostname);
  const authMessage = document.querySelector("#officeAuthMessage");
  const loginForm = document.querySelector("#officeLoginForm");
  const passwordForm = document.querySelector("#officePasswordForm");
  const logoutButton = document.querySelector("#officeLogoutBtn");
  let client = null;
  let officeStarted = false;

  function setMessage(message, type = "") {
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`.trim();
  }

  function startOffice(mode = "authenticated") {
    if (officeStarted) return;
    officeStarted = true;
    document.body.className = mode;
    if (mode === "authenticated") logoutButton.hidden = false;
    window.startOrchardOffice?.();
  }

  function showLogin(message = "") {
    document.body.className = "auth-locked";
    loginForm.hidden = false;
    passwordForm.hidden = true;
    document.querySelector("#authTitle").textContent = "원장님 로그인";
    document.querySelector("#authDescription").textContent = "등록된 관리자 계정으로 로그인해주세요.";
    setMessage(message || "아이디와 비밀번호를 입력해주세요.", message ? "error" : "");
  }

  function showPasswordSetup() {
    document.body.className = "auth-locked";
    loginForm.hidden = true;
    passwordForm.hidden = false;
    document.querySelector("#authTitle").textContent = "새 비밀번호 설정";
    document.querySelector("#authDescription").textContent = "원장님 교무실에서 사용할 새 비밀번호를 입력해주세요.";
    setMessage("비밀번호는 10자 이상으로 만들어주세요.");
  }

  async function verifyAdmin(session) {
    const email = String(session?.user?.email || "").toLowerCase();
    if (email !== ADMIN_EMAIL) {
      await client.auth.signOut();
      showLogin("등록된 원장님 계정만 이용할 수 있습니다.");
      return false;
    }
    return true;
  }

  async function initializeOnlineAuth() {
    try {
      const response = await fetch("/api/auth-config", { cache: "no-store" });
      if (!response.ok) throw new Error("로그인 설정을 불러오지 못했습니다.");
      const config = await response.json();
      if (!config.url || !config.publishableKey) throw new Error("로그인 연결 설정이 아직 완료되지 않았습니다.");
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { detectSessionInUrl: true, persistSession: true },
      });

      const params = new URLSearchParams(location.hash.replace(/^#/, ""));
      const authType = params.get("type");
      const { data } = await client.auth.getSession();
      if (data.session && await verifyAdmin(data.session)) {
        if (["invite", "recovery"].includes(authType)) showPasswordSetup();
        else startOffice();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin(error.message || "로그인 연결을 준비하지 못했습니다.");
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return setMessage("로그인 연결이 아직 준비되지 않았습니다.", "error");
    const email = document.querySelector("#officeAuthEmail").value.trim().toLowerCase();
    const password = document.querySelector("#officeAuthPassword").value;
    if (email !== ADMIN_EMAIL) return setMessage("등록된 원장님 이메일을 입력해주세요.", "error");
    setMessage("로그인하고 있습니다.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return setMessage("이메일 또는 비밀번호를 확인해주세요.", "error");
    if (await verifyAdmin(data.session)) startOffice();
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#officeNewPassword").value;
    const confirmation = document.querySelector("#officeNewPasswordConfirm").value;
    if (password.length < 10) return setMessage("비밀번호는 10자 이상으로 만들어주세요.", "error");
    if (password !== confirmation) return setMessage("두 비밀번호가 서로 다릅니다.", "error");
    setMessage("새 비밀번호를 저장하고 있습니다.");
    const { error } = await client.auth.updateUser({ password });
    if (error) return setMessage("비밀번호를 저장하지 못했습니다. 초대 링크를 다시 확인해주세요.", "error");
    history.replaceState({}, document.title, location.pathname);
    setMessage("비밀번호가 저장되었습니다.", "success");
    setTimeout(() => startOffice(), 500);
  });

  logoutButton.addEventListener("click", async () => {
    await client?.auth.signOut();
    location.reload();
  });

  if (isLocalOffice) startOffice("local-office");
  else initializeOnlineAuth();
})();
