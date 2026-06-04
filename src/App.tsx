import Toolbar from './components/ui/Toolbar'
import Scene from './components/viewport/Scene'
import ChatBar from './components/chat/ChatBar'
import TransformPanel from './components/controls/TransformPanel'
import AssetList from './components/ui/AssetList'
import { useStudio } from './store'
import { useDeltaLogger } from './hooks/useDeltaLogger'

export default function App() {
  const { isChatOpen } = useStudio()
  useDeltaLogger()

  return (
    <div className="flex flex-col h-screen bg-studio-bg text-studio-text">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: assets + transforms */}
        <aside className="w-56 shrink-0 border-r border-studio-border flex flex-col overflow-hidden bg-studio-panel">
          <div className="p-3 text-xs font-semibold text-studio-muted uppercase tracking-wider border-b border-studio-border">
            Assets
          </div>
          <div className="overflow-y-auto">
            <AssetList />
          </div>
          <div className="border-t border-studio-border overflow-y-auto flex-1">
            <div className="p-3 text-xs font-semibold text-studio-muted uppercase tracking-wider">
              The Pen
            </div>
            <TransformPanel />
          </div>
        </aside>

        {/* Main viewport */}
        <main className="flex-1 relative overflow-hidden">
          <Scene />
        </main>

        {/* Right panel: chat */}
        {isChatOpen && (
          <aside className="w-72 shrink-0 border-l border-studio-border flex flex-col bg-studio-panel overflow-hidden">
            <div className="p-3 text-xs font-semibold text-studio-muted uppercase tracking-wider border-b border-studio-border">
              Creator's Chat
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <ChatBar />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
