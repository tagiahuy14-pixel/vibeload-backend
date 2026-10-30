from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseExtractor(ABC):
    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Check if this extractor can handle the given URL."""
        pass

    @abstractmethod
    def analyze(self, url: str) -> Dict[str, Any]:
        """Analyze the media URL and return structured metadata."""
        pass
