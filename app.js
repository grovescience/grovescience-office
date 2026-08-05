const defaultClasses = [
  { name: "초3 I단계", type: "정규반", time: "월 15:30", frequency: "주 1회", subject: "교과과학", defaultBook: "초등 교과과학 I단계", tuition: 260000 },
  { name: "초4 E단계", type: "정규반", time: "화 16:00", frequency: "주 1회", subject: "실험과학", defaultBook: "초등 실험과학 E단계", tuition: 280000 },
  { name: "초6 과학독해", type: "정규반", time: "수 17:00", frequency: "주 1회", subject: "과학독해", defaultBook: "과학독해 프린트", tuition: 280000 },
  { name: "중1 정규반", type: "정규반", time: "목 18:30", frequency: "주 1회", subject: "교과과학", defaultBook: "중1 내신과학", tuition: 320000 },
  { name: "중2 정규반", type: "정규반", time: "금 18:30", frequency: "주 1회", subject: "교과과학", defaultBook: "중2 내신과학", tuition: 340000 },
  { name: "중3 정규반", type: "정규반", time: "토 13:00", frequency: "주 1회", subject: "교과과학", defaultBook: "중3 내신과학", tuition: 360000 },
  { name: "고1 정규반", type: "정규반", time: "토 16:00", frequency: "주 1회", subject: "교과과학", defaultBook: "고1 통합과학", tuition: 380000 },
  { name: "중2 방학특강a", type: "방학특강", time: "방학 오전", frequency: "특강 일정", subject: "방학특강", defaultBook: "중2 특강 프린트 A", tuition: 300000 },
  { name: "중2 방학특강b", type: "방학특강", time: "방학 오후", frequency: "특강 일정", subject: "방학특강", defaultBook: "중2 특강 프린트 B", tuition: 300000 },
  { name: "중3 방학특강", type: "방학특강", time: "방학 집중", frequency: "특강 일정", subject: "방학특강", defaultBook: "중3 특강 프린트", tuition: 340000 },
  { name: "탐구보고서", type: "방학특강", time: "예약제", frequency: "개별 일정", subject: "탐구보고서", defaultBook: "탐구보고서 개별 자료", tuition: 250000 },
  { name: "고2 화학특강", type: "방학특강", time: "방학 저녁", frequency: "특강 일정", subject: "방학특강", defaultBook: "고2 화학특강 자료", tuition: 420000 },
];
let classes = defaultClasses.map((item) => ({ ...item }));

const attendanceStates = ["출석", "결석", "지각", "조퇴", "보강"];
const paymentStates = ["납부완료", "미납", "부분납부", "면제"];
const homeworkStates = ["확인 전", "완료", "미완료", "보충 필요"];
const storageKey = "orchardScienceOffice";
const subjectChoices = ["실험과학", "과학독해", "교과과학", "탐구보고서", "방학특강"];
const subjectAliases = {
  과학실험: "실험과학",
  내신과학: "교과과학",
  통합과학: "교과과학",
  화학특강: "방학특강",
};

const sampleStudents = [
];

let state = loadState();
applyClassSettings();
let selectedPaymentClass = "전체";
let selectedPaymentFilter = "미납자";
let selectedStudentList = "active";
let selectedStudentSort = "oldest";
let serverSaveTimer = null;
let syncingFromServer = false;
let lastServerSaveError = "";
let currentStudentRoomStudentId = localStorage.getItem("orchardScienceClassroomStudentId") || "";
let currentStudentRoomId = "";
let classroomMemberSelection = new Set();
let classroomMemberAccess = {};
let memberDialogStudents = [];
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedScheduleDate = today();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return createInitialState();
  return normalizeState(JSON.parse(saved));
}

function createInitialState() {
  return {
    students: sampleStudents.map((student) => ({ ...student })),
    attendance: {},
    attendanceCycleAnchors: {},
    payments: {},
    consulting: {},
    newConsultations: [],
    waitlist: [],
    classHomework: {},
    classSettings: {},
    customClasses: [],
    classrooms: [],
    scheduleEvents: [],
    scoreExams: [],
  };
}

function normalizeState(saved) {
  const next = {
    students: [],
    attendance: {},
    attendanceCycleAnchors: {},
    attendanceSessions: {},
    payments: {},
    consulting: {},
    newConsultations: [],
    waitlist: [],
    classHomework: {},
    classSettings: {},
    customClasses: [],
    classrooms: [],
    scheduleEvents: [],
    scoreExams: [],
    ...saved,
  };
  next.customClasses = normalizeCustomClasses(next.customClasses);
  next.scoreExams = Array.isArray(next.scoreExams) ? next.scoreExams : [];
  next.classSettings = normalizeClassSettings(next.classSettings, next.customClasses);
  next.students = (next.students || []).map((student) => {
    const classInfo = getClassInfo(student.className);
    const normalized = {
      homework: "",
      homeworkStatus: "확인 전",
      classroomCode: "",
      specialClassNames: [],
      subject: classInfo?.subject || "",
      book: classInfo?.defaultBook || "",
      ...student,
    };
    const subject = subjectAliases[normalized.subject] || normalized.subject || classInfo?.subject || "교과과학";
    normalized.subject = subjectChoices.includes(subject) ? subject : "교과과학";
    normalized.specialClassNames = Array.isArray(normalized.specialClassNames)
      ? [...new Set(normalized.specialClassNames.filter(Boolean))].filter((name) => name !== normalized.className)
      : [];
    return normalized;
  });
  next.consulting = next.consulting || {};
  next.classHomework = Object.keys(next.classHomework || {}).reduce((homework, className) => {
    const item = next.classHomework[className] || {};
    homework[className] = {
      date: item.date || today(),
      text: item.text || item.homework || "",
      updatedAt: item.updatedAt || Date.now(),
    };
    return homework;
  }, {});
  next.newConsultations = (next.newConsultations || []).map((record) => ({
    id: record.id || crypto.randomUUID(),
    date: record.date || today(),
    name: record.name || "",
    school: record.school || "",
    grade: record.grade || "초3",
    parentPhone: record.parentPhone || "",
    memo: record.memo || "",
    createdAt: record.createdAt || Date.now(),
  }));
  next.waitlist = (next.waitlist || []).map((record) => ({
    id: record.id || crypto.randomUUID(),
    name: record.name || "",
    school: record.school || "",
    grade: record.grade || "초3",
    waitDate: record.waitDate || today(),
    className: record.className || classes[0].name,
    baseYear: Number(record.baseYear || String(record.waitDate || today()).slice(0, 4) || new Date().getFullYear()),
    baseGrade: record.baseGrade || record.grade || "초3",
    autoAdvance: Boolean(record.autoAdvance),
    nextYearClassName: record.nextYearClassName || "",
    noticeDate: record.noticeDate || "",
    memo: record.memo || "",
    status: record.status || "대기",
    completedAt: record.completedAt || "",
    createdAt: record.createdAt || Date.now(),
  }));
  next.classrooms = normalizeClassrooms(next.classrooms);
  next.scheduleEvents = (next.scheduleEvents || []).map((event) => ({
    id: event.id || crypto.randomUUID(), date: event.date || today(), type: event.type || "학원 행사",
    title: event.title || "", memo: event.memo || "", createdAt: event.createdAt || Date.now(),
  }));
  return next;
}

function normalizeClassrooms(classrooms = []) {
  return (classrooms || []).map((room) => {
    const memberStudentIds = Array.isArray(room.memberStudentIds) ? [...new Set(room.memberStudentIds)] : [];
    const normalizedRoom = {
      id: room.id || crypto.randomUUID(),
      name: room.name || "새 수업방",
      teacher: room.teacher || "",
      description: room.description || "",
      isPublic: getClassroomPublicFlag(room),
      memberStudentIds,
      memberAccess: {},
      posts: (room.posts || []).map((post) => ({
        id: post.id || crypto.randomUUID(),
        type: ["공지", "숙제", "유튜브 링크"].includes(post.type) ? post.type : "공지",
        title: post.title || "",
        content: post.content || "",
        link: post.link || "",
        links: normalizeYoutubeLinks(post.links, post.link),
        openToAll: Boolean(post.openToAll),
        lessonDate: normalizeDateValue(post.lessonDate) || "",
        createdAt: post.createdAt || Date.now(),
        updatedAt: post.updatedAt || post.createdAt || Date.now(),
      })),
      createdAt: room.createdAt || Date.now(),
      updatedAt: room.updatedAt || room.createdAt || Date.now(),
    };
    normalizedRoom.memberAccess = normalizeClassroomMemberAccess(room, memberStudentIds);
    return normalizedRoom;
  });
}

function getClassroomPublicFlag(room = {}, fallback = false) {
  if (room.isPublic === undefined && room.visibility === undefined) return fallback;
  return room.isPublic === true || room.visibility === "public";
}

function isClassroomPublic(room) {
  return getClassroomPublicFlag(room);
}

function normalizeYoutubeLinks(links = [], legacyLink = "") {
  const normalized = Array.isArray(links)
    ? links
        .map((item) => ({
          title: String(item.title || "").trim(),
          url: String(item.url || item.link || "").trim(),
        }))
        .filter((item) => item.url)
    : [];
  if (legacyLink && !normalized.some((item) => item.url === legacyLink)) {
    normalized.unshift({ title: "수업 링크", url: legacyLink });
  }
  return normalized;
}

