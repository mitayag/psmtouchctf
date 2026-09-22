export function TrophyGold({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="goldGradient" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#FFF5C3" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path d="M12 8h40v6c0 14-10 22-20 22S12 28 12 14V8z" fill="url(#goldGradient)" stroke="#B8860B" strokeWidth="2" />
      <rect x="24" y="36" width="16" height="8" rx="2" fill="#FFD700" stroke="#B8860B" strokeWidth="2" />
      <rect x="20" y="44" width="24" height="6" rx="2" fill="#FFD700" stroke="#B8860B" strokeWidth="2" />
      <path d="M8 10h8c0 10-4 18-10 20V10z" fill="#FFD700" stroke="#B8860B" strokeWidth="2" />
      <path d="M56 10h-8c0 10 4 18 10 20V10z" fill="#FFD700" stroke="#B8860B" strokeWidth="2" />
    </svg>
  );
}

export function TrophySilver({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="silverGradient" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#C0C0C0" />
          <stop offset="100%" stopColor="#808080" />
        </linearGradient>
      </defs>
      <path d="M12 8h40v6c0 14-10 22-20 22S12 28 12 14V8z" fill="url(#silverGradient)" stroke="#808080" strokeWidth="2" />
      <rect x="24" y="36" width="16" height="8" rx="2" fill="#C0C0C0" stroke="#808080" strokeWidth="2" />
      <rect x="20" y="44" width="24" height="6" rx="2" fill="#C0C0C0" stroke="#808080" strokeWidth="2" />
      <path d="M8 10h8c0 10-4 18-10 20V10z" fill="#C0C0C0" stroke="#808080" strokeWidth="2" />
      <path d="M56 10h-8c0 10 4 18 10 20V10z" fill="#C0C0C0" stroke="#808080" strokeWidth="2" />
    </svg>
  );
}

export function TrophyBronze({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bronzeGradient" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#F4D0B1" />
          <stop offset="50%" stopColor="#CD7F32" />
          <stop offset="100%" stopColor="#8B4513" />
        </linearGradient>
      </defs>
      <path d="M12 8h40v6c0 14-10 22-20 22S12 28 12 14V8z" fill="url(#bronzeGradient)" stroke="#8B4513" strokeWidth="2" />
      <rect x="24" y="36" width="16" height="8" rx="2" fill="#CD7F32" stroke="#8B4513" strokeWidth="2" />
      <rect x="20" y="44" width="24" height="6" rx="2" fill="#CD7F32" stroke="#8B4513" strokeWidth="2" />
      <path d="M8 10h8c0 10-4 18-10 20V10z" fill="#CD7F32" stroke="#8B4513" strokeWidth="2" />
      <path d="M56 10h-8c0 10 4 18 10 20V10z" fill="#CD7F32" stroke="#8B4513" strokeWidth="2" />
    </svg>
  );
}

export function TrophyCyan({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M10 8h28v4c0 10-7 16-14 16S10 22 10 12V8z" fill="#111A2E" stroke="#20E3FF" strokeWidth="2" />
      <rect x="18" y="28" width="12" height="5" rx="1" fill="#111A2E" stroke="#20E3FF" strokeWidth="2" />
      <rect x="15" y="34" width="18" height="4" rx="1" fill="#111A2E" stroke="#20E3FF" strokeWidth="2" />
    </svg>
  );
}

export function ShineIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 0L36 24L60 20L40 32L60 44L36 40L32 64L28 40L4 44L24 32L4 20L28 24Z" fill="rgba(255,255,255,0.9)">
        <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="1" />
      </path>
    </svg>
  );
}
