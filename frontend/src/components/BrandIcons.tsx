import type { SVGProps } from "react";

export function TikTokIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.47 6.27 6.27 0 0 0 1.95-4.46V8.78a8.28 8.28 0 0 0 4.82 1.55V6.88c-.33 0-.67-.06-1-.19z"
        fill="currentColor"
      />
    </svg>
  );
}

export function YouTubeIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
        fill="#FF0000"
      />
      <polygon points="9.545,15.568 15.818,12 9.545,8.432" fill="#FFFFFF" />
    </svg>
  );
}

export function SoundCloudIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#FF5500"
      className={className}
      {...props}
    >
      <path d="M11.56 12.03v7.19h.89v-7.19zm-1.52 1.48v5.71h.9v-5.71zm3.03-2.15v7.86h.89v-7.86zm-4.54 3.12v4.74h.89v-4.74zm6.05-3.32v8.06h.89v-8.06zm-7.56 4.3v3.76h.9v-3.76zm9.07-4.14v7.9h.89v-7.9zm-10.58 4.74v3.16h.89v-3.16zm12.09-3.86v7.02h.89v-7.02zm-13.6 4.41v2.61h.89v-2.61zm15.11-3.69c-.27 0-.53.04-.77.12v6.17h4.09c1.37 0 2.48-1.12 2.48-2.49s-1.11-2.49-2.48-2.49c-.21 0-.41.03-.6.08-.23-1.89-1.83-3.39-3.72-3.39zM.98 16.59v1.39h.89v-1.39zm-1-.21v1.8h.89v-1.8z" />
    </svg>
  );
}

export function InstagramIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <radialGradient id="ig-gradient-icon" cx="20%" cy="100%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-gradient-icon)" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.2" stroke="url(#ig-gradient-icon)" strokeWidth="2.2" />
      <circle cx="17.6" cy="6.4" r="1.3" fill="url(#ig-gradient-icon)" />
    </svg>
  );
}

export function FacebookIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#1877F2"
      className={className}
      {...props}
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function ThreadsIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M12.003 0C5.372 0 0 5.372 0 12.003c0 6.63 5.372 12.003 12.003 12.003 6.63 0 12.003-5.372 12.003-12.003C24.006 5.372 18.633 0 12.003 0zm4.582 13.064c-.09 2.76-1.57 4.55-4.25 4.55-2.22 0-3.79-1.39-3.79-3.34 0-1.92 1.48-3.32 3.65-3.32.96 0 1.87.27 2.53.75-.12-1.89-1.28-2.91-3.07-2.91-1.25 0-2.2.53-2.61 1.48l-1.62-.89c.74-1.59 2.37-2.41 4.29-2.41 2.92 0 4.88 1.74 4.88 4.79v5.33h-1.89v-1.18c-.73.86-1.74 1.36-3.06 1.36-2.48 0-4.04-1.67-4.04-3.81 0-2.18 1.63-3.83 4.22-3.83 1.25 0 2.27.35 3.03.95v-.26c0-.98-.7-1.61-1.91-1.61-1.04 0-1.74.43-1.97 1.09l-1.62-.77c.48-1.28 1.83-2.13 3.65-2.13 2.38 0 3.82 1.34 3.82 3.42v3.78h-.27zm-1.89-.37c-.6-.44-1.42-.69-2.27-.69-1.64 0-2.63.97-2.63 2.15 0 1.15.96 2.08 2.39 2.08 1.67 0 2.51-1.09 2.51-2.45v-1.09z" />
    </svg>
  );
}

export function PinterestIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#E60023"
      className={className}
      {...props}
    >
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.124.347 2.317.535 3.554.535 6.627 0 12-5.373 12-12C24.017 5.367 18.644 0 12.017 0z" />
    </svg>
  );
}

export function RedditIcon({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#FF4500"
      className={className}
      {...props}
    >
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286A.75.75 0 0 0 1.76 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.347 13.916c.036.216.053.437.053.662 0 3.38-3.896 6.12-8.7 6.12-4.805 0-8.7-2.74-8.7-6.12 0-.225.018-.446.053-.662a2.385 2.385 0 0 1-1.203-2.066c0-1.317 1.068-2.385 2.385-2.385.674 0 1.284.28 1.718.73 1.554-1.103 3.664-1.808 6.007-1.874l1.022-4.805a.477.477 0 0 1 .572-.363l3.376.717a1.67 1.67 0 0 1 1.614-.997c.925 0 1.675.75 1.675 1.675 0 .925-.75 1.675-1.675 1.675-.925 0-1.675-.75-1.675-1.675a1.67 1.67 0 0 1 .425-1.107l-2.969-.63-.906 4.267c2.316.074 4.398.778 5.932 1.874.434-.45.1.044.718-.73 1.317 0 2.385 1.068 2.385 2.385 0 .895-.494 1.675-1.22 2.066zM8.85 13.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm6.3 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm-6.09 4.35a.45.45 0 0 0-.09.63c.69.93 1.77 1.47 2.94 1.47s2.25-.54 2.94-1.47a.45.45 0 0 0-.72-.54c-.54.72-1.38 1.11-2.22 1.11s-1.68-.39-2.22-1.11a.45.45 0 0 0-.63-.09z" />
    </svg>
  );
}
