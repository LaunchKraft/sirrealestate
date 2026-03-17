import { Button, Tooltip } from "@mui/material";

import NiMoon from "@/icons/nexture/ni-moon";
import NiSun from "@/icons/nexture/ni-sun";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/theme/theme-provider";

export default function Mode() {
  const { isDarkMode } = useThemeContext();
  const { setMode } = useThemeContext();

  const handleToggle = () => {
    setMode(isDarkMode ? "light" : "dark");
  };

  return (
    <>
      <Tooltip title={isDarkMode ? "Light Up" : "Go Dark"} placement="bottom" arrow>
        <Button
          variant="text"
          size="large"
          color="text-primary"
          className={cn("icon-only hover-icon-shrink [&.active]:text-primary hover:bg-grey-25")}
          onClick={handleToggle}
          startIcon={isDarkMode ? <NiSun size={"large"} /> : <NiMoon size={"large"} />}
        />
      </Tooltip>
    </>
  );
}
