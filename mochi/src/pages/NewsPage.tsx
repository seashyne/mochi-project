// News page: platform announcements with per-notice read state and unread filter

import React, { useState } from 'react';
import { Bell, CheckCheck, Newspaper } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { useI18n } from '../i18n/context';
import { useSocialStore } from '../store/useSocialStore';
import { ANNOUNCEMENTS } from '../data/announcements';

const TAG_STYLES: Record<string, string> = {
  PLATFORM: 'text-sky-700 bg-sky-500/10 border-sky-500/30 dark:text-sky-300',
  STUDIO: 'text-indigo-700 bg-indigo-500/10 border-indigo-500/30 dark:text-indigo-300',
  SHOP: 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300',
  COMMUNITY: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300'
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const NewsPage: React.FC = () => {
  const { t } = useI18n();
  const p = t.pages;
  const readNoticeIds = useSocialStore((state) => state.readNoticeIds);
  const markNoticeRead = useSocialStore((state) => state.markNoticeRead);
  const markAllNoticesRead = useSocialStore((state) => state.markAllNoticesRead);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const unreadCount = ANNOUNCEMENTS.filter((item) => !readNoticeIds.includes(item.id)).length;
  const visible = unreadOnly
    ? ANNOUNCEMENTS.filter((item) => !readNoticeIds.includes(item.id))
    : ANNOUNCEMENTS;

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="NEWS"
        icon={Newspaper}
        title={p.newsTitle}
        subtitle={p.newsSubtitle}
        badge={
          unreadCount > 0 ? (
            <span className="mochi-chip">
              <Bell className="w-3.5 h-3.5" /> {unreadCount}
            </span>
          ) : undefined
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setUnreadOnly((value) => !value)}
              data-active={unreadOnly}
              className="mochi-tab"
            >
              {p.unreadOnly}
            </button>
            <button
              type="button"
              onClick={() => markAllNoticesRead(ANNOUNCEMENTS.map((item) => item.id))}
              disabled={unreadCount === 0}
              className="mochi-btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              {p.markAllRead}
            </button>
          </>
        }
      />

      {visible.length === 0 ? (
        <PageEmpty icon={Bell} title={p.newsEmpty} hint={p.localOnly} />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((item) => {
            const isRead = readNoticeIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={`mochi-card-soft flex flex-col gap-2 transition-opacity ${
                  isRead ? 'opacity-70' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`mochi-chip border ${TAG_STYLES[item.tag] || TAG_STYLES.PLATFORM}`}>
                    {item.tag}
                  </span>
                  <span className="mochi-meta">{formatDate(item.date)}</span>
                  {!isRead && <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden="true" />}
                </div>
                <h3 className="text-sm font-bold text-[color:var(--mochi-text)]">{item.title}</h3>
                <p className="text-xs leading-relaxed text-[color:var(--mochi-text-sub)]">{item.body}</p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => markNoticeRead(item.id)}
                    disabled={isRead}
                    className="mochi-btn-ghost inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    {isRead ? p.close : p.markAllRead}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mochi-meta">{p.localOnly}</p>
    </div>
  );
};

export default NewsPage;
