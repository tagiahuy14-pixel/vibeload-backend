import { useState, useEffect } from "react";
import { X, QrCode, Smartphone, Check, Copy } from "lucide-react";
import QRCode from "qrcode";

interface QRCodeModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function QRCodeModal({ url, title, onClose }: QRCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const fullUrl = url.startsWith("http")
          ? url
          : `${window.location.origin}/?url=${encodeURIComponent(url)}`;
        const dataUrl = await QRCode.toDataURL(fullUrl, {
          width: 280,
          margin: 2,
          color: {
            dark: "#0F172A",
            light: "#FFFFFF",
          },
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        // ignore
      }
    }
    void generate();
    return () => {
      cancelled = true;
    };
  }, [url]);

  function copyLink() {
    try {
      void navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="trimmer-modal-header">
          <div className="trimmer-modal-title">
            <span className="trimmer-icon-circle">
              <QrCode size={18} />
            </span>
            <div>
              <h3>Quét Mã Chuyển Sang Điện Thoại</h3>
              <p>Mở camera điện thoại quét để tải nhanh không cần gửi qua mạng xã hội</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="qr-modal-body">
          <div className="qr-preview-wrapper">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Mã QR tải media" className="qr-image" />
            ) : (
              <div className="qr-skeleton" />
            )}
          </div>

          <div className="qr-media-meta">
            <p className="qr-meta-title" title={title}>
              {title || "VibeLoad Media"}
            </p>
            <div className="qr-link-copy-row">
              <span className="qr-link-text">{url}</span>
              <button
                type="button"
                className="icon-button"
                onClick={copyLink}
                title="Sao chép liên kết"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="qr-guide-box">
            <Smartphone size={18} />
            <span>
              Mở <strong>Camera</strong> điện thoại (hoặc Zalo / trình quét QR) quét mã trên để mở ngay và tải về thiết bị.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
