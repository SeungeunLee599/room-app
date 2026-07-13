type MedicalMarkProps = {
  className?: string;
};

export function MedicalMark({ className }: MedicalMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="4" width="56" height="56" rx="20" fill="#FFFFFF" />
      <rect x="4" y="4" width="56" height="56" rx="20" stroke="#CDE7EE" strokeWidth="2" />
      <circle cx="32" cy="19" r="9" fill="#18314D" />
      <path
        d="M13 51V45C13 34.5 21.5 26 32 26C42.5 26 51 34.5 51 45V51C51 53.2 49.2 55 47 55H17C14.8 55 13 53.2 13 51Z"
        fill="#18314D"
      />
      <path d="M25 27.8L32 36L39 27.8C36.8 26.6 34.4 26 32 26C29.6 26 27.2 26.6 25 27.8Z" fill="#FFFFFF" />
      <path d="M42 37V49M36 43H48" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
