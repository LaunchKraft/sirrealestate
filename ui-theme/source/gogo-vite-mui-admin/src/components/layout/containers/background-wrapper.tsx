import { Box } from "@mui/material";

export default function BackgroundWrapper() {
  return <Box className={`bg-background fixed inset-0 -z-10 h-full w-full bg-cover`} />;
}
