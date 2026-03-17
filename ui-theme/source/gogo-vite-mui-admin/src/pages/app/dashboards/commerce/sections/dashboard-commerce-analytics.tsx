import { Box, Button, Card, CardContent, Typography } from "@mui/material";

import IllustrationAnalytics from "@/icons/illustrations/illustration-analytics";
import NiChartPolar from "@/icons/nexture/ni-chart-polar";

export default function DashboardCommerceAnalytics() {
  return (
    <>
      <Typography variant="h6" component="h6" className="mt-2 mb-3">
        Analytics
      </Typography>
      <Card>
        <CardContent className="flex flex-col items-center">
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
    </>
  );
}
