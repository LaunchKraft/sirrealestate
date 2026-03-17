import { Link } from "react-router-dom";

import { Box, Button, Card, CardContent, Typography } from "@mui/material";

import IllustrationPlatforms from "@/icons/illustrations/illustration-platforms";
import NiDocumentFull from "@/icons/nexture/ni-document-full";

export default function AIContentTips() {
  return (
    <Card>
      <CardContent className="flex h-full min-h-56 flex-col items-start justify-between">
        <Box className="flex w-full flex-col md:flex-row">
          <Box className="mb-4 w-full md:w-8/12 2xl:w-9/12">
            <Typography variant="h6" component="h6" className="card-title">
              Best Practices and Tips
            </Typography>
            <Typography
              variant="body1"
              component="p"
              className="text-text-secondary text-center md:text-start xl:max-w-md"
            >
              Unlock your full potential with our Best Practices and Tips! Discover actionable insights that help you
              streamline processes and achieve your goals.
            </Typography>
          </Box>
          <Box className="flex w-full justify-center md:w-4/12 md:justify-end 2xl:w-3/12">
            <IllustrationPlatforms className="text-secondary max-h-40 w-full object-contain"></IllustrationPlatforms>
          </Box>
        </Box>
        <Button
          className="mx-auto md:mx-0"
          size="medium"
          color="secondary"
          variant="pastel"
          startIcon={<NiDocumentFull size={"medium"} />}
          component={Link}
          to="/applications/ai-content/learn"
        >
          Read Now
        </Button>
      </CardContent>
    </Card>
  );
}
