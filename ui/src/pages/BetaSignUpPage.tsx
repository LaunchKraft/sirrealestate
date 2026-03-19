import '@/style/global.css'

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { signUp, confirmSignUp, signIn } from 'aws-amplify/auth'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
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

const API_URL = import.meta.env.VITE_API_URL as string

type Step = 'checking' | 'invalid' | 'form' | 'confirm'

export default function BetaSignUpPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [step, setStep] = useState<Step>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!email) { setStep('invalid'); return }
    fetch(`${API_URL}/waitlist/check?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'invited_beta') setStep('form')
        else setStep('invalid')
      })
      .catch(() => setStep('invalid'))
  }, [email])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !confirmPassword) { setError('All fields are required.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setError(null)
    setLoading(true)
    try {
      await signUp({ username: email, password, options: { userAttributes: { email } } })
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) { setError('Verification code is required.'); return }
    setError(null)
    setLoading(true)
    try {
      await confirmSignUp({ username: email, confirmationCode: code })
      await signIn({ username: email, password })
      await fetch(`${API_URL}/waitlist/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {}) // non-critical
      navigate('/chat', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
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

            {step === 'checking' && (
              <Box className="flex justify-center py-4">
                <CircularProgress />
              </Box>
            )}

            {step === 'invalid' && (
              <Box className="flex flex-col gap-3 text-center">
                <Typography variant="h6" className="font-semibold">Invalid invitation</Typography>
                <Typography variant="body1" className="text-text-secondary">
                  This invitation link is invalid or has already been used. If you believe this is an error, please contact us.
                </Typography>
              </Box>
            )}

            {step === 'form' && (
              <Box component="form" onSubmit={handleSignUp} className="flex flex-col gap-5">
                <Box className="flex flex-col gap-1">
                  <Typography variant="h6" className="font-semibold">Complete your sign up</Typography>
                  <Typography variant="body2" className="text-text-secondary">You've been invited to join Sir Realtor Beta.</Typography>
                </Box>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Email</FormLabel>
                  <Input type="email" value={email} disabled />
                </FormControl>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Password</FormLabel>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((s) => !s)} onMouseDown={(e) => e.preventDefault()}>
                          {showPassword ? <NiEyeClose size="medium" className="text-text-secondary" /> : <NiEyeOpen size="medium" className="text-text-secondary" />}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </FormControl>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Confirm password</FormLabel>
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirmPassword((s) => !s)} onMouseDown={(e) => e.preventDefault()}>
                          {showConfirmPassword ? <NiEyeClose size="medium" className="text-text-secondary" /> : <NiEyeOpen size="medium" className="text-text-secondary" />}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </FormControl>

                {error && (
                  <Alert severity="error" className="neutral bg-background-paper/60!">
                    <AlertTitle variant="subtitle2">Error</AlertTitle>
                    <Typography variant="body2">{error}</Typography>
                  </Alert>
                )}

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </Box>
            )}

            {step === 'confirm' && (
              <Box component="form" onSubmit={handleConfirm} className="flex flex-col gap-5">
                <Typography variant="body1" className="text-text-secondary">
                  We sent a verification code to <strong>{email}</strong>. Enter it below to finish signing in.
                </Typography>

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">Verification code</FormLabel>
                  <Input
                    type="text"
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

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Verifying…' : 'Verify & Sign In'}
                </Button>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </>
  )
}
