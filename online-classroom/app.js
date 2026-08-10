let supabaseClient = null;
let supabaseUrl = "";
let supabasePublishableKey = "";
let currentStudentName = "";
let currentStudentCode = "";
let currentStudentData = null;
let currentRoomId = "";
const classroomImageApi = "https://grovescience-office-admin.vercel.app/api/classroom-images";

const $ = (selector) => document.querySelector(selector);

function gradeSortValue(grade) {
  const text = String(grade || "");
  const schoolOrder = text.startsWith("초") ? 0 : text.startsWith("중") ? 10 : text.startsWith("고") ? 20 : 30;
  const number = Number(text.replace(/[^0-9]/g, "")) || 0;
  return schoolOrder + number;
}

function sortStudents(students) {
  return [...students].sort((a, b) => {
    const gradeDiff = gradeSortValue(a.grade) - gradeSortValue(b.grade);
    if (gradeDiff) return gradeDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function sortRooms(rooms) {
  return [...rooms].sort((a, b) => {
    const specialDiff = Number(isSpecialRoom(a)) - Number(isSpecialRoom(b));
    if (specialDiff) return specialDiff;
    const levelDiff = getRoomLevelSortValue(a) - getRoomLevelSortValue(b);
    if (levelDiff) return levelDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function isSpecialRoom(room) {
  const name = String(room?.name || "");
  return name.includes("특강") || name.includes("방학") || name === "탐구보고서";
}

function getRoomLevelSortValue(room) {
  const name = String(room?.name || "");
  const match = name.match(/(초|중|고)\s*(\d+)/);
  if (!match) return 999;
  const schoolOffset = match[1] === "초" ? 0 : match[1] === "중" ? 100 : 200;
  return schoolOffset + Number(match[2]);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatLessonDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

function getIndividualYoutubeUrl(value = "") {
  const original = String(value || "").trim();
  if (!original) return "";
  try {
    const parsed = new URL(original);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
      if (!videoId) videoId = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || "";
    }
    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return original;
    const cleaned = new URL("https://www.youtube.com/watch");
    cleaned.searchParams.set("v", videoId);
    const startAt = parsed.searchParams.get("t") || parsed.searchParams.get("start");
    if (startAt) cleaned.searchParams.set("t", startAt);
    return cleaned.toString();
  } catch (error) {
    return original;
  }
}

function getClassroomLinkLabel(link, index = 0) {
  const title = link.title || `수업 링크 ${index + 1}`;
  const url = String(link.url || "");
  return /(?:youtube\.com|youtu\.be)/i.test(url) ? `${title} (유튜브 링크 바로가기)` : title;
}

async function setup() {
  $("#loginBtn").addEventListener("click", login);
  $("#logoutBtn").addEventListener("click", logout);
  $("#passwordChangeBtn").addEventListener("click", () => {
    $("#passwordChangeForm").hidden = !$("#passwordChangeForm").hidden;
    $("#passwordChangeMessage").textContent = "";
  });
  $("#passwordChangeCancelBtn").addEventListener("click", closePasswordChange);
  $("#passwordChangeForm").addEventListener("submit", changePassword);
  ["#studentNameInput", "#studentCodeInput"].forEach((selector) => {
    $(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter") login();
    });
  });
  try {
    const response = await fetch("./api/auth-config", { cache: "no-store" });
    const config = await response.json();
    if (!response.ok || !config.url || !config.publishableKey) throw new Error();
    supabaseUrl = config.url;
    supabasePublishableKey = config.publishableKey;
    supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true } });
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) await loadPortal(data.session);
  } catch (error) {
    $("#loginMessage").textContent = "학습방 연결을 준비하지 못했습니다. 선생님께 문의해 주세요.";
  }
}

async function login() {
  const name = $("#studentNameInput").value.trim().toLowerCase();
  const code = $("#studentCodeInput").value;
  $("#loginMessage").textContent = "";
  await loadStudentData(name, code);
}

async function loadStudentData(name, code) {
  if (!name || !code) {
    $("#loginMessage").textContent = "학생 아이디와 비밀번호를 모두 입력해 주세요.";
    return;
  }
  $("#loginBtn").disabled = true;
  $("#loginBtn").textContent = "확인하고 있어요…";
  try {
    if (!supabaseClient) throw new Error("not ready");
    const email = `${name.replace(/[^a-z0-9_-]/g, "")}@student.grovescience.local`;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: code });
    if (error || !data.session) throw error || new Error("login failed");
    await loadPortal(data.session);
  } catch (error) {
    currentStudentData = null;
    $("#loginPanel").hidden = false;
    $("#roomShell").hidden = true;
    $("#loginMessage").textContent = "학생 아이디 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.";
    return;
  } finally {
    $("#loginBtn").disabled = false;
    $("#loginBtn").textContent = "입장하기";
  }
}

