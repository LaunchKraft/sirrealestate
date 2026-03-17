import { MuiOtpInput } from "mui-one-time-password-input";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Box, Button, Divider, FormLabel, Paper, Typography } from "@mui/material";

import Logo from "@/components/logo/logo";
import { DEFAULTS } from "@/config";

export default function Page() {
  const navigate = useNavigate();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate(DEFAULTS.appRoot);
  };

  const [otp, setOtp] = useState("");

  const handleChange = (newValue: string) => {
    setOtp(newValue);
  };

  return (
    <Box className="bg-waves flex min-h-screen w-full items-center justify-center bg-cover bg-center p-4">
      <Paper elevation={3} className="bg-background-paper shadow-darker-xs w-lg max-w-full rounded-4xl py-14">
        <Box className="flex flex-col gap-4 px-8 sm:px-14">
          <Box className="flex flex-col">
            <Box className="mb-14 flex justify-center">
              <Logo classNameMobile="hidden" />
            </Box>

            <Box className="flex flex-col gap-10">
              <Box className="flex flex-col">
                <Typography variant="h1" component="h1" className="mb-2">
                  Confirm Verification
                </Typography>
                <Typography variant="body1" className="text-text-primary">
                  Please enter your 6 digit code that sent to your email address.
                </Typography>
              </Box>

              <Box className="flex flex-col gap-5">
                <Box component={"form"} onSubmit={handleSubmit} className="flex flex-col">
                  <Box className="flex flex-col">
                    <FormLabel component="label">Verification Code</FormLabel>
                    <MuiOtpInput
                      value={otp}
                      onChange={handleChange}
                      length={6}
                      TextFieldsProps={{ size: "small", variant: "standard", className: "outlined" }}
                      className="gap-1 md:gap-2"
                    />
                  </Box>

                  <Box className="flex flex-col gap-2">
                    <Button type="submit" variant="contained" className="mb-4">
                      Continue
                    </Button>
                  </Box>

                  <Typography variant="body2" className="text-text-secondary">
                    By clicking Continue, Sign in with Google, or Sign in with GitHub, you agree to the{" "}
                    <Link target="_blank" to="/auth/terms-and-conditions" className="link-primary link-underline-hover">
                      Terms and Conditions
                    </Link>{" "}
                    and{" "}
                    <Link target="_blank" to="/auth/privacy-policy" className="link-primary link-underline-hover">
                      Privacy Policy
                    </Link>
                    .
                  </Typography>
                </Box>
              </Box>
              <Divider className="text-text-secondary my-0 text-sm"></Divider>
              <Box className="flex flex-col">
                <Typography variant="h6" component="h6">
                  Did not get the code?
                </Typography>
                <Typography variant="body1" className="text-text-secondary">
                  If you have not received the code, please{" "}
                  <Link to="/auth/get-verification" className="link-primary link-underline-hover">
                    resend
                  </Link>
                  .
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
