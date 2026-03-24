import '@/style/global.css'

import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { signIn } from 'aws-amplify/auth'
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
import { EyeOff, Eye } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'
import { trackEvent } from '@/lib/analytics'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!isLoading && user) return <Navigate to="/chat" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { isSignedIn } = await signIn({ username: email, password })
      if (isSignedIn) {
        trackEvent('login', { method: 'email' })
        navigate('/chat', { replace: true })
      } else {
        setError('Sign-in requires additional steps. Please contact support.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      setError(msg)
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

            <Box
              component="form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-5"
            >
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
                          <EyeOff size={20} className="text-text-secondary" />
                        ) : (
                          <Eye size={20} className="text-text-secondary" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  }
                />
              </FormControl>

              {error && (
                <Alert severity="error" className="neutral bg-background-paper/60!">
                  <AlertTitle variant="subtitle2">Sign-in error</AlertTitle>
                  <Typography variant="body2">{error}</Typography>
                </Alert>
              )}

              <Link
                to="/forgot-password"
                className="link-text-secondary link-underline-hover text-center text-sm font-semibold"
              >
                Forgot password?
              </Link>

              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                className="mt-2"
              >
                {loading ? 'Signing in…' : 'Continue'}
              </Button>
            </Box>

            {/* TODO: re-enable Google sign-in after beta */}
            {/* <GoogleSignInButton label="Sign in with Google" /> */}

            <Divider className="text-text-secondary my-0 text-sm" />

            <Box className="flex flex-col">
              <Typography variant="h6" component="h6">
                Get Started
              </Typography>
              <Typography variant="body1" className="text-text-secondary">
                Don't have an account yet?{' '}
                <Link to="/sign-up" className="link-primary link-underline-hover">
                  Sign up
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </>
  )
}
