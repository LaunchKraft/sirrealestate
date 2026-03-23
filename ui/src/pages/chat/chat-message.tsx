import { Conversation } from './types'
import DsMarkdown from 'ds-markdown'
import { useState } from 'react'
import { Avatar, Box, Button, Card, CardContent, Fade, Typography } from '@mui/material'
import { Copy, ThumbsUp, Share2, ThumbsDown } from 'lucide-react'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'

type ChatMessageProps = {
  conversation: Conversation
  onAnimationEnd: () => void
  onAnimationStart: () => void
  userInitials: string
  onSuggestedQuestion?: (q: string) => void
}

export default function ChatMessage({
  conversation,
  onAnimationEnd,
  onAnimationStart,
  userInitials,
  onSuggestedQuestion,
}: ChatMessageProps) {
  const [isAnimating, setIsAnimating] = useState(true)

  if (conversation.type === 'AI') {
    return (
      <Box className="flex w-full flex-row items-start gap-2">
        <img
          src={logo}
          alt="Sir Realtor"
          className="mt-1 h-9 w-9 flex-shrink-0 rounded-full object-cover object-top"
        />
        <Card className="w-full !rounded-3xl">
          <CardContent className="relative">
            <DsMarkdown
              answerType="answer"
              interval={10}
              onEnd={() => {
                setIsAnimating(false)
                onAnimationEnd()
              }}
              onStart={() => {
                setIsAnimating(true)
                onAnimationStart()
              }}
              disableTyping={!conversation.animate}
            >
              {conversation.message}
            </DsMarkdown>

            {conversation.suggestedQuestions ? (
              <Box className="mt-3 flex flex-wrap gap-1.5">
                {conversation.suggestedQuestions.map((q) => (
                  <Button
                    key={q}
                    size="small"
                    variant="outlined"
                    color="grey"
                    className="hover:text-primary normal-case text-xs"
                    onClick={() => onSuggestedQuestion?.(q)}
                  >
                    {q}
                  </Button>
                ))}
              </Box>
            ) : (
              <Fade in={!isAnimating} timeout={{ enter: 200 }}>
                <Box className="mt-4 flex flex-row items-end gap-1">
                  <Button
                    size="tiny"
                    color="grey"
                    variant="pastel"
                    startIcon={<ThumbsUp size={16} />}
                    className="[.active]:text-primary [.active]:bg-grey-25 hover:text-primary icon-only min-w-0 md:min-w-16"
                  />
                  <Button
                    size="tiny"
                    color="grey"
                    variant="pastel"
                    startIcon={<ThumbsDown size={16} />}
                    className="[.active]:text-primary [.active]:bg-grey-25 hover:text-primary icon-only min-w-0 md:min-w-16"
                  />
                  <Button
                    size="tiny"
                    color="grey"
                    variant="pastel"
                    startIcon={<Copy size={16} />}
                    className="[.active]:text-primary [.active]:bg-grey-25 hover:text-primary icon-only min-w-0 md:min-w-16"
                    onClick={() => navigator.clipboard.writeText(conversation.message)}
                  />
                  <Button
                    size="tiny"
                    color="grey"
                    variant="pastel"
                    startIcon={<Share2 size={16} />}
                    className="[.active]:text-primary [.active]:bg-grey-25 hover:text-primary icon-only min-w-0 md:min-w-16"
                  />
                </Box>
              </Fade>
            )}
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box className="flex w-full flex-row items-start justify-end gap-2">
      <Card className={cn('ms-auto max-w-xs !rounded-3xl md:max-w-lg !bg-primary')}>
        <CardContent className="relative">
          <Typography variant="body1" className="whitespace-pre-line text-white">
            {conversation.message}
          </Typography>
        </CardContent>
      </Card>
      <Avatar
        className="bg-primary/20 text-primary mt-1 flex-shrink-0 text-xs font-semibold"
        sx={{ width: 36, height: 36 }}
      >
        {userInitials}
      </Avatar>
    </Box>
  )
}