function normalizeDateValue(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeClassroomMemberAccess(room = {}, memberStudentIds = room.memberStudentIds || []) {
  const source = room.memberAccess || room.memberStartDates || {};
  return memberStudentIds.reduce((result, studentId) => {
    const item = source[studentId] || {};
    const startDate = normalizeDateValue(typeof item === "string" ? item : item.startDate);
    const endDate = normalizeDateValue(typeof item === "string" ? "" : item.endDate);
    result[studentId] = { startDate, endDate };
    return result;
  }, {});
}

function mergeClassroomMemberAccess(existing = {}, incoming = {}, memberStudentIds = []) {
  return memberStudentIds.reduce((result, studentId) => {
    result[studentId] = {
      startDate: normalizeDateValue(existing[studentId]?.startDate || incoming[studentId]?.startDate),
      endDate: normalizeDateValue(existing[studentId]?.endDate || incoming[studentId]?.endDate),
    };
    return result;
  }, {});
}

function getClassroomMemberStartDate(room, studentId) {
  return normalizeDateValue(room?.memberAccess?.[studentId]?.startDate);
}

function getClassroomMemberEndDate(room, studentId) {
  return normalizeDateValue(room?.memberAccess?.[studentId]?.endDate);
}

function canStudentAccessClassroom(room, studentId, date = today()) {
  if (!room || !studentId || !isClassroomPublic(room) || !room.memberStudentIds.includes(studentId)) return false;
  const startDate = getClassroomMemberStartDate(room, studentId);
  const endDate = getClassroomMemberEndDate(room, studentId);
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function canStudentSeeClassroomPost(room, studentId, post) {
  if (!room || !studentId || !post) return false;
  if (post.openToAll) return true;
  const startDate = getClassroomMemberStartDate(room, studentId);
  if (!startDate) return true;
  const startTime = new Date(`${startDate}T00:00:00`).getTime();
  return Number(post.createdAt || 0) >= startTime;
}

function getVisibleClassroomPosts(room, studentId) {
  return [...(room?.posts || [])].filter((post) => canStudentSeeClassroomPost(room, studentId, post));
}

function normalizeClassSettings(settings = {}, customClasses = state?.customClasses || []) {
  const classSource = [...defaultClasses, ...normalizeCustomClasses(customClasses)];
  return classSource.reduce((saved, classInfo) => {
    const item = settings[classInfo.name];
    if (!item) return saved;
    saved[classInfo.name] = {
      time: String(item.time || classInfo.time),
      frequency: String(item.frequency || classInfo.frequency),
      subject: subjectChoices.includes(item.subject) ? item.subject : classInfo.subject,
      defaultBook: String(item.defaultBook || classInfo.defaultBook),
      tuition: Number(item.tuition || classInfo.tuition || 0),
    };
    return saved;
  }, {});
}

function applyClassSettings(settings = state?.classSettings || {}, customSource = state?.customClasses || []) {
  const customClasses = normalizeCustomClasses(customSource);
  classes = [...defaultClasses, ...customClasses].map((classInfo) => ({ ...classInfo, ...(settings[classInfo.name] || {}) }));
}

function normalizeCustomClasses(customClasses = []) {
  const defaultNames = new Set(defaultClasses.map((classInfo) => classInfo.name));
  const seen = new Set();
  return (customClasses || [])
    .map((classInfo) => ({
      name: String(classInfo.name || "").trim(),
      type: ["정규반", "방학특강"].includes(classInfo.type) ? classInfo.type : "정규반",
      time: String(classInfo.time || ""),
      frequency: String(classInfo.frequency || "주 1회"),
      subject: subjectChoices.includes(classInfo.subject) ? classInfo.subject : "교과과학",
      defaultBook: String(classInfo.defaultBook || ""),
      tuition: Number(classInfo.tuition || 0),
      custom: true,
      createdAt: classInfo.createdAt || Date.now(),
    }))
    .filter((classInfo) => {
      if (!classInfo.name || defaultNames.has(classInfo.name) || seen.has(classInfo.name)) return false;
      seen.add(classInfo.name);
      return true;
    });
}

function saveState(options = {}) {
  localStorage.setItem(storageKey, JSON.stringify(state));
  if (!options.localOnly) queueServerSave();
}

function queueServerSave() {
  if (syncingFromServer || !window.fetch) return;
  window.clearTimeout(serverSaveTimer);
  serverSaveTimer = window.setTimeout(saveStateToServer, 250);
}

async function saveStateToServer() {
  lastServerSaveError = "";
  try {
    const { data } = await window.officeAuthClient?.auth?.getSession?.() || { data: {} };
    const accessToken = data?.session?.access_token || "";
    const response = await fetch("./api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ ...state, savedAt: new Date().toISOString() }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      lastServerSaveError = result.error || `서버 응답 ${response.status}`;
      return false;
    }
    return true;
  } catch (error) {
    // 로컬 파일 저장 서버가 꺼져 있으면 브라우저 저장만 유지합니다.
    lastServerSaveError = error.message || "서버에 연결하지 못했습니다.";
    return false;
  }
}

async function syncStateFromServer() {
  if (!window.fetch) return;
  try {
    const { data } = await window.officeAuthClient?.auth?.getSession?.() || { data: {} };
    const accessToken = data?.session?.access_token || "";
    const response = await fetch("./api/state", { cache: "no-store", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    if (!response.ok) return;
    const serverState = normalizeState(await response.json());
    const localCount = state.students.length;
    const serverCount = serverState.students.length;
    const localStudentShape = JSON.stringify((state.students || []).map((student) => ({
      id: student.id,
      name: student.name,
      grade: student.grade,
      className: student.className,
      classroomCode: student.classroomCode || "",
    })));
    const serverStudentShape = JSON.stringify((serverState.students || []).map((student) => ({
      id: student.id,
      name: student.name,
      grade: student.grade,
      className: student.className,
      classroomCode: student.classroomCode || "",
    })));
    const localClassroomShape = JSON.stringify(state.classrooms || []);
    const serverClassroomShape = JSON.stringify(serverState.classrooms || []);
    const localClassShape = JSON.stringify({ customClasses: state.customClasses || [], classSettings: state.classSettings || {} });
    const serverClassShape = JSON.stringify({ customClasses: serverState.customClasses || [], classSettings: serverState.classSettings || {} });

    if (
      serverCount > localCount ||
      (localCount === 0 && serverCount > 0) ||
      (serverCount >= localCount && localStudentShape !== serverStudentShape) ||
      (serverCount >= localCount && (localClassroomShape !== serverClassroomShape || localClassShape !== serverClassShape))
    ) {
      syncingFromServer = true;
      state = serverState;
      applyClassSettings();
      saveState({ localOnly: true });
      refreshClassControls();
      renderAll();
      syncingFromServer = false;
      return;
    }

    if (localCount > serverCount) {
      state.customClasses = normalizeCustomClasses([...(serverState.customClasses || []), ...(state.customClasses || [])]);
      state.classSettings = normalizeClassSettings({ ...(state.classSettings || {}), ...(serverState.classSettings || {}) }, state.customClasses);
      state.classrooms = mergeClassrooms(serverState.classrooms, state.classrooms);
      state.classHomework = { ...(serverState.classHomework || {}), ...(state.classHomework || {}) };
      applyClassSettings();
      saveState({ localOnly: true });
      queueServerSave();
    }
  } catch (error) {
    // 서버 저장을 사용할 수 없는 환경에서는 기존 브라우저 저장을 사용합니다.
  } finally {
    syncingFromServer = false;
  }
}

function studentMergeKey(student) {
  return [student.name || "", student.school || "", student.grade || ""].map((value) => String(value).trim()).join("|");
}

function mergeRecordGroups(current = {}, incoming = {}) {
  return Object.keys(incoming).reduce(
    (merged, key) => {
      if (Array.isArray(incoming[key])) {
        merged[key] = [...(Array.isArray(merged[key]) ? merged[key] : []), ...incoming[key]];
      } else if (incoming[key] && typeof incoming[key] === "object") {
        merged[key] = { ...(merged[key] || {}), ...incoming[key] };
      } else {
        merged[key] = incoming[key];
      }
      return merged;
    },
    { ...current },
  );
}

function mergeImportedState(current, incoming) {
  const merged = normalizeState(current);
  const imported = normalizeState(incoming);
  const idMap = new Map(merged.students.map((student, index) => [student.id, index]));
  const infoMap = new Map(merged.students.map((student, index) => [studentMergeKey(student), index]));
  let added = 0;
  let updated = 0;

  imported.students.forEach((student) => {
    const existingIndex = idMap.has(student.id) ? idMap.get(student.id) : infoMap.get(studentMergeKey(student));
    if (existingIndex === undefined) {
      merged.students.push(student);
      idMap.set(student.id, merged.students.length - 1);
      infoMap.set(studentMergeKey(student), merged.students.length - 1);
      added += 1;
      return;
    }

    const existing = merged.students[existingIndex];
    const mergedStudent = { ...existing, ...student, id: existing.id || student.id };
    merged.students[existingIndex] = mergedStudent;
    updated += 1;
  });

  merged.attendance = mergeRecordGroups(merged.attendance, imported.attendance);
  merged.attendanceCycleAnchors = mergeRecordGroups(merged.attendanceCycleAnchors, imported.attendanceCycleAnchors);
  merged.payments = mergeRecordGroups(merged.payments, imported.payments);
  merged.consulting = mergeRecordGroups(merged.consulting, imported.consulting);
  merged.classHomework = { ...merged.classHomework, ...imported.classHomework };
  merged.customClasses = normalizeCustomClasses([...(merged.customClasses || []), ...(imported.customClasses || [])]);
  merged.classSettings = normalizeClassSettings({ ...merged.classSettings, ...imported.classSettings }, merged.customClasses);
  applyClassSettings(merged.classSettings, merged.customClasses);
  merged.newConsultations = mergeListById(merged.newConsultations, imported.newConsultations);
  merged.waitlist = mergeListById(merged.waitlist, imported.waitlist);
  merged.classrooms = mergeClassrooms(merged.classrooms, imported.classrooms);
  return { state: merged, added, updated };
}

function mergeClassrooms(current = [], incoming = []) {
  const map = new Map(normalizeClassrooms(current).map((room) => [room.id, room]));
  normalizeClassrooms(incoming).forEach((room, index) => {
    const rawIncomingRoom = incoming[index] || {};
    const existing = map.get(room.id);
    if (!existing) {
      map.set(room.id, room);
      return;
    }
    const posts = mergeListById(existing.posts, room.posts).sort((a, b) => b.createdAt - a.createdAt);
    map.set(room.id, {
      ...existing,
      ...room,
      isPublic: getClassroomPublicFlag(rawIncomingRoom, existing.isPublic),
      memberStudentIds: [...new Set([...(existing.memberStudentIds || []), ...(room.memberStudentIds || [])])],
      posts,
    });
    const mergedRoom = map.get(room.id);
    mergedRoom.memberAccess = mergeClassroomMemberAccess(existing.memberAccess, room.memberAccess, mergedRoom.memberStudentIds);
  });
  return Array.from(map.values());
}

function mergeListById(current = [], incoming = []) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, { ...(map.get(item.id) || {}), ...item }));
  return Array.from(map.values());
}

function getClassInfo(className) {
  return classes.find((item) => item.name === className);
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function generateClassroomCode(existingCodes = new Set()) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (existingCodes.has(code));
  return code;
}

function getClassroomCodeSet(exceptStudentId = "") {
  return new Set(
    state.students
      .filter((student) => student.id !== exceptStudentId)
      .map((student) => String(student.classroomCode || "").trim().toUpperCase())
      .filter(Boolean),
  );
}

function ensureStudentClassroomCodes() {
  let changed = false;
  const used = getClassroomCodeSet();
  state.students = state.students.map((student) => {
    const code = String(student.classroomCode || "").trim().toUpperCase();
    if (code) {
      used.add(code);
      return { ...student, classroomCode: code };
    }
    const classroomCode = generateClassroomCode(used);
    used.add(classroomCode);
    changed = true;
    return { ...student, classroomCode };
  });
  if (changed) saveState();
  return changed;
}

function parseDate(date) {
  const [year, month, day] = String(date || today()).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dateToDayNumber(date) {
  return Math.round(parseDate(date).getTime() / 86400000);
}

function getWeekdayIndex(date) {
  return parseDate(date).getDay();
}

function getWeekdayLabel(index) {
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][Number(index)] || "요일";
}

function syncAttendanceWeekdayToDate() {
  const weekdaySelect = $("#attendanceWeekday");
  const dateInput = $("#attendanceDate");
  if (!weekdaySelect || !dateInput) return;
  weekdaySelect.value = String(getWeekdayIndex(dateInput.value));
}

function getSelectedAttendanceWeekday() {
  const value = $("#attendanceWeekday")?.value;
  return value === undefined || value === "" ? getWeekdayIndex($("#attendanceDate")?.value) : Number(value);
}

function getAttendanceCycleAnchor(className, weekday) {
  return state.attendanceCycleAnchors?.[className]?.[weekday];
}

function saveAttendanceCycleAnchor(className, weekday, date, session, overwrite = true) {
  if (!className || !date) return;
  state.attendanceCycleAnchors = state.attendanceCycleAnchors || {};
  state.attendanceCycleAnchors[className] = state.attendanceCycleAnchors[className] || {};
  const key = String(weekday);
  if (!overwrite && state.attendanceCycleAnchors[className][key]) return;
  state.attendanceCycleAnchors[className][key] = {
    date,
    session: Number(session || 1),
    updatedAt: Date.now(),
  };
}

function getCycleSessionFromAnchor(anchor, date) {
  const diffDays = dateToDayNumber(date) - dateToDayNumber(anchor.date);
  const weekOffset = Math.floor(diffDays / 7);
  const zeroBased = ((Number(anchor.session || 1) - 1 + weekOffset) % 4 + 4) % 4;
  return zeroBased + 1;
}

function classOptions(includeAll = false) {
  const options = includeAll ? ['<option value="전체">전체 반</option>'] : [];
  return options.concat(classes.map((item) => `<option value="${item.name}">${item.name}</option>`)).join("");
}

function isSpecialClassName(className) {
  const classInfo = getClassInfo(className);
  return classInfo?.type === "방학특강" || String(className || "").includes("특강") || String(className || "").includes("방학");
}

function regularClassOptions(includeEmpty = true) {
  const options = includeEmpty ? ['<option value="">정규반 없음</option>'] : [];
  return options.concat(classes.filter((item) => !isSpecialClassName(item.name)).map((item) => `<option value="${item.name}">${item.name}</option>`)).join("");
}

function getStudentClassNames(student) {
  return [...new Set([student.className, ...(student.specialClassNames || [])].filter(Boolean))];
}

function studentBelongsToClass(student, className) {
  return className === "전체" || getStudentClassNames(student).includes(className);
}

function formatStudentClasses(student) {
  const regular = student.className && !isSpecialClassName(student.className) ? student.className : "정규반 없음";
  const specials = [...new Set([...(student.specialClassNames || []), ...(isSpecialClassName(student.className) ? [student.className] : [])])];
  return `<div class="class-stack"><strong>${regular}</strong>${specials.map((name) => `<span class="special-class-label">특강 · ${name}</span>`).join("")}</div>`;
}

function renderSpecialClassChecks(selected = []) {
  const selectedSet = new Set(selected || []);
  const specialClasses = classes.filter((item) => isSpecialClassName(item.name));
  $("#specialClassChecks").innerHTML = specialClasses.length
    ? specialClasses.map((item) => `<label><input type="checkbox" value="${item.name}" ${selectedSet.has(item.name) ? "checked" : ""} />${item.name}</label>`).join("")
    : `<span class="muted-text">반관리에서 특강반을 만들면 여기에 표시됩니다.</span>`;
}

function classEditOptions() {
  return ['<option value="">+ 새 반 만들기</option>'].concat(classes.map((item) => `<option value="${item.name}">${item.name}</option>`)).join("");
}

function setup() {
  if (setup.hasRun) return;
  setup.hasRun = true;
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  $("#attendanceDate").value = today();
  syncAttendanceWeekdayToDate();
  $("#paymentMonth").value = currentMonth();
  $("#consultingDate").value = today();
  $("#consultingClass").innerHTML = classOptions(true);
  $("#classroomPostLessonDateInput").value = today();
  $("#scheduleDateInput").value = today();
  $("#leadDate").value = today();
  $("#waitDate").value = today();
  $("#classHomeworkDate").value = today();
  $("#scoreExamDate").value = today();
  $("#scoreExamClass").innerHTML = classOptions();
  $("#classFilter").innerHTML = classOptions(true);
  $("#attendanceClass").innerHTML = classOptions();
  $("#homeworkClass").innerHTML = classOptions(true);
  $("#classInput").innerHTML = regularClassOptions();
  $("#waitClass").innerHTML = classOptions();
  $("#waitNextClass").innerHTML = classOptions();
  renderSpecialClassChecks();
  $("#classEditSelect").innerHTML = classEditOptions();
  $("#classSubjectInput").innerHTML = subjectChoices.map((subject) => `<option>${subject}</option>`).join("");
  fillClassEditForm();
  syncAttendanceRoundControl();
  renderClassroomStudentOptions();
  renderYoutubeLinkRows([]);

  bindEvents();
  renderAll();
  syncStateFromServer();
}

function bindEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view, button.textContent));
  });

  $$("[data-open-student]").forEach((button) => {
    button.addEventListener("click", () => openStudentDialog());
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => $("#studentDialog").close());
  });

  $("#classInput").addEventListener("change", fillClassDefaults);
  $("#studentSearch").addEventListener("input", renderStudents);
  $("#classFilter").addEventListener("change", renderStudents);
  $("#statusFilter").addEventListener("change", renderStudents);
  $("#waitAutoAdvance").addEventListener("change", syncWaitAutoAdvanceFields);
  $("#waitGrade").addEventListener("change", suggestWaitNextClass);
  $("#waitClass").addEventListener("change", suggestWaitNextClass);
  $$('[data-student-list]').forEach((button) => {
    button.addEventListener("click", () => selectStudentList(button.dataset.studentList));
  });
  $$('[data-student-sort]').forEach((button) => {
    button.addEventListener("click", () => selectStudentSort(button.dataset.studentSort));
  });
  $("#finishSpecialClassBtn").addEventListener("click", finishSelectedSpecialClass);
  $("#attendanceDate").addEventListener("change", () => {
    syncAttendanceWeekdayToDate();
    renderAttendance();
  });
  $("#attendanceClass").addEventListener("change", renderAttendance);
  $("#attendanceWeekday").addEventListener("change", renderAttendance);
  $("#attendanceRound").addEventListener("change", saveAttendanceSession);
  $("#paymentMonth").addEventListener("change", renderPayments);
  $("#paymentClassFilter").addEventListener("change", () => selectPaymentClass($("#paymentClassFilter").value));
  $$("[data-payment-filter]").forEach((button) => {
    button.addEventListener("click", () => selectPaymentFilter(button.dataset.paymentFilter));
  });
  $("#homeworkClass").addEventListener("change", renderHomework);
  $("#classEditSelect").addEventListener("change", fillClassEditForm);
  $("#newClassBtn").addEventListener("click", startNewClassForm);
  $("#saveClassInfoBtn").addEventListener("click", saveClassInfoFromForm);
  $("#deleteClassInfoBtn").addEventListener("click", deleteClassInfoFromForm);
  $("#saveClassHomeworkBtn").addEventListener("click", saveClassHomework);
  $("#copyClassHomeworkBtn").addEventListener("click", copyClassHomeworkMessage);
  $("#aiReportStudent").addEventListener("change", fillAiReportDefaults);
  $("#aiReportTemplate").addEventListener("change", (event) => {
    event.currentTarget.dataset.touched = "true";
    fillAiReportDefaults();
  });
  $("#generateAiReportBtn").addEventListener("click", generateAiReport);
  $("#copyAiReportBtn").addEventListener("click", copyAiReport);
  $("#downloadAiReportBtn").addEventListener("click", downloadAiReport);
  $("#consultingStudent").addEventListener("change", renderConsulting);
  $("#consultingClass").addEventListener("change", () => { renderConsultingStudentOptions(); renderConsulting(); });
  $("#addConsultingBtn").addEventListener("click", addConsultingRecord);
  $("#addLeadBtn").addEventListener("click", addNewConsultation);
  $("#saveWaitBtn").addEventListener("click", saveWaitlistFromForm);
  $("#clearWaitBtn").addEventListener("click", clearWaitlistForm);
  $("#saveClassroomBtn").addEventListener("click", saveClassroomFromForm);
  $("#clearClassroomBtn").addEventListener("click", clearClassroomForm);
  $("#classroomGradeSelect").addEventListener("change", () => renderClassroomMemberChecks());
  $("#classroomVisibleGradeAll").addEventListener("change", (event) => setVisibleClassroomMembers(event.target.checked));
  $("#clearAllMembersBtn").addEventListener("click", clearAllClassroomMembers);
  $("#saveClassroomPostBtn").addEventListener("click", saveClassroomPostFromForm);
  $("#clearClassroomPostBtn").addEventListener("click", clearClassroomPostForm);
  $("#addYoutubeLinkBtn").addEventListener("click", () => addYoutubeLinkRow());
  $("#postClassroomSelect").addEventListener("change", renderAdminClassroomPosts);
  $("#studentRoomLoginBtn").addEventListener("click", loginStudentRoom);
  $("#studentRoomLogoutBtn").addEventListener("click", logoutStudentRoom);
  $("#exportOnlineClassroomBtn").addEventListener("click", exportOnlineClassroom);
  $("#bulkStudentAccountsBtn").addEventListener("click", provisionAllStudentAccounts);
  $("#scoreExamType").addEventListener("change", () => { syncScoreExamForm(); renderScoreStudentInputs(); });
  $("#scoreExamClass").addEventListener("change", renderScoreStudentInputs);
  $("#scoreExamTotalQuestions").addEventListener("input", updateAcademyScorePreviews);
  $("#saveScoreExamBtn").addEventListener("click", saveScoreExam);
  $("#clearScoreExamBtn").addEventListener("click", clearScoreExamForm);
  $("#closeScoreRankingBtn").addEventListener("click", () => $("#scoreRankingDialog").close());
  $("#closeMemberDialogBtn").addEventListener("click", () => $("#memberDialog").close());
  $("#calendarPrevBtn").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderScheduleCalendar(); });
  $("#calendarNextBtn").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderScheduleCalendar(); });
  $("#calendarTodayBtn").addEventListener("click", () => { calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectScheduleDate(today()); });
  $("#addScheduleBtn").addEventListener("click", addScheduleEvent);

  $("#studentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveStudentFromForm();
  });

  $$("[data-export-data]").forEach((button) => button.addEventListener("click", exportData));
  $$(".import-data-input").forEach((input) => input.addEventListener("change", importData));
}

function switchView(viewId, label) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $("#pageTitle").textContent = label;
}

function navigateToView(viewId) {
  const navItem = $(`.nav-item[data-view="${viewId}"]`);
  switchView(viewId, navItem?.textContent || "대시보드");
}

function renderAll() {
  renderSchoolOptions();
  renderDashboard();
  renderScheduleCalendar();
  renderClasses();
  renderStudents();
  renderAttendance();
  renderPaymentClassButtons();
  renderPayments();
  renderBooks();
  renderHomework();
  renderAiReportStudentOptions();
  renderConsultingStudentOptions();
  renderConsulting();
  renderNewConsultations();
  renderWaitlist();
  renderClassroomStudentOptions();
  renderClassrooms();
  renderStudentClassroomView();
  renderScoreExams();
}

function scoreEscape(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char]));
}

function scoreStudentsForClass(className) {
  return (state.students || [])
    .filter((student) => student.status === "재원" && studentBelongsToClass(student, className))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
}

function scorePercent(exam, result) {
  if (exam.type === "academy") {
    const total = Number(exam.totalQuestions) || 0;
    return total ? Math.round((Number(result.correctCount) / total) * 1000) / 10 : 0;
  }
  return Math.max(0, Math.min(100, Number(result.score) || 0));
}

