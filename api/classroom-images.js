import crypto from "node:crypto";
import { adminRest, adminStorage, getSupabaseConfig, requireAdmin, requireUser } from "../lib/supabase-server.js";

const BUCKET = "classroom-images";
const ADMIN_EMAIL = "grovescience24@gmail.com";
const CLASSROOM_ORIGIN = "https://grovescience-classroom.vercel.app";
const MAX_BYTES = 3 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function setCors(request, response) {
  const origin = String(request.headers.origin || "");
  if (origin === CLASSROOM_ORIGIN) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function safePart(value, fallback) {
  const cleaned = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned || fallback;
}

async function ensureBucket() {
  const existing = await adminStorage(`bucket/${BUCKET}`);
  if (existing.ok) return;
  const created = await adminStorage("bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES, allowed_mime_types: [...allowedTypes.keys()] }),
  });
  if (!created.ok && created.status !== 409) throw new Error("이미지 보관함을 만들지 못했습니다.");
}

async function studentCanRead(userId, imagePath) {
  const result = await adminRest(`student_portals?auth_user_id=eq.${encodeURIComponent(userId)}&select=payload`);
  if (!result.ok) return false;
  const rows = await result.json();
  return (rows[0]?.payload?.classrooms || []).some((room) =>
    (room.posts || []).some((post) => (post.images || []).some((image) => image.path === imagePath)),
  );
}

function validImageBytes(buffer, type) {
  if (type === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (type === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (type === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export default async function handler(request, response) {
  setCors(request, response);
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") return response.status(204).end();
  try {
    if (request.method === "POST") {
      if (!(await requireAdmin(request))) return response.status(401).json({ error: "관리자 로그인이 필요합니다." });
      const contentType = String(request.body?.contentType || "").toLowerCase();
      const extension = allowedTypes.get(contentType);
      if (!extension) return response.status(400).json({ error: "JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다." });
      const base64 = String(request.body?.data || "").replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length || buffer.length > MAX_BYTES) return response.status(400).json({ error: "이미지는 한 장당 3MB 이하만 올릴 수 있습니다." });
      if (!validImageBytes(buffer, contentType)) return response.status(400).json({ error: "올바른 이미지 파일이 아닙니다." });
      await ensureBucket();
      const roomId = safePart(request.body?.roomId, "room");
      const postId = safePart(request.body?.postId, "post");
      const imagePath = `classroom/${roomId}/${postId}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await adminStorage(`object/${BUCKET}/${imagePath}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "x-upsert": "false" },
        body: buffer,
      });
      if (!uploaded.ok) throw new Error("이미지를 저장하지 못했습니다.");
      return response.status(200).json({ path: imagePath, name: String(request.body?.name || "수업 이미지").slice(0, 120) });
    }

    if (request.method === "DELETE") {
      if (!(await requireAdmin(request))) return response.status(401).json({ error: "관리자 로그인이 필요합니다." });
      const imagePath = String(request.body?.path || "");
      if (!imagePath.startsWith("classroom/")) return response.status(400).json({ error: "삭제할 이미지 경로가 올바르지 않습니다." });
      const deleted = await adminStorage(`object/${BUCKET}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [imagePath] }),
      });
      if (!deleted.ok) throw new Error("이미지를 삭제하지 못했습니다.");
      return response.status(200).json({ ok: true });
    }

    if (request.method === "GET") {
      const user = await requireUser(request);
      if (!user) return response.status(401).json({ error: "로그인이 필요합니다." });
      const imagePath = String(request.query?.path || "");
      const isAdmin = String(user.email || "").toLowerCase() === ADMIN_EMAIL;
      if (!isAdmin && !(await studentCanRead(user.id, imagePath))) return response.status(403).json({ error: "이 이미지를 볼 권한이 없습니다." });
      const signed = await adminStorage(`object/sign/${BUCKET}/${imagePath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!signed.ok) throw new Error("이미지를 불러오지 못했습니다.");
      const data = await signed.json();
      const signedPath = data.signedURL || data.signedUrl;
      const { url } = getSupabaseConfig();
      return response.status(200).json({ url: signedPath?.startsWith("http") ? signedPath : `${url}/storage/v1${signedPath}` });
    }

    response.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return response.status(405).json({ error: "허용되지 않은 요청입니다." });
  } catch (error) {
    return response.status(500).json({ error: error.message || "이미지 처리 중 오류가 발생했습니다." });
  }
}
