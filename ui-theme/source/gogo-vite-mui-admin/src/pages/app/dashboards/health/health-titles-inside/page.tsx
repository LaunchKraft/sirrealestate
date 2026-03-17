import DashboardHealthAppointments from "./sections/dashboard-health-appointments";
import DashboardHealthContact from "./sections/dashboard-health-contact";
import DashboardHealthDoctors from "./sections/dashboard-health-doctors";
import DashboardHealthInfo from "./sections/dashboard-health-info";
import DashboardHealthResults from "./sections/dashboard-health-results";
import DashboardHealthVitals from "./sections/dashboard-health-vitals";
import dayjs, { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Breadcrumbs, Button, FormControl, Tooltip, Typography } from "@mui/material";
import { Grid } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateRange, DateRangePicker } from "@mui/x-date-pickers-pro";

import NiCalendar from "@/icons/nexture/ni-calendar";
import NiCellsPlus from "@/icons/nexture/ni-cells-plus";
import NiChevronDownSmall from "@/icons/nexture/ni-chevron-down-small";
import NiChevronLeftSmall from "@/icons/nexture/ni-chevron-left-small";
import NiChevronRightSmall from "@/icons/nexture/ni-chevron-right-small";
import NiCross from "@/icons/nexture/ni-cross";
import NiEnterReverseUp from "@/icons/nexture/ni-enter-reverse-up";
import { cn } from "@/lib/utils";
dayjs.extend(weekday);

export default function Page() {
  const [dateRange, setDateRange] = useState<DateRange<Dayjs>>([dayjs().weekday(-7), dayjs().weekday(-1)]);

  return (
    <Grid container spacing={5}>
      <Grid container spacing={2.5} className="w-full" size={12}>
        <Grid size={{ xs: 12, md: "grow" }}>
          <Typography variant="h1" component="h1" className="mb-0">
            Welcome Laura!
          </Typography>
          <Breadcrumbs>
            <Link color="inherit" to="/dashboards/default">
              Home
            </Link>
            <Link color="inherit" to="/dashboards">
              Dashboards
            </Link>
            <Typography variant="body2">Health</Typography>
          </Breadcrumbs>
        </Grid>

        <Grid size={{ xs: 12, md: "auto" }} className="flex flex-row items-start gap-2">
          <FormControl variant="standard" className="surface-standard mb-0 w-full md:w-auto">
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DateRangePicker
                slots={{
                  openPickerIcon: (props) => {
                    return <NiCalendar {...props} className={cn(props.className, "text-text-secondary")} />;
                  },
                  switchViewIcon: (props) => {
                    return <NiChevronDownSmall {...props} className={cn(props.className, "text-text-secondary")} />;
                  },
                  leftArrowIcon: (props) => {
                    return <NiChevronLeftSmall {...props} className={cn(props.className, "text-text-secondary")} />;
                  },
                  rightArrowIcon: (props) => {
                    return <NiChevronRightSmall {...props} className={cn(props.className, "text-text-secondary")} />;
                  },
                  clearIcon: (props) => {
                    return <NiCross {...props} className={cn(props.className, "text-text-secondary")} />;
                  },
                }}
                slotProps={{
                  textField: { size: "small", variant: "standard" },
                  desktopPaper: { className: "outlined" },
                }}
                value={dateRange}
                onChange={(newValue) => setDateRange(newValue)}
              />
            </LocalizationProvider>
          </FormControl>

          <Tooltip title="View the Alternative">
            <Button
              className="surface-standard flex-none"
              size="medium"
              color="grey"
              variant="surface"
              component={Link}
              to="/dashboards/health"
              startIcon={<NiEnterReverseUp size={"medium"} />}
            >
              Titles Outside
            </Button>
          </Tooltip>
          <Tooltip title="Add Widget">
            <Button
              className="icon-only surface-standard flex-none"
              size="medium"
              color="grey"
              variant="surface"
              startIcon={<NiCellsPlus size={"medium"} />}
            />
          </Tooltip>
        </Grid>
      </Grid>

      <Grid container size={12} className="items-start">
        <Grid size={{ lg: 4, xs: 12 }} container>
          <Grid size={12}>
            <DashboardHealthInfo />
          </Grid>
          <Grid size={12}>
            <DashboardHealthContact />
          </Grid>
          <Grid size={12}>
            <DashboardHealthDoctors />
          </Grid>
        </Grid>

        <Grid container size={{ lg: 8, xs: 12 }}>
          <Grid size={12}>
            <DashboardHealthVitals />
          </Grid>
          <Grid size={12}>
            <DashboardHealthAppointments />
          </Grid>
          <Grid size={12}>
            <DashboardHealthResults />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
