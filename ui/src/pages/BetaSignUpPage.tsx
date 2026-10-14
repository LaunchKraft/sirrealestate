import '@/style/global.css'

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { signIn } from 'aws-amplify/auth'
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
import { EyeOff, Eye } from 'lucide-react'

// The Sir Realtor beta (waitlist, invites, account creation) is managed in launchr,
// LaunchKraft's launch tool. Its public handler checks the invite and creates the
// Cognito user server-side — self-signup is disabled on the user pool.
const LAUNCHR_PUBLIC_URL = 'https://f3xcm4xr4b5sryk74xi7kvh3x40aotxe.lambda-url.us-east-1.on.aws/'
const LAUNCHR_PRODUCT_ID = '6b1cdb8a-33b8-4115-b42e-8abd2bb5214f'

// Mirrors the user pool's password policy so we can fail fast with a clear message.
const PASSWORD_RULES = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'
function meetsPasswordPolicy(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)
}

function launchr(body: Record<string, unknown>): Promise<Response> {
  return fetch(LAUNCHR_PUBLIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: LAUNCHR_PRODUCT_ID, ...body }),
  })
}

type Step = 'checking' | 'invalid' | 'error' | 'form'

export default function BetaSignUpPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [step, setStep] = useState<Step>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!email) { setStep('invalid'); return }
    let cancelled = false
    launchr({ action: 'check-invited', email })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setStep(data.invited ? 'form' : 'invalid') })
      .catch(() => {
        if (!cancelled) {
          setError('We could not verify your invitation just now. Please try again in a moment.')
          setStep('error')
        }
      })
    return () => { cancelled = true }
  }, [email])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !confirmPassword) { setError('All fields are required.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (!meetsPasswordPolicy(password)) { setError(`Password requirements: ${PASSWORD_RULES}`); return }
    setError(null)
    setLoading(true)
    try {
      const res = await launchr({ action: 'signup', email, password })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Sign-up failed. Please try again.')
      try {
        await signIn({ username: email, password })
        navigate('/chat', { replace: true })
      } catch {
        // Already registered (e.g. a second visit to the invite link) — send them to sign in.
        navigate('/login', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.')
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

            {step === 'error' && (
              <Box className="flex flex-col gap-3 text-center">
                <Typography variant="h6" className="font-semibold">Something went wrong</Typography>
                <Typography variant="body1" className="text-text-secondary">{error}</Typography>
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
                          {showPassword ? <EyeOff size={20} className="text-text-secondary" /> : <Eye size={20} className="text-text-secondary" />}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </FormControl>

                <Typography variant="caption" className="text-text-secondary -mt-3">{PASSWORD_RULES}</Typography>

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
                          {showConfirmPassword ? <EyeOff size={20} className="text-text-secondary" /> : <Eye size={20} className="text-text-secondary" />}
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

          </Box>
        </Paper>
      </Box>
    </>
  )
}
