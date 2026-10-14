import '@/style/global.css'

import { useState } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Paper,
  Typography,
} from '@mui/material'
import MuiLayerOverride from '@/theme/mui-layer-override'
import logo from '@/assets/logo.png'

const API_URL = import.meta.env.VITE_API_URL as string

export default function BetaWaitlistPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Something went wrong. Please try again.')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
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

            {done ? (
              <Box className="flex flex-col items-center gap-4 text-center">
                <Typography variant="h6" className="font-semibold">You're on the list!</Typography>
                <Typography variant="body1" className="text-text-secondary">
                  We'll reach out to <strong>{email}</strong> when your spot is ready. Stay tuned.
                </Typography>
              </Box>
            ) : (
              <>
                <Box className="flex flex-col gap-3">
                  <Typography variant="h6" className="font-semibold">We're in private beta</Typography>
                  <Typography variant="body1" className="text-text-secondary">
                    Sir Realtor is currently available by invitation only as we roll out to a small group of early users. Join the waitlist and we'll invite you when your spot opens up.
                  </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <FormControl className="outlined" variant="standard" size="small">
                    <FormLabel component="label" className="mb-0.5!">Email</FormLabel>
                    <Input
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
                    {loading ? 'Joining…' : 'Join the waitlist'}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </Paper>
      </Box>
    </>
  )
}
