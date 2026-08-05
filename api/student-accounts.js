import { adminAuth, adminRest, requireAdmin } from "../lib/supabase-server.js";

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "허용되지 않은 요청입니다." });
  try {
    if (!(await requireAdmin(request))) return response.status(401).json({ error: "관리자 로그인이 필요합니다." });
    const studentId = String(request.body?.studentId || "").trim();
    const loginId = normalizeLoginId(request.body?.loginId);
    const password = String(request.body?.password || "");
    if (!studentId || loginId.length < 4) return response.status(400).json({ error: "로그인 아이디는 영문·숫자 4자 이상이어야 합니다." });
    if (password.length < 10) return response.status(400).json({ error: "임시 비밀번호는 10자 이상이어야 합니다." });

    const existingResult = await adminRest(`student_profiles?student_id=eq.${encodeURIComponent(studentId)}&select=auth_user_id`);
    const existingRows = existingResult.ok ? await existingResult.json() : [];
    let authUserId = existingRows[0]?.auth_user_id || "";
    const email = `${loginId}@student.grovescience.local`;
    const body = JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "student", student_id: studentId, login_id: loginId } });
    const authResult = authUserId
      ? await adminAuth(`users/${authUserId}`, { method: "PUT", body })
      : await adminAuth("users", { method: "POST", body });
    if (!authResult.ok) {
      const detail = await authResult.json().catch(() => ({}));
      return response.status(400).json({ error: detail.msg || detail.message || "학생 계정을 만들지 못했습니다." });
    }
    const authUser = await authResult.json();
    authUserId = authUser.id || authUser.user?.id || authUserId;
    const profileResult = await adminRest("student_profiles?on_conflict=auth_user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ auth_user_id: authUserId, student_id: studentId, login_id: loginId, role: "student", updated_at: new Date().toISOString() }]),
    });
    if (!profileResult.ok) return response.status(502).json({ error: "학생 권한을 저장하지 못했습니다." });
    await adminRest(`student_portals?student_id=eq.${encodeURIComponent(studentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ auth_user_id: authUserId, updated_at: new Date().toISOString() }),
    });
    return response.status(200).json({ ok: true, loginId });
  } catch (error) {
    return response.status(500).json({ error: error.message || "학생 계정 처리 중 오류가 발생했습니다." });
  }
}
