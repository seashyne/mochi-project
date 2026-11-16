// Static policy and information pages (About, Jobs, Newsroom, Parents, Gift Cards,
// Help, Terms, Accessibility, Privacy, Sitemap). One component, one content set
// per route, so every page shares the same reading layout.

import React from 'react';
import { useI18n } from '../../i18n/context';

export type LegalPageKind =
  | 'about'
  | 'jobs'
  | 'newsroom'
  | 'parents'
  | 'gift-cards'
  | 'help'
  | 'terms'
  | 'accessibility'
  | 'privacy'
  | 'privacy-choices'
  | 'sitemap';

export interface LegalPageProps {
  kind: LegalPageKind;
  onNavigate?: (path: string) => void;
}

interface Section {
  title: string;
  body: string;
}

const PageShell: React.FC<{ title: string; lead: string; children: React.ReactNode }> = ({
  title,
  lead,
  children
}) => (
  <div className="mochi-page">
    <div className="max-w-3xl">
      <h1 className="mochi-page-title">{title}</h1>
      <p className="mochi-page-sub">{lead}</p>
      <div className="mt-8 space-y-7">{children}</div>
    </div>
  </div>
);

const SectionBlock: React.FC<{ section: Section }> = ({ section }) => (
  <section>
    <h2 className="text-base font-extrabold text-[color:var(--mochi-text)] tracking-tight">
      {section.title}
    </h2>
    <p className="mt-2 text-sm leading-relaxed text-[color:var(--mochi-sub)]">{section.body}</p>
  </section>
);

export const LegalPage: React.FC<LegalPageProps> = ({ kind }) => {
  const { t } = useI18n();
  const L = t.legal;

  if (kind === 'about') {
    return (
      <PageShell title={L.aboutTitle} lead={L.aboutLead}>
        <SectionBlock section={{ title: L.aboutMissionTitle, body: L.aboutMissionBody }} />
        <SectionBlock section={{ title: L.aboutPlatformTitle, body: L.aboutPlatformBody }} />
        <SectionBlock section={{ title: L.aboutCommunityTitle, body: L.aboutCommunityBody }} />
      </PageShell>
    );
  }

  if (kind === 'jobs') {
    return (
      <PageShell title={L.jobsTitle} lead={L.jobsLead}>
        <h2 className="text-base font-extrabold text-[color:var(--mochi-text)] tracking-tight">
          {L.jobsOpenings}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--mochi-sub)]">{L.jobsNoOpenings}</p>
      </PageShell>
    );
  }

  if (kind === 'newsroom') {
    return (
      <PageShell title={L.newsroomTitle} lead={L.newsroomLead}>
        <h2 className="text-base font-extrabold text-[color:var(--mochi-text)] tracking-tight">
          {L.newsroomLatest}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--mochi-sub)]">{L.newsroomNoPosts}</p>
      </PageShell>
    );
  }

  if (kind === 'parents') {
    return (
      <PageShell title={L.parentsTitle} lead={L.parentsLead}>
        <SectionBlock section={{ title: L.parentsSafetyTitle, body: L.parentsSafetyBody }} />
        <SectionBlock section={{ title: L.parentsControlsTitle, body: L.parentsControlsBody }} />
      </PageShell>
    );
  }

  if (kind === 'gift-cards') {
    return (
      <PageShell title={L.giftCardsTitle} lead={L.giftCardsLead}>
        <SectionBlock section={{ title: L.giftCardsBalanceTitle, body: L.giftCardsBalanceBody }} />
        <SectionBlock section={{ title: L.giftCardsHowTitle, body: L.giftCardsHowBody }} />
      </PageShell>
    );
  }

  if (kind === 'help') {
    return (
      <PageShell title={L.helpTitle} lead={L.helpLead}>
        <SectionBlock section={{ title: L.helpAccountTitle, body: L.helpAccountBody }} />
        <SectionBlock section={{ title: L.helpPlayingTitle, body: L.helpPlayingBody }} />
        <SectionBlock section={{ title: L.helpBuildingTitle, body: L.helpBuildingBody }} />
      </PageShell>
    );
  }

  if (kind === 'terms') {
    return (
      <PageShell title={L.termsTitle} lead={L.termsLead}>
        <SectionBlock section={{ title: L.termsUseTitle, body: L.termsUseBody }} />
        <SectionBlock section={{ title: L.termsContentTitle, body: L.termsContentBody }} />
        <SectionBlock section={{ title: L.termsSafetyTitle, body: L.termsSafetyBody }} />
      </PageShell>
    );
  }

  if (kind === 'accessibility') {
    return (
      <PageShell title={L.accessibilityTitle} lead={L.accessibilityLead}>
        <SectionBlock
          section={{ title: L.accessibilityCommitmentTitle, body: L.accessibilityCommitmentBody }}
        />
        <SectionBlock section={{ title: L.accessibilitySupportTitle, body: L.accessibilitySupportBody }} />
      </PageShell>
    );
  }

  if (kind === 'privacy') {
    return (
      <PageShell title={L.privacyTitle} lead={L.privacyLead}>
        <SectionBlock section={{ title: L.privacyCollectTitle, body: L.privacyCollectBody }} />
        <SectionBlock section={{ title: L.privacyUseTitle, body: L.privacyUseBody }} />
      </PageShell>
    );
  }

  if (kind === 'privacy-choices') {
    return (
      <PageShell title={L.privacyChoicesTitle} lead={L.privacyChoicesBody}>
        <div className="space-y-3">
          {[
            L.privacyChoicesEssential,
            L.privacyChoicesAnalytics,
            L.privacyChoicesPersonalization
          ].map((label) => (
            <label
              key={label}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
            >
              <span className="text-[color:var(--mochi-text)]">{label}</span>
              <input
                type="checkbox"
                defaultChecked={label === L.privacyChoicesEssential}
                disabled={label === L.privacyChoicesEssential}
                className="h-4 w-4 accent-[#00a2ff]"
              />
            </label>
          ))}
        </div>
        <p className="text-sm text-[color:var(--mochi-sub)]">{L.privacyChoicesManage}</p>
      </PageShell>
    );
  }

  return (
    <PageShell title={L.sitemapTitle} lead={L.sitemapLead}>
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { heading: L.sitemapPlatform, items: [L.sitemapCatalog, L.sitemapStudio] },
          { heading: L.sitemapAccount, items: [L.helpAccountTitle] },
          { heading: L.sitemapLegal, items: [L.termsTitle, L.privacyTitle, L.accessibilityTitle] }
        ].map((group) => (
          <div key={group.heading}>
            <h2 className="text-sm font-extrabold text-[color:var(--mochi-text)] tracking-tight">
              {group.heading}
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[color:var(--mochi-sub)]">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageShell>
  );
};

export default LegalPage;
