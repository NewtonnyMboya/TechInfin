import hashlib
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
MAX_BYTES = 500 * 1024 * 1024
SUPABASE_HOST = os.environ.get("SUPABASE_STORAGE_HOST", "")
API_KEY = os.environ.get("SCANNER_API_KEY", "")

def fail(message, status=400):
    return jsonify({"error": message}), status

def validate_url(value):
    parsed = urlparse(value or "")
    if (parsed.scheme != "https" or not SUPABASE_HOST
        or parsed.hostname != SUPABASE_HOST
        or not parsed.path.startswith("/storage/v1/object/sign/software-private/")):
        raise ValueError("Only signed URLs from the configured private software bucket are accepted")
    return parsed

def inspect_content(path, filename):
    suffix = Path(filename).suffix.lower()
    with open(path, "rb") as f:
        head = f.read(16)
    if suffix == ".pdf":
        if not head.startswith(b"%PDF-"):
            raise ValueError("File extension and PDF signature do not match")
        return "application/pdf"
    if suffix in (".zip", ".apk"):
        if not (head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08")):
            raise ValueError("File extension and ZIP/APK signature do not match")
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(x.file_size for x in entries) > 2 * 1024 * 1024 * 1024:
                raise ValueError("Archive exceeds safe content limits")
            names = [x.filename for x in entries]
            if any(n.startswith("/") or ".." in Path(n).parts for n in names):
                raise ValueError("Archive contains unsafe paths")
            bad = archive.testzip()
            if bad:
                raise ValueError("Archive integrity check failed")
            if suffix == ".apk" and "AndroidManifest.xml" not in names:
                raise ValueError("APK is missing AndroidManifest.xml")
        return "application/vnd.android.package-archive" if suffix == ".apk" else "application/zip"
    raise ValueError("Only .pdf, .zip and .apk files are supported by the verifier")

@app.get("/health")
def health():
    return jsonify({"ok": True, "scanner": "ClamAV"})

@app.post("/scan")
def scan():
    if not API_KEY or request.headers.get("Authorization") != "Bearer " + API_KEY:
        return fail("Unauthorized", 401)
    body = request.get_json(silent=True) or {}
    url = body.get("download_url")
    filename = body.get("file_name", "")
    if not isinstance(filename, str) or not filename or len(filename) > 180:
        return fail("A valid file_name is required")
    try:
        validate_url(url)
        digest = hashlib.sha256()
        total = 0
        with tempfile.TemporaryDirectory() as directory:
            target = os.path.join(directory, "upload")
            with requests.get(url, stream=True, timeout=(15, 300)) as response:
                response.raise_for_status()
                with open(target, "wb") as output:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        total += len(chunk)
                        if total > MAX_BYTES:
                            return fail("File exceeds 500 MB limit", 413)
                        digest.update(chunk)
                        output.write(chunk)
            if total < 1:
                return fail("Empty files are not accepted")
            detected = inspect_content(target, filename)
            version = subprocess.run(["clamscan", "--version"], capture_output=True, text=True, check=True).stdout.strip()
            result = subprocess.run(["clamscan", "--no-summary", target], capture_output=True, text=True, timeout=600)
            if result.returncode == 0:
                clean = True
            elif result.returncode == 1:
                clean = False
            else:
                return fail("ClamAV scan could not complete; product must remain unpublished", 503)
            return jsonify({
                "clean": clean,
                "sha256": digest.hexdigest(),
                "size_bytes": total,
                "detected_mime": detected,
                "engine": version[:80]
            })
    except (ValueError, requests.RequestException, zipfile.BadZipFile, subprocess.SubprocessError) as exc:
        return fail(str(exc), 422)
    except Exception:
        app.logger.exception("Unexpected scanner failure")
        return fail("Scanner failed safely; product remains unpublished", 500)
