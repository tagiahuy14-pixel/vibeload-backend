import io
import zipfile
from email.message import Message
import pytest

PIL = pytest.importorskip("PIL")
Image = PIL.Image
from app.services.photos import download_photo
from app.services.zip_service import create_photo_zip


def image_bytes(fmt="PNG"):
    stream = io.BytesIO()
    Image.new("RGB", (3, 2), "blue").save(stream, format=fmt)
    return stream.getvalue()


class Response(io.BytesIO):
    def __init__(self, data, mime):
        super().__init__(data)
        self.headers = Message()
        self.headers["Content-Type"] = mime


def test_actual_format_overrides_url_suffix(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.photos.safe_urlopen", lambda *a, **kw: Response(image_bytes(), "image/png"))
    target = tmp_path / "photo.jpg"
    assert download_photo("https://cdn.example/image.jpg", target) == ("png", "image/png")
    with Image.open(target) as image:
        assert image.size == (3, 2)


@pytest.mark.parametrize("data,mime", [(b"<html>error</html>", "text/html"), (b"not an image", "image/jpeg"), (image_bytes(), "image/jpeg")])
def test_invalid_image_is_not_delivered(monkeypatch, tmp_path, data, mime):
    monkeypatch.setattr("app.services.photos.safe_urlopen", lambda *a, **kw: Response(data, mime))
    target = tmp_path / "photo"
    with pytest.raises(Exception):
        download_photo("https://cdn.example/image", target)
    assert not target.exists()


def test_album_keeps_order_and_validated_extension(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.photos.safe_urlopen", lambda *a, **kw: Response(image_bytes(), "image/png"))
    result = create_photo_zip([{"url": "https://cdn.example/1"}, {"url": "https://cdn.example/2"}], tmp_path / "album.zip")
    with zipfile.ZipFile(result) as archive:
        assert archive.namelist() == ["photo_01.png", "photo_02.png"]
        assert archive.testzip() is None


def test_incomplete_album_fails_with_index_and_count(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.photos.safe_urlopen", lambda *a, **kw: Response(image_bytes(), "image/png"))
    with pytest.raises(RuntimeError, match="#2.*1/2"):
        create_photo_zip([{"url": "https://cdn.example/1"}, {"index": 2}], tmp_path / "album.zip")
    assert not (tmp_path / "album.zip").exists()


def test_photo_limit_and_cancel(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.photos.safe_urlopen", lambda *a, **kw: Response(image_bytes(), "image/png"))
    with pytest.raises(Exception):
        download_photo("https://cdn.example/image", tmp_path / "photo", max_bytes=4)
    with pytest.raises(RuntimeError, match="DOWNLOAD_CANCELLED"):
        download_photo("https://cdn.example/image", tmp_path / "photo", cancelled=lambda: True)
    assert not (tmp_path / "photo").exists()
