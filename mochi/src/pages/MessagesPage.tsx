// Messages page: local-first thread list with a working conversation pane

import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus, Send } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { AvatarFrame } from '../components/common/AvatarFrame';
import { useI18n } from '../i18n/context';
import { useSocialStore } from '../store/useSocialStore';

export interface MessagesPageProps {
  initialThreadId?: string | null;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export const MessagesPage: React.FC<MessagesPageProps> = ({ initialThreadId }) => {
  const { t } = useI18n();
  const p = t.pages;
  const threads = useSocialStore((state) => state.threads);
  const ensureThread = useSocialStore((state) => state.ensureThread);
  const sendMessage = useSocialStore((state) => state.sendMessage);
  const markThreadRead = useSocialStore((state) => state.markThreadRead);

  const [activeId, setActiveId] = useState<string | null>(initialThreadId || threads[0]?.id || null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (initialThreadId) setActiveId(initialThreadId);
  }, [initialThreadId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) || null,
    [threads, activeId]
  );

  const selectThread = (id: string) => {
    setActiveId(id);
    markThreadRead(id);
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeId || !draft.trim()) return;
    sendMessage(activeId, draft);
    setDraft('');
  };

  const handleStartThread = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const id = ensureThread(newName);
    setNewName('');
    selectThread(id);
  };

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI // INBOX"
        title={p.messagesTitle}
        subtitle={p.messagesSubtitle}
        icon={MessageSquare}
        badge={<span className="mochi-chip">{threads.length}</span>}
      />

      <form onSubmit={handleStartThread} className="flex flex-col sm:flex-row gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={p.threadNamePlaceholder}
          className="mochi-input-soft flex-1"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="mochi-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>{p.startChat}</span>
        </button>
      </form>

      {threads.length === 0 ? (
        <PageEmpty icon={MessageSquare} title={p.messagesEmpty} hint={p.localOnly} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div className="mochi-list">
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={`mochi-row text-start w-full ${
                    thread.id === activeId ? 'border-sky-400/40 bg-sky-500/[0.06]' : ''
                  }`}
                >
                  <AvatarFrame initials={thread.name.slice(0, 2)} size="sm" tier="cyber" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[color:var(--mochi-text)] truncate">{thread.name}</p>
                      {thread.unread > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500 text-[10px] font-bold">
                          {thread.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[color:var(--mochi-text-muted)] truncate">
                      {last ? last.body : p.conversationEmpty}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mochi-panel flex flex-col min-h-[420px]">
            {activeThread ? (
              <>
                <div className="flex items-center gap-2 pb-3 border-b border-[color:var(--mochi-border)]">
                  <AvatarFrame initials={activeThread.name.slice(0, 2)} size="sm" tier="cyber" />
                  <div>
                    <p className="text-sm font-bold text-[color:var(--mochi-text)]">{activeThread.name}</p>
                    <p className="mochi-meta">{p.localOnly}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-2.5 max-h-[360px]">
                  {activeThread.messages.length === 0 ? (
                    <p className="text-xs text-[color:var(--mochi-text-muted)]">{p.conversationEmpty}</p>
                  ) : (
                    activeThread.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                          message.self
                            ? 'ml-auto bg-sky-500/15 border border-sky-500/25 text-[color:var(--mochi-text)]'
                            : 'bg-[color:var(--mochi-card)] border border-[color:var(--mochi-border)] text-[color:var(--mochi-text)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="font-bold">{message.self ? p.you : message.author}</span>
                          <span className="mochi-meta">{formatTime(message.at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSend} className="flex items-center gap-2 pt-3 border-t border-[color:var(--mochi-border)]">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={p.messagePlaceholder}
                    className="mochi-input-soft flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="mochi-btn-primary inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{p.sendMessage}</span>
                  </button>
                </form>
              </>
            ) : (
              <PageEmpty icon={MessageSquare} title={p.messagesEmpty} hint={p.localOnly} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;
