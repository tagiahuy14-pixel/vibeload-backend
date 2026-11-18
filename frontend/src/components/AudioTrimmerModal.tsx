import { useState, useEffect, useRef } from "react";
import { X, Play, Pause, Scissors, Download, Volume2, Sparkles, Check, Zap, Disc3 } from "lucide-react";
import { decodeAudioBlob, sliceAudioBuffer, audioBufferToWav, renderProcessedAudio } from "../lib/audioTrimmer";
import { saveBlob } from "../lib/save";

interface AudioTrimmerModalProps {
  blob: Blob;
  fileName: string;
  onClose: () => void;
  onNotice?: (msg: string) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

export function AudioTrimmerModal({ blob, fileName, onClose, onNotice }: AudioTrimmerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [volumeBoost, setVolumeBoost] = useState<number>(1.0);
  const [bassBoost, setBassBoost] = useState<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const activeSourceNode = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { buffer, audioContext: ctx } = await decodeAudioBlob(blob);
        if (isCancelled) return;
        setAudioBuffer(buffer);
        setAudioContext(ctx);
        setDuration(buffer.duration);
        setStartTime(0);
        setEndTime(Math.min(30, buffer.duration));
      } catch (err) {
        if (!isCancelled) {
          setError("Không thể giải mã dữ liệu âm thanh để cắt. Hãy đảm bảo định dạng được hỗ trợ.");
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    void load();

    return () => {
      isCancelled = true;
      stopPlayback();
    };
  }, [blob]);

  function stopPlayback() {
    if (activeSourceNode.current) {
      try {
        activeSourceNode.current.stop();
        activeSourceNode.current.disconnect();
      } catch {
        // Ignore errors if already stopped
      }
      activeSourceNode.current = null;
    }
    setIsPlaying(false);
  }

