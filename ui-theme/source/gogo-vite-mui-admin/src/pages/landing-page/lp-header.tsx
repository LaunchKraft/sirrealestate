import { t } from "i18next";
import React, { useState } from "react";
import { Link } from "react-router-dom";

import { Box, Button, Drawer, Typography, useScrollTrigger } from "@mui/material";

import Logo from "@/components/logo/logo";
import { LINKS } from "@/constants";
import NiCross from "@/icons/nexture/ni-cross";
import NiMenuSplitReverse from "@/icons/nexture/ni-menu-split-reverse";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

type ScrollProps = {
  children?: React.ReactElement<{ className?: string }>;
  className?: string;
};

function ElevationScroll(props: ScrollProps) {
  const { children, className } = props;
  const trigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 0,
  });

  return children
    ? React.cloneElement(children, {
        className: trigger ? cn(className, "bg-background-paper shadow-xs") : cn(className, "bg-background"),
      })
    : null;
}

export default function LPHeader({ className }: Props) {
  const [openDrawer, setOpenDrawer] = useState(false);
  const toggleDrawer = (newOpen: boolean) => () => {
    setOpenDrawer(newOpen);
  };

  return (
    <ElevationScroll
      className={cn(
        "mui-fixed lp-container-padding fixed top-0 z-50 flex h-20 w-full items-center justify-center rounded-b-3xl transition-all duration-700",
        className,
      )}
    >
      <Box component="header" className="bg-background fixed top-0 flex h-20 w-full items-center justify-center">
        <Box className="lp-contained-container flex flex-row justify-between">
          {/* Logo */}
          <Box className="flex flex-row items-center gap-2.5">
            <Logo classNameMobile="hidden" />
            <Typography className="border-primary text-primary rounded-[8px] border px-1.5 py-1 text-sm leading-3 font-bold">
              VITE
            </Typography>
          </Box>

          {/* Desktop navigation */}
          <Box className="hidden flex-row gap-5 md:flex">
            <Box className="flex flex-row gap-1">
              <Button
                className="px-2! lg:px-4!"
                variant="text"
                size="large"
                color="text-primary"
                to={LINKS.view}
                target="_blank"
                component={Link}
              >
                {t("landing-view")}
              </Button>
              <Button
                className="px-2! lg:px-4!"
                variant="text"
                size="large"
                color="text-primary"
                to={LINKS.figma}
                target="_blank"
                component={Link}
              >
                {t("footer-figma")}
              </Button>
              <Button
                className="px-2! lg:px-4!"
                variant="text"
                size="large"
                color="text-primary"
                to={LINKS.docs}
                target="_blank"
                component={Link}
              >
                {t("footer-docs")}
              </Button>
              <Button
                className="px-2! lg:px-4!"
                variant="text"
                size="large"
                color="text-primary"
                to={LINKS.purchase}
                target="_blank"
                component={Link}
              >
                {t("footer-purchase")}
              </Button>
            </Box>
            <Box className="flex flex-row gap-2">
              <Button
                className="px-4!"
                variant="contained"
                size="large"
                color="primary"
                to={LINKS.signup}
                target="_blank"
                component={Link}
              >
                Signup
              </Button>
              <Button
                className="px-4!"
                variant="pastel"
                size="large"
                color="primary"
                to={LINKS.login}
                target="_blank"
                component={Link}
              >
                Login
              </Button>
            </Box>
          </Box>

          {/* Mobile navigation */}
          <Button
            variant="text"
            size="large"
            color="text-primary"
            className="icon-only md:hidden"
            onClick={toggleDrawer(true)}
            startIcon={<NiMenuSplitReverse size={24} />}
          />

          {/* Mobile menu */}
          <Drawer open={openDrawer} onClose={toggleDrawer(false)}>
            <Box className="relative flex w-72 flex-col gap-5 p-7">
              <Button
                variant="text"
                size="large"
                color="text-primary"
                className="icon-only absolute end-2 top-2"
                onClick={toggleDrawer(false)}
                startIcon={<NiCross size={24} />}
              />

              <Box className="flex flex-row items-center gap-2.5 ps-4">
                <Logo classNameMobile="hidden" />
                <Typography className="border-primary text-primary rounded-[8px] border px-1.5 py-1 text-sm leading-3 font-bold">
                  VITE
                </Typography>
              </Box>
              <Box className="flex flex-col gap-1">
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="text-primary"
                  to={LINKS.view}
                  target="_blank"
                  component={Link}
                >
                  {t("landing-view")}
                </Button>
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="text-primary"
                  target="_blank"
                  to={LINKS.figma}
                  component={Link}
                >
                  {t("footer-figma")}
                </Button>
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="text-primary"
                  to={LINKS.docs}
                  target="_blank"
                  component={Link}
                >
                  {t("footer-docs")}
                </Button>
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="text-primary"
                  target="_blank"
                  to={LINKS.purchase}
                  component={Link}
                >
                  {t("footer-purchase")}
                </Button>
              </Box>
              <Box className="border-grey-50 border-t"></Box>

              <Box className="flex flex-col gap-1">
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="primary"
                  to={LINKS.signup}
                  target="_blank"
                  component={Link}
                >
                  Signup
                </Button>
                <Button
                  className="full-width-button px-4!"
                  variant="text"
                  size="large"
                  color="primary"
                  to={LINKS.login}
                  target="_blank"
                  component={Link}
                >
                  Login
                </Button>
              </Box>
            </Box>
          </Drawer>
        </Box>
      </Box>
    </ElevationScroll>
  );
}
