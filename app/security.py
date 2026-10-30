import ipaddress
import re
import socket
import urllib.parse
from pathlib import Path
from typing import Tuple, Optional
from fastapi import HTTPException, Request
from .config import settings

# Disallowed IP networks for SSRF protection
BLOCKED_NETWORKS = [
    # IPv4
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("::ffff:0:0/96"),
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("100::/64"),
    ipaddress.ip_network("2001:db8::/32"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
]

BLOCKED_HOST_SUFFIXES = [
    "localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "onion", "arpa"
]

UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)


def is_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address belongs to private, loopback, or reserved networks."""
    for net in BLOCKED_NETWORKS:
        if ip in net:
            return True
    return False


def validate_url_security(raw_url: str) -> str:
    """
    Validate target URL against SSRF attacks.
    Ensures scheme is http/https and host does not resolve to private or loopback IPs.
    """
    url = raw_url.strip().strip('"\'')
    if not url:
        raise HTTPException(status_code=400, detail="URL không được để trống")

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận giao thức HTTP hoặc HTTPS")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="URL không có hostname hợp lệ")

    host_lower = hostname.lower().rstrip(".")

    # Check blocked suffixes
    for suffix in BLOCKED_HOST_SUFFIXES:
        if host_lower == suffix or host_lower.endswith(f".{suffix}"):
            raise HTTPException(status_code=403, detail="Không được phép truy cập địa chỉ máy chủ nội bộ (SSRF)")

    # Resolve IP and verify each resolved address
    try:
        # Check if direct IP literal first
        try:
            ip_obj = ipaddress.ip_address(host_lower)
            if is_ip_blocked(ip_obj):
                raise HTTPException(status_code=403, detail="Không được phép truy cập địa chỉ IP riêng hoặc nội bộ (SSRF)")
            return url
        except ValueError:
            pass

        # Resolve DNS
        addr_info = socket.getaddrinfo(host_lower, parsed.port or (443 if parsed.scheme == "https" else 80))
        for res in addr_info:
            sockaddr = res[4]
            ip_str = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip_str)
            if is_ip_blocked(ip_obj):
                raise HTTPException(status_code=403, detail="Tên miền phân giải về địa chỉ mạng nội bộ hoặc bị cấm (SSRF)")
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Không thể phân giải tên miền: {hostname}")

    return url


def sanitize_filename(filename: str, fallback: str = "media") -> str:
    """
    Sanitize filename against path traversal and dangerous characters.
    """
    # Normalize unicode
    name = re.sub(r'[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]', '_', filename)
    name = re.sub(r'\.{2,}', '_', name)  # remove ..
    name = name.strip('. ')
    if not name:
        name = fallback
    # Limit length
    if len(name.encode("utf-8")) > 180:
        name = name[:80]
    return name


def validate_job_id(job_id: str) -> str:
    """Validate that job_id is a valid UUID4 string to prevent directory traversal."""
    if not job_id or not UUID_REGEX.match(job_id):
        raise HTTPException(status_code=400, detail="ID tác vụ không hợp lệ")
    return job_id


def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"
