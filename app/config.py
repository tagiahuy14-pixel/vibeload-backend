from typing import List, Union
import json
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
import tempfile


class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "production"
    # Avoid collisions with host tooling that exports DEBUG=WARN, etc.
    DEBUG: bool = Field(False, validation_alias="VIBELOAD_DEBUG")
    SYSTEM_STATUS_TOKEN: str = ""

    CORS_ORIGINS: Union[List[str], str] = [
        "https://vibeload-web.vercel.app",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ]

    STORAGE_DIR: str = str(Path(tempfile.gettempdir()) / "vibeload")
    MAX_STORAGE_MB: int = 5120  # 5 GB
    STORAGE_TTL_SECONDS: int = 1800  # 30 minutes

    MAX_CONCURRENT_JOBS_PER_IP: int = 1
    MAX_CONCURRENT_JOBS_TOTAL: int = 1
    RATE_LIMIT_PER_MINUTE: int = 60

    MAX_FILE_SIZE_MB: int = 500
    SOCKET_TIMEOUT: int = 30
    MAX_PHOTO_SIZE_MB: int = 20

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def storage_path(self) -> Path:
        p = Path(self.STORAGE_DIR).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
