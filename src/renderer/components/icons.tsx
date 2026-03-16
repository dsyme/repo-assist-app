
/** GitHub Agentic Workflow icon — blue automation/actions zap icon */
export function GhAwIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Zap/lightning bolt — actions automation */}
      <path d="M8.75.75V6h3.5a.75.75 0 0 1 .55 1.26l-6 6.5A.75.75 0 0 1 5.75 13V8h-3.5a.75.75 0 0 1-.55-1.26l6-6.5A.75.75 0 0 1 8.75.75Z" fill="#58a6ff" />
    </svg>
  )
}

/** Pages/Deployment icon — represents GitHub Pages or deployment workflows */
export function PagesDeployIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Globe/deploy */}
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1.5a6.5 6.5 0 0 1 4.3 11.35A14.7 14.7 0 0 0 9.5 9.5 14.7 14.7 0 0 0 8 1.5zM6.5 9.5a14.7 14.7 0 0 0-2.8 3.35A6.5 6.5 0 0 1 8 1.5a14.7 14.7 0 0 0-1.5 8z" fillRule="evenodd" opacity="0.85" />
      {/* Arrow up — deploy */}
      <path d="M8 4l2.5 3H9v3H7V7H5.5z" />
    </svg>
  )
}