async function loadPortal(session) {
  const response = await fetch(`${supabaseUrl}/rest/v1/student_portals?select=payload&auth_user_id=eq.${session.user.id}`, {
    cache: "no-store",
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error("portal unavailable");
  const rows = await response.json();
  if (!rows[0]?.payload?.student) throw new Error("portal not assigned");
  currentStudentData = rows[0].payload;
  currentStudentName = currentStudentData.student.name;
  currentStudentCode = "";
  currentRoomId = "";
  renderStudentRoom();
}

async function logout() {
  await supabaseClient?.auth.signOut();
  currentStudentName = "";
  currentStudentCode = "";
  currentStudentData = null;
  currentRoomId = "";
  $("#studentNameInput").value = "";
  $("#studentCodeInput").value = "";
  $("#loginMessage").textContent = "안전하게 로그아웃했습니다.";
  $("#loginPanel").hidden = false;
  $("#roomShell").hidden = true;
  closePasswordChange();
}

function closePasswordChange() {
  $("#passwordChangeForm").hidden = true;
  $("#currentPasswordInput").value = "";
  $("#newPasswordInput").value = "";
  $("#newPasswordConfirmInput").value = "";
  $("#passwordChangeMessage").textContent = "";
}

async function changePassword(event) {
  event.preventDefault();
  const currentPassword = $("#currentPasswordInput").value;
  const newPassword = $("#newPasswordInput").value;
  const confirmation = $("#newPasswordConfirmInput").value;
  const message = $("#passwordChangeMessage");
  if (newPassword.length < 10) return message.textContent = "새 비밀번호는 10자 이상으로 만들어 주세요.";
  if (newPassword !== confirmation) return message.textContent = "새 비밀번호 두 개가 서로 다릅니다.";
  const { data } = await supabaseClient.auth.getSession();
  const email = data.session?.user?.email;
  if (!email) return message.textContent = "로그인 상태를 확인할 수 없습니다.";
  message.textContent = "비밀번호를 확인하고 있습니다…";
  const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) return message.textContent = "현재 비밀번호가 맞지 않습니다.";
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) return message.textContent = "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  alert("비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.");
  closePasswordChange();
}

function getAllowedRooms() {
  return sortRooms(currentStudentData?.classrooms || []);
}

function displayOrchardOnText(value) {
  return String(value || "").replace(/수업방/g, "과수원ON");
}

function renderStudentRoom() {
  const student = currentStudentData?.student;
  if (!student) {
    logout();
    return;
  }
  $("#loginPanel").hidden = true;
  $("#roomShell").hidden = false;
  $("#studentNameLabel").textContent = `${student.name} 학생`;
  const rooms = getAllowedRooms();
  $("#roomCountLabel").textContent = `${rooms.length}개`;
  if (!currentRoomId || !rooms.some((room) => room.id === currentRoomId)) currentRoomId = rooms[0]?.id || "";
  $("#roomList").innerHTML = rooms.length
    ? rooms
        .map(
          (room) => `
            <button class="room-button ${room.id === currentRoomId ? "active" : ""}" type="button" data-room-id="${room.id}">
              <strong>${escapeHtml(displayOrchardOnText(room.name))}</strong><br />
              <span>${(room.posts || []).length}개 게시글</span>
            </button>
          `,
        )
        .join("")
    : `<div class="empty">아직 입장 가능한 과수원ON이 없습니다.</div>`;
  document.querySelectorAll("[data-room-id]").forEach((button) => {
    button.addEventListener("click", () => {
      currentRoomId = button.dataset.roomId;
      renderStudentRoom();
    });
  });
  renderStudentAnnouncements();
  renderStudentScores();
  renderPosts();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char]));
}

function renderStudentAnnouncements() {
  const date = new Date();
  const todayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const announcements = (Array.isArray(currentStudentData?.announcements) ? currentStudentData.announcements : [])
    .filter((item) => (!item.startDate || item.startDate <= todayKey) && (!item.endDate || item.endDate >= todayKey))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  $("#announcementCountLabel").textContent = `${announcements.length}개`;
  $("#studentAnnouncementList").innerHTML = announcements.length
    ? announcements.map((item) => {
        const scopeText = item.scope === "class" ? item.className || "반별 공지" : "학원 전체";
        const period = item.endDate ? `${item.startDate || ""} ~ ${item.endDate}` : item.startDate || "";
        return `<article class="student-announcement-card ${item.scope === "class" ? "class-notice" : "global-notice"}"><div class="student-announcement-head"><div><span class="announcement-scope">${escapeHtml(scopeText)}</span><span class="badge">${escapeHtml(item.category || "일반 안내")}</span></div><small>${escapeHtml(period)}</small></div><strong>${escapeHtml(item.title || "공지사항")}</strong><p>${escapeHtml(item.content || "")}</p></article>`;
      }).join("")
    : `<div class="empty">현재 확인할 공지사항이 없습니다.</div>`;
}