  function handleTogglePlay() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!audioContext || !audioBuffer) return;

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const sliced = sliceAudioBuffer(audioContext, audioBuffer, startTime, endTime);
    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = sliced;

    let lastNode: AudioNode = sourceNode;
    if (bassBoost) {
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowshelf";
      filter.frequency.value = 140;
      filter.gain.value = 6;
      lastNode.connect(filter);
      lastNode = filter;
    }

    if (volumeBoost !== 1.0) {
      const gain = audioContext.createGain();
      gain.gain.value = volumeBoost;
      lastNode.connect(gain);
      lastNode = gain;
    }

    lastNode.connect(audioContext.destination);

    sourceNode.onended = () => {
      setIsPlaying(false);
      activeSourceNode.current = null;
    };

    activeSourceNode.current = sourceNode;
    sourceNode.start(0);
    setIsPlaying(true);
  }

  function applyPreset(presetDuration: number) {
    stopPlayback();
    const newEnd = Math.min(duration, startTime + presetDuration);
    setEndTime(newEnd);
  }

  async function handleExport() {
    if (!audioContext || !audioBuffer) return;
    try {
      setSaving(true);
      stopPlayback();
      const processed = await renderProcessedAudio(
        audioBuffer,
        startTime,
        endTime,
        volumeBoost,
        bassBoost
      );
      const wavBlob = audioBufferToWav(processed);

      const baseName = fileName.replace(/\.[a-zA-Z0-9]+$/i, "");
      const bassTag = bassBoost ? "_BassBoost" : "";
      const volTag = volumeBoost > 1.0 ? `_${Math.round(volumeBoost * 100)}pct` : "";
      const outputName = `${baseName}_Ringtone_30s${bassTag}${volTag}.wav`;

      await saveBlob(wavBlob, outputName);
      setSavedSuccess(true);
      onNotice?.(`Đã xuất tệp nhạc chuông chất lượng cao: ${outputName}`);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      onNotice?.("Lỗi khi xử lý và lưu tệp âm thanh.");
    } finally {
      setSaving(false);
    }
  }

  const selectedLength = Math.max(0, endTime - startTime);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="trimmer-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="trimmer-modal-header">
          <div className="trimmer-modal-title">
            <span className="trimmer-icon-circle">
              <Scissors size={18} />
            </span>
            <div>
              <h3>Cắt Nhạc Chuông 1 Chạm</h3>
              <p>Tạo đoạn nhạc chuông / báo thức 30s trực tiếp trên thiết bị (0đ phí)</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="trimmer-modal-body">
          {loading ? (
            <div className="trimmer-loading">
              <div className="spin-circle" />
              <span>Đang phân tích phổ âm thanh trực tiếp trên thiết bị...</span>
            </div>
          ) : error ? (
            <div className="trimmer-error">{error}</div>
          ) : (
            <>
              <div className="trimmer-file-info">
                <Volume2 size={16} className="text-muted" />
                <span className="trimmer-filename">{fileName}</span>
                <span className="trimmer-total-duration">Tổng: {formatTime(duration)}</span>
              </div>

              {/* Range Preview Box */}
              <div className="trimmer-visual-box">
                <div className="trimmer-wave-bars">
                  {Array.from({ length: 42 }).map((_, idx) => {
                    const ratio = idx / 42;
                    const isInside = ratio >= startTime / duration && ratio <= endTime / duration;
                    const heightPercent = 25 + Math.sin(idx * 0.45) * 35 + ((idx * 17) % 30);
                    return (
                      <span
                        key={idx}
                        className={`wave-bar ${isInside ? "active" : ""}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    );
                  })}
                </div>

                <div className="trimmer-time-display">
                  <span>Bắt đầu: <strong>{formatTime(startTime)}</strong></span>
                  <span className="time-highlight">Độ dài: <strong>{selectedLength.toFixed(1)}s</strong></span>
                  <span>Kết thúc: <strong>{formatTime(endTime)}</strong></span>
                </div>
              </div>

              {/* Slider Controls */}
              <div className="trimmer-controls-group">
                <div className="trimmer-slider-row">
                  <label htmlFor="start-slider">Điểm bắt đầu:</label>
                  <input
                    id="start-slider"
                    type="range"
                    min={0}
                    max={Math.max(0, endTime - 1)}
                    step={0.5}
                    value={startTime}
                    onChange={(e) => {
                      stopPlayback();
                      setStartTime(Number(e.target.value));
                    }}
                  />
                  <span>{formatTime(startTime)}</span>
                </div>

                <div className="trimmer-slider-row">
                  <label htmlFor="end-slider">Điểm kết thúc:</label>
                  <input
                    id="end-slider"
                    type="range"
                    min={startTime + 1}
                    max={duration}
                    step={0.5}
                    value={endTime}
                    onChange={(e) => {
                      stopPlayback();
                      setEndTime(Number(e.target.value));
                    }}
                  />
                  <span>{formatTime(endTime)}</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="trimmer-presets-row">
                <span className="presets-label">Gợi ý nhanh:</span>
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(15)}
                >
                  ⚡ 15s Thông báo
                </button>
                <button
                  type="button"
                  className="preset-chip active"
                  onClick={() => applyPreset(30)}
                >
                  <Sparkles size={13} /> 30s Nhạc chuông
                </button>
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(45)}
                >
                  ⏰ 45s Báo thức
                </button>
              </div>

              {/* DSP Audio Boost Controls */}
              <div className="trimmer-dsp-box">
                <div className="dsp-section-title">
                  <Zap size={14} className="text-accent" />
                  <span>Khuếch đại & Xử lý âm thanh (Web Audio API)</span>
                </div>
                <div className="dsp-controls-row">
                  <div className="dsp-control-group">
                    <span className="dsp-label">Âm lượng:</span>
                    <div className="dsp-chips">
                      {[
                        { label: "100% Gốc", val: 1.0 },
                        { label: "150% (+50%)", val: 1.5 },
                        { label: "200% (Gấp đôi)", val: 2.0 },
                      ].map((chip) => (
                        <button
                          key={chip.val}
                          type="button"
                          className={`preset-chip ${volumeBoost === chip.val ? "active" : ""}`}
                          onClick={() => {
                            stopPlayback();
                            setVolumeBoost(chip.val);
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="dsp-control-group">
                    <button
                      type="button"
                      className={`preset-chip ${bassBoost ? "active bass-active" : ""}`}
                      onClick={() => {
                        stopPlayback();
                        setBassBoost((prev) => !prev);
                      }}
                      title="Tăng cường dải tần số thấp (+6dB) giúp âm trầm dày và ấm hơn"
                    >
                      <Disc3 size={14} /> Bass Booster: {bassBoost ? "BẬT" : "TẮT"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions: Play Preview & Export */}
              <div className="trimmer-actions-row">
                <button
                  type="button"
                  className={`button secondary ${isPlaying ? "playing" : ""}`}
                  onClick={handleTogglePlay}
                >
                  {isPlaying ? (
                    <>
                      <Pause size={17} /> Tạm dừng
                    </>
                  ) : (
                    <>
                      <Play size={17} /> Nghe thử đoạn chọn
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="button primary"
                  disabled={saving || selectedLength <= 0}
                  onClick={() => void handleExport()}
                >
                  {saving ? (
                    "Đang xuất..."
                  ) : savedSuccess ? (
                    <>
                      <Check size={17} /> Đã xuất nhạc chuông!
                    </>
                  ) : (
                    <>
                      <Download size={17} /> Xuất Nhạc Chuông (.WAV)
                    </>
                  )}
                </button>
              </div>

              <div className="trimmer-help-note">
                <span>💡 Tệp xuất ra định dạng chuẩn <strong>PCM WAV 16-bit</strong> tương thích 100% với cài làm nhạc chuông/báo thức trên cả Android và iPhone.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
