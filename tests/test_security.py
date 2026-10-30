import pytest
from fastapi import HTTPException
from app.security import validate_url_security, sanitize_filename, validate_job_id


def test_ssrf_rejects_localhost_and_loopback():
    blocked_urls = [
        "http://localhost:8000/secret",
        "http://127.0.0.1/admin",
        "http://127.0.0.2:3000",
        "http://[::1]/internal",
        "http://10.0.0.1/config",
        "http://192.168.1.1/router",
        "http://172.16.0.1/keys",
        "http://169.254.169.254/latest/meta-data/",
        "http://server.local/passwords",
        "http://internal.lan/",
    ]
    for url in blocked_urls:
        with pytest.raises(HTTPException) as exc:
            validate_url_security(url)
        assert exc.value.status_code in (400, 403)


def test_ssrf_rejects_non_http_schemes():
    blocked = [
        "file:///etc/passwd",
        "ftp://example.com/file",
        "javascript:alert(1)",
        "gopher://example.com",
    ]
    for url in blocked:
        with pytest.raises(HTTPException) as exc:
            validate_url_security(url)
        assert exc.value.status_code == 400


def test_ssrf_accepts_valid_public_urls():
    valid = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.tiktok.com/@tiktok/video/7106594312292453678",
        "https://www.facebook.com/watch/?v=123456",
        "https://soundcloud.com/artist/track",
    ]
    for url in valid:
        assert validate_url_security(url) == url


def test_sanitize_filename_prevents_traversal():
    assert ".." not in sanitize_filename("../../etc/passwd")
    assert "/" not in sanitize_filename("foo/bar.mp4")
    assert "\\" not in sanitize_filename("foo\\bar.mp4")
    assert sanitize_filename("") == "media"


def test_validate_job_id():
    valid_uuid = "e7b0a701-44df-44be-83bf-1c88d89cb217"
    assert validate_job_id(valid_uuid) == valid_uuid

    invalid_uuids = [
        "../../etc/passwd",
        "e7b0a701",
        "1234-invalid",
        "e7b0a701-44df-54be-83bf-1c88d89cb217",  # not uuid4
        "; DROP TABLE;",
    ]
    for inv in invalid_uuids:
        with pytest.raises(HTTPException):
            validate_job_id(inv)