function renderStudentScores() {
  const scores = Array.isArray(currentStudentData?.scores) ? currentStudentData.scores : [];
  $("#scoreCountLabel").textContent = `${scores.length}개`;
  $("#studentScoreList").innerHTML = scores.length
    ? scores.map((item) => {
        const academyDetail = item.type === "academy"
          ? `<span>${Number(item.correctCount) || 0}/${Number(item.totalQuestions) || 0}개 정답 · 100점 환산</span>`
          : `<span>학교 시험</span>`;
        return `
          <article class="student-score-card">
            <div>
              <small>${escapeHtml(item.date)} · ${escapeHtml(item.subject || "과학")}${item.className ? ` · ${escapeHtml(item.className)}` : ""}</small>
              <strong>${escapeHtml(item.title || "시험")}</strong>
              ${academyDetail}
            </div>
            <em>${Number(item.score) || 0}점</em>
          </article>`;
      }).join("")
    : `<div class="empty">아직 등록된 성적이 없습니다.</div>`;
}

function comparePostsByLessonDate(left, right) {
  const lessonDateOrder = String(right.lessonDate || "").localeCompare(String(left.lessonDate || ""));
  if (lessonDateOrder) return lessonDateOrder;
  return Number(right.updatedAt || right.createdAt || 0) - Number(left.updatedAt || left.createdAt || 0);
}

function renderPosts() {
  const room = getAllowedRooms().find((item) => item.id === currentRoomId);
  $("#roomTitle").textContent = room ? displayOrchardOnText(room.name) : "게시글";
  $("#postList").innerHTML = room?.posts?.length
    ? [...room.posts].sort(comparePostsByLessonDate).map(renderPost).join("")
    : `<div class="empty">확인할 게시글이 없습니다.</div>`;
  hydratePostImages();
}

function normalizePostImages(images = []) {
  return Array.isArray(images) ? images.filter((image) => String(image?.path || "").startsWith("classroom/")) : [];
}

async function hydratePostImages() {
  const targets = Array.from(document.querySelectorAll("[data-classroom-image-path]"));
  if (!targets.length) return;
  const { data } = await supabaseClient.auth.getSession();
  const accessToken = data.session?.access_token || "";
  if (!accessToken) return;
  await Promise.all(targets.map(async (target) => {
    try {
      const response = await fetch(`${classroomImageApi}?path=${encodeURIComponent(target.dataset.classroomImagePath)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error();
      const image = document.createElement("img");
      image.src = result.url;
      image.alt = "수업 이미지";
      image.loading = "lazy";
      target.replaceWith(image);
    } catch (error) {
      target.textContent = "이미지를 불러오지 못했습니다.";
    }
  }));
}

function renderPost(post) {
  const links = post.links || [];
  const linkList = links.length
    ? `<div class="link-list">
        ${links
          .map(
            (link, index) => `
              <a class="classroom-link" href="${getIndividualYoutubeUrl(link.url)}" target="_blank" rel="noreferrer">
                <span>${getClassroomLinkLabel(link, index)}</span>
                <small>열기</small>
              </a>
            `,
          )
          .join("")}
      </div>`
    : "";
  const images = normalizePostImages(post.images);
  const imageList = images.length
    ? `<div class="classroom-image-gallery">
        ${images.map((image) => `<div class="classroom-image-placeholder" data-classroom-image-path="${image.path}">이미지 불러오는 중</div>`).join("")}
      </div>`
    : "";
  return `
    <article class="post-card">
      <div class="post-head">
        <span class="badge ${post.type === "숙제" ? "orange" : ""}">${post.type || "공지"}</span>
        <small>${post.lessonDate ? `수업일 ${formatLessonDate(post.lessonDate)} · ` : ""}${formatDateTime(post.createdAt)}</small>
      </div>
      <strong>${post.title}</strong>
      <p>${escapeHtml(post.content || "")}</p>
      ${imageList}
      ${linkList}
    </article>
  `;
}

setup();
