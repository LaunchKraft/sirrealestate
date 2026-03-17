import { SyntheticEvent, useState } from "react";

import { Box, Button, Fade, Menu, MenuItem, PopoverVirtualElement } from "@mui/material";

import NiChevronRightSmall from "@/icons/nexture/ni-chevron-right-small";
import { cn } from "@/lib/utils";
export default function VersionSelect({ className }: { className?: string }) {
  const [anchorEl, setAnchorEl] = useState<EventTarget | Element | PopoverVirtualElement | null>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: Event | SyntheticEvent) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };
  return (
    <>
      <Button
        className={cn("max-w-24 px-2 sm:max-w-none md:px-4", className)}
        variant="text"
        color="grey"
        onClick={handleClick}
        endIcon={
          <NiChevronRightSmall
            size="medium"
            className={cn("-ms-1 transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")}
          />
        }
      >
        <Box className="w-full truncate text-clip">Vite v7.7.0</Box>
      </Button>
      <Menu
        anchorEl={anchorEl as Element}
        open={open}
        onClose={handleClose}
        className="mt-1"
        slots={{
          transition: Fade,
        }}
      >
        <MenuItem onClick={handleClose} selected>
          Vite v7.7.0
        </MenuItem>
        <MenuItem onClick={handleClose}>Vite v7.6.0</MenuItem>
        <MenuItem onClick={handleClose}>Vite v7.5.0</MenuItem>
        <MenuItem onClick={handleClose}>Vite v7.4.0</MenuItem>
      </Menu>
    </>
  );
}