function syncScoreExamForm() {
  const academy = $("#scoreExamType").value === "academy";
  $("#scoreTotalQuestionsWrap").hidden = !academy;
}

function renderScoreStudentInputs(existingResults = null) {
  const container = $("#scoreStudentInputs");
  if (!container) return;
  const type = $("#scoreExamType").value;
  const students = scoreStudentsForClass($("#scoreExamClass").value);
  const stored = existingResults || [];
  if (!students.length) {
    container.innerHTML = '<p class="empty-state">선택한 반의 재원생이 없습니다.</p>';
    return;
  }
  container.innerHTML = students.map((student) => {
    const result = stored.find((item) => item.studentId === student.id) || {};
    const value = type === "academy" ? (result.correctCount ?? "") : (result.score ?? "");
    return `<label class="score-student-row"><strong>${scoreEscape(student.name)}</strong><span>${scoreEscape(student.grade || "")} · ${scoreEscape(student.school || "")}</span><input class="score-value-input" data-student-id="${scoreEscape(student.id)}" type="number" min="0" step="${type === "academy" ? "1" : "0.1"}" value="${scoreEscape(value)}" placeholder="${type === "academy" ? "맞힌 개수" : "점수"}"><em class="score-converted"></em></label>`;
  }).join("");
  Array.from(container.querySelectorAll(".score-value-input")).forEach((input) => input.addEventListener("input", updateAcademyScorePreviews));
  updateAcademyScorePreviews();
}

function updateAcademyScorePreviews() {
  const academy = $("#scoreExamType")?.value === "academy";
  const total = Number($("#scoreExamTotalQuestions")?.value) || 0;
  Array.from($("#scoreStudentInputs").querySelectorAll(".score-student-row")).forEach((row) => {
    const value = Number(row.querySelector("input").value);
    const preview = row.querySelector(".score-converted");
    preview.textContent = academy && total && Number.isFinite(value) ? `${value}/${total} · ${Math.round(value / total * 1000) / 10}점` : "";
  });
}

function clearScoreExamForm() {
  $("#scoreExamId").value = "";
  $("#scoreExamType").value = "school";
  $("#scoreExamDate").value = today();
  $("#scoreExamTitle").value = "";
  $("#scoreExamSubject").value = "";
  $("#scoreExamTotalQuestions").value = "";
  syncScoreExamForm();
  renderScoreStudentInputs();
}

