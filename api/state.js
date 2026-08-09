import { adminRest, requireAdmin } from "../lib/supabase-server.js";

function isRoomOpenForStudent(room, studentId, now = new Date()) {
  if (room?.isPublic === false || !(room?.memberStudentIds || []).includes(studentId)) return false;
  const access = room?.memberAccess?.[studentId] || {};
  const today = now.toISOString().slice(0, 10);
  return (!access.startDate || access.startDate <= today) && (!access.endDate || access.endDate >= today);
}

function buildStudentScores(state, studentId) {
  return (state.scoreExams || [])
    .map((exam) => {
      const result = (exam.results || []).find((item) => item.studentId === studentId);
      if (!result) return null;
      const totalQuestions = exam.type === "academy" ? Number(exam.totalQuestions) || 0 : null;
      const score = exam.type === "academy"
        ? (totalQuestions ? Math.round((Number(result.correctCount) / totalQuestions) * 1000) / 10 : 0)
        : Math.max(0, Math.min(100, Number(result.score) || 0));
      return {
        id: exam.id,
        type: exam.type,
        title: exam.title || "시험",
        date: exam.date || "",
        subject: exam.subject || "과학",
        className: exam.className || "",
        score,
        correctCount: exam.type === "academy" ? Number(result.correctCount) || 0 : null,
        totalQuestions,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function getStudentClassNames(student) {
  return [...new Set([student.className, ...(student.specialClassNames || [])].filter(Boolean))];
}

function buildStudentAnnouncements(state, student) {
  const classNames = getStudentClassNames(student);
  return (state.announcements || [])
    .filter((announcement) => announcement.scope !== "class" || classNames.includes(announcement.className))
    .map((announcement) => ({
      id: announcement.id,
      scope: announcement.scope === "class" ? "class" : "all",
      className: announcement.scope === "class" ? announcement.className || "" : "",
      category: announcement.category || "일반 안내",
      title: announcement.title || "공지사항",
      content: announcement.content || "",
      startDate: announcement.startDate || "",
      endDate: announcement.endDate || "",
      updatedAt: announcement.updatedAt || announcement.createdAt || Date.now(),
    }))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function buildPortalPayload(state, student) {
  const classrooms = (state.classrooms || [])
    .filter((room) => isRoomOpenForStudent(room, student.id))
    .map((room) => ({
      id: room.id,
      name: room.name,
      teacher: room.teacher || "",
      description: room.description || "",
      posts: room.posts || [],
      updatedAt: room.updatedAt || room.createdAt || Date.now(),
    }));
  return {
    student: { id: student.id, name: student.name, grade: student.grade, className: student.className },
    announcements: buildStudentAnnouncements(state, student),
    classrooms,
    scores: buildStudentScores(state, student.id),
    updatedAt: new Date().toISOString(),
  };
}

async function syncStudentPortals(state) {
  const students = Array.isArray(state.students) ? state.students : [];
  if (!students.length) return;
  const profileResponse = await adminRest("student_profiles?select=student_id,auth_user_id");
  const profiles = profileResponse.ok ? await profileResponse.json() : [];
  const userIds = new Map(profiles.map((profile) => [profile.student_id, profile.auth_user_id]));
  const rows = students.map((student) => ({
    student_id: student.id,
    auth_user_id: userIds.get(student.id) || null,
    payload: buildPortalPayload(state, student),
    updated_at: new Date().toISOString(),
  }));
  const response = await adminRest("student_portals?on_conflict=student_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(await response.text());
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  try {
    if (!(await requireAdmin(request))) return response.status(401).json({ error: "관리자 로그인이 필요합니다." });
    if (request.method === "GET") {
      const result = await adminRest("office_state?id=eq.main&select=payload");
      if (!result.ok) return response.status(502).json({ error: "온라인 자료를 읽지 못했습니다." });
      const rows = await result.json();
      if (!rows.length) return response.status(404).json({ error: "아직 저장된 온라인 자료가 없습니다." });
      await syncStudentPortals(rows[0].payload).catch(() => {});
      return response.status(200).json(rows[0].payload);
    }
    if (request.method === "POST") {
      const state = request.body || {};
      const result = await adminRest("office_state?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ id: "main", payload: state, updated_at: new Date().toISOString() }]),
      });
      if (!result.ok) return response.status(502).json({ error: "온라인 자료를 저장하지 못했습니다." });
      await syncStudentPortals(state);
      return response.status(200).json({ ok: true });
    }
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "허용되지 않은 요청입니다." });
  } catch (error) {
    return response.status(500).json({ error: error.message || "서버 오류가 발생했습니다." });
  }
}
