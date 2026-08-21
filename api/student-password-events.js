import { adminRest, requireUser } from "../lib/supabase-server.js";

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Cache-Control", "no-store");
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "허용되지 않은 요청입니다." });

  try {
    const user = await requireUser(request);
    if (!user?.id) return response.status(401).json({ error: "학생 로그인이 필요합니다." });

    const profileResult = await adminRest(
      `student_profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=student_id,login_id`,
    );
    if (!profileResult.ok) return response.status(502).json({ error: "학생 계정을 확인하지 못했습니다." });
    const profiles = await profileResult.json();
    const studentId = String(profiles[0]?.student_id || "");
    const loginId = String(profiles[0]?.login_id || "").trim().toLowerCase();
    if (!studentId) return response.status(404).json({ error: "연결된 학생 정보를 찾지 못했습니다." });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const storedResult = await adminRest("office_state?id=eq.main&select=payload,updated_at");
      if (!storedResult.ok) return response.status(502).json({ error: "교무실 자료를 확인하지 못했습니다." });
      const rows = await storedResult.json();
      const storedRow = rows[0];
      if (!storedRow?.payload) return response.status(404).json({ error: "교무실 자료가 아직 없습니다." });

      const changedAt = new Date().toISOString();
      const credentialUpdatedAt = Date.now();
      let found = false;
      const students = (storedRow.payload.students || []).map((student) => {
        if (student.id !== studentId) return student;
        found = true;
        return {
          ...student,
          temporaryPassword: "",
          credentialStatus: "student_changed",
          passwordChangedByStudentAt: changedAt,
          credentialUpdatedAt,
        };
      });
      if (!found) return response.status(404).json({ error: "교무실 학생 명단에서 찾지 못했습니다." });

      const studentCredentialVault = { ...(storedRow.payload.studentCredentialVault || {}) };
      if (loginId) {
        studentCredentialVault[loginId] = {
          ...(studentCredentialVault[loginId] || {}),
          id: studentId,
          loginId,
          temporaryPassword: "",
          credentialStatus: "student_changed",
          passwordChangedByStudentAt: changedAt,
          credentialUpdatedAt,
        };
      }

      const updateResult = await adminRest(
        `office_state?id=eq.main&updated_at=eq.${encodeURIComponent(storedRow.updated_at)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            payload: { ...storedRow.payload, students, studentCredentialVault },
            updated_at: changedAt,
          }),
        },
      );
      if (!updateResult.ok) return response.status(502).json({ error: "교무실에 변경 기록을 저장하지 못했습니다." });
      const updatedRows = await updateResult.json();
      if (updatedRows.length) return response.status(200).json({ ok: true, changedAt });
    }
    return response.status(409).json({ error: "교무실 자료가 동시에 변경되고 있습니다. 잠시 후 다시 시도해주세요." });
  } catch (error) {
    return response.status(500).json({ error: error.message || "비밀번호 변경 기록 처리 중 오류가 발생했습니다." });
  }
}
