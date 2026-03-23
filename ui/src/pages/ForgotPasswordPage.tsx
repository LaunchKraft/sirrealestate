import '@/style/global.css'

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth'
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

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Email is required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await resetPassword({ username: email })
      setStep('reset')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset code. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code || !newPassword) {
      setError('Verification code and new password are required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword })
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed. Please try again.'
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

            {step === 'email' ? (
              <Box component="form" onSubmit={handleRequestCode} className="flex flex-col gap-5">
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

                {error && (
                  <Alert severity="error" className="neutral bg-background-paper/60!">
                    <AlertTitle variant="subtitle2">Error</AlertTitle>
                    <Typography variant="body2">{error}</Typography>
                  </Alert>
                )}

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Sending code…' : 'Continue'}
                </Button>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleResetPassword} className="flex flex-col gap-5">
                <Typography variant="body1" className="text-text-secondary">
                  We sent a reset code to <strong>{email}</strong>. Enter it along with your new password.
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

                <FormControl className="outlined" variant="standard" size="small">
                  <FormLabel component="label" className="mb-0.5!">New password</FormLabel>
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder=""
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                    <AlertTitle variant="subtitle2">Reset error</AlertTitle>
                    <Typography variant="body2">{error}</Typography>
                  </Alert>
                )}

                <Button type="submit" variant="contained" disabled={loading} className="mt-2">
                  {loading ? 'Resetting password…' : 'Reset Password'}
                </Button>
              </Box>
            )}

            <Divider className="text-text-secondary my-0 text-sm" />

            <Box className="flex flex-col">
              <Typography variant="h6" component="h6">
                Sign in
              </Typography>
              <Typography variant="body1" className="text-text-secondary">
                Remember your password?{' '}
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
