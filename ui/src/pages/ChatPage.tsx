// ci trigger
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  TextareaAutosize,
  Tooltip,
  Typography,
} from '@mui/material'
import { chat } from '@/services/api'
import { useDocumentUpload } from '@/hooks/useDocumentUpload'
import ChatMessage from '@/pages/chat/chat-message'
import { Conversation } from '@/pages/chat/types'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import { useUserProfile } from '@/hooks/useUserProfile'
import NiArrowOutUp from '@/icons/nexture/ni-arrow-out-up'
import NiMicrophone from '@/icons/nexture/ni-microphone'
import NiSendRight from '@/icons/nexture/ni-send-right'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { cn } from '@/lib/utils'
import type { ConversationMessage } from '@/types'

const INTRO_CONVERSATION: Conversation = {
  id: 'intro',
  type: 'AI',
  message: "Hello, I'm Sir Realtor and I'll be your virtual real estate concierge. Let's chat about what you're looking for in a home.",
  animate: false,
  suggestedQuestions: [
    'What neighborhoods in my area have the best value?',
    'How do I evaluate if a property is priced fairly?',
    'What should I look for in a home inspection?',
  ],
}

const SESSION_KEY = 'chat_session'

function loadSession(): { conversation: Conversation[]; messages: ConversationMessage[]; sessionId?: string } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { conversation: [INTRO_CONVERSATION], messages: [] }
}

function saveSession(conversation: Conversation[], messages: ConversationMessage[], sessionId?: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ conversation, messages, sessionId }))
  } catch { /* ignore */ }
}

export default function ChatPage() {
  const [searchParams] = useSearchParams()
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const [conversation, setConversation] = useState<Conversation[]>(() => loadSession().conversation)
  const [messages, setMessages] = useState<ConversationMessage[]>(() => loadSession().messages)
  const [sessionId, setSessionId] = useState<string | undefined>(() => loadSession().sessionId)
  const { invalidateProfile, invalidateSearchResults } = useSidebarRefresh()
  const { profile, refetch: refetchProfile } = useUserProfile()
  const { upload, isUploading } = useDocumentUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { refetchProfile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist chat session across navigation within the same tab
  useEffect(() => {
    saveSession(conversation, messages, sessionId)
  }, [conversation, messages, sessionId])

  const userInitials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : profile?.email ? profile.email.slice(0, 2).toUpperCase() : 'ME'

  const handleSpeechResult = useCallback((transcript: string) => {
    setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript))
  }, [])

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: handleSpeechResult,
  })

  // If launched with ?feedback=viewingId, pre-fill a feedback prompt
  useEffect(() => {
    const feedbackId = searchParams.get('feedback')
    if (feedbackId) {
      setInputValue(`I'd like to share feedback about my viewing (ID: ${feedbackId})`)
    }
  }, [searchParams])

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return

    const userMsg: Conversation = {
      id: crypto.randomUUID(),
      type: 'User',
      message,
    }

    setConversation((prev) => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    const newUserMessage: ConversationMessage = {
      role: 'user',
      content: [{ type: 'text', text: message }],
    }
    const updatedMessages: ConversationMessage[] = [...messages, newUserMessage]

    try {
      const response = await chat.send({ messages: updatedMessages, sessionId })
      setSessionId(response.sessionId)
      setMessages(response.messages)

      // Invalidate sidebar data after any tool use
      if (response.hasToolUse) {
        invalidateProfile()
        invalidateSearchResults()
      }

      setConversation((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'AI',
          message: response.reply,
          animate: true,
        },
      ])
    } catch (err) {
      setConversation((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'AI',
          message: 'Sorry, something went wrong. Please try again.',
          animate: false,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await upload(file)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  // Auto-scroll while animating
  useEffect(() => {
    if (!isAnimating) return
    const id = setInterval(() => {
      window.scrollTo({ top: document.body.scrollHeight })
    }, 100)
    return () => clearInterval(id)
  }, [isAnimating])

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight })
  }, [conversation])

  return (
    <Box className="relative flex h-full min-h-[calc(100vh-12rem)] flex-col items-center gap-5">
      {/* Conversation area */}
      <Box className="flex w-full max-w-200 flex-1 flex-col items-end justify-start gap-5 pb-32 sm:px-4">
        {conversation.map((msg) => (
          <ChatMessage
            key={msg.id}
            conversation={msg}
            onAnimationStart={() => setIsAnimating(true)}
            onAnimationEnd={() => setIsAnimating(false)}
            userInitials={userInitials}
            onSuggestedQuestion={sendMessage}
          />
        ))}

        {isLoading && (
          <Box className="w-full">
            <Card className="w-full">
              <CardContent>
                <Typography variant="body2" className="text-text-secondary animate-pulse">
                  Thinking…
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      {/* Fixed input bar */}
      <Box className="bg-background fixed bottom-0 z-2 w-full p-4 sm:max-w-160 lg:max-w-200">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Card>
          <CardContent className="flex flex-col gap-4 p-2!">
            <FormControl className="MuiTextField-root relative mb-0 w-full">
              <TextareaAutosize
                minRows={2}
                maxRows={3}
                className="MuiInputBase-root MuiInput-root outlined autosize bg-background-paper! w-full resize-none pe-28! outline-none!"
                placeholder="Ask SirRealtor anything about real estate…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <Box className="absolute bottom-0 end-0 flex flex-row gap-1 sm:top-0 sm:bottom-auto">
                <Tooltip
                  title={!isSupported ? 'Voice input not supported in this browser' : isListening ? 'Stop recording' : 'Voice'}
                  arrow
                  enterDelay={isListening ? 0 : 2000}
                >
                  <span className="hidden sm:inline-flex">
                    <Button
                      className={cn('icon-only', isListening && 'animate-pulse')}
                      size="medium"
                      color={isListening ? 'error' : 'grey'}
                      variant="text"
                      disabled={!isSupported || isLoading}
                      onClick={isListening ? stopListening : startListening}
                      startIcon={<NiMicrophone size="medium" />}
                    />
                  </span>
                </Tooltip>
                <Tooltip title={isUploading ? 'Uploading…' : 'Attach document'} arrow enterDelay={isUploading ? 0 : 2000}>
                  <span>
                    <Button
                      className={cn('icon-only', isUploading && 'animate-pulse')}
                      size="medium"
                      color="grey"
                      variant="text"
                      disabled={isLoading || isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      startIcon={<NiArrowOutUp size="medium" />}
                    />
                  </span>
                </Tooltip>
                <Tooltip title="Send" arrow enterDelay={2000}>
                  <Button
                    className="icon-only"
                    size="medium"
                    color="primary"
                    variant="contained"
                    onClick={() => sendMessage(inputValue)}
                    disabled={isLoading || !inputValue.trim()}
                    startIcon={<NiSendRight size="medium" />}
                  />
                </Tooltip>
              </Box>
            </FormControl>
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
