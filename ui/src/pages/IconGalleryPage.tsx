import {
  Upload,
  BarChart2,
  Bell,
  Calendar,
  ChevronRight,
  X,
  Copy,
  Maximize2,
  EyeOff,
  Eye,
  Home,
  ThumbsUp,
  LayoutList,
  Menu,
  MessageSquare,
  Mic,
  Search,
  Send,
  Share2,
  ThumbsDown,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type IconEntry = {
  name: string
  Icon: LucideIcon
}

const icons: IconEntry[] = [
  { name: 'Upload', Icon: Upload },
  { name: 'BarChart2', Icon: BarChart2 },
  { name: 'Bell', Icon: Bell },
  { name: 'Calendar', Icon: Calendar },
  { name: 'ChevronRight', Icon: ChevronRight },
  { name: 'X', Icon: X },
  { name: 'Copy', Icon: Copy },
  { name: 'Maximize2', Icon: Maximize2 },
  { name: 'EyeOff', Icon: EyeOff },
  { name: 'Eye', Icon: Eye },
  { name: 'Home', Icon: Home },
  { name: 'ThumbsUp', Icon: ThumbsUp },
  { name: 'LayoutList', Icon: LayoutList },
  { name: 'Menu', Icon: Menu },
  { name: 'MessageSquare', Icon: MessageSquare },
  { name: 'Mic', Icon: Mic },
  { name: 'Search', Icon: Search },
  { name: 'Send', Icon: Send },
  { name: 'Share2', Icon: Share2 },
  { name: 'ThumbsDown', Icon: ThumbsDown },
  { name: 'User', Icon: User },
]

export default function IconGalleryPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Lucide Icon Gallery</h1>
      <p className="mb-8 text-sm text-gray-500">{icons.length} icons · sizes 16, 20, 24</p>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {icons.map(({ name, Icon }) => (
          <div key={name} className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="w-full truncate text-center text-[11px] font-medium text-gray-500">{name}</p>
            <div className="flex items-end gap-3 text-gray-700">
              <Icon size={16} />
              <Icon size={20} />
              <Icon size={24} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
