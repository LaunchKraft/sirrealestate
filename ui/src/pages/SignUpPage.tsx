import '@/style/global.css'

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUp, confirmSignUp, resendSignUpCode, signIn } from 'aws-amplify/auth'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  InputAdornment,
  Paper,
  Typography,
} from '@mui/material'
import MuiLayerOverride from '@/theme/mui-layer-override'
import logo from '@/assets/logo.png'
import NiEyeClose from '@/icons/nexture/ni-eye-close'
import NiEyeOpen from '@/icons/nexture/ni-eye-open'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function SignUpPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'credentials' | 'confirm'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !confirmPassword) {
      setError('All fields are required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      })
      setStep('confirm')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) {
      setError('Verification code is required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await confirmSignUp({ username: email, confirmationCode: code })
      await signIn({ username: email, password })
      navigate('/chat', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendMsg(null)
    setError(null)
    try {
      await resendSignUpCode({ username: email })
      setResendMsg('A new code has been sent to your email.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.'
      setError(msg)
    }
  }

  return (
    <>
      <MuiLayerOverride />
      <Box className="bg-waves flex min-h-screen w-full items-center justify-center bg-cover bg-center p-4">
        <Paper elevation={3} className="bg-background-paper shadow-darker-xs w-lg max-w-full rounded-4xl py-14">
          <Box className="flex flex-col gap-10 px-8 sm:px-14">
            <Box className="flex flex-col items-center gap-2">
              <img src={logo} alt="Sir Realtor" className="w-48 h-auto" />
              <Typography variant="h5" className="font-heading font-bold tracking-tight text-primary" sx={{ fontWeight: 700, fontSize: '1.75rem' }}>
                Sir Realtor
              </Typography>
            </Box>

            {step === 'credentials' ? (
              <Box component="form" onSubmit={handleSignUp} className="flex flex-col gap-5">
                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Email</FormLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </FormControl>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Password</FormLabel>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((s) => !s)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showPassword ? (
                            <NiEyeClose size="medium" className="text-text-secondary" />
                          ) : (
                            <NiEyeOpen size="medium" className="text-text-secondary" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </FormControl>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Confirm password</FormLabel>
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder=""
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirmPassword((s) => !s)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {showConfirmPassword ? (
                            <NiEyeClose size="medium" className="text-text-secondary" />
                          ) : (
                            <NiEyeOpen size="medium" className="text-text-secondary" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </FormControl>

                {error && (
                  <Alert severity="error" className="neutral bg-background-paper/60!">
                    <AlertTitle variant="subtitle2">Sign-up error</AlertTitle>
                    <Typography variant="body2">{error}</Typography>
                  </Alert>
                )}

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Creating account…' : 'Continue'}
                </Button>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleConfirm} className="flex flex-col gap-5">
                <Typography variant="body1" className="text-text-secondary">
                  We sent a verification code to <strong>{email}</strong>. Enter it below.
                </Typography>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Verification code</FormLabel>
                  <Input
                    id="code"
                    type="text"
                    placeholder=""
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={loading}
                  />
                </FormControl>

                {error && (
                  <Alert severity="error" className="neutral bg-background-paper/60!">
                    <AlertTitle variant="subtitle2">Verification error</AlertTitle>
                    <Typography variant="body2">{error}</Typography>
                  </Alert>
                )}

                {resendMsg && (
                  <Alert severity="info" className="neutral bg-background-paper/60!">
                    <Typography variant="body2">{resendMsg}</Typography>
                  </Alert>
                )}

                <Box
                  component="button"
                  type="button"
                  onClick={handleResend}
                  className="link-text-secondary link-underline-hover text-center text-sm font-semibold bg-transparent border-0 cursor-pointer p-0"
                >
                  Resend code
                </Box>

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Verifying…' : 'Verify & Sign In'}
                </Button>
              </Box>
            )}

            <GoogleSignInButton />

            <Divider className="text-text-secondary my-0 text-sm" />

            <Box className="flex flex-col">
              <Typography variant="h6" component="h6">
                Sign in
              </Typography>
              <Typography variant="body1" className="text-text-secondary">
                Already have an account?{' '}
                <Link to="/login" className="link-primary link-underline-hover">
                  Sign in
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </>
  )
}
