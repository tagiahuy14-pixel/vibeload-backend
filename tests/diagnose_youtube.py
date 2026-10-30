"""Local anonymous comparison only. Does not read cookies or alter production."""
import datetime as dt
import json
import re
import sys
from pathlib import Path
import yt_dlp
import yt_dlp.version

OUT = Path(__file__).resolve().parents[2] / ".qa" / "postdeploy-audit"
OUT.mkdir(parents=True, exist_ok=True)


class Logger:
    def __init__(self):
        self.lines = []

    def debug(self, message):
        self.lines.append(str(message))

    warning = debug
    error = debug


def run(mode):
    logger = Logger()
    options = {"skip_download": True, "noplaylist": True, "quiet": True, "verbose": True,
               "socket_timeout": 20, "retries": 1, "extractor_retries": 1, "logger": logger,
               "cachedir": False, "cookiefile": None}
    if mode == "deployed-clients":
        options["extractor_args"] = {"youtube": {"player_client": ["ios", "android"]}}
    result = {"mode": mode, "version": yt_dlp.version.__version__, "at": dt.datetime.now(dt.timezone.utc).isoformat(), "success": False}
    try:
        with yt_dlp.YoutubeDL(options) as engine:
            info = engine.extract_info("https://www.youtube.com/watch?v=jNQXAC9IVRw", download=False)
        result.update(success=True, title=info.get("title"), formats=len(info.get("formats", [])))
    except Exception as error:
        result["error"] = str(error)
    # Keep query signatures out of shared diagnostic logs.
    result["log"] = [re.sub(r'(https?://[^\s?]+)\?[^\s]+', r'\1?[redacted]', line) for line in logger.lines]
    (OUT / ("youtube-local-" + mode + "-" + yt_dlp.version.__version__ + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    for mode in sys.argv[1:] or ["deployed-clients", "official-defaults"]:
        run(mode)
