import { NextureIconsProps, sizeHelper, strokeSizeHelper } from "../nexture-icons";

export default function NiBarChart({
  className,
  variant = "outlined",
  size = "medium",
  oneTone = false,
}: NextureIconsProps) {
  const iconSize = sizeHelper(size);
  const iconStrokeWidth = strokeSizeHelper(iconSize);

  if (variant === "outlined") {
    return (
      <svg
        width={iconSize}
        height={iconSize}
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Baseline */}
        <path
          opacity={oneTone ? 1 : 0.5}
          d="M3 20H21"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
        />
        {/* Left bar */}
        <rect
          opacity={oneTone ? 1 : 0.6}
          x="4"
          y="12"
          width="4"
          height="8"
          rx="1"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinejoin="round"
        />
        {/* Middle bar (tallest) */}
        <rect
          x="10"
          y="6"
          width="4"
          height="14"
          rx="1"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinejoin="round"
        />
        {/* Right bar */}
        <rect
          opacity={oneTone ? 1 : 0.6}
          x="16"
          y="9"
          width="4"
          height="11"
          rx="1"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  } else {
    return (
      <svg
        width={iconSize}
        height={iconSize}
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Baseline */}
        <path
          opacity={oneTone ? 1 : 0.5}
          d="M3 20H21"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
        />
        {/* Left bar */}
        <rect
          opacity={oneTone ? 1 : 0.6}
          x="4"
          y="12"
          width="4"
          height="8"
          rx="1"
          fill="currentColor"
        />
        {/* Middle bar (tallest) */}
        <rect
          x="10"
          y="6"
          width="4"
          height="14"
          rx="1"
          fill="currentColor"
        />
        {/* Right bar */}
        <rect
          opacity={oneTone ? 1 : 0.6}
          x="16"
          y="9"
          width="4"
          height="11"
          rx="1"
          fill="currentColor"
        />
      </svg>
    );
  }
}
