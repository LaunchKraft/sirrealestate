import { NextureIconsProps, sizeHelper, strokeSizeHelper } from "../nexture-icons";

export default function NiGogo({ className, variant = "outlined", size = "medium" }: NextureIconsProps) {
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
        <path
          d="M18.2184 7.46943C21.1129 9.79637 21.1129 14.2036 18.2184 16.5306L17.3415 17.2356C14.9914 19.1249 12.3623 20.6378 9.54797 21.7203C6.4174 22.9245 3.25268 20.0449 4.15685 16.8149L4.94004 14.017C5.30936 12.6977 5.30936 11.3023 4.94004 9.98296L4.15685 7.18513C3.25268 3.95512 6.4174 1.07549 9.54797 2.27967C12.3623 3.36219 14.9914 4.87513 17.3415 6.7644L18.2184 7.46943Z"
          stroke="currentColor"
          strokeWidth={iconStrokeWidth}
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
        <path
          d="M3.43421 7.38765C2.36389 3.56373 6.11082 0.154667 9.81702 1.58003C12.7036 2.69038 15.4007 4.24185 17.8112 6.17964L18.6881 6.88472C21.956 9.51187 21.956 14.488 18.6881 17.1152L17.8112 17.8203C15.4007 19.7581 12.7036 21.3095 9.81702 22.4199C6.11078 23.8453 2.3638 20.4362 3.43421 16.6123L4.21741 13.8144C4.54957 12.6275 4.54957 11.3724 4.21741 10.1855L3.43421 7.38765Z"
          fill="currentColor"
        />
      </svg>
    );
  }
}
