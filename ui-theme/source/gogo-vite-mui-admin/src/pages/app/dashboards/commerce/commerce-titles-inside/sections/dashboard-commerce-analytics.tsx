import { Box, Button, Card, CardContent, Typography } from "@mui/material";

import IllustrationAnalytics from "@/icons/illustrations/illustration-analytics";
import NiChartPolar from "@/icons/nexture/ni-chart-polar";

export default function DashboardCommerceAnalytics() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h6" className="card-title">
          Analytics
        </Typography>

        <Box className="flex h-76.5 w-full flex-col items-center justify-between">
          <Box className="flex flex-col">
            <IllustrationAnalytics className="text-primary max-h-48 w-full object-contain" />
            <Typography component="p" className="text-center">
              Configure analytics to get extended results!
            </Typography>
          </Box>
          <Button size="medium" color="primary" variant="outlined" startIcon={<NiChartPolar size={"medium"} />}>
            Get Analytics
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