function saveScoreExam() {
  const type = $("#scoreExamType").value;
  const title = $("#scoreExamTitle").value.trim();
  const className = $("#scoreExamClass").value;
  const totalQuestions = Number($("#scoreExamTotalQuestions").value);
  if (!title || !className) return alert("시험명과 반을 입력해주세요.");
  if (type === "academy" && (!Number.isInteger(totalQuestions) || totalQuestions < 1)) return alert("학원내 시험의 전체 문항 수를 입력해주세요.");
  const results = Array.from($("#scoreStudentInputs").querySelectorAll(".score-value-input")).filter((input) => input.value !== "").map((input) => {
    const value = Number(input.value);
    return type === "academy" ? { studentId: input.dataset.studentId, correctCount: value } : { studentId: input.dataset.studentId, score: value };
  });
  if (!results.length) return alert("학생 한 명 이상의 성적을 입력해주세요.");
  if (type === "school" && results.some((item) => item.score < 0 || item.score > 100)) return alert("학교 시험 점수는 0점부터 100점까지 입력해주세요.");
  if (type === "academy" && results.some((item) => item.correctCount < 0 || item.correctCount > totalQuestions || !Number.isInteger(item.correctCount))) return alert(`맞힌 개수는 0개부터 ${totalQuestions}개까지 정수로 입력해주세요.`);
  const id = $("#scoreExamId").value || crypto.randomUUID();
  const old = (state.scoreExams || []).find((exam) => exam.id === id);
  const exam = { id, type, title, date: $("#scoreExamDate").value || today(), className, subject: $("#scoreExamSubject").value.trim(), totalQuestions: type === "academy" ? totalQuestions : null, results, createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  state.scoreExams = [...(state.scoreExams || []).filter((item) => item.id !== id), exam];
  saveState();
  renderScoreExams();
  clearScoreExamForm();
  alert("시험 성적을 저장했습니다.");
}

function scoreResultName(result) {
  return (state.students || []).find((student) => student.id === result.studentId)?.name || "학생";
}

function renderScoreExamCard(exam) {
  const sorted = [...(exam.results || [])].sort((a, b) => scorePercent(exam, b) - scorePercent(exam, a));
  const average = sorted.length ? Math.round(sorted.reduce((sum, result) => sum + scorePercent(exam, result), 0) / sorted.length * 10) / 10 : 0;
  const bars = exam.type === "school" ? `<div class="score-mini-chart">${sorted.slice(0, 8).map((result) => { const percent = scorePercent(exam, result); return `<div><span>${scoreEscape(scoreResultName(result))}</span><i><b style="width:${percent}%"></b></i><strong>${percent}점</strong></div>`; }).join("")}</div>` : `<div class="score-academy-summary">${sorted.slice(0, 5).map((result) => `<span>${scoreEscape(scoreResultName(result))} ${result.correctCount}/${exam.totalQuestions} · ${scorePercent(exam, result)}점</span>`).join("")}</div>`;
  return `<article class="score-exam-card" onclick="openScoreRanking('${exam.id}')"><div class="score-card-heading"><div><small>${scoreEscape(exam.date)} · ${scoreEscape(exam.className)}${exam.subject ? ` · ${scoreEscape(exam.subject)}` : ""}</small><h3>${scoreEscape(exam.title)}</h3></div><strong>평균 ${average}점</strong></div>${bars}<div class="score-card-actions"><button type="button" onclick="event.stopPropagation(); editScoreExam('${exam.id}')">수정</button><button type="button" class="danger-text" onclick="event.stopPropagation(); deleteScoreExam('${exam.id}')">삭제</button><span>눌러서 전체 순위 보기</span></div></article>`;
}

function renderScoreExams() {
  if (!$("#schoolExamList")) return;
  const exams = [...(state.scoreExams || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  ["school", "academy"].forEach((type) => {
    const target = type === "school" ? $("#schoolExamList") : $("#academyExamList");
    const items = exams.filter((exam) => exam.type === type);
    target.innerHTML = items.length ? items.map(renderScoreExamCard).join("") : '<p class="empty-state">아직 저장한 시험이 없습니다.</p>';
  });
}

function editScoreExam(id) {
  const exam = (state.scoreExams || []).find((item) => item.id === id);
  if (!exam) return;
  $("#scoreExamId").value = exam.id;
  $("#scoreExamType").value = exam.type;
  $("#scoreExamDate").value = exam.date;
  $("#scoreExamTitle").value = exam.title;
  $("#scoreExamClass").value = exam.className;
  $("#scoreExamSubject").value = exam.subject || "";
  $("#scoreExamTotalQuestions").value = exam.totalQuestions || "";
  syncScoreExamForm();
  renderScoreStudentInputs(exam.results || []);
  $("#scores").scrollIntoView({ behavior: "smooth" });
}

function deleteScoreExam(id) {
  const exam = (state.scoreExams || []).find((item) => item.id === id);
  if (!exam || !confirm(`${exam.title} 시험 기록을 삭제할까요?`)) return;
  state.scoreExams = state.scoreExams.filter((item) => item.id !== id);
  saveState();
  renderScoreExams();
}

function openScoreRanking(id) {
  const exam = (state.scoreExams || []).find((item) => item.id === id);
  if (!exam) return;
  const sorted = [...(exam.results || [])].sort((a, b) => scorePercent(exam, b) - scorePercent(exam, a));
  $("#scoreRankingTitle").textContent = exam.title;
  $("#scoreRankingSummary").textContent = `${exam.date} · ${exam.className}${exam.subject ? ` · ${exam.subject}` : ""} · 고득점순`;
  $("#scoreRankingList").innerHTML = `<div class="score-ranking-list">${sorted.map((result, index) => `<div><b>${index + 1}</b><strong>${scoreEscape(scoreResultName(result))}</strong><span>${exam.type === "academy" ? `${result.correctCount}/${exam.totalQuestions}개 정답` : "학교 시험"}</span><em>${scorePercent(exam, result)}점</em></div>`).join("")}</div>`;
  $("#scoreRankingDialog").showModal();
}

function getSavedSchoolNames() {
  const names = [
    ...(state.students || []).map((student) => student.school),
    ...(state.newConsultations || []).map((record) => record.school),
    ...(state.waitlist || []).map((record) => record.school),
  ];
  return [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}

function renderSchoolOptions() {
  const list = $("#schoolOptions");
  if (!list) return;
  list.textContent = "";
  getSavedSchoolNames().forEach((school) => {
    const option = document.createElement("option");
    option.value = school;
    list.appendChild(option);
  });
}

function renderDashboard() {
  const unpaid = state.students.filter((student) => getPayment(student.id).status !== "납부완료").length;
  $("#totalStudents").textContent = state.students.length;
  $("#unpaidCount").textContent = unpaid;

  const weekday = "일월화수목금토"[new Date().getDay()];
  const todayClassItems = classes.filter((item) => getClassWeekdays(item).includes(weekday));
  $("#todayClasses").innerHTML = todayClassItems.length ? todayClassItems
    .map((item) => {
      const count = state.students.filter((student) => studentBelongsToClass(student, item.name)).length;
      return `
        <article class="class-card">
          <div>
            <button class="link-name-button" type="button" onclick="openDashboardAttendance('${item.name}')">${item.name}</button>
            <small>${item.time} · ${item.frequency} · ${item.defaultBook}</small>
          </div>
          <span class="badge">${count}명</span>
        </article>
      `;
    })
    .join("") : `<div class="empty-state">오늘 예정된 정규 수업이 없습니다.</div>`;

  const recent = [...state.students].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  $("#recentStudents").innerHTML = recent.length
    ? recent
        .map(
          (student) => `
            <tr>
              <td><button class="table-link-button" type="button" onclick="openStudentDialog('${student.id}')">${student.name}</button></td>
              <td>${getStudentClassNames(student).join(", ") || "-"}</td>
              <td>${student.school || "-"} / ${student.grade || "-"}</td>
              <td><span class="badge">${student.status}</span></td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="4">아직 등록된 학생이 없습니다.</td></tr>`;
}

function getClassWeekdays(item) {
  return [...new Set(String(item?.time || "").match(/[월화수목금토일]/g) || [])];
}

function dateKey(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderScheduleCalendar() {
  const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
  $("#calendarMonthLabel").textContent = `${year}년 ${month + 1}월`;
  const first = new Date(year, month, 1), lastDate = new Date(year, month + 1, 0).getDate();
  const cells = ["일", "월", "화", "수", "목", "금", "토"].map((day) => `<div class="calendar-weekday">${day}</div>`);
  for (let i = 0; i < first.getDay(); i += 1) cells.push(`<div class="calendar-day outside"></div>`);
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month, day), key = dateKey(date), weekday = "일월화수목금토"[date.getDay()];
    const classItems = classes.filter((item) => getClassWeekdays(item).includes(weekday));
    const events = state.scheduleEvents.filter((item) => item.date === key);
    cells.push(`<button class="calendar-day ${key === today() ? "today" : ""} ${key === selectedScheduleDate ? "selected" : ""}" type="button" onclick="selectScheduleDate('${key}')"><span>${day}</span>${classItems.slice(0, 2).map((item) => `<small class="calendar-class">${item.name}</small>`).join("")}${events.slice(0, 2).map((item) => `<small class="calendar-event">${item.title}</small>`).join("")}${classItems.length + events.length > 4 ? `<small>+${classItems.length + events.length - 4}</small>` : ""}</button>`);
  }
  $("#academyCalendar").innerHTML = cells.join("");
  renderScheduleAgenda();
}

function selectScheduleDate(value) {
  selectedScheduleDate = value;
  $("#scheduleDateInput").value = value;
  const date = new Date(`${value}T00:00:00`);
  calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  renderScheduleCalendar();
}

function addScheduleEvent() {
  const date = $("#scheduleDateInput").value, title = $("#scheduleTitleInput").value.trim();
  if (!date || !title) return alert("일자와 일정명을 입력해주세요.");
  state.scheduleEvents.push({ id: crypto.randomUUID(), date, type: $("#scheduleTypeInput").value, title, memo: $("#scheduleMemoInput").value.trim(), createdAt: Date.now() });
  $("#scheduleTitleInput").value = ""; $("#scheduleMemoInput").value = ""; selectedScheduleDate = date;
  saveState(); renderScheduleCalendar();
}

function deleteScheduleEvent(id) {
  const event = state.scheduleEvents.find((item) => item.id === id);
  if (!event || !confirm(`${event.title} 일정을 삭제할까요?`)) return;
  state.scheduleEvents = state.scheduleEvents.filter((item) => item.id !== id); saveState(); renderScheduleCalendar();
}

function renderScheduleAgenda() {
  const date = new Date(`${selectedScheduleDate}T00:00:00`), weekday = "일월화수목금토"[date.getDay()];
  const classItems = classes.filter((item) => getClassWeekdays(item).includes(weekday));
  const events = state.scheduleEvents.filter((item) => item.date === selectedScheduleDate);
  $("#scheduleAgenda").innerHTML = `<h3>${selectedScheduleDate} 일정</h3>` + (classItems.map((item) => `<article><span class="badge">수업</span><strong>${item.name}</strong><small>${item.time}</small></article>`).join("") + events.map((item) => `<article><span class="badge orange">${item.type}</span><strong>${item.title}</strong><small>${item.memo || ""}</small><button class="mini-button danger" type="button" onclick="deleteScheduleEvent('${item.id}')">삭제</button></article>`).join("") || `<div class="empty-state">등록된 일정이 없습니다.</div>`);
}

function openDashboardStudents() {
  navigateToView("students");
}

function openDashboardClasses() {
  navigateToView("classes");
}

function openDashboardPayments() {
  selectedPaymentClass = "전체";
  selectedPaymentFilter = "미납자";
  navigateToView("payments");
  renderPayments();
}

function openDashboardAttendance(className) {
  $("#attendanceClass").value = className;
  navigateToView("attendance");
  renderAttendance();
}

function renderClasses() {
  $("#regularClassList").innerHTML = renderClassCards("정규반");
  $("#specialClassList").innerHTML = renderClassCards("방학특강");
}

function fillClassEditForm() {
  const className = $("#classEditSelect").value;
  if (!className) {
    startNewClassForm(false);
    return;
  }
  const classInfo = getClassInfo(className);
  if (!classInfo) return;
  $("#classEditSelect").value = classInfo.name;
  $("#classNameInput").value = classInfo.name;
  $("#classNameInput").readOnly = true;
  $("#classTypeInput").value = classInfo.type || "정규반";
  $("#classTimeInput").value = classInfo.time || "";
  $("#classFrequencyInput").value = classInfo.frequency || "";
  $("#classSubjectInput").value = classInfo.subject || subjectChoices[0];
  $("#classBookInput").value = classInfo.defaultBook || "";
  $("#classTuitionInput").value = classInfo.tuition || "";
  $("#deleteClassInfoBtn").disabled = !isCustomClass(classInfo.name);
}

function startNewClassForm(clearSelect = true) {
  if (clearSelect) $("#classEditSelect").value = "";
  $("#classNameInput").value = "";
  $("#classNameInput").readOnly = false;
  $("#classTypeInput").value = "정규반";
  $("#classTimeInput").value = "";
  $("#classFrequencyInput").value = "주 1회";
  $("#classSubjectInput").value = "교과과학";
  $("#classBookInput").value = "";
  $("#classTuitionInput").value = "";
  $("#deleteClassInfoBtn").disabled = true;
  $("#classNameInput").focus();
}

function saveClassInfoFromForm() {
  const selectedClassName = $("#classEditSelect").value;
  const className = (selectedClassName || $("#classNameInput").value).trim();
  const current = selectedClassName ? getClassInfo(selectedClassName) : null;
  if (!className) {
    alert("반 이름을 입력해주세요.");
    return;
  }
  if (!current && classes.some((classInfo) => classInfo.name === className)) {
    alert("이미 같은 이름의 반이 있습니다.");
    return;
  }
  const savedClassInfo = {
    name: className,
    type: $("#classTypeInput").value || current?.type || "정규반",
    time: $("#classTimeInput").value.trim() || current?.time || "",
    frequency: $("#classFrequencyInput").value.trim() || current?.frequency || "주 1회",
    subject: $("#classSubjectInput").value || current?.subject || "교과과학",
    defaultBook: $("#classBookInput").value.trim() || current?.defaultBook || "",
    tuition: Number($("#classTuitionInput").value || current?.tuition || 0),
    custom: !defaultClasses.some((classInfo) => classInfo.name === className),
    createdAt: current?.createdAt || Date.now(),
  };
  if (savedClassInfo.custom) {
    state.customClasses = normalizeCustomClasses([...(state.customClasses || []).filter((item) => item.name !== className), savedClassInfo]);
  }
  state.classSettings = state.classSettings || {};
  state.classSettings[className] = {
    time: savedClassInfo.time,
    frequency: savedClassInfo.frequency,
    subject: savedClassInfo.subject,
    defaultBook: savedClassInfo.defaultBook,
    tuition: savedClassInfo.tuition,
  };
  state.classSettings = normalizeClassSettings(state.classSettings, state.customClasses);
  applyClassSettings();
  saveState();
  refreshClassControls();
  $("#classEditSelect").value = className;
  fillClassEditForm();
  renderAll();
  alert(`${className} 반 정보를 저장했습니다.`);
}

function selectClassForEdit(className) {
  $("#classEditSelect").value = className;
  fillClassEditForm();
  $("#classTimeInput").focus();
}

function isCustomClass(className) {
  return (state.customClasses || []).some((classInfo) => classInfo.name === className);
}

function deleteClassInfoFromForm() {
  const className = $("#classEditSelect").value;
  if (!className || !isCustomClass(className)) {
    alert("기본 반은 삭제할 수 없고, 새로 만든 반만 삭제할 수 있습니다.");
    return;
  }
  const studentCount = state.students.filter((student) => studentBelongsToClass(student, className)).length;
  if (studentCount > 0) {
    alert(`${className}에 학생 ${studentCount}명이 연결되어 있어 삭제할 수 없습니다. 학생의 수강반을 먼저 바꿔주세요.`);
    return;
  }
  const waitlistCount = (state.waitlist || []).filter((record) => {
    const projection = getWaitlistProjection(record);
    return record.className === className || record.nextYearClassName === className || projection.className === className;
  }).length;
  if (waitlistCount > 0) {
    alert(`${className}에 대기자 ${waitlistCount}명이 연결되어 있어 삭제할 수 없습니다. 대기자 명단에서 새 반으로 먼저 연결해주세요.`);
    return;
  }
  if (!confirm(`${className} 반을 삭제할까요?`)) return;
  state.customClasses = (state.customClasses || []).filter((classInfo) => classInfo.name !== className);
  if (state.classSettings) delete state.classSettings[className];
  applyClassSettings();
  saveState();
  refreshClassControls();
  startNewClassForm();
  renderAll();
}

function refreshClassControls() {
  const previous = {
    classFilter: $("#classFilter")?.value,
    attendanceClass: $("#attendanceClass")?.value,
    homeworkClass: $("#homeworkClass")?.value,
    classInput: $("#classInput")?.value,
    waitClass: $("#waitClass")?.value,
    waitNextClass: $("#waitNextClass")?.value,
    classEditSelect: $("#classEditSelect")?.value,
  };

  $("#classFilter").innerHTML = classOptions(true);
  $("#attendanceClass").innerHTML = classOptions();
  $("#homeworkClass").innerHTML = classOptions(true);
  $("#classInput").innerHTML = regularClassOptions();
  $("#waitClass").innerHTML = classOptions();
  $("#waitNextClass").innerHTML = classOptions();
  $("#classEditSelect").innerHTML = classEditOptions();

  Object.entries(previous).forEach(([id, value]) => {
    const input = $(`#${id}`);
    if (input && (classes.some((classInfo) => classInfo.name === value) || value === "전체")) {
      input.value = value;
    }
  });
}

function renderClassCards(type) {
  return classes
    .filter((item) => item.type === type)
    .map((item) => {
      const count = state.students.filter((student) => studentBelongsToClass(student, item.name)).length;
      return `
        <article class="class-card">
          <div>
            <button class="link-name-button" type="button" onclick="openClassStudentList('${item.name}')">${item.name}</button>
            <small>${item.time} · ${item.frequency} · ${item.subject} · ${item.defaultBook} · ${formatMoney(item.tuition)}</small>
          </div>
          <div class="class-card-actions">
            <span class="badge ${type === "방학특강" ? "orange" : ""}">${count}명</span>
            <button class="mini-button" type="button" onclick="selectClassForEdit('${item.name}')">수정</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function openClassStudentList(className) {
  const students = sortStudentsByGradeName(state.students.filter((student) => studentBelongsToClass(student, className)));
  openMemberDialog(`${className} 학생 명단`, students);
}

function openClassroomStudentList(roomId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  if (!room) return;
  const ids = new Set(room.memberStudentIds || []);
  const students = sortStudentsByGradeName(state.students.filter((student) => ids.has(student.id)));
  openMemberDialog(`${room.name} 수업방 학생 명단`, students);
}

function openMemberDialog(title, students) {
  ensureStudentClassroomCodes();
  memberDialogStudents = students;
  $("#memberDialogTitle").textContent = title;
  $("#memberDialogCount").textContent = `${students.length}명`;
  $("#memberDialogTable").innerHTML = students.length
    ? students
        .map(
          (student) => `
            <tr>
              <td><strong>${student.name}</strong></td>
              <td>${student.school || "-"}<br>${student.grade || "-"}</td>
              <td>${student.className || "-"}</td>
              <td><strong>${student.loginId || "미발급"}</strong></td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="4">연결된 학생이 없습니다.</td></tr>`;
  $("#memberDialog").showModal();
}

async function copyMemberDialogCodes() {
  if (!memberDialogStudents.length) return;
  const message = memberDialogStudents.map((student) => `${student.name}: ${student.classroomCode}`).join("\n");
  try {
    await navigator.clipboard.writeText(message);
    alert("학생 코드 명단을 복사했습니다.");
  } catch (error) {
    prompt("아래 내용을 복사해서 보내세요.", message);
  }
}

function filteredStudents() {
  const keyword = $("#studentSearch").value.trim().toLowerCase();
  const className = $("#classFilter").value;
  const status = $("#statusFilter").value;

  return state.students.filter((student) => {
    const searchable = `${student.name} ${student.school} ${student.grade} ${getStudentClassNames(student).join(" ")} ${student.book} ${student.homework}`.toLowerCase();
    const matchesKeyword = !keyword || searchable.includes(keyword);
    const matchesClass = studentBelongsToClass(student, className);
    const matchesList = selectedStudentList === "retired"
      ? student.status === "퇴원"
      : selectedStudentList === "paused"
        ? student.status === "휴원"
        : !["퇴원", "휴원"].includes(student.status);
    const matchesStatus = selectedStudentList !== "active" || status === "전체" || student.status === status;
    return matchesKeyword && matchesClass && matchesStatus && matchesList;
  });
}

function selectStudentList(list) {
  selectedStudentList = ["active", "paused", "retired"].includes(list) ? list : "active";
  $$('[data-student-list]').forEach((button) => button.classList.toggle("active", button.dataset.studentList === selectedStudentList));
  $("#statusFilter").disabled = selectedStudentList !== "active";
  if (selectedStudentList !== "active") $("#statusFilter").value = "전체";
  renderStudents();
}

function selectStudentSort(sort) {
  selectedStudentSort = sort === "newest" ? "newest" : "oldest";
  $$('[data-student-sort]').forEach((button) => button.classList.toggle("active", button.dataset.studentSort === selectedStudentSort));
  renderStudents();
}

function sortStudentsByRegistration(students) {
  return [...students].sort((a, b) => {
    const aCreated = Number(a.createdAt || 0);
    const bCreated = Number(b.createdAt || 0);
    const dateDiff = selectedStudentSort === "newest" ? bCreated - aCreated : aCreated - bCreated;
    if (dateDiff) return dateDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function syncFinishSpecialClassButton() {
  const className = $("#classFilter").value;
  const classInfo = getClassInfo(className);
  const isSpecial = className !== "전체" && (classInfo?.type === "방학특강" || className.includes("특강") || className.includes("방학"));
  const button = $("#finishSpecialClassBtn");
  button.hidden = selectedStudentList !== "active" || !isSpecial;
  if (isSpecial) button.textContent = `${className} 특강 종료 처리`;
}

function finishSelectedSpecialClass() {
  const className = $("#classFilter").value;
  const targets = filteredStudents().filter((student) => student.status !== "퇴원");
  if (!targets.length) {
    alert("퇴원 처리할 학생이 없습니다.");
    return;
  }
  const keepActiveCount = targets.filter((student) => getStudentClassNames(student).some((name) => name !== className)).length;
  const retireCount = targets.length - keepActiveCount;
  if (!confirm(`${className} 특강 종료를 처리할까요?\n\n· 정규반이나 다른 반이 있는 학생 ${keepActiveCount}명: 이 특강만 제거\n· 이 특강만 듣는 학생 ${retireCount}명: 퇴원생 명단으로 이동\n\n과거 출석·납부·상담 기록은 삭제되지 않습니다.`)) return;
  const targetIds = new Set(targets.map((student) => student.id));
  state.students = state.students.map((student) => {
    if (!targetIds.has(student.id)) return student;
    const nextRegularClass = student.className === className ? "" : student.className;
    const nextSpecialClasses = (student.specialClassNames || []).filter((name) => name !== className);
    const hasOtherClass = [nextRegularClass, ...nextSpecialClasses].some(Boolean);
    return {
      ...student,
      className: nextRegularClass,
      specialClassNames: nextSpecialClasses,
      status: hasOtherClass ? student.status : "퇴원",
      retiredAt: hasOtherClass ? student.retiredAt : Date.now(),
      retiredReason: hasOtherClass ? student.retiredReason : `${className} 특강 종료`,
    };
  });
  saveState();
  renderAll();
  alert(`특강 종료 처리가 끝났습니다.\n정규반 유지 ${keepActiveCount}명 · 퇴원생 이동 ${retireCount}명`);
}

function renderStudents() {
  ensureStudentClassroomCodes();
  const students = sortStudentsByRegistration(filteredStudents());
  $("#studentListTitle").textContent = selectedStudentList === "retired" ? "퇴원생 목록" : selectedStudentList === "paused" ? "휴원생 목록" : "재원생 목록";
  syncFinishSpecialClassButton();
  $("#studentCountLabel").textContent = `${students.length}명`;
  $("#studentTable").innerHTML = students.length
    ? students
        .map((student) => {
          const classInfo = getClassInfo(student.className);
          return `
            <tr>
              <td><strong>${student.name}</strong><br><span class="badge">${student.status}</span></td>
              <td>${student.school || "-"}<br>${student.grade || "-"}</td>
              <td>${formatStudentClasses(student)}<span class="muted-text">${classInfo?.frequency || "-"}</span></td>
              <td>학생 ${student.studentPhone || "-"}<br>학부모 ${student.parentPhone || "-"}</td>
              <td><strong>${student.loginId || "미발급"}</strong></td>
              <td>${student.book || "-"}<br><span class="muted-text">숙제: ${getHomeworkText(student) || "없음"} / ${student.homeworkStatus || "확인 전"}</span></td>
              <td>
                <div class="row-actions">
                  ${selectedStudentList === "retired" || selectedStudentList === "paused"
                    ? `<button class="mini-button restore" type="button" onclick="restoreStudent('${student.id}')">재원생으로 복구</button>
                       ${selectedStudentList === "retired" ? `<button class="mini-button danger" type="button" onclick="permanentlyDeleteStudent('${student.id}')">영구 삭제</button>` : ""}`
                    : `<button class="mini-button" type="button" onclick="openStudentDialog('${student.id}')">수정</button>
                       <button class="mini-button" type="button" onclick="quickConsult('${student.id}')">상담</button>
                       <button class="mini-button warning" type="button" onclick="retireStudent('${student.id}')">퇴원 처리</button>`}
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7">조건에 맞는 학생이 없습니다.</td></tr>`;
}

async function copyClassroomCode(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;
  const message = String(student.classroomCode || "").trim().toUpperCase();
  try {
    await navigator.clipboard.writeText(message);
    alert(`${student.name} 학생 코드 ${message}를 복사했습니다.`);
  } catch (error) {
    prompt("아래 내용을 복사해서 보내세요.", message);
  }
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function makeUniqueLoginId(student, index, usedIds) {
  const existing = String(student.loginId || "").trim().toLowerCase();
  if (existing && !usedIds.has(existing)) {
    usedIds.add(existing);
    return existing;
  }
  let sequence = index + 1;
  let candidate = "";
  do {
    candidate = `orchard26${String(sequence).padStart(3, "0")}`;
    sequence += 1;
  } while (usedIds.has(candidate));
  usedIds.add(candidate);
  return candidate;
}

function csvValue(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadStudentCredentials(rows) {
  const headers = ["학생 이름", "학년", "수강반", "로그인 아이디", "임시 비밀번호", "수업방 코드", "학생용 주소", "발급 결과"];
  const csv = [headers, ...rows.map((row) => [row.name, row.grade, row.className, row.loginId, row.password, row.classroomCode, "https://grovescience-classroom.vercel.app/", row.status])]
    .map((row) => row.map(csvValue).join(","))
    .join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `과수원과학-학생로그인-발급명단-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function provisionAllStudentAccounts() {
  const targets = sortStudentsByGradeName(state.students.filter((student) => student.status !== "퇴원"));
  if (!targets.length) return alert("계정을 발급할 재원·휴원 학생이 없습니다.");
  if (!confirm(`재원·휴원 학생 ${targets.length}명의 로그인 아이디와 임시 비밀번호를 자동 발급할까요?\n\n이미 발급된 학생도 비밀번호가 새로 변경되며, 전달용 CSV 파일이 한 번 다운로드됩니다.`)) return;
  const { data } = await window.officeAuthClient?.auth?.getSession?.() || { data: {} };
  const accessToken = data?.session?.access_token || "";
  if (!accessToken) return alert("온라인 관리자 로그인이 필요합니다.");
  const button = $("#bulkStudentAccountsBtn");
  button.disabled = true;
  const usedIds = new Set();
  const accounts = targets.map((student, index) => ({
    student,
    loginId: makeUniqueLoginId(student, index, usedIds),
    password: generateTemporaryPassword(),
  }));
  state.students = state.students.map((student) => {
    const account = accounts.find((item) => item.student.id === student.id);
    return account ? { ...student, loginId: account.loginId } : student;
  });
  ensureStudentClassroomCodes();
  saveState();
  const results = [];
  try {
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      button.textContent = `계정 발급 중 ${index + 1}/${accounts.length}`;
      const response = await fetch("./api/student-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ studentId: account.student.id, loginId: account.loginId, password: account.password }),
      });
      const result = await response.json().catch(() => ({}));
      const current = state.students.find((student) => student.id === account.student.id) || account.student;
      results.push({
        name: current.name,
        grade: current.grade,
        className: getStudentClassNames(current).join(", "),
        loginId: account.loginId,
        password: response.ok ? account.password : "",
        classroomCode: current.classroomCode || "",
        status: response.ok ? "발급 완료" : `실패: ${result.error || response.status}`,
      });
    }
    await saveStateToServer();
    downloadStudentCredentials(results);
    renderStudents();
    const successCount = results.filter((row) => row.status === "발급 완료").length;
    alert(`학생 계정 일괄 발급이 끝났습니다.\n성공 ${successCount}명 · 실패 ${results.length - successCount}명\n\n다운로드된 발급명단 파일은 개인정보이므로 안전하게 보관해주세요.`);
  } finally {
    button.disabled = false;
    button.textContent = "학생 아이디 일괄 발급";
  }
}

function renderAttendance() {
  const className = $("#attendanceClass").value;
  const date = $("#attendanceDate").value;
  const weekday = getSelectedAttendanceWeekday();
  const students = state.students.filter((student) => studentBelongsToClass(student, className));
  const classInfo = getClassInfo(className);
  const session = getAttendanceSession(className, date, weekday);
  const anchor = getAttendanceCycleAnchor(className, weekday);
  $("#attendanceRound").value = String(session);
  $("#attendanceList").innerHTML = students.length
    ? `<div class="helper-line">${className} · ${getWeekdayLabel(weekday)} 기준입니다. 오늘 기록은 ${session}회차로 저장됩니다.${
        anchor ? ` 기준점: ${anchor.date} ${anchor.session}회차` : " 회차를 수동으로 바꾸면 이 요일 기준점으로 저장됩니다."
      }</div>` +
      students.map((student) => renderAttendanceRow(student, date)).join("")
    : `<div class="empty-state">이 반 학생이 아직 없습니다. 학생관리에서 학생을 추가하거나 기존 학생의 수강반을 ${className}(으)로 바꾸면 자동으로 나타납니다.</div>`;
}

function renderAttendanceRow(student, date) {
  const record = getAttendanceRecord(student.id, date);
  const session = record.session || getAttendanceSession($("#attendanceClass").value, date);
  const showMakeup = record.status === "결석" || record.makeupDate;
  return `
    <article class="manage-row">
      <div>
        <strong>${student.name}</strong>
        <div class="meta">${student.school || "-"} · ${student.grade || "-"} · ${session}회차 · 학부모 ${student.parentPhone || "-"}</div>
      </div>
      <div class="segmented">
        ${attendanceStates
          .map(
            (status) => `
              <button class="${record.status === status ? "active" : ""}" type="button"
                onclick="setAttendance('${student.id}', '${date}', '${status}')">${status}</button>
            `,
          )
          .join("")}
      </div>
      <label class="makeup-date ${showMakeup ? "" : "muted"}">
        <span>보강일자</span>
        <input type="date" value="${record.makeupDate || ""}" ${record.status === "결석" || record.status === "보강" ? "" : "disabled"}
          onchange="setAttendanceMakeupDate('${student.id}', '${date}', this.value)" />
      </label>
    </article>
  `;
}

function getAttendance(studentId, date) {
  return getAttendanceRecord(studentId, date).status;
}

function getAttendanceRecord(studentId, date) {
  const saved = state.attendance[date]?.[studentId];
  if (!saved) return { status: "출석", session: Number($("#attendanceRound")?.value || 1), makeupDate: "" };
  if (typeof saved === "string") return { status: saved, session: Number($("#attendanceRound")?.value || 1), makeupDate: "" };
  return {
    status: saved.status || "출석",
    session: Number(saved.session || $("#attendanceRound")?.value || 1),
    makeupDate: saved.makeupDate || "",
  };
}

function getAttendanceSession(className, date, weekday = getSelectedAttendanceWeekday()) {
  const saved = state.attendanceSessions?.[date]?.[className];
  if (saved) return Number(saved);
  const anchor = getAttendanceCycleAnchor(className, weekday);
  if (anchor) return getCycleSessionFromAnchor(anchor, date);
  const classStudentIds = new Set(state.students.filter((student) => studentBelongsToClass(student, className)).map((student) => student.id));
  const dates = Object.keys(state.attendance || {}).filter((savedDate) => {
    if (savedDate === date) return true;
    return Object.keys(state.attendance[savedDate] || {}).some((studentId) => classStudentIds.has(studentId));
  });
  if (!dates.includes(date)) dates.push(date);
  dates.sort();
  const index = Math.max(0, dates.indexOf(date));
  return (index % 4) + 1;
}

function saveAttendanceSession() {
  const className = $("#attendanceClass").value;
  const date = $("#attendanceDate").value;
  const weekday = getSelectedAttendanceWeekday();
  const session = Number($("#attendanceRound").value || 1);
  state.attendanceSessions = state.attendanceSessions || {};
  state.attendanceSessions[date] = state.attendanceSessions[date] || {};
  state.attendanceSessions[date][className] = session;
  saveAttendanceCycleAnchor(className, weekday, date, session, true);

  const students = state.students.filter((student) => studentBelongsToClass(student, className));
  students.forEach((student) => {
    const record = getAttendanceRecord(student.id, date);
    if (state.attendance[date]?.[student.id]) {
      state.attendance[date][student.id] = { ...record, session };
    }
  });
  saveState();
  renderAttendance();
}

function syncAttendanceRoundControl() {
  if (!$("#attendanceRound")) return;
  $("#attendanceRound").value = String(getAttendanceSession($("#attendanceClass").value, $("#attendanceDate").value, getSelectedAttendanceWeekday()));
}

function setAttendance(studentId, date, status) {
  const student = state.students.find((item) => item.id === studentId);
  const weekday = getSelectedAttendanceWeekday();
  const session = Number($("#attendanceRound")?.value || getAttendanceSession(student?.className || "", date, weekday));
  const previous = getAttendanceRecord(studentId, date);
  state.attendance[date] = state.attendance[date] || {};
  state.attendance[date][studentId] = {
    ...previous,
    status,
    session,
    makeupDate: status === "결석" || status === "보강" ? previous.makeupDate || "" : "",
  };
  if (student) {
    state.attendanceSessions = state.attendanceSessions || {};
    state.attendanceSessions[date] = state.attendanceSessions[date] || {};
    state.attendanceSessions[date][student.className] = session;
    saveAttendanceCycleAnchor(student.className, weekday, date, session, false);
  }
  saveState();
  renderAttendance();
}

function setAttendanceMakeupDate(studentId, date, makeupDate) {
  const previous = getAttendanceRecord(studentId, date);
  state.attendance[date] = state.attendance[date] || {};
  state.attendance[date][studentId] = { ...previous, makeupDate };
  saveState();
  renderAttendance();
}

function renderPayments() {
  const className = selectedPaymentClass;
  const students = sortStudentsByClassGradeName(state.students.filter((student) => studentBelongsToClass(student, className)));
  const filtered = filterPaymentStudents(students);
  const paidTotal = students.reduce((sum, student) => {
    const payment = getPayment(student.id);
    return payment.status === "납부완료" ? sum + getBillingTuition(student) : sum;
  }, 0);
  const paidCount = students.filter((student) => getPayment(student.id).status === "납부완료").length;
  const unpaidCount = students.length - paidCount;

  renderPaymentFilterButtons();
  renderPaymentClassButtons();
  const label = className === "전체" ? "전체 반" : className;
  $("#paymentSummary").textContent = `${label} · 전체 ${students.length}명 · 납부 ${paidCount}명 · 미납 ${unpaidCount}명 · 합계 ${formatMoney(paidTotal)}`;
  $("#paymentList").innerHTML = students.length
    ? filtered.length
      ? filtered.map(renderPaymentRow).join("")
      : `<div class="empty-state">${selectedPaymentFilter} 조건에 맞는 학생이 없습니다.</div>`
    : `<div class="empty-state">${label}에 표시할 학생이 없습니다. 학생관리에서 학생을 등록하면 이곳에 자동으로 나옵니다.</div>`;
}

function sortStudentsByClassGradeName(students) {
  return [...students].sort((a, b) => {
    const classDiff = getClassSortValue(a.className) - getClassSortValue(b.className);
    if (classDiff) return classDiff;
    const gradeDiff = getGradeSortValue(a.grade) - getGradeSortValue(b.grade);
    if (gradeDiff) return gradeDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function getClassSortValue(className) {
  const classInfo = classes.find((item) => item.name === className);
  if (!classInfo) return 9999;
  const typeOffset = classInfo.type === "방학특강" ? 500 : 0;
  const match = String(classInfo.name || "").match(/(초|중|고)\s*(\d+)/);
  if (!match) return typeOffset + classes.indexOf(classInfo);
  const schoolOffset = match[1] === "초" ? 0 : match[1] === "중" ? 100 : 200;
  return typeOffset + schoolOffset + Number(match[2]);
}

function filterPaymentStudents(students) {
  if (selectedPaymentFilter === "납부자") return students.filter((student) => getPayment(student.id).status === "납부완료");
  if (selectedPaymentFilter === "미납자") return students.filter((student) => getPayment(student.id).status !== "납부완료");
  return students;
}

function renderPaymentFilterButtons() {
  $$("[data-payment-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentFilter === selectedPaymentFilter);
  });
}

function selectPaymentFilter(filter) {
  selectedPaymentFilter = ["전체", "미납자", "납부자"].includes(filter) ? filter : "전체";
  renderPayments();
}

function renderPaymentClassButtons() {
  const select = $("#paymentClassFilter");
  if (!select) return;
  const options = [{ name: "전체", label: `전체 반 (${state.students.length}명)` }].concat(
    classes.map((classInfo) => {
      const count = state.students.filter((student) => studentBelongsToClass(student, classInfo.name)).length;
      return { name: classInfo.name, label: `${classInfo.name} (${count}명)` };
    }),
  );
  select.innerHTML = options.map((item) => `<option value="${item.name}">${item.label}</option>`).join("");
  select.value = options.some((item) => item.name === selectedPaymentClass) ? selectedPaymentClass : "전체";
  selectedPaymentClass = select.value;
}

function selectPaymentClass(className) {
  selectedPaymentClass = className || "전체";
  renderPaymentClassButtons();
  renderPayments();
}

function renderPaymentRow(student) {
  const payment = getPayment(student.id);
  const isPaid = payment.status === "납부완료";
  return `
    <article class="payment-row ${isPaid ? "paid" : ""}">
      <label class="payment-check">
        <input type="checkbox" ${isPaid ? "checked" : ""} onchange="setPaymentPaid('${student.id}', this.checked)" />
        <span></span>
      </label>
      <div class="payment-student">
        <strong>${student.name}</strong>
        <div class="meta">${student.className || "-"} · ${student.school || "-"} · ${student.grade || "-"} · 학부모 ${student.parentPhone || "-"}</div>
      </div>
      <div class="payment-money">${formatMoney(getBillingTuition(student))}</div>
      <label class="payment-date">
        <span>납부일</span>
        <input type="date" value="${payment.paidAt || ""}" ${isPaid ? "" : "disabled"} onchange="setPaymentDate('${student.id}', this.value)" />
      </label>
      <div class="payment-status">
        <strong>${isPaid ? "납부완료" : "미납"}</strong>
        <span>${isPaid ? "월별 저장됨" : "체크하면 납부완료"}</span>
      </div>
    </article>
  `;
}

function getPayment(studentId) {
  const month = $("#paymentMonth")?.value || currentMonth();
  return state.payments[month]?.[studentId] || { status: "미납" };
}

function getBillingTuition(student) {
  const classInfo = getClassInfo(student.className);
  return Number(classInfo?.tuition || student.tuition || 0);
}

function setPayment(studentId, status) {
  const month = $("#paymentMonth").value;
  const previous = state.payments[month]?.[studentId] || {};
  state.payments[month] = state.payments[month] || {};
  state.payments[month][studentId] = { ...previous, status, paidAt: status === "납부완료" ? previous.paidAt || today() : "" };
  saveState();
  renderPayments();
  renderDashboard();
}

function setPaymentPaid(studentId, checked) {
  setPayment(studentId, checked ? "납부완료" : "미납");
}

function setPaymentDate(studentId, paidAt) {
  const month = $("#paymentMonth").value;
  state.payments[month] = state.payments[month] || {};
  const previous = state.payments[month][studentId] || { status: "납부완료" };
  state.payments[month][studentId] = { ...previous, status: "납부완료", paidAt };
  saveState();
  renderPayments();
  renderDashboard();
}

function renderBooks() {
  $("#bookGrid").innerHTML = classes
    .map((classInfo) => {
      const students = state.students.filter((student) => studentBelongsToClass(student, classInfo.name));
      return `
        <article class="book-card">
          <div class="book-card-head">
            <strong>${classInfo.name}</strong>
            <span>${classInfo.frequency}</span>
          </div>
          <p>기본 교재: ${classInfo.defaultBook}</p>
          <div class="mini-list">
            ${
              students.length
                ? students.map((student) => `<button type="button" onclick="openStudentDialog('${student.id}')">${student.name} · ${student.book || classInfo.defaultBook}</button>`).join("")
                : "<em>등록 학생 없음</em>"
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHomework() {
  const className = $("#homeworkClass").value;
  const students = state.students.filter((student) => studentBelongsToClass(student, className));
  renderClassHomeworkEditor();
  $("#homeworkList").innerHTML = students.length
    ? students
        .map(
          (student) => `
            <article class="manage-row">
              <div>
                <strong>${student.name}</strong>
                <div class="meta">${getStudentClassNames(student).join(", ") || "-"} · ${getHomeworkText(student) || "숙제 입력 없음"}</div>
              </div>
              <button class="mini-button" type="button" onclick="copyHomeworkMessage('${student.id}')">숙제 안내 복사</button>
              <div class="segmented">
                ${homeworkStates
                  .map(
                    (status) => `
                      <button class="${(student.homeworkStatus || "확인 전") === status ? "active" : ""}" type="button"
                        onclick="setHomeworkStatus('${student.id}', '${status}')">${status}</button>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">숙제를 확인할 학생이 없습니다. 학생관리에서 학생을 한 번만 등록하면 이곳에도 자동으로 나옵니다.</div>`;
}

function getHomeworkText(student) {
  const selectedClass = $("#homeworkClass")?.value;
  const className = selectedClass && selectedClass !== "전체" && studentBelongsToClass(student, selectedClass) ? selectedClass : student.className;
  return student.homework || state.classHomework[className]?.text || "";
}

function getHomeworkDate(student) {
  const selectedClass = $("#homeworkClass")?.value;
  const className = selectedClass && selectedClass !== "전체" && studentBelongsToClass(student, selectedClass) ? selectedClass : student.className;
  return state.classHomework[className]?.date || "";
}

function renderClassHomeworkEditor() {
  const className = $("#homeworkClass").value;
  const isAll = className === "전체";
  const homework = state.classHomework[className] || { date: today(), text: "" };
  $("#classHomeworkDate").value = isAll ? today() : homework.date || today();
  $("#classHomeworkText").value = isAll ? "" : homework.text || "";
  $("#classHomeworkDate").disabled = isAll;
  $("#classHomeworkText").disabled = isAll;
  $("#saveClassHomeworkBtn").disabled = isAll;
  $("#copyClassHomeworkBtn").disabled = isAll;
  $("#homeworkEditorHint").textContent = isAll ? "반을 하나 선택하면 숙제를 입력할 수 있습니다." : `${className} 숙제를 한 번만 입력하세요.`;
}

function saveClassHomework() {
  const className = $("#homeworkClass").value;
  if (className === "전체") {
    alert("숙제를 저장할 반을 먼저 선택해주세요.");
    return;
  }

  state.classHomework[className] = {
    date: $("#classHomeworkDate").value || today(),
    text: $("#classHomeworkText").value.trim(),
    updatedAt: Date.now(),
  };
  saveState();
  renderHomework();
  renderStudents();
  alert(`${className} 숙제를 저장했습니다.`);
}

function setHomeworkStatus(studentId, status) {
  state.students = state.students.map((student) => (student.id === studentId ? { ...student, homeworkStatus: status } : student));
  saveState();
  renderHomework();
  renderStudents();
}

async function copyHomeworkMessage(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) return;
  const homeworkText = getHomeworkText(student);
  const homeworkDate = getHomeworkDate(student);
  const message = [
    `[과수원과학 숙제 안내]`,
    `${student.name} 학생 / ${getStudentClassNames(student).join(", ") || "반 미지정"}`,
    homeworkDate ? `숙제일자: ${homeworkDate}` : "",
    `숙제: ${homeworkText || "아직 입력된 숙제가 없습니다."}`,
    `상태: ${student.homeworkStatus || "확인 전"}`,
    `문의가 있으면 과수원과학으로 연락 주세요.`,
  ].filter(Boolean).join("\n");

  try {
    await navigator.clipboard.writeText(message);
    alert("숙제 안내문을 복사했습니다. 카톡이나 문자에 붙여넣어 보내세요.");
  } catch (error) {
    prompt("아래 내용을 복사해서 보내세요.", message);
  }
}

async function copyClassHomeworkMessage() {
  const className = $("#homeworkClass").value;
  if (className === "전체") {
    alert("숙제 안내문을 복사할 반을 먼저 선택해주세요.");
    return;
  }

  const homework = state.classHomework[className] || {};
  const message = [
    `[과수원과학 숙제 안내]`,
    `${className} 숙제입니다.`,
    homework.date ? `숙제일자: ${homework.date}` : "",
    `숙제: ${homework.text || "아직 입력된 숙제가 없습니다."}`,
    `다음 수업 전까지 준비해주세요.`,
  ].filter(Boolean).join("\n");

  try {
    await navigator.clipboard.writeText(message);
    alert("반 숙제 안내문을 복사했습니다. 카톡이나 문자에 붙여넣어 보내세요.");
  } catch (error) {
    prompt("아래 내용을 복사해서 보내세요.", message);
  }
}

function renderAiReportStudentOptions() {
  const select = $("#aiReportStudent");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = state.students.length
    ? sortStudentsByClassGradeName(state.students)
        .map((student) => `<option value="${student.id}">${student.name} · ${student.grade || "-"} · ${student.className || "-"}</option>`)
        .join("")
    : `<option value="">학생을 먼저 등록해 주세요</option>`;
  if (previous && state.students.some((student) => student.id === previous)) {
    select.value = previous;
  }
  fillAiReportDefaults();
}

function getStudentAttendanceSummary(studentId) {
  const records = Object.entries(state.attendance || {})
    .map(([date, day]) => ({ date, record: day?.[studentId] }))
    .filter((item) => item.record)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  if (!records.length) return "아직 출결 기록이 없습니다.";
  return records
    .map(({ date, record }) => {
      const normalized = typeof record === "string" ? { status: record } : record;
      const makeup = normalized.makeupDate ? `, 보강일 ${normalized.makeupDate}` : "";
      const session = normalized.session ? `${normalized.session}회차 ` : "";
      return `${date}: ${session}${normalized.status || "출석"}${makeup}`;
    })
    .join("\n");
}

function getAiReportStudentPayload(student) {
  return {
    name: student.name,
    school: student.school || "",
    grade: student.grade || "",
    className: student.className || "",
    subject: student.subject || "",
    book: student.book || "",
    homework: getHomeworkText(student) || "",
    homeworkStatus: student.homeworkStatus || "확인 전",
    memo: student.memo || "",
  };
}

function fillAiReportDefaults() {
  const status = $("#aiReportStatus");
  const student = state.students.find((item) => item.id === $("#aiReportStudent")?.value);
  if (!student) {
    if (status) status.textContent = "학생 없음";
    return;
  }
  const template = $("#aiReportTemplate");
  if (template && !template.dataset.touched) {
    template.value = String(student.grade || "").startsWith("초") ? "초등부 월간 실험 보고서" : "중고등부 학기말 종합보고서";
  }
  if (status) status.textContent = `${student.name} 학생 선택됨`;
}

async function generateAiReport() {
  const student = state.students.find((item) => item.id === $("#aiReportStudent").value);
  if (!student) {
    alert("보고서를 만들 학생을 먼저 선택해 주세요.");
    return;
  }

  const button = $("#generateAiReportBtn");
  const status = $("#aiReportStatus");
  const result = $("#aiReportResult");
  button.disabled = true;
  status.textContent = "AI가 작성 중...";
  result.value = "";

  try {
    const response = await fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: $("#aiReportTemplate").value,
        student: getAiReportStudentPayload(student),
        attendanceSummary: getStudentAttendanceSummary(student.id),
        reportInputs: {
          learningNotes: $("#aiReportLearningNotes").value.trim(),
          evaluationNotes: $("#aiReportEvaluationNotes").value.trim(),
          attendanceRate: $("#aiReportAttendanceRate").value.trim(),
          homeworkStatus: $("#aiReportHomeworkStatus").value.trim(),
          photoMemo: $("#aiReportPhotoMemo").value.trim(),
          teacherComment: $("#aiReportTeacherComment").value.trim(),
        },
        learningNotes: $("#aiReportLearningNotes").value.trim(),
        teacherComment: $("#aiReportTeacherComment").value.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "보고서 생성에 실패했습니다.");
    result.value = data.report || "보고서 내용이 비어 있습니다. 입력 내용을 조금 더 적고 다시 시도해 주세요.";
    status.textContent = "생성 완료";
  } catch (error) {
    status.textContent = "생성 실패";
    result.value = [
      "AI 보고서를 만들지 못했습니다.",
      "",
      "확인할 것:",
      "1. Vercel 환경변수 OPENAI_API_KEY가 저장되어 있는지",
      "2. 환경변수 저장 후 Redeploy를 했는지",
      "3. OpenAI 결제/사용 한도가 정상인지",
      "",
      `오류: ${error.message}`,
    ].join("\n");
  } finally {
    button.disabled = false;
  }
}

async function copyAiReport() {
  const text = $("#aiReportResult").value.trim();
  if (!text) {
    alert("복사할 보고서가 없습니다.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("보고서를 복사했습니다. 카톡이나 문서에 붙여넣어 사용하세요.");
  } catch (error) {
    prompt("아래 내용을 복사하세요.", text);
  }
}

function downloadAiReport() {
  const text = $("#aiReportResult").value.trim();
  if (!text) {
    alert("저장할 보고서가 없습니다.");
    return;
  }
  const student = state.students.find((item) => item.id === $("#aiReportStudent").value);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `과수원과학-AI보고서-${student?.name || "학생"}-${today()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderConsultingStudentOptions() {
  const previous = $("#consultingStudent").value;
  const className = $("#consultingClass").value;
  const students = state.students.filter((student) => student.status !== "퇴원" && (!className || studentBelongsToClass(student, className)));
  $("#consultingStudent").innerHTML = students.length ? students.map((student) => `<option value="${student.id}">${student.name} · ${getStudentClassNames(student).join(", ") || "반 미지정"}</option>`).join("") : `<option value="">해당 반 학생 없음</option>`;
  if (students.some((student) => student.id === previous)) $("#consultingStudent").value = previous;
}

function renderConsulting() {
  const studentId = $("#consultingStudent").value || state.students[0]?.id;
  if (!studentId) {
    $("#consultingList").innerHTML = `<div class="empty-state">상담 기록을 남길 학생이 없습니다. 학생관리에서 학생을 한 번만 등록하면 상담기록에서 바로 선택할 수 있습니다.</div>`;
    return;
  }
  if ($("#consultingStudent").value !== studentId) $("#consultingStudent").value = studentId;
  const records = state.consulting[studentId] || [];
  $("#consultingList").innerHTML = records.length
    ? records
        .slice()
        .reverse()
        .map(
          (record, index) => `
            <article class="record-card">
              <strong>${record.date}</strong>
              <p>${record.text}</p>
              <button class="mini-button danger" type="button" onclick="deleteConsultingRecord('${studentId}', ${records.length - 1 - index})">삭제</button>
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">아직 상담 기록이 없습니다. 위 칸에 적고 추가 버튼을 누르세요.</div>`;
}

function addConsultingRecord() {
  const studentId = $("#consultingStudent").value;
  const text = $("#consultingText").value.trim();
  if (!studentId || !text) return;
  state.consulting[studentId] = state.consulting[studentId] || [];
  state.consulting[studentId].push({ date: $("#consultingDate").value || today(), text });
  $("#consultingText").value = "";
  saveState();
  renderConsulting();
}

function deleteConsultingRecord(studentId, index) {
  state.consulting[studentId].splice(index, 1);
  saveState();
  renderConsulting();
}

function quickConsult(studentId) {
  switchView("consulting", "상담기록");
  const student = state.students.find((item) => item.id === studentId);
  $("#consultingClass").value = getStudentClassNames(student)[0] || "";
  renderConsultingStudentOptions();
  $("#consultingStudent").value = studentId;
  renderConsulting();
}

function addNewConsultation() {
  const name = $("#leadName").value.trim();
  const memo = $("#leadMemo").value.trim();
  if (!name || !memo) {
    alert("신규 상담은 학생 이름과 상담내용을 적어주세요.");
    return;
  }

  state.newConsultations.push({
    id: crypto.randomUUID(),
    date: $("#leadDate").value || today(),
    name,
    school: $("#leadSchool").value.trim(),
    grade: $("#leadGrade").value,
    parentPhone: $("#leadParentPhone").value.trim(),
    memo,
    createdAt: Date.now(),
  });

  $("#leadName").value = "";
  $("#leadSchool").value = "";
  $("#leadGrade").value = "초3";
  $("#leadParentPhone").value = "";
  $("#leadMemo").value = "";
  $("#leadDate").value = today();
  saveState();
  renderSchoolOptions();
  renderNewConsultations();
}

function renderNewConsultations() {
  $("#leadList").innerHTML = state.newConsultations.length
    ? state.newConsultations
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(
          (record) => `
            <article class="record-card">
              <div>
                <strong>${record.name}</strong>
                <span>${record.date} · ${record.school || "-"} · ${record.grade} · 엄마 ${record.parentPhone || "-"}</span>
              </div>
              <button class="mini-button danger" type="button" onclick="deleteNewConsultation('${record.id}')">삭제</button>
              <p>${record.memo}</p>
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">아직 신규 상담 기록이 없습니다.</div>`;
}

function deleteNewConsultation(recordId) {
  state.newConsultations = state.newConsultations.filter((record) => record.id !== recordId);
  saveState();
  renderSchoolOptions();
  renderNewConsultations();
}

const gradeProgression = ["초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"];

function advanceGrade(grade, years = 1) {
  const index = gradeProgression.indexOf(grade);
  if (index < 0) return grade;
  return gradeProgression[Math.min(index + Math.max(0, years), gradeProgression.length - 1)];
}

function suggestClassForGrade(grade, previousClassName = "") {
  const candidates = classes.filter((item) => !isSpecialClassName(item.name) && item.name.includes(grade));
  if (!candidates.length) return "";
  if (String(previousClassName).includes("과학독해")) {
    const reading = candidates.find((item) => item.name.includes("과학독해"));
    if (reading) return reading.name;
  }
  return candidates[0].name;
}

function suggestWaitNextClass() {
  if (!$("#waitAutoAdvance").checked) return;
  const nextGrade = advanceGrade($("#waitGrade").value, 1);
  const suggested = suggestClassForGrade(nextGrade, $("#waitClass").value);
  if (suggested) $("#waitNextClass").value = suggested;
}

function syncWaitAutoAdvanceFields() {
  const enabled = $("#waitAutoAdvance").checked;
  $("#waitNextClassWrap").hidden = !enabled;
  if (enabled) suggestWaitNextClass();
}

function getWaitlistProjection(record, year = new Date().getFullYear()) {
  const baseYear = Number(record.baseYear || String(record.waitDate || today()).slice(0, 4) || year);
  const yearsPassed = Math.max(0, year - baseYear);
  const baseGrade = record.baseGrade || record.grade;
  if (!record.autoAdvance || yearsPassed === 0) {
    return { grade: record.grade, className: record.className, advanced: false, needsRelink: !getClassInfo(record.className) };
  }
  let projectedClass = record.nextYearClassName || suggestClassForGrade(advanceGrade(baseGrade, 1), record.className);
  for (let step = 2; step <= yearsPassed; step += 1) {
    projectedClass = suggestClassForGrade(advanceGrade(baseGrade, step), projectedClass) || projectedClass;
  }
  return {
    grade: advanceGrade(baseGrade, yearsPassed),
    className: projectedClass || record.className,
    advanced: true,
    needsRelink: !projectedClass || !getClassInfo(projectedClass),
  };
}

function saveWaitlistFromForm() {
  const id = $("#waitId").value || crypto.randomUUID();
  const name = $("#waitName").value.trim();
  if (!name) {
    alert("대기자 이름을 적어주세요.");
    return;
  }

  const existing = state.waitlist.find((record) => record.id === id);
  const waitDate = $("#waitDate").value || today();
  const record = {
    id,
    name,
    school: $("#waitSchool").value.trim(),
    grade: $("#waitGrade").value,
    waitDate,
    className: $("#waitClass").value,
    baseYear: existing?.baseYear || Number(waitDate.slice(0, 4)),
    baseGrade: existing?.baseGrade || $("#waitGrade").value,
    autoAdvance: $("#waitAutoAdvance").checked,
    nextYearClassName: $("#waitAutoAdvance").checked ? $("#waitNextClass").value : "",
    noticeDate: $("#waitNoticeDate").value,
    memo: $("#waitMemo").value.trim(),
    status: existing?.status || "대기",
    completedAt: existing?.completedAt || "",
    createdAt: existing?.createdAt || Date.now(),
  };

  state.waitlist = existing ? state.waitlist.map((item) => (item.id === id ? record : item)) : [...state.waitlist, record];
  saveState();
  clearWaitlistForm();
  renderSchoolOptions();
  renderWaitlist();
}

function clearWaitlistForm() {
  $("#waitId").value = "";
  $("#waitName").value = "";
  $("#waitSchool").value = "";
  $("#waitGrade").value = "초3";
  $("#waitDate").value = today();
  $("#waitClass").value = classes[0].name;
  $("#waitAutoAdvance").checked = false;
  $("#waitNextClass").value = classes[0].name;
  syncWaitAutoAdvanceFields();
  $("#waitNoticeDate").value = "";
  $("#waitMemo").value = "";
  $("#saveWaitBtn").textContent = "대기자 저장";
}

function editWaitlist(recordId) {
  const record = state.waitlist.find((item) => item.id === recordId);
  if (!record) return;
  switchView("waitlist", "대기자 명단");
  $("#waitId").value = record.id;
  $("#waitName").value = record.name;
  $("#waitSchool").value = record.school;
  $("#waitGrade").value = record.grade;
  $("#waitDate").value = record.waitDate;
  $("#waitClass").value = record.className;
  $("#waitAutoAdvance").checked = Boolean(record.autoAdvance);
  $("#waitNextClass").value = record.nextYearClassName || suggestClassForGrade(advanceGrade(record.baseGrade || record.grade, 1), record.className) || classes[0].name;
  syncWaitAutoAdvanceFields();
  $("#waitNoticeDate").value = record.noticeDate;
  $("#waitMemo").value = record.memo;
  $("#saveWaitBtn").textContent = "수정 저장";
}

function markWaitlist(recordId, status) {
  state.waitlist = state.waitlist.map((record) =>
    record.id === recordId
      ? { ...record, status, completedAt: today(), noticeDate: record.noticeDate || today() }
      : record,
  );
  saveState();
  renderWaitlist();
}

function restoreWaitlist(recordId) {
  state.waitlist = state.waitlist.map((record) =>
    record.id === recordId ? { ...record, status: "대기", completedAt: "" } : record,
  );
  saveState();
  renderWaitlist();
}

function deleteWaitlist(recordId) {
  if (!confirm("이 대기자 기록을 삭제할까요?")) return;
  state.waitlist = state.waitlist.filter((record) => record.id !== recordId);
  saveState();
  renderWaitlist();
}

function renderWaitlist() {
  const active = state.waitlist.filter((record) => record.status === "대기");
  const done = state.waitlist.filter((record) => record.status !== "대기");
  $("#waitActiveCount").textContent = `${active.length}명`;
  $("#waitlistActive").innerHTML = active.length
    ? active.map((record) => renderWaitlistCard(record)).join("")
    : `<div class="empty-state">현재 대기자가 없습니다.</div>`;
  $("#waitlistDone").innerHTML = done.length
    ? done
        .slice()
        .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))
        .map((record) => renderWaitlistCard(record, true))
        .join("")
    : `<div class="empty-state">처리 완료된 대기자가 없습니다.</div>`;
}

function renderWaitlistCard(record, isDone = false) {
  const projection = getWaitlistProjection(record);
  const projectionText = projection.advanced
    ? `<p class="${projection.needsRelink ? "wait-relink" : "wait-projection"}">${new Date().getFullYear()}년 자동 반영: ${projection.grade} · ${projection.needsRelink ? "반 다시 연결 필요" : `대기반 ${projection.className}`}</p>`
    : record.autoAdvance
      ? `<p class="wait-projection">다음 해 예정: ${advanceGrade(record.baseGrade || record.grade, 1)} · ${record.nextYearClassName || "반 다시 연결 필요"}</p>`
      : "";
  return `
    <article class="wait-card ${isDone ? "done" : ""}">
      <div>
        <strong>${record.name}</strong>
        <p>${record.school || "-"} · ${record.grade} · 대기반 ${record.className}</p>
        ${projectionText}
        <p>대기일 ${record.waitDate || "-"} · 자리 안내일 ${record.noticeDate || "미정"}</p>
        <p>${record.memo || "메모 없음"}</p>
      </div>
      <div class="wait-actions">
        ${
          isDone
            ? `<span class="badge">${record.status}</span><button class="mini-button" type="button" onclick="restoreWaitlist('${record.id}')">대기 복구</button>`
            : `<button class="mini-button" type="button" onclick="markWaitlist('${record.id}', '등록')">등록</button><button class="mini-button" type="button" onclick="markWaitlist('${record.id}', '미등록')">미등록</button>`
        }
        <button class="mini-button" type="button" onclick="editWaitlist('${record.id}')">수정</button>
        <button class="mini-button danger" type="button" onclick="deleteWaitlist('${record.id}')">삭제</button>
      </div>
    </article>
  `;
}

function renderClassroomStudentOptions() {
  const options = sortStudentsByGradeName(state.students).map((student) => `<option value="${student.id}">${student.grade} · ${student.name} · ${getStudentClassNames(student).join(", ") || "반 미지정"}</option>`).join("");
  if ($("#studentRoomLoginSelect")) $("#studentRoomLoginSelect").innerHTML = options;
  renderClassroomGradeOptions();
  renderClassroomMemberChecks();
}

function renderClassrooms() {
  renderClassroomGradeOptions();
  renderClassroomMemberChecks();
  renderClassroomList();
  renderPostClassroomOptions();
  renderAdminClassroomPosts();
}

function getGradeSortValue(grade) {
  const gradeText = String(grade || "");
  const schoolOrder = gradeText.startsWith("초") ? 0 : gradeText.startsWith("중") ? 10 : gradeText.startsWith("고") ? 20 : 30;
  const number = Number(gradeText.replace(/[^0-9]/g, "")) || 0;
  return schoolOrder + number;
}

function sortStudentsByGradeName(students) {
  return [...students].sort((a, b) => {
    const gradeDiff = getGradeSortValue(a.grade) - getGradeSortValue(b.grade);
    if (gradeDiff) return gradeDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function sortClassroomsByName(classrooms) {
  return [...classrooms].sort((a, b) => {
    const specialDiff = Number(isSpecialClassroom(a)) - Number(isSpecialClassroom(b));
    if (specialDiff) return specialDiff;
    const levelDiff = getClassroomLevelSortValue(a) - getClassroomLevelSortValue(b);
    if (levelDiff) return levelDiff;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
  });
}

function isSpecialClassroom(room) {
  const name = String(room?.name || "");
  const matchedClass = classes.find((classInfo) => classInfo.name === name);
  return matchedClass?.type === "방학특강" || name.includes("특강") || name.includes("방학");
}

function getClassroomLevelSortValue(room) {
  const name = String(room?.name || "");
  const match = name.match(/(초|중|고)\s*(\d+)/);
  if (!match) return 999;
  const schoolOffset = match[1] === "초" ? 0 : match[1] === "중" ? 100 : 200;
  return schoolOffset + Number(match[2]);
}

function getClassroomGradeOptions() {
  return [...new Set(state.students.map((student) => student.grade).filter(Boolean))].sort((a, b) => getGradeSortValue(a) - getGradeSortValue(b));
}

function renderClassroomGradeOptions() {
  const select = $("#classroomGradeSelect");
  if (!select) return;
  const previous = select.value;
  const grades = getClassroomGradeOptions();
  select.innerHTML = grades.length
    ? grades.map((grade) => `<option value="${grade}">${grade}</option>`).join("")
    : `<option value="">학생 없음</option>`;
  if (grades.includes(previous)) select.value = previous;
  if (!select.value && grades.length) select.value = grades[0];
}

function renderClassroomMemberChecks(selectedIds, selectedAccess = classroomMemberAccess) {
  if (selectedIds) {
    classroomMemberSelection = new Set(selectedIds);
    classroomMemberAccess = normalizeClassroomMemberAccess({ memberAccess: selectedAccess }, selectedIds);
  }
  if (!$("#classroomMemberList")) return;
  const visibleStudents = getVisibleClassroomStudents();
  $("#classroomMemberList").innerHTML = visibleStudents.length
    ? sortStudentsByGradeName(visibleStudents)
        .map(
          (student) => {
            const checked = classroomMemberSelection.has(student.id);
            const startDate = classroomMemberAccess[student.id]?.startDate || "";
            const endDate = classroomMemberAccess[student.id]?.endDate || "";
            return `
            <div class="member-check">
              <div class="member-main">
                <input type="checkbox" value="${student.id}" data-grade="${student.grade || ""}" ${checked ? "checked" : ""} onchange="setClassroomMemberChecked('${student.id}', this.checked)" />
                <span>${student.name}</span>
                <small>${student.school || "-"} · ${student.grade || "-"} · ${getStudentClassNames(student).join(", ") || "반 미지정"}${student.status === "퇴원" ? " · 퇴원생" : ""}</small>
              </div>
              <div class="member-access-dates">
                <label><small>입장일</small><input type="date" value="${startDate}" ${checked ? "" : "disabled"} onchange="setClassroomMemberStartDate('${student.id}', this.value)" /></label>
                <label><small>종료일</small><input type="date" value="${endDate}" ${checked ? "" : "disabled"} onchange="setClassroomMemberEndDate('${student.id}', this.value)" /></label>
              </div>
            </div>
          `;
          },
        )
        .join("")
    : `<div class="empty-state">${state.students.length ? "선택한 학년에 학생이 없습니다." : "학생명단에 학생이 있어야 수업방 권한을 연결할 수 있습니다."}</div>`;
  updateClassroomMemberCount();
  updateVisibleGradeAllCheck();
}

function getVisibleClassroomStudents() {
  const selectedGrade = $("#classroomGradeSelect")?.value;
  return selectedGrade ? state.students.filter((student) => student.grade === selectedGrade) : state.students;
}

function setClassroomMemberChecked(studentId, checked) {
  if (checked) {
    classroomMemberSelection.add(studentId);
    if (!classroomMemberAccess[studentId]) classroomMemberAccess[studentId] = { startDate: today(), endDate: "" };
  } else {
    classroomMemberSelection.delete(studentId);
    delete classroomMemberAccess[studentId];
  }
  renderClassroomMemberChecks();
  updateClassroomMemberCount();
  updateVisibleGradeAllCheck();
}

function setVisibleClassroomMembers(checked) {
  getVisibleClassroomStudents().forEach((student) => {
    if (checked) {
      classroomMemberSelection.add(student.id);
      if (!classroomMemberAccess[student.id]) classroomMemberAccess[student.id] = { startDate: today(), endDate: "" };
    } else {
      classroomMemberSelection.delete(student.id);
      delete classroomMemberAccess[student.id];
    }
  });
  renderClassroomMemberChecks();
}

function setClassroomMemberStartDate(studentId, value) {
  if (!classroomMemberSelection.has(studentId)) return;
  classroomMemberAccess[studentId] = {
    ...classroomMemberAccess[studentId],
    startDate: normalizeDateValue(value),
  };
}

function setClassroomMemberEndDate(studentId, value) {
  if (!classroomMemberSelection.has(studentId)) return;
  const endDate = normalizeDateValue(value);
  const startDate = normalizeDateValue(classroomMemberAccess[studentId]?.startDate);
  if (endDate && startDate && endDate < startDate) {
    alert("종료일은 입장일보다 빠를 수 없습니다.");
    renderClassroomMemberChecks();
    return;
  }
  classroomMemberAccess[studentId] = { ...classroomMemberAccess[studentId], endDate };
}

function updateVisibleGradeAllCheck() {
  const checkbox = $("#classroomVisibleGradeAll");
  if (!checkbox) return;
  const visibleStudents = getVisibleClassroomStudents();
  const checkedCount = visibleStudents.filter((student) => classroomMemberSelection.has(student.id)).length;
  checkbox.disabled = !visibleStudents.length;
  checkbox.checked = visibleStudents.length > 0 && checkedCount === visibleStudents.length;
  checkbox.indeterminate = checkedCount > 0 && checkedCount < visibleStudents.length;
}

function clearAllClassroomMembers() {
  classroomMemberSelection = new Set();
  classroomMemberAccess = {};
  renderClassroomMemberChecks();
  updateClassroomMemberCount();
}

function getSelectedClassroomMemberIds() {
  return [...classroomMemberSelection];
}

function getSelectedClassroomMemberAccess() {
  return getSelectedClassroomMemberIds().reduce((result, studentId) => {
    result[studentId] = {
      startDate: normalizeDateValue(classroomMemberAccess[studentId]?.startDate),
      endDate: normalizeDateValue(classroomMemberAccess[studentId]?.endDate),
    };
    return result;
  }, {});
}

function updateClassroomMemberCount() {
  if ($("#classroomMemberCount")) $("#classroomMemberCount").textContent = `${getSelectedClassroomMemberIds().length}명 선택`;
}

function clearClassroomForm() {
  $("#classroomIdInput").value = "";
  $("#classroomNameInput").value = "";
  $("#classroomTeacherInput").value = "";
  $("#classroomDescriptionInput").value = "";
  $("#classroomPublicInput").checked = false;
  $("#classroomFormMode").textContent = "새 수업방";
  classroomMemberSelection = new Set();
  classroomMemberAccess = {};
  renderClassroomMemberChecks([]);
}

function saveClassroomFromForm() {
  const id = $("#classroomIdInput").value || crypto.randomUUID();
  const existing = state.classrooms.find((room) => room.id === id);
  const room = {
    id,
    name: $("#classroomNameInput").value.trim(),
    teacher: $("#classroomTeacherInput").value.trim(),
    description: $("#classroomDescriptionInput").value.trim(),
    isPublic: $("#classroomPublicInput").checked,
    memberStudentIds: getSelectedClassroomMemberIds(),
    memberAccess: getSelectedClassroomMemberAccess(),
    posts: existing?.posts || [],
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (!room.name) {
    alert("수업방 이름을 입력해주세요.");
    return;
  }
  state.classrooms = existing ? state.classrooms.map((item) => (item.id === id ? room : item)) : [...state.classrooms, room];
  saveState();
  clearClassroomForm();
  renderClassrooms();
  renderStudentClassroomView();
}

function editClassroom(roomId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  if (!room) return;
  $("#classroomIdInput").value = room.id;
  $("#classroomNameInput").value = room.name;
  $("#classroomTeacherInput").value = room.teacher || "";
  $("#classroomDescriptionInput").value = room.description || "";
  $("#classroomPublicInput").checked = isClassroomPublic(room);
  $("#classroomFormMode").textContent = "수업방 수정";
  renderClassroomMemberChecks(room.memberStudentIds || [], room.memberAccess || {});
  $("#classroomEditorPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteClassroom(roomId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  if (!room || !confirm(`${room.name} 수업방을 삭제할까요? 게시글도 함께 삭제됩니다.`)) return;
  state.classrooms = state.classrooms.filter((item) => item.id !== roomId);
  if (currentStudentRoomId === roomId) currentStudentRoomId = "";
  saveState();
  clearClassroomForm();
  renderClassrooms();
  renderStudentClassroomView();
}

function openClassroomPosts(roomId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  if (!room) return;
  $("#postClassroomSelect").value = room.id;
  renderAdminClassroomPosts();
  $("#adminClassroomPosts")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderClassroomList() {
  $("#classroomCountLabel").textContent = `${state.classrooms.length}개`;
  $("#classroomList").innerHTML = state.classrooms.length
    ? sortClassroomsByName(state.classrooms)
        .map((room) => {
          const memberNames = room.memberStudentIds
            .map((studentId) => state.students.find((student) => student.id === studentId)?.name)
            .filter(Boolean)
            .join(", ");
          return `
            <article class="classroom-card">
              <div>
                <button class="link-name-button" type="button" onclick="editClassroom('${room.id}')">${room.name}</button>
                <p>${room.description || "설명 없음"}</p>
                <div class="classroom-meta-row">
                  <span class="visibility-pill ${isClassroomPublic(room) ? "public" : ""}">${isClassroomPublic(room) ? "학생용 공개" : "비공개"}</span>
                  <span>${room.teacher ? `담당 ${room.teacher} · ` : ""}${room.memberStudentIds.length}명 접근 · 게시글 ${room.posts.length}개</span>
                </div>
                <em>${memberNames || "연결된 학생 없음"}</em>
              </div>
              <div class="row-actions">
                <button class="mini-button" type="button" onclick="openClassroomPosts('${room.id}')">게시글</button>
                <button class="mini-button" type="button" onclick="openClassroomStudentList('${room.id}')">학생 명단</button>
                <button class="mini-button" type="button" onclick="editClassroom('${room.id}')">수정</button>
                <button class="mini-button danger" type="button" onclick="deleteClassroom('${room.id}')">삭제</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">아직 수업방이 없습니다. 왼쪽에서 수업방을 만들어주세요.</div>`;
}

function renderPostClassroomOptions() {
  $("#postClassroomSelect").innerHTML = state.classrooms.length
    ? sortClassroomsByName(state.classrooms)
        .map((room) => `<option value="${room.id}">${room.name}${isClassroomPublic(room) ? "" : " (비공개)"}</option>`)
        .join("")
    : `<option value="">수업방 없음</option>`;
}

function clearClassroomPostForm() {
  $("#classroomPostIdInput").value = "";
  $("#postTypeInput").value = "공지";
  $("#postOpenToAllInput").checked = false;
  $("#postTitleInput").value = "";
  $("#postContentInput").value = "";
  $("#classroomPostLessonDateInput").value = today();
  renderYoutubeLinkRows([]);
}

function addYoutubeLinkRow(link = { title: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "youtube-link-row";
  const titleInput = document.createElement("input");
  titleInput.className = "youtube-title-input";
  titleInput.placeholder = "수업 제목 예: 1강 힘과 운동";
  titleInput.value = link.title || "";
  const urlInput = document.createElement("input");
  urlInput.className = "youtube-url-input";
  urlInput.placeholder = "https://www.youtube.com/...";
  urlInput.value = link.url || "";
  const deleteButton = document.createElement("button");
  deleteButton.className = "mini-button danger";
  deleteButton.type = "button";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => {
    row.remove();
    ensureYoutubeLinkRow();
  });
  row.append(titleInput, urlInput, deleteButton);
  $("#youtubeLinkList").appendChild(row);
}

function renderYoutubeLinkRows(links = []) {
  $("#youtubeLinkList").innerHTML = "";
  (links.length ? links : [{ title: "", url: "" }]).forEach((link) => addYoutubeLinkRow(link));
}

function ensureYoutubeLinkRow() {
  if (!$("#youtubeLinkList").children.length) addYoutubeLinkRow();
}

function getYoutubeLinksFromForm() {
  return $$("#youtubeLinkList .youtube-link-row")
    .map((row) => ({
      title: row.querySelector(".youtube-title-input").value.trim(),
      url: row.querySelector(".youtube-url-input").value.trim(),
    }))
    .filter((link) => link.url);
}

function getClassroomLinkLabel(link, index = 0) {
  const title = link.title || `수업 링크 ${index + 1}`;
  const url = String(link.url || "");
  return /(?:youtube\.com|youtu\.be)/i.test(url) ? `${title} (유튜브 링크 바로가기)` : title;
}

function saveClassroomPostFromForm() {
  const roomId = $("#postClassroomSelect").value;
  const room = state.classrooms.find((item) => item.id === roomId);
  if (!room) {
    alert("게시글을 올릴 수업방을 먼저 만들어주세요.");
    return;
  }
  const postId = $("#classroomPostIdInput").value || crypto.randomUUID();
  const existing = room.posts.find((post) => post.id === postId);
  const youtubeLinks = getYoutubeLinksFromForm();
  const post = {
    id: postId,
    type: $("#postTypeInput").value,
    title: $("#postTitleInput").value.trim(),
    links: youtubeLinks,
    link: youtubeLinks[0]?.url || "",
    content: $("#postContentInput").value.trim(),
    openToAll: $("#postOpenToAllInput").checked,
    lessonDate: $("#classroomPostLessonDateInput").value || today(),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (!post.title) {
    alert("게시글 제목을 입력해주세요.");
    return;
  }
  room.posts = existing ? room.posts.map((item) => (item.id === postId ? post : item)) : [post, ...room.posts];
  room.updatedAt = Date.now();
  state.classrooms = state.classrooms.map((item) => (item.id === room.id ? room : item));
  saveState();
  clearClassroomPostForm();
  renderClassrooms();
  renderStudentClassroomView();
}

function editClassroomPost(roomId, postId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  const post = room?.posts.find((item) => item.id === postId);
  if (!room || !post) return;
  $("#postClassroomSelect").value = roomId;
  $("#classroomPostIdInput").value = post.id;
  $("#postTypeInput").value = post.type;
  $("#postOpenToAllInput").checked = Boolean(post.openToAll);
  $("#postTitleInput").value = post.title;
  $("#postContentInput").value = post.content || "";
  $("#classroomPostLessonDateInput").value = post.lessonDate || today();
  renderYoutubeLinkRows(normalizeYoutubeLinks(post.links, post.link));
}

function deleteClassroomPost(roomId, postId) {
  const room = state.classrooms.find((item) => item.id === roomId);
  const post = room?.posts.find((item) => item.id === postId);
  if (!room || !post || !confirm(`${post.title} 게시글을 삭제할까요?`)) return;
  room.posts = room.posts.filter((item) => item.id !== postId);
  room.updatedAt = Date.now();
  state.classrooms = state.classrooms.map((item) => (item.id === room.id ? room : item));
  saveState();
  renderClassrooms();
  renderStudentClassroomView();
}

function renderAdminClassroomPosts() {
  const roomId = $("#postClassroomSelect").value;
  const room = state.classrooms.find((item) => item.id === roomId);
  $("#adminClassroomPosts").innerHTML = room?.posts.length
    ? [...room.posts].sort((a, b) => b.createdAt - a.createdAt).map((post) => renderClassroomPostCard(room.id, post, true)).join("")
    : `<div class="empty-state">선택한 수업방에 게시글이 없습니다.</div>`;
}

function renderClassroomPostCard(roomId, post, editable = false) {
  const links = normalizeYoutubeLinks(post.links, post.link);
  const linkList = links.length
    ? `<div class="youtube-link-view">
        ${links
          .map(
            (link, index) => `
              <a class="classroom-link" href="${link.url}" target="_blank" rel="noreferrer">
                <span>${getClassroomLinkLabel(link, index)}</span>
                <small>열기</small>
              </a>
            `,
          )
          .join("")}
      </div>`
    : "";
  return `
    <article class="classroom-post-card">
      <div class="post-head">
        <span class="badge ${post.type === "숙제" ? "orange" : ""}">${post.type}</span>
        <small>${post.openToAll ? "전체 공개 · " : ""}${post.lessonDate ? `수업일 ${formatLessonDate(post.lessonDate)} · ` : ""}${formatDateTime(post.createdAt)}</small>
      </div>
      <strong>${post.title}</strong>
      <p>${post.content || "내용 없음"}</p>
      ${linkList}
      ${
        editable
          ? `<div class="row-actions">
              <button class="mini-button" type="button" onclick="editClassroomPost('${roomId}', '${post.id}')">수정</button>
              <button class="mini-button danger" type="button" onclick="deleteClassroomPost('${roomId}', '${post.id}')">삭제</button>
            </div>`
          : ""
      }
    </article>
  `;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatLessonDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

function getStudentRoomCode(student) {
  if (student.classroomCode) return String(student.classroomCode).trim().toUpperCase();
  const digits = `${student.parentPhone || student.studentPhone || ""}`.replace(/\D/g, "");
  return digits ? digits.slice(-4) : "";
}

function loginStudentRoom() {
  const student = state.students.find((item) => item.id === $("#studentRoomLoginSelect").value);
  if (!student) return;
  currentStudentRoomStudentId = student.id;
  currentStudentRoomId = "";
  localStorage.setItem("orchardScienceClassroomStudentId", student.id);
  renderStudentClassroomView();
}

function logoutStudentRoom() {
  currentStudentRoomStudentId = "";
  currentStudentRoomId = "";
  localStorage.removeItem("orchardScienceClassroomStudentId");
  $("#studentRoomCodeInput").value = "";
  renderStudentClassroomView();
}

function renderStudentClassroomView() {
  const student = state.students.find((item) => item.id === currentStudentRoomStudentId);
  if (!student) {
    $("#studentRoomLogin").hidden = false;
    $("#studentRoomArea").hidden = true;
    return;
  }
  $("#studentRoomLogin").hidden = true;
  $("#studentRoomArea").hidden = false;
  $("#studentRoomNameLabel").textContent = `${student.name} 학생`;
  const rooms = getAdminPreviewClassrooms(student.id);
  $("#studentRoomCountLabel").textContent = `${rooms.length}개`;
  if (!currentStudentRoomId || !rooms.some((room) => room.id === currentStudentRoomId)) currentStudentRoomId = rooms[0]?.id || "";
  $("#studentClassroomList").innerHTML = rooms.length
    ? rooms
        .map(
          (room) => `
            <button class="${room.id === currentStudentRoomId ? "active" : ""}" type="button" onclick="openStudentClassroom('${room.id}')">
              <strong>${room.name}</strong>
              <span>${getClassroomPreviewStatus(room, student.id)} · ${(room.posts || []).length}개 게시글</span>
            </button>
          `,
        )
        .join("")
    : `<div class="empty-state">이 학생에게 연결된 수업방이 없습니다. 수업방 관리에서 학생을 연결해주세요.</div>`;
  renderStudentClassroomPosts();
}

function getAdminPreviewClassrooms(studentId) {
  return sortClassroomsByName(state.classrooms.filter((room) => room.memberStudentIds.includes(studentId)));
}

function getClassroomPreviewStatus(room, studentId) {
  if (!isClassroomPublic(room)) return "비공개";
  const startDate = getClassroomMemberStartDate(room, studentId);
  const endDate = getClassroomMemberEndDate(room, studentId);
  if (startDate && today() < startDate) return `이용 전 (${startDate}부터)`;
  if (endDate && today() > endDate) return `기간 종료 (${endDate})`;
  return "학생에게 공개 중";
}

function getAllowedClassrooms(studentId) {
  return sortClassroomsByName(state.classrooms.filter((room) => canStudentAccessClassroom(room, studentId)));
}

function openStudentClassroom(roomId) {
  if (!currentStudentRoomStudentId || !getAdminPreviewClassrooms(currentStudentRoomStudentId).some((room) => room.id === roomId)) {
    alert("이 학생에게 연결되지 않은 수업방입니다.");
    return;
  }
  currentStudentRoomId = roomId;
  renderStudentClassroomView();
}

function renderStudentClassroomPosts() {
  const room = getAdminPreviewClassrooms(currentStudentRoomStudentId).find((item) => item.id === currentStudentRoomId);
  const posts = [...(room?.posts || [])];
  $("#studentClassroomTitle").textContent = room ? room.name : "게시글";
  $("#studentPostList").innerHTML = posts.length
    ? posts.sort((a, b) => b.createdAt - a.createdAt).map((post) => renderClassroomPostCard(room.id, post, false)).join("")
    : `<div class="empty-state">확인할 게시글이 없습니다.</div>`;
}

function buildOnlineClassroomData(sourceState = state) {
  return {
    academyName: "과수원과학",
    title: "과수원ON",
    exportedAt: new Date().toISOString(),
    loginMode: "student-code-files",
  };
}

function buildOnlineStudentFiles(sourceState = state) {
  const classrooms = normalizeClassrooms(sourceState.classrooms || []).filter((room) => isClassroomPublic(room));
  return sortStudentsByGradeName(sourceState.students || []).reduce((files, student) => {
    const code = String(student.classroomCode || "").trim().toUpperCase();
    if (!student.id || !student.name || !code) return files;
    files[code] = {
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        className: student.className,
      },
      classrooms: sortClassroomsByName(classrooms.filter((room) => canStudentAccessClassroom(room, student.id))).map((room) => ({
        id: room.id,
        name: room.name,
        teacher: room.teacher || "",
        description: room.description || "",
        isPublic: true,
        posts: getVisibleClassroomPosts(room, student.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((post) => ({
            id: post.id,
            type: post.type,
            title: post.title,
            content: post.content || "",
            links: normalizeYoutubeLinks(post.links, post.link),
            openToAll: Boolean(post.openToAll),
            lessonDate: post.lessonDate || "",
            createdAt: post.createdAt,
            updatedAt: post.updatedAt || post.createdAt,
          })),
      })),
      exportedAt: new Date().toISOString(),
    };
    return files;
  }, {});
}

function buildOnlineClassroomExport(sourceState = state) {
  return {
    publicData: buildOnlineClassroomData(sourceState),
    studentFiles: buildOnlineStudentFiles(sourceState),
  };
}

function downloadOnlineClassroomData(data) {
  const script = `window.CLASSROOM_DATA = ${JSON.stringify(data, null, 2)};\n`;
  const blob = new Blob([script], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "classroom-data.js";
  link.click();
  URL.revokeObjectURL(url);
}

async function exportOnlineClassroom() {
  ensureStudentClassroomCodes();
  saveState();
  await saveStateToServer();
  const latestState = await fetch("./api/state", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : state))
    .then((serverState) => normalizeState(serverState))
    .catch(() => state);
  const data = buildOnlineClassroomExport(latestState);
  state = latestState;
  renderAll();
  try {
    const response = await fetch("./api/online-classroom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("online export failed");
    const result = await response.json();
    alert(`과수원ON 백업파일을 만들었습니다.\n\n폴더: ${result.folder}\n압축파일: ${result.zip}\n\n이 파일은 기존 Netlify 수동 배포용 백업입니다.`);
  } catch (error) {
    downloadOnlineClassroomData(buildOnlineClassroomData(state));
    alert("서버 저장을 사용할 수 없어 과수원ON 자료 파일만 다운로드했습니다. classroom-data.js 파일을 기존 수동 배포 폴더에 넣어주세요.");
  }
}

function fillClassDefaults() {
  const classInfo = getClassInfo($("#classInput").value);
  if (!classInfo) return;
  $("#subjectInput").value = classInfo.subject;
  $("#bookInput").value = classInfo.defaultBook;
  $("#tuitionInput").value = classInfo.tuition;
}

function openStudentDialog(studentId = "") {
  renderSchoolOptions();
  const student = state.students.find((item) => item.id === studentId);
  const classInfo = getClassInfo(student?.className || classes[0].name);
  $("#classInput").innerHTML = regularClassOptions();
  const inheritedSpecials = [...new Set([...(student?.specialClassNames || []), ...(student?.className && isSpecialClassName(student.className) ? [student.className] : [])])];
  renderSpecialClassChecks(inheritedSpecials);
  $("#dialogTitle").textContent = student ? "학생 정보 수정" : "학생 추가";
  $("#studentId").value = student?.id || "";
  $("#nameInput").value = student?.name || "";
  $("#schoolInput").value = student?.school || "";
  $("#gradeInput").value = student?.grade || "초3";
  $("#classInput").value = student?.className && !isSpecialClassName(student.className) ? student.className : "";
  $("#studentPhoneInput").value = student?.studentPhone || "";
  $("#parentPhoneInput").value = student?.parentPhone || "";
  $("#classroomCodeInput").value = student?.classroomCode || "";
  $("#studentLoginIdInput").value = student?.loginId || "";
  $("#studentTempPasswordInput").value = "";
  $("#subjectInput").value = student?.subject || classInfo?.subject || "";
  $("#bookInput").value = student?.book || classInfo?.defaultBook || "";
  $("#homeworkInput").value = student?.homework || "";
  $("#homeworkStatusInput").value = student?.homeworkStatus || "확인 전";
  $("#tuitionInput").value = student?.tuition || classInfo?.tuition || "";
  $("#statusInput").value = student?.status || "재원";
  $("#memoInput").value = student?.memo || "";
  $("#studentDialog").showModal();
}

async function saveStudentFromForm() {
  const id = $("#studentId").value || crypto.randomUUID();
  const existing = state.students.find((student) => student.id === id);
  const classInfo = getClassInfo($("#classInput").value);
  const existingCodes = getClassroomCodeSet(id);
  const enteredClassroomCode = $("#classroomCodeInput").value.trim().toUpperCase();
  const classroomCode = enteredClassroomCode || existing?.classroomCode || generateClassroomCode(existingCodes);
  const specialClassNames = $$("#specialClassChecks input:checked").map((input) => input.value);
  const student = {
    id,
    name: $("#nameInput").value.trim(),
    school: $("#schoolInput").value.trim(),
    grade: $("#gradeInput").value,
    className: $("#classInput").value,
    specialClassNames,
    studentPhone: $("#studentPhoneInput").value.trim(),
    parentPhone: $("#parentPhoneInput").value.trim(),
    classroomCode,
    loginId: $("#studentLoginIdInput").value.trim().toLowerCase(),
    subject: $("#subjectInput").value.trim() || classInfo?.subject || "",
    book: $("#bookInput").value.trim() || classInfo?.defaultBook || "",
    homework: $("#homeworkInput").value.trim(),
    homeworkStatus: $("#homeworkStatusInput").value,
    tuition: Number($("#tuitionInput").value || classInfo?.tuition || 0),
    status: $("#statusInput").value,
    memo: $("#memoInput").value.trim(),
    createdAt: existing?.createdAt || Date.now(),
  };

  if (!student.name) return;
  if (existing) {
    state.students = state.students.map((item) => (item.id === id ? student : item));
  } else {
    state.students.push(student);
  }

  saveState();
  const temporaryPassword = $("#studentTempPasswordInput").value;
  if (student.loginId && temporaryPassword) {
    try {
      const { data } = await window.officeAuthClient?.auth?.getSession?.() || { data: {} };
      const accessToken = data?.session?.access_token || "";
      if (!accessToken) throw new Error("온라인 관리자 로그인이 필요합니다.");
      const response = await fetch("./api/student-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ studentId: student.id, loginId: student.loginId, password: temporaryPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "학생 계정을 만들지 못했습니다.");
      await saveStateToServer();
      alert(`${student.name} 학생 계정을 만들었습니다.\n아이디: ${student.loginId}\n비밀번호는 학생에게 개별 전달해주세요.`);
    } catch (error) {
      alert(`학생 정보는 저장했지만 로그인 계정은 만들지 못했습니다.\n${error.message}`);
    }
  }
  $("#studentDialog").close();
  renderAll();
}

function retireStudent(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student || !confirm(`${student.name} 학생을 퇴원생 명단으로 옮길까요?\n\n출석·납부·상담 기록은 그대로 유지됩니다.`)) return;
  state.students = state.students.map((item) => item.id === studentId ? { ...item, status: "퇴원", retiredAt: Date.now(), retiredReason: "개별 퇴원 처리" } : item);
  saveState();
  renderAll();
}

function restoreStudent(studentId) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student || !confirm(`${student.name} 학생을 재원생 명단으로 복구할까요?`)) return;
  state.students = state.students.map((item) => item.id === studentId ? { ...item, status: "재원", restoredAt: Date.now(), retiredReason: "" } : item);
  saveState();
  renderAll();
}

function permanentlyDeleteStudent(studentId) {
  const student = state.students.find((item) => item.id === studentId && item.status === "퇴원");
  if (!student) return;
  if (!confirm(`${student.name} 학생을 영구 삭제할까요?\n\n학생 정보와 연결된 출석·납부·상담·수업방 권한도 함께 삭제됩니다. 이 작업은 화면에서 되돌릴 수 없습니다.`)) return;
  if (!confirm(`마지막 확인입니다.\n\n${student.name} 학생을 정말 영구 삭제하시겠습니까?\n삭제 직전에 전체 백업파일을 자동으로 내려받습니다.`)) return;

  exportData();
  state.students = state.students.filter((item) => item.id !== studentId);
  delete state.consulting[studentId];
  Object.values(state.attendance || {}).forEach((day) => delete day[studentId]);
  Object.values(state.payments || {}).forEach((month) => delete month[studentId]);
  state.classrooms = (state.classrooms || []).map((room) => {
    const memberAccess = { ...(room.memberAccess || {}) };
    delete memberAccess[studentId];
    return { ...room, memberStudentIds: (room.memberStudentIds || []).filter((id) => id !== studentId), memberAccess };
  });
  state.newConsultations = (state.newConsultations || []).filter((record) => record.studentId !== studentId);
  state.waitlist = (state.waitlist || []).filter((record) => record.studentId !== studentId);
  saveState();
  renderAll();
  alert(`${student.name} 학생을 영구 삭제했습니다. 삭제 전 백업파일은 다운로드 폴더에 저장되었습니다.`);
}

function exportData() {
  const backup = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([backup], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `과수원과학-교무실-백업-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(String(reader.result || "{}"));
      const result = mergeImportedState(state, imported);
      state = result.state;
      saveState();
      renderAll();
      const onlineSaved = await saveStateToServer();
      alert(`자료를 합쳤습니다.\n새로 추가: ${result.added}명\n기존 업데이트: ${result.updated}명\n온라인 저장: ${onlineSaved ? "완료" : `실패 - ${lastServerSaveError || "원인을 확인하고 있습니다"}\n원본은 이 컴퓨터에 안전하게 남아 있습니다`}`);
    } catch (error) {
      alert("자료 파일을 읽을 수 없습니다. 과수원과학 교무실에서 백업한 파일인지 확인해주세요.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

window.openStudentDialog = openStudentDialog;
window.openDashboardStudents = openDashboardStudents;
window.openDashboardClasses = openDashboardClasses;
window.openDashboardPayments = openDashboardPayments;
window.openDashboardAttendance = openDashboardAttendance;
window.retireStudent = retireStudent;
window.restoreStudent = restoreStudent;
window.permanentlyDeleteStudent = permanentlyDeleteStudent;
window.setAttendance = setAttendance;
window.setAttendanceMakeupDate = setAttendanceMakeupDate;
window.setPayment = setPayment;
window.setPaymentPaid = setPaymentPaid;
window.setPaymentDate = setPaymentDate;
window.selectPaymentClass = selectPaymentClass;
window.selectClassForEdit = selectClassForEdit;
window.openClassStudentList = openClassStudentList;
window.setHomeworkStatus = setHomeworkStatus;
window.copyHomeworkMessage = copyHomeworkMessage;
window.copyClassHomeworkMessage = copyClassHomeworkMessage;
window.copyClassroomCode = copyClassroomCode;
window.quickConsult = quickConsult;
window.addConsultingRecord = addConsultingRecord;
window.deleteConsultingRecord = deleteConsultingRecord;
window.mergeImportedState = mergeImportedState;
window.deleteNewConsultation = deleteNewConsultation;
window.editWaitlist = editWaitlist;
window.markWaitlist = markWaitlist;
window.restoreWaitlist = restoreWaitlist;
window.deleteWaitlist = deleteWaitlist;
window.updateClassroomMemberCount = updateClassroomMemberCount;
window.openClassroomPosts = openClassroomPosts;
window.editClassroom = editClassroom;
window.deleteClassroom = deleteClassroom;
window.openClassroomStudentList = openClassroomStudentList;
window.editClassroomPost = editClassroomPost;
window.deleteClassroomPost = deleteClassroomPost;
window.openStudentClassroom = openStudentClassroom;
window.editScoreExam = editScoreExam;
window.deleteScoreExam = deleteScoreExam;
window.openScoreRanking = openScoreRanking;
window.startOrchardOffice = setup;
