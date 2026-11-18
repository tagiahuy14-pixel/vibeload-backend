import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Sparkles } from "lucide-react";

interface ActiveTapState {
  btnX: number;
  btnY: number;
  btnW: number;
  btnH: number;
  btnR: number;
  tapX: number;
  tapY: number;
  isPrimary: boolean;
}

const INTERACTIVE_BUTTON_SELECTOR =
  ".button, .deep-link-action, .apk-bridge-action, .web-fallback-action, .qr-chip-button, .paste-button, .quick-chip-button";

/**
 * Global SVG Specular Touch Highlight Layer.
 * Uses pure SVG geometric attributes (no inline style attributes) so strict CSP `style-src 'self'` is 100% respected.
 */
export function LiquidTouchSpecularLayer() {
  const uid = useId().replace(/:/g, "");
  const [tap, setTap] = useState<ActiveTapState | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const activeElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const updateTapFromEvent = (e: PointerEvent, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const computed = window.getComputedStyle(el);
      const radius = parseFloat(computed.borderTopLeftRadius) || 14;
      setTap({
        btnX: rect.left,
        btnY: rect.top,
        btnW: rect.width,
        btnH: rect.height,
        btnR: Math.min(radius, rect.height / 2),
        tapX: e.clientX,
        tapY: e.clientY,
        isPrimary: el.classList.contains("primary"),
      });
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest<HTMLElement>(INTERACTIVE_BUTTON_SELECTOR);
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      activeElementRef.current = btn;
      btn.setAttribute("data-liquid-pressed", "true");
      updateTapFromEvent(e, btn);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const btn = activeElementRef.current;
      if (!btn) return;
      updateTapFromEvent(e, btn);
    };

    const clearPress = () => {
      if (activeElementRef.current) {
        activeElementRef.current.removeAttribute("data-liquid-pressed");
        activeElementRef.current = null;
      }
      setTap(null);
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", clearPress, { passive: true });
    window.addEventListener("pointercancel", clearPress, { passive: true });
    window.addEventListener("scroll", clearPress, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearPress);
      window.removeEventListener("pointercancel", clearPress);
      window.removeEventListener("scroll", clearPress);
    };
  }, []);

  if (!tap) return null;

  const clipId = `btn-tap-clip-${uid}`;
  const gradId = `btn-tap-grad-${uid}`;
  const rimGradId = `btn-tap-rim-${uid}`;

  return (
    <svg
      className="liquid-touch-overlay"
      viewBox={`0 0 ${viewport.w} ${viewport.h}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={tap.btnX}
            y={tap.btnY}
            width={tap.btnW}
            height={tap.btnH}
            rx={tap.btnR}
            ry={tap.btnR}
          />
        </clipPath>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="#ffffff"
            stopOpacity={tap.isPrimary ? "0.52" : "0.62"}
          />
          <stop
            offset="42%"
            stopColor={tap.isPrimary ? "#c4b5fd" : "#93c5fd"}
            stopOpacity="0.24"
          />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={rimGradId}
          cx={tap.tapX}
          cy={tap.tapY}
          r={Math.max(tap.btnW, 120) * 0.75}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#60a5fa" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <circle
          cx={tap.tapX}
          cy={tap.tapY}
          r={Math.max(tap.btnW * 0.55, 78)}
          fill={`url(#${gradId})`}
        />
        <circle
          cx={tap.tapX}
          cy={tap.tapY}
          r="24"
          fill="#ffffff"
          fillOpacity={tap.isPrimary ? "0.28" : "0.35"}
        />
      </g>

      <rect
        x={tap.btnX + 0.75}
        y={tap.btnY + 0.75}
        width={Math.max(0, tap.btnW - 1.5)}
        height={Math.max(0, tap.btnH - 1.5)}
        rx={tap.btnR}
        ry={tap.btnR}
        fill="none"
        stroke={`url(#${rimGradId})`}
        strokeWidth="1.5"
      />
    </svg>
  );
}

interface LiquidGlassRefractionDemoProps {
  compact?: boolean;
}

/**
 * Interactive SVG Edge-Refraction Lens Demo.
 * Demonstrates optical refraction at the glass capsule rim while preserving clarity in the center
 * and keeping foreground icon + label razor-sharp. Uses dedicated SVG scene layers instead of
 * assuming CSS backdrop-filter can replicate edge-weighted refraction across all browsers.
 */
export function LiquidGlassRefractionDemo({ compact = false }: LiquidGlassRefractionDemoProps) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);

  const sceneW = 640;
  const sceneH = compact ? 168 : 196;
  const lensW = compact ? 236 : 256;
  const lensH = compact ? 64 : 72;
  const lensR = lensH / 2;
  const rimWidth = compact ? 15 : 17;

  const [lensPos, setLensPos] = useState(() => ({
    x: sceneW / 2,
    y: sceneH / 2 + 4,
  }));
  const [pressed, setPressed] = useState(false);
  const [tapOffset, setTapOffset] = useState({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  const clampLens = (x: number, y: number) => {
    const padX = lensW / 2 + 12;
    const padY = lensH / 2 + 12;
    return {
      x: Math.max(padX, Math.min(sceneW - padX, x)),
      y: Math.max(padY, Math.min(sceneH - padY, y)),
    };
  };

  const clientToSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: sceneW / 2, y: sceneH / 2 };
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: sceneW / 2, y: sceneH / 2 };
    const scaleX = sceneW / rect.width;
    const scaleY = sceneH / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    const isInsideLens =
      Math.abs(pt.x - lensPos.x) <= lensW / 2 + 16 &&
      Math.abs(pt.y - lensPos.y) <= lensH / 2 + 16;

    if (isInsideLens) {
      dragOffsetRef.current = { dx: lensPos.x - pt.x, dy: lensPos.y - pt.y };
      setTapOffset({ x: pt.x - lensPos.x, y: pt.y - lensPos.y });
    } else {
      const next = clampLens(pt.x, pt.y);
      setLensPos(next);
      dragOffsetRef.current = { dx: 0, dy: 0 };
      setTapOffset({ x: 0, y: 0 });
    }
    setPressed(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pressed) return;
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    const next = clampLens(
      pt.x + dragOffsetRef.current.dx,
      pt.y + dragOffsetRef.current.dy
    );
    setLensPos(next);
    setTapOffset({
      x: Math.max(-lensW / 2, Math.min(lensW / 2, pt.x - next.x)),
      y: Math.max(-lensH / 2, Math.min(lensH / 2, pt.y - next.y)),
    });
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setPressed(false);
  };

  const renderBackdropScene = (layerKey: string) => (
    <g key={layerKey}>
      {/* Optical grid lines */}
      <g className="refraction-grid-lines" strokeWidth="1">
        <line x1="0" y1="36" x2={sceneW} y2="36" />
        <line x1="0" y1={sceneH / 2} x2={sceneW} y2={sceneH / 2} />
        <line x1="0" y1={sceneH - 36} x2={sceneW} y2={sceneH - 36} />
        <line x1="120" y1="0" x2="120" y2={sceneH} />
        <line x1="320" y1="0" x2="320" y2={sceneH} />
        <line x1="520" y1="0" x2="520" y2={sceneH} />
      </g>

      {/* Luminous color pills behind typography */}
      <rect
        x="48"
        y={compact ? "22" : "28"}
        width="176"
        height="24"
        rx="12"
        fill={`url(#orb-blue-${uid})`}
        opacity="0.32"
      />
      <rect
        x="418"
        y={compact ? "120" : "142"}
        width="180"
        height="24"
        rx="12"
        fill={`url(#orb-purple-${uid})`}
        opacity="0.32"
      />

      {/* High-contrast typographic rows to demonstrate rim bending vs center clarity */}
      <text
        x={sceneW / 2}
        y={compact ? "52" : "60"}
        textAnchor="middle"
        className="refraction-bg-kicker"
      >
        OPTICAL RIM REFRACTION · VÙNG GIỮA GIỮ NGUYÊN
      </text>
      <text
        x={sceneW / 2}
        y={compact ? "102" : "116"}
        textAnchor="middle"
        className="refraction-bg-headline"
      >
        SEE THROUGH GLASS
      </text>
      <text
        x={sceneW / 2}
        y={compact ? "142" : "162"}
        textAnchor="middle"
        className="refraction-bg-subline"
      >
        1920 × 1080 · MAXRES FULL HD · LIQUID LENS
      </text>
    </g>
  );

  const outerClipId = `lens-outer-${uid}`;
  const innerClipId = `lens-inner-${uid}`;
  const edgeFilterId = `lens-edge-refract-${uid}`;
  const rimStrokeId = `lens-rim-stroke-${uid}`;
  const tapGlowId = `lens-tap-glow-${uid}`;
  const glassSurfaceId = `lens-surface-${uid}`;

  const lensLeft = lensPos.x - lensW / 2;
  const lensTop = lensPos.y - lensH / 2;
  const innerW = lensW - rimWidth * 2;
  const innerH = lensH - rimWidth * 2;
  const innerLeft = lensPos.x - innerW / 2;
  const innerTop = lensPos.y - innerH / 2;
  const innerR = Math.max(12, innerH / 2);

  // Subtle rim magnification & prism warp around lens center so letters near the rim bend outward
  const rimScaleX = 1.11;
  const rimScaleY = 1.24;
  const rimMatrix = `translate(${lensPos.x}, ${lensPos.y}) scale(${rimScaleX}, ${rimScaleY}) translate(${-lensPos.x}, ${-lensPos.y})`;
  const centerMatrix = `translate(${lensPos.x}, ${lensPos.y}) scale(1.012, 1.012) translate(${-lensPos.x}, ${-lensPos.y})`;
  const pressScaleMatrix = pressed
    ? `translate(${lensPos.x}, ${lensPos.y}) scale(0.968) translate(${-lensPos.x}, ${-lensPos.y})`
    : undefined;

  return (
    <div className={`liquid-refraction-demo ${compact ? "is-compact" : ""}`}>
      <div className="refraction-demo-header">
        <span className="refraction-demo-badge">
          <Sparkles size={13} /> Minh họa khúc xạ mép kính (SVG)
        </span>
        <span className="refraction-demo-hint">
          Kéo hoặc chạm vào thấu kính để xem chữ bẻ cong ở viền
        </span>
      </div>

      <svg
        ref={svgRef}
        className={`refraction-demo-svg ${pressed ? "is-pressed" : ""}`}
        viewBox={`0 0 ${sceneW} ${sceneH}`}
        role="img"
        aria-label="Minh họa thấu kính Liquid Glass: kéo qua chữ để quan sát khúc xạ ở mép kính trong khi vùng giữa và nhãn nút giữ nguyên độ sắc nét"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <linearGradient id={`orb-blue-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0071e3" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id={`orb-purple-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>

          <clipPath id={outerClipId}>
            <rect
              x={lensLeft}
              y={lensTop}
              width={lensW}
              height={lensH}
              rx={lensR}
              ry={lensR}
            />
          </clipPath>

          <clipPath id={innerClipId}>
            <rect
              x={innerLeft}
              y={innerTop}
              width={innerW}
              height={innerH}
              rx={innerR}
              ry={innerR}
            />
          </clipPath>

          {/* SVG displacement filter applied strictly to the outer rim band */}
          <filter id={edgeFilterId} x="-15%" y="-25%" width="130%" height="150%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.018 0.055"
              numOctaves="2"
              seed="7"
              result="wave"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="wave"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          <linearGradient id={glassSurfaceId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.22" />
          </linearGradient>

          <linearGradient id={rimStrokeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="45%" stopColor="#93c5fd" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.82" />
          </linearGradient>

          <radialGradient
            id={tapGlowId}
            cx={lensPos.x + tapOffset.x}
            cy={lensPos.y + tapOffset.y}
            r={lensW * 0.48}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity={pressed ? "0.75" : "0.28"} />
            <stop offset="45%" stopColor="#93c5fd" stopOpacity={pressed ? "0.34" : "0.1"} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 1. Base undistorted SVG background */}
        {renderBackdropScene("base")}

        {/* 2. Draggable Liquid Glass Capsule Lens */}
        <g transform={pressScaleMatrix}>
          {/* 2a. Outer rim band: background text is bent/refracted near the capsule edge */}
          <g clipPath={`url(#${outerClipId})`}>
            <rect
              x={lensLeft}
              y={lensTop}
              width={lensW}
              height={lensH}
              className="refraction-lens-backdrop-fill"
            />
            <g filter={`url(#${edgeFilterId})`} transform={rimMatrix}>
              {renderBackdropScene("rim-refracted")}
            </g>
            <rect
              x={lensLeft}
              y={lensTop}
              width={lensW}
              height={lensH}
              fill={`url(#${glassSurfaceId})`}
            />
          </g>

          {/* 2b. Inner core of the lens: background text stays nearly undistorted */}
          <g clipPath={`url(#${innerClipId})`}>
            <rect
              x={innerLeft}
              y={innerTop}
              width={innerW}
              height={innerH}
              className="refraction-lens-core-fill"
            />
            <g transform={centerMatrix}>{renderBackdropScene("center-clear")}</g>
          </g>

          {/* 2c. Touch-point radial highlight inside the lens */}
          <g clipPath={`url(#${outerClipId})`}>
            <circle
              cx={lensPos.x + tapOffset.x}
              cy={lensPos.y + tapOffset.y}
              r={pressed ? 84 : 56}
              fill={`url(#${tapGlowId})`}
            />
          </g>

          {/* 2d. Specular outer rim & subtle inner rim boundary */}
          <rect
            x={lensLeft + 0.75}
            y={lensTop + 0.75}
            width={lensW - 1.5}
            height={lensH - 1.5}
            rx={lensR}
            ry={lensR}
            fill="none"
            stroke={`url(#${rimStrokeId})`}
            strokeWidth="1.6"
          />
          <rect
            x={innerLeft}
            y={innerTop}
            width={innerW}
            height={innerH}
            rx={innerR}
            ry={innerR}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="0.8"
          />

          {/* 2e. Foreground icon & text on the lens — always 100% crisp and unblurred */}
          <g className="refraction-lens-foreground">
            <circle
              cx={lensLeft + 34}
              cy={lensPos.y}
              r="15"
              className="refraction-lens-icon-pill"
            />
            <path
              d={`M ${lensLeft + 34} ${lensPos.y - 7} L ${lensLeft + 36} ${lensPos.y - 2} L ${lensLeft + 41} ${lensPos.y} L ${lensLeft + 36} ${lensPos.y + 2} L ${lensLeft + 34} ${lensPos.y + 7} L ${lensLeft + 32} ${lensPos.y + 2} L ${lensLeft + 27} ${lensPos.y} L ${lensLeft + 32} ${lensPos.y - 2} Z`}
              fill="#ffffff"
            />
            <text
              x={lensLeft + 58}
              y={lensPos.y - 3}
              className="refraction-lens-title"
            >
              Thấu kính Liquid Glass
            </text>
            <text
              x={lensLeft + 58}
              y={lensPos.y + 13}
              className="refraction-lens-sub"
            >
              Kéo qua chữ · Bấm để phát sáng
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
