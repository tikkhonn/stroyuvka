import type { ReactElement, SVGProps } from "react";
import type { AttendanceAggregate } from "../api/client";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

function ListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </Svg>
  );
}

function PresentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19c.6-3 2.6-5 5-5s4.4 2 5 5" />
      <path d="M15 11.5 17.2 13.7 21 10" />
    </Svg>
  );
}

function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 6v6c0 4.2 2.8 7.4 7 8.5 4.2-1.1 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.7-3.8" />
    </Svg>
  );
}

function BriefcaseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </Svg>
  );
}

function PlaneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12 4 5l2.5 7L4 19l17-7Z" />
      <path d="M6.5 12H21" />
    </Svg>
  );
}

function CrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

function ExitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="m15 16 5-4-5-4M20 12H10" />
    </Svg>
  );
}

function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-6h4v6" />
    </Svg>
  );
}

function DotsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M10 16h4M12 16v2.5" />
    </Svg>
  );
}

export const SUMMARY_ICONS: Record<
  keyof AttendanceAggregate,
  (props: IconProps) => ReactElement
> = {
  total_list: ListIcon,
  present: PresentIcon,
  duty: ShieldIcon,
  trip: BriefcaseIcon,
  leave: PlaneIcon,
  sick: CrossIcon,
  dismissal: ExitIcon,
  away_dorm: HomeIcon,
  other: DotsIcon,
  arrest: LockIcon,
};
