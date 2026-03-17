import { useRef } from "react";
import { useInViewport } from "react-in-viewport";

import { Avatar, Box, Grid, Typography } from "@mui/material";

import NiBasket from "@/icons/nexture/ni-basket";
import NiMessages from "@/icons/nexture/ni-messages";
import NiStars from "@/icons/nexture/ni-stars";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/theme/theme-provider";

type Props = {
  className?: string;
};

export default function LPStats({ className }: Props) {
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
          <Grid container spacing={{ xs: 12, md: 5 }}>
            <Grid size={{ xs: 12, md: 4 }} className="text-center">
              <Box className="flex flex-col items-center gap-4">
                <Avatar className="bg-primary-light/10 large">
                  <NiBasket className="text-primary" size="large" />
                </Avatar>
                <Box className="flex flex-col gap-2">
                  <Typography variant="h1">3.5K+ Sales</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} className="text-center">
              <Box className="flex flex-col items-center gap-4">
                <Avatar className="bg-secondary-light/10 large">
                  <NiStars className="text-secondary" size="large" />
                </Avatar>
                <Box className="flex flex-col gap-2">
                  <Typography variant="h1">4.3+ Rating</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} className="text-center">
              <Box className="flex flex-col items-center gap-4">
                <Avatar className="bg-accent-1-light/10 large">
                  <NiMessages className="text-accent-1" size="large" />
                </Avatar>
                <Box className="flex flex-col gap-2">
                  <Typography variant="h1">100+ Reviews</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
