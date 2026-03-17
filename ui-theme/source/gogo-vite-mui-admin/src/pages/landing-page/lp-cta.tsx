import { useRef } from "react";
import { useInViewport } from "react-in-viewport";
import { Link } from "react-router-dom";

import { Box, Button, Grid, Typography } from "@mui/material";

import { LINKS } from "@/constants";
import IllustrationLaunch from "@/icons/illustrations/illustration-launch";
import NiBasket from "@/icons/nexture/ni-basket";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/theme/theme-provider";

type Props = {
  className?: string;
};

export default function LPCTA({ className }: Props) {
  const { isDarkMode } = useThemeContext();
  const scrollRef = useRef(null);
  const { inViewport } = useInViewport(scrollRef, { threshold: 0.25 });

  return (
    <Box
      ref={scrollRef}
      className={cn(
        className,
        "lp-container-padding flex w-full justify-center opacity-0 transition-opacity duration-700",
        inViewport && "opacity-100",
      )}
    >
      <Box
        className={cn(
          "lp-contained-container bg-waves! bg-background/30 lp-content-padding flex justify-center rounded-4xl border bg-cover",
          isDarkMode ? "border-grey-20 bg-blend-darken" : "border-grey-50 bg-blend-lighten",
        )}
      >
        <Box className="flex w-full flex-col gap-10">
          <Grid container spacing={5} className="flex items-center">
            <Grid
              size={{ xs: 12, md: 4, lg: 3 }}
              className="flex justify-center text-center md:justify-start md:text-start"
            >
              <IllustrationLaunch className="text-primary h-64 w-full max-w-xs object-contain" />
            </Grid>
            <Grid size={{ xs: 12, md: 8, lg: 9 }} className="flex justify-center md:justify-start">
              <Box className="text-center md:text-start">
                <Typography component="h2" variant="h2" className="lp-h2 text-center md:text-start">
                  Get Started with Gogo
                </Typography>
                <Typography component="p" className="lp-leading mb-2.5 text-center md:text-start">
                  Turn your ideas into polished products. Craft beautiful, consistent applications with modular,
                  customizable ui components designed and coded based on best practices.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<NiBasket size="large" />}
                  target="_blank"
                  to={LINKS.purchase}
                  component={Link}
                >
                  Buy
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
