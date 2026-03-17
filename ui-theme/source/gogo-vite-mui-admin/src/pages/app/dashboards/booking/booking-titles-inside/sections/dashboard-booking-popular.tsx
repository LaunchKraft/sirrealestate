import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Box, Card, CardContent, Chip, FormControl, MenuItem, Select, Typography } from "@mui/material";

import NiChevronDownSmall from "@/icons/nexture/ni-chevron-down-small";
import { getThemeImage } from "@/lib/image-helper";
import { useThemeContext } from "@/theme/theme-provider";

export default function DashboardBookingPopular() {
  const [location, setLocation] = useState<string>("Europe");
  const { theme, isDarkMode } = useThemeContext();

  const [configImage, setConfigImage] = useState("/images/booking/banner/booking-hero-green.png");
  useEffect(() => {
    const imageUrl = getThemeImage({
      srcSet: {
        "theme-blue": ["booking-hero-blue.png", "booking-hero-blue-dark.png"],
        "theme-green": ["booking-hero-green.png", "booking-hero-green-dark.png"],
        "theme-orange": ["booking-hero-orange.png", "booking-hero-orange-dark.png"],
        "theme-purple": ["booking-hero-purple.png", "booking-hero-purple-dark.png"],
      },
      directory: "/images/booking/banner/",
      current: { theme, isDarkMode },
    });
    setTimeout(() => {
      setConfigImage(imageUrl);
    }, 0);
  }, [theme, isDarkMode]);

  return (
    <Box>
      <Card className="outline-background-paper flex-colp-0 relative flex h-89 outline-4 -outline-offset-4">
        <Box className="bg-primary-light/10 absolute inset-1 z-0 rounded-xl"></Box>
        <Box className="from-background-paper to-background-paper/0 absolute inset-1 z-1 rounded-xl bg-linear-to-r rtl:bg-linear-to-l"></Box>

        <CardContent className="z-10 flex flex-1 flex-col items-start justify-between p-5!">
          <Box className="flex w-full flex-wrap justify-between gap-4">
            <Typography variant="h6" component="h6" className="card-title">
              Popular Destinations
            </Typography>
            <Box className="-mt-1.5 flex gap-1">
              <FormControl size="small" variant="standard" className="outlined mb-0 w-34">
                <Select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  IconComponent={NiChevronDownSmall}
                  MenuProps={{ className: "outlined" }}
                  slotProps={{
                    root: {
                      className: "[&>.MuiInputBase-input]:py-0! rounded-sm!",
                    },
                  }}
                >
                  <MenuItem value="Asia">Asia</MenuItem>
                  <MenuItem value="Africa">Africa</MenuItem>
                  <MenuItem value="America">America</MenuItem>
                  <MenuItem value="Australia">Australia</MenuItem>
                  <MenuItem value="Europe">Europe</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          <Box className="flex w-full flex-row justify-between">
            <Box className="flex w-full flex-col gap-5 md:w-1/2">
              <Box className="flex flex-col gap-2">
                <Box className="flex flex-row items-center justify-between">
                  <Link to="#" color="textPrimary" className="link-underline-hover font-semibold">
                    France
                  </Link>
                  <Chip label="72 M" variant="outlined" className="border-grey-100" />
                </Box>
                <Box className="bg-grey-100 h-0.5 w-full">
                  <Box className="bg-primary h-0.5" style={{ width: "85%" }}></Box>
                </Box>
              </Box>

              <Box className="flex flex-col gap-2">
                <Box className="flex flex-row items-center justify-between">
                  <Link to="#" color="textPrimary" className="link-underline-hover font-semibold">
                    Spain
                  </Link>
                  <Chip label="70 M" variant="outlined" className="border-grey-100" />
                </Box>
                <Box className="bg-grey-100 h-0.5 w-full">
                  <Box className="bg-primary h-0.5" style={{ width: "75%" }}></Box>
                </Box>
              </Box>

              <Box className="flex flex-col gap-2">
                <Box className="flex flex-row items-center justify-between">
                  <Link to="#" color="textPrimary" className="link-underline-hover font-semibold">
                    Greece
                  </Link>
                  <Chip label="27 M" variant="outlined" className="border-grey-100" />
                </Box>
                <Box className="bg-grey-100 h-0.5 w-full">
                  <Box className="bg-primary h-0.5" style={{ width: "45%" }}></Box>
                </Box>
              </Box>

              <Box className="flex flex-col gap-2">
                <Box className="flex flex-row items-center justify-between">
                  <Link to="#" color="textPrimary" className="link-underline-hover font-semibold">
                    Italy
                  </Link>
                  <Chip label="25 M" variant="outlined" className="border-grey-100" />
                </Box>
                <Box className="bg-grey-100 h-0.5 w-full">
                  <Box className="bg-primary h-0.5" style={{ width: "40%" }}></Box>
                </Box>
              </Box>

              <Box className="flex flex-col gap-2">
                <Box className="flex flex-row items-center justify-between">
                  <Link to="#" color="textPrimary" className="link-underline-hover font-semibold">
                    Germany
                  </Link>
                  <Chip label="19 M" variant="outlined" className="border-grey-100" />
                </Box>
                <Box className="bg-grey-100 h-0.5 w-full">
                  <Box className="bg-primary h-0.5" style={{ width: "30%" }}></Box>
                </Box>
              </Box>
            </Box>

            <Box className="flex w-0 justify-center md:w-1/2 md:justify-end xl:w-4/12">
              <img
                alt="configure theme"
                sizes="100vw"
                className="hidden h-64 w-full max-w-xs object-contain md:block"
                src={configImage}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
