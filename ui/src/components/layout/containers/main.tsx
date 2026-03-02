import { PropsWithChildren } from 'react'
import { useLayoutContext } from '@/components/layout/layout-context'

export default function Main({ children }: PropsWithChildren) {
  const { sidebarOpen, sidebarWidth, isMobile } = useLayoutContext()

  const paddingLeft = sidebarOpen && !isMobile ? sidebarWidth : 0

  return (
    <main
      className="flex h-full min-h-0 w-full flex-col bg-black/[0.03] pt-20 transition-all duration-(--layout-duration)"
      style={{ paddingInlineStart: `${paddingLeft}px` }}
    >
      {children}
    </main>
  )
}
