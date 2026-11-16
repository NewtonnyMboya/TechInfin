import io
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch
from subprocess import TimeoutExpired

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class ScannerSecurityTests(unittest.TestCase):
    def test_pdf_extension_with_non_pdf_content_is_rejected(self):
        with tempfile.NamedTemporaryFile() as sample:
            sample.write(b"this is not a PDF")
            sample.flush()
            with self.assertRaisesRegex(ValueError, "signature do not match"):
                server.inspect_content(sample.name, "report.pdf")

    def test_zip_extension_with_non_zip_content_is_rejected(self):
        with tempfile.NamedTemporaryFile() as sample:
            sample.write(b"MZ\x00\x00not a zip")
            sample.flush()
            with self.assertRaisesRegex(ValueError, "signature do not match"):
                server.inspect_content(sample.name, "package.zip")

    def test_corrupt_zip_is_rejected(self):
        with tempfile.NamedTemporaryFile() as sample:
            sample.write(b"PK\x03\x04" + b"not-a-valid-archive")
            sample.flush()
            with self.assertRaises((zipfile.BadZipFile, ValueError)):
                server.inspect_content(sample.name, "package.zip")

    def test_clamav_timeout_returns_service_unavailable(self):
        server.API_KEY = "ci-test-key"
        fake_response = MagicMock()
        fake_response.__enter__.return_value = fake_response
        fake_response.iter_content.return_value = [b"%PDF-1.7\nvalid test fixture"]
        fake_response.raise_for_status.return_value = None

        with patch.object(server, "validate_url"), \
             patch.object(server.requests, "get", return_value=fake_response), \
             patch.object(server.subprocess, "run", side_effect=[
                 MagicMock(stdout="ClamAV 1.4.3"),
                 TimeoutExpired(cmd="clamscan", timeout=600),
             ]):
            response = server.app.test_client().post(
                "/scan",
                headers={"Authorization": "Bearer ci-test-key"},
                json={
                    "download_url": "https://example.invalid/signed",
                    "file_name": "report.pdf",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("timed out", response.get_json()["error"].lower())

    def test_scanner_requires_authorization(self):
        server.API_KEY = "ci-test-key"
        response = server.app.test_client().post(
            "/scan",
            json={"download_url": "https://example.invalid/signed", "file_name": "x.pdf"},
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
