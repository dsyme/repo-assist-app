
/** GitHub Agentic Workflow icon — represents agentic automation */
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
      {/* Gear/workflow base */}
      <path d="M8 0a1 1 0 0 1 1 1v.8c.9.2 1.7.6 2.4 1.1l.5-.5a1 1 0 0 1 1.4 1.4l-.5.5c.5.7.9 1.5 1.1 2.4H15a1 1 0 1 1 0 2h-.8c-.2.9-.6 1.7-1.1 2.4l.5.5a1 1 0 0 1-1.4 1.4l-.5-.5c-.7.5-1.5.9-2.4 1.1V15a1 1 0 1 1-2 0v-.8c-.9-.2-1.7-.6-2.4-1.1l-.5.5a1 1 0 0 1-1.4-1.4l.5-.5A6 6 0 0 1 2.8 9.3H1a1 1 0 0 1 0-2h.8c.2-.9.6-1.7 1.1-2.4l-.5-.5a1 1 0 0 1 1.4-1.4l.5.5C5 3 5.8 2.6 6.7 2.4V1a1 1 0 0 1 1-1zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fillRule="evenodd" />
      {/* AI sparkle overlay */}
      <circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.9" />
      <path d="M12 2l.4 1.2L13.6 3.6l-1.2.4L12 5.2l-.4-1.2L10.4 3.6l1.2-.4z" fill="var(--bgColor-default, #0d1117)" />
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
