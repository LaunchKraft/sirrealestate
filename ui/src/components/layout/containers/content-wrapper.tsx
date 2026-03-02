import { PropsWithChildren } from 'react'
import { Box, Paper } from '@mui/material'

export default function ContentWrapper({ children }: PropsWithChildren) {
  return (
    <Paper
      elevation={0}
      sx={{ backgroundColor: 'rgba(0, 0, 0, 0.03)' }}
      className="flex min-h-[calc(100vh-7.5rem)] w-full min-w-0 rounded-xl px-4 py-5 sm:rounded-4xl sm:py-6 md:py-8 lg:px-12"
    >
      <Box className="flex w-full">
        <Box className="mx-auto w-full">
          <Box className="-mx-2 min-h-full overflow-x-auto px-2 *:mb-2">{children}</Box>
        </Box>
      </Box>
    </Paper>
  )
}
