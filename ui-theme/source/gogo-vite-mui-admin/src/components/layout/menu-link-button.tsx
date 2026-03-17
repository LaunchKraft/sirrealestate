import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Avatar, Button, ButtonProps } from "@mui/material";

import NextureIcons from "@/icons/nexture-icons";
import { cn } from "@/lib/utils";

interface MenuLinkButtonProps {
  to: string;
  icon?: string;
  iconVariant?: "contained" | "outlined";
  iconClassName?: string;
  avatarSrc?: string;
  avatarAlt?: string;
  children: ReactNode;
  size?: ButtonProps["size"];
  className?: string;
}

export const MenuLinkButton = ({
  to,
  icon,
  iconVariant = "outlined",
  iconClassName,
  avatarSrc,
  avatarAlt,
  children,
  size = "large",
  className,
}: MenuLinkButtonProps) => {
  const location = useLocation();
  const currentUrl = location.pathname + location.search;
  const isActive = currentUrl === to || currentUrl.startsWith(to + "/");

  const renderStartIcon = () => {
    if (avatarSrc) {
      return (
        <Avatar
          className={cn(
            "me-0 h-6 w-6 transition-transform group-hover:scale-[0.85]",
            isActive && "text-accent-1 scale-[0.85]",
          )}
          src={avatarSrc}
          alt={avatarAlt}
        />
      );
    }

    if (icon) {
      return (
        <NextureIcons
          variant={isActive ? "contained" : iconVariant}
          icon={icon as any}
          size={"large"}
          className={cn("transition-transform group-hover:scale-[0.85]", isActive && "scale-[0.85]", iconClassName)}
        />
      );
    }

    return null;
  };

  return (
    <Button
      variant="text"
      size={size}
      color="text-primary"
      className={cn(
        "full-width-button group hover:bg-grey-25",
        size === "large" ? "px-4" : "px-3",
        isActive && "active text-primary! bg-grey-25!",
        className,
      )}
      startIcon={renderStartIcon()}
      component={Link}
      to={to}
    >
      {children}
    </Button>
  );
};
