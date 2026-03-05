import { NextureIconsProps, sizeHelper, strokeSizeHelper } from "../nexture-icons";

export default function NiHome({
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
        {/* Roof */}
        <path
          opacity={oneTone ? 1 : 0.6}
          d="M3 10.5L12 3L21 10.5"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Walls */}
        <path
          d="M5 9.5V20C5 20.5523 5.44772 21 6 21H9.5V16C9.5 15.4477 9.94772 15 10.5 15H13.5C14.0523 15 14.5 15.4477 14.5 16V21H18C18.5523 21 19 20.5523 19 20V9.5"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
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
        {/* House body */}
        <path
          d="M5 9.5V20C5 20.5523 5.44772 21 6 21H9.5V16C9.5 15.4477 9.94772 15 10.5 15H13.5C14.0523 15 14.5 15.4477 14.5 16V21H18C18.5523 21 19 20.5523 19 20V9.5L12 3L5 9.5Z"
          fill="currentColor"
        />
        {/* Roof highlight */}
        <path
          opacity={oneTone ? 1 : 0.4}
          d="M3 10.5L12 3L21 10.5"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
}
