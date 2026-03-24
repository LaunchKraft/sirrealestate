import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Fab,
  IconButton,
  TextareaAutosize,
  Tooltip,
  Typography,
} from '@mui/material'
import DsMarkdown from 'ds-markdown'
import { chat } from '@/services/api'
import { useFloatingChat } from './floating-chat-context'
import { useSidebarRefresh } from '@/components/layout/sidebar-refresh-context'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { MessageSquare, Mic, Send, X, Maximize2 } from 'lucide-react'
import logo from '@/assets/logo.png'
import { cn } from '@/lib/utils'
import type { ConversationMessage } from '@/types'
import type { Conversation } from '@/pages/chat/types'

export default function FloatingChat() {
  const { pathname } = useLocation()
  const { isOpen, openChat, closeChat, pendingMessage, clearPendingMessage } = useFloatingChat()

  if (pathname === '/chat') return null
  const navigate = useNavigate()
  const { invalidateProfile, invalidateSearchResults, invalidateViewings } = useSidebarRefresh()
  const { profile } = useUserProfile()

  // Isolated session — never collides with ChatPage
  const sessionIdRef = useRef<string>(crypto.randomUUID())

  const [inputValue, setInputValue] = useState('')
  const [conversation, setConversation] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const userInitials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : profile?.email ? profile.email.slice(0, 2).toUpperCase() : 'ME'

  const handleSpeechResult = useCallback((transcript: string) => {
    setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript))
  }, [])

  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: handleSpeechResult,
  })

  const sendMessage = useCallback(async (message: string) => {
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
      const response = await chat.send({ messages: updatedMessages, sessionId: sessionIdRef.current })
      sessionIdRef.current = response.sessionId
      setMessages(response.messages)

      if (response.hasToolUse) {
        invalidateProfile()
        invalidateSearchResults()
        invalidateViewings()
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
    } catch {
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
  }, [isLoading, messages, invalidateProfile, invalidateSearchResults])

  // Auto-trigger pending message when chat opens
  useEffect(() => {
    if (pendingMessage && isOpen) {
      sendMessage(pendingMessage)
      clearPendingMessage()
    }
  }, [pendingMessage, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation, isLoading])

  const handleExpand = () => {
    if (conversation.length > 0) {
      sessionStorage.setItem('chat_session', JSON.stringify({
        conversation,
        messages,
        sessionId: sessionIdRef.current,
      }))
    }
    closeChat()
    navigate('/chat')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <Card
          sx={{ zIndex: 1400, padding: 0 }}
          className="fixed bottom-24 right-4 flex w-80 flex-col overflow-hidden shadow-xl"
          style={{ maxHeight: '32rem' }}
        >
          {/* Header */}
          <Box className="bg-primary flex items-center justify-between rounded-t-xl px-3 py-2">
            <Box className="flex items-center gap-2">
              <img
                src={logo}
                alt="Sir Realtor"
                className="h-6 w-6 rounded-full object-cover object-top"
              />
              <Typography variant="body2" className="font-semibold text-white">
                Sir Realtor
              </Typography>
            </Box>
            <Box className="flex items-center">
              <IconButton size="small" onClick={handleExpand} sx={{ color: 'white' }}>
                <Maximize2 size={16} />
              </IconButton>
              <IconButton size="small" onClick={closeChat} sx={{ color: 'white' }}>
                <X size={16} />
              </IconButton>
            </Box>
          </Box>

          {/* Messages */}
          <Box className="flex flex-1 flex-col gap-3 overflow-y-auto p-3" style={{ minHeight: 0 }}>
            {conversation.length === 0 && !isLoading && (
              <Typography variant="caption" className="text-text-secondary text-center">
                {pathname === '/viewings'
                ? 'Would you like to schedule or change a viewing or add some availability?'
                : pathname.startsWith('/listings/')
                  ? 'Would you like to know more about one of these properties?'
                  : 'Ask me anything about real estate.'}
              </Typography>
            )}
            {conversation.map((msg) => (
              <Box
                key={msg.id}
                className={cn('flex items-start gap-2', msg.type === 'User' && 'flex-row-reverse')}
              >
                {msg.type === 'AI' ? (
                  <img
                    src={logo}
                    alt="Sir Realtor"
                    className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full object-cover object-top"
                  />
                ) : (
                  <Avatar
                    className="bg-primary/20 text-primary mt-0.5 flex-shrink-0 text-[10px] font-semibold"
                    sx={{ width: 24, height: 24 }}
                  >
                    {userInitials}
                  </Avatar>
                )}
                <Box
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm',
                    msg.type === 'AI' ? 'bg-background-paper' : 'bg-primary text-white',
                  )}
                >
                  {msg.type === 'AI' ? (
                    <DsMarkdown
                      answerType="answer"
                      interval={10}
                      disableTyping={!msg.animate}
                    >
                      {msg.message}
                    </DsMarkdown>
                  ) : (
                    <Typography variant="body2" className="whitespace-pre-line">
                      {msg.message}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
            {isLoading && (
              <Typography variant="caption" className="text-text-secondary animate-pulse ps-8">
                Thinking…
              </Typography>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* Input */}
          <CardContent className="border-t p-2!">
            <Box className="flex items-center rounded-full border border-gray-200 bg-white px-4 py-1.5 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <TextareaAutosize
                minRows={1}
                maxRows={3}
                className="w-full flex-1 resize-none bg-transparent text-[0.80rem] outline-none!"
                placeholder="Ask something…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <Box className="flex flex-shrink-0 flex-row items-center gap-0.5">
                <Tooltip
                  title={!isSupported ? 'Voice not supported' : isListening ? 'Stop' : 'Voice'}
                  arrow
                  enterDelay={2000}
                >
                  <span>
                    <Button
                      className={cn('icon-only', isListening && 'animate-pulse')}
                      size="small"
                      color={isListening ? 'error' : 'grey'}
                      variant="text"
                      disabled={!isSupported || isLoading}
                      onClick={isListening ? stopListening : startListening}
                      startIcon={<Mic size={16} />}
                      sx={{ minWidth: 50 }}
                    />
                  </span>
                </Tooltip>
                <Tooltip title="Send" arrow enterDelay={2000}>
                  <Button
                    className="icon-only"
                    color="primary"
                    variant="contained"
                    onClick={() => sendMessage(inputValue)}
                    disabled={isLoading}
                    sx={{ minWidth: 36, width: 36, height: 36, borderRadius: '50%', padding: 0 }}
                  >
                    <Send size={14} />
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        size="medium"
        onClick={isOpen ? closeChat : openChat}
        sx={{ zIndex: 1400, position: 'fixed', bottom: 24, right: 16 }}
        aria-label="Open chat"
      >
        <MessageSquare size={20} />
      </Fab>
    </>
  )
}
