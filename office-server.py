from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import shutil
import tempfile


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
STATE_FILE = DATA_DIR / "office-state.json"
RECOVERY_FILE = ROOT / "학생명단-복구백업.json"
LAST_GOOD_FILE = DATA_DIR / "office-state-last-good.json"
ONLINE_DIR = ROOT / "online-classroom"
ONLINE_DATA_FILE = ONLINE_DIR / "classroom-data.js"
ONLINE_STUDENT_DATA_DIR = ONLINE_DIR / "student-data"
ONLINE_ZIP_BASE = ROOT / "과수원과학-학생용-수업방-netlify"
ONLINE_ZIP_FILE = ROOT / "과수원과학-학생용-수업방-netlify.zip"


def read_state_bytes():
    source = STATE_FILE if STATE_FILE.exists() else RECOVERY_FILE
    if source.exists():
        return source.read_bytes()
    return json.dumps(
        {
            "students": [],
            "attendance": {},
            "attendanceSessions": {},
            "payments": {},
            "consulting": {},
            "newConsultations": [],
            "waitlist": [],
            "classHomework": {},
            "classSettings": {},
        },
        ensure_ascii=False,
    ).encode("utf-8")


def read_state_object():
    try:
        return json.loads(read_state_bytes().decode("utf-8"))
    except Exception:
        return {}


def student_key(student):
    if not isinstance(student, dict):
        return ""
    if student.get("id"):
        return f"id:{student.get('id')}"
    return student_info_key(student)


def student_info_key(student):
    if not isinstance(student, dict):
        return ""
    parts = [student.get("name", ""), student.get("school", ""), student.get("grade", "")]
    return "|".join(str(part).strip() for part in parts)


def merge_students(existing, incoming):
    result = []
    id_positions = {}
    info_positions = {}
    for student in existing if isinstance(existing, list) else []:
        id_key = student_key(student)
        info_key = student_info_key(student)
        if id_key:
            id_positions[id_key] = len(result)
        if info_key:
            info_positions[info_key] = len(result)
        result.append(student)

    for student in incoming if isinstance(incoming, list) else []:
        id_key = student_key(student)
        info_key = student_info_key(student)
        position = id_positions.get(id_key)
        if position is None and info_key:
            position = info_positions.get(info_key)
        if position is not None and isinstance(result[position], dict) and isinstance(student, dict):
            result[position] = {**result[position], **student, "id": result[position].get("id") or student.get("id")}
        else:
            if id_key:
                id_positions[id_key] = len(result)
            if info_key:
                info_positions[info_key] = len(result)
            result.append(student)
    return result


def merge_class_settings(existing, incoming):
    existing = existing if isinstance(existing, dict) else {}
    incoming = incoming if isinstance(incoming, dict) else {}
    if len(incoming) < len(existing):
        return {**incoming, **existing}
    return {**existing, **incoming}


def merge_records(existing, incoming):
    existing = existing if isinstance(existing, dict) else {}
    incoming = incoming if isinstance(incoming, dict) else {}
    merged = {**existing}
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_records(merged[key], value)
        else:
            merged[key] = value
    return merged


def merge_named_classes(existing, incoming):
    existing = existing if isinstance(existing, list) else []
    incoming = incoming if isinstance(incoming, list) else []
    if len(incoming) >= len(existing):
        return incoming

    result = []
    positions = {}
    for class_info in existing:
        name = class_info.get("name") if isinstance(class_info, dict) else None
        if name:
            positions[name] = len(result)
        result.append(class_info)
    for class_info in incoming:
        name = class_info.get("name") if isinstance(class_info, dict) else None
        if name and name in positions and isinstance(result[positions[name]], dict):
            result[positions[name]] = {**result[positions[name]], **class_info}
        elif name:
            positions[name] = len(result)
            result.append(class_info)
    return result


def merge_state(existing, incoming):
    existing = existing if isinstance(existing, dict) else {}
    incoming = incoming if isinstance(incoming, dict) else {}
    merged = {**existing, **incoming}
    merged["students"] = merge_students(existing.get("students", []), incoming.get("students", []))
    merged["classSettings"] = merge_class_settings(existing.get("classSettings", {}), incoming.get("classSettings", {}))
    merged["attendanceCycleAnchors"] = merge_records(existing.get("attendanceCycleAnchors", {}), incoming.get("attendanceCycleAnchors", {}))
    merged["customClasses"] = merge_named_classes(existing.get("customClasses", []), incoming.get("customClasses", []))
    return merged


def write_state_bytes(payload):
    DATA_DIR.mkdir(exist_ok=True)
    incoming = json.loads(payload.decode("utf-8"))
    merged = merge_state(read_state_object(), incoming)
    payload = json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8")
    if STATE_FILE.exists():
        shutil.copy2(STATE_FILE, LAST_GOOD_FILE)
    fd, temp_name = tempfile.mkstemp(prefix="office-state-", suffix=".json", dir=DATA_DIR)
    try:
        with os.fdopen(fd, "wb") as temp_file:
            temp_file.write(payload)
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, STATE_FILE)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def write_online_classroom(payload):
    data = json.loads(payload.decode("utf-8"))
    public_data = data.get("publicData", data) if isinstance(data, dict) else data
    student_files = data.get("studentFiles", {}) if isinstance(data, dict) else {}
    ONLINE_DIR.mkdir(exist_ok=True)
    script = "window.CLASSROOM_DATA = " + json.dumps(public_data, ensure_ascii=False, indent=2) + ";\n"
    ONLINE_DATA_FILE.write_text(script, encoding="utf-8")
    if isinstance(student_files, dict):
        if ONLINE_STUDENT_DATA_DIR.exists():
            shutil.rmtree(ONLINE_STUDENT_DATA_DIR)
        ONLINE_STUDENT_DATA_DIR.mkdir(exist_ok=True)
        for code, student_data in student_files.items():
            safe_code = "".join(ch for ch in str(code).upper() if ch.isalnum())
            if not safe_code:
                continue
            (ONLINE_STUDENT_DATA_DIR / f"{safe_code}.json").write_text(
                json.dumps(student_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
    if ONLINE_ZIP_FILE.exists():
        ONLINE_ZIP_FILE.unlink()
    shutil.make_archive(str(ONLINE_ZIP_BASE), "zip", ONLINE_DIR)
    return {
        "ok": True,
        "folder": str(ONLINE_DIR),
        "zip": str(ONLINE_ZIP_FILE),
    }


class OfficeHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/state":
            payload = read_state_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in {"/api/state", "/api/online-classroom"}:
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(length)
        try:
            result = write_online_classroom(payload) if path == "/api/online-classroom" else {"ok": True}
            if path == "/api/state":
                write_state_bytes(payload)
        except Exception as exc:
            message = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
            return

        message = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(message)))
        self.end_headers()
        self.wfile.write(message)


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 5178), OfficeHandler)
    server.serve_forever()
