const data = window.CLASSROOM_DATA || { students: [], classrooms: [] };
let currentStudentName = "";
let currentStudentCode = "";
let currentStudentData = null;
let currentRoomId = "";

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

function setup() {
  $("#loginBtn").addEventListener("click", login);
  $("#logoutBtn").addEventListener("click", logout);
  ["#studentNameInput", "#studentCodeInput"].forEach((selector) => {
    $(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter") login();
    });
  });
  $("#studentCodeInput").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
}

async function login() {
  const name = $("#studentNameInput").value.trim();
  const code = $("#studentCodeInput").value.trim().toUpperCase();
  $("#loginMessage").textContent = "";
  await loadStudentData(name, code);
}

async function loadStudentData(name, code) {
  if (!name || !code) {
    $("#loginMessage").textContent = "학생 이름과 개인코드를 모두 입력해 주세요.";
    return;
  }
  $("#loginBtn").disabled = true;
  $("#loginBtn").textContent = "확인하고 있어요…";
  try {
    const response = await fetch(`./student-data/${encodeURIComponent(code)}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error("student data not found");
    const studentData = await response.json();
    if (String(studentData.student?.name || "").trim() !== name) throw new Error("student name mismatch");
    currentStudentName = name;
    currentStudentCode = code;
    currentStudentData = studentData;
    currentRoomId = "";
    renderStudentRoom();
  } catch (error) {
    currentStudentData = null;
    $("#loginPanel").hidden = false;
    $("#roomShell").hidden = true;
    $("#loginMessage").textContent = "학생 이름 또는 개인코드가 맞지 않습니다. 다시 확인해 주세요.";
    return;
  } finally {
    $("#loginBtn").disabled = false;
    $("#loginBtn").textContent = "입장하기";
  }
}

function logout() {
  currentStudentName = "";
  currentStudentCode = "";
  currentStudentData = null;
  currentRoomId = "";
  $("#studentNameInput").value = "";
  $("#studentCodeInput").value = "";
  $("#loginMessage").textContent = "안전하게 로그아웃했습니다.";
  $("#loginPanel").hidden = false;
  $("#roomShell").hidden = true;
}

function getAllowedRooms() {
  return sortRooms(currentStudentData?.classrooms || []);
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
              <strong>${room.name}</strong><br />
              <span>${(room.posts || []).length}개 게시글</span>
            </button>
          `,
        )
        .join("")
    : `<div class="empty">아직 입장 가능한 수업방이 없습니다.</div>`;
  document.querySelectorAll("[data-room-id]").forEach((button) => {
    button.addEventListener("click", () => {
      currentRoomId = button.dataset.roomId;
      renderStudentRoom();
    });
  });
  renderPosts();
}

function renderPosts() {
  const room = getAllowedRooms().find((item) => item.id === currentRoomId);
  $("#roomTitle").textContent = room ? room.name : "게시글";
  $("#postList").innerHTML = room?.posts?.length
    ? [...room.posts].sort((a, b) => b.createdAt - a.createdAt).map(renderPost).join("")
    : `<div class="empty">확인할 게시글이 없습니다.</div>`;
}

function renderPost(post) {
  const links = post.links || [];
  const linkList = links.length
    ? `<div class="link-list">
        ${links
          .map(
            (link, index) => `
              <a class="classroom-link" href="${link.url}" target="_blank" rel="noreferrer">
                <span>${link.title || `수업 링크 ${index + 1}`}</span>
                <small>열기</small>
              </a>
            `,
          )
          .join("")}
      </div>`
    : "";
  return `
    <article class="post-card">
      <div class="post-head">
        <span class="badge ${post.type === "숙제" ? "orange" : ""}">${post.type || "공지"}</span>
        <small>${post.lessonDate ? `수업일 ${formatLessonDate(post.lessonDate)} · ` : ""}${formatDateTime(post.createdAt)}</small>
      </div>
      <strong>${post.title}</strong>
      <p>${post.content || ""}</p>
      ${linkList}
    </article>
  `;
}

setup();
