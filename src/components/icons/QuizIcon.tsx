import type { SVGProps } from "react";

export default function QuizIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M7.2 9.2l1.3 1.3 2.4-2.5" />
      <path d="M13.2 9.2h3.6" />
      <circle cx="8.8" cy="14.8" r="1.2" />
      <path d="M13.2 14.8h3.6" />
    </svg>
  );
}