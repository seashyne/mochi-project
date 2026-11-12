// Team Create UI localization: the drawer, presence strip and trigger render
// through the shared 4-locale dictionaries instead of hardcoded strings.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { StudioTeamPanel } from '../src/components/studio/team/StudioTeamPanel';
import { StudioTeamPresence } from '../src/components/studio/team/StudioTeamPresence';
import { StudioTeamControls } from '../src/components/studio/team/StudioTeamControls';
import type { TeamCreateApi } from '../src/components/studio/team/useTeamCreate';
import type { Language } from '../src/i18n/types';

function fakeTeam(overrides: Partial<TeamCreateApi> = {}): TeamCreateApi {
  return {
    team: {
      draftId: 'd1',
      ownerId: 'u1',
      role: 'owner',
      enabled: true,
      members: [{
        userId: 'u2', username: 'guest', role: 'viewer',
        invitedBy: 'u1', createdAt: '2026-11-12T00:00:00Z'
      }],
      websocketPath: '/api/v1/games/drafts/d1/team/ws'
    },
    error: null,
    syncError: null,
    busy: false,
    refresh: vi.fn(),
    setEnabled: vi.fn(),
    invite: vi.fn(),
    setRole: vi.fn(),
    remove: vi.fn(),
    status: 'closed',
    version: 0,
    collaborators: [],
    locks: {},
    awareness: {},
    save: vi.fn(),
    resync: vi.fn(),
    markExternalSnapshot: vi.fn(),
    markExternalFields: vi.fn(),
    isLive: false,
    isOwner: true,
    isEnabled: true,
    role: 'owner',
    ...overrides
  };
}

const render = (ui: React.ReactElement, locale: Language) =>
  renderToString(<I18nProvider initialLocale={locale}>{ui}</I18nProvider>);

/** SSR inserts comment separators between adjacent text nodes; strip them. */
const clean = (html: string): string => html.replace(/<!-- -->/g, '');

describe('Team Create UI localization', () => {
  it('renders the drawer fully in English', () => {
    const html = clean(render(
      <StudioTeamPanel team={fakeTeam()} onClose={vi.fn()} />, 'en'
    ));
    expect(html).toContain('Team Create');
    expect(html).toContain('Live Session');
    expect(html).toContain('Invite Creator');
    expect(html).toContain('Members (2)');
    expect(html).toContain('Pause Team Create');
    expect(html).toContain('Waiting for collaborators to join.');
    expect(html).toContain('Save Now');
    expect(html).toContain('Resync');
  });

  it('renders the drawer fully in Thai', () => {
    const html = clean(render(
      <StudioTeamPanel team={fakeTeam()} onClose={vi.fn()} />, 'th'
    ));
    expect(html).toContain('เซสชันสด');
    expect(html).toContain('เชิญผู้สร้าง');
    expect(html).toContain('สมาชิก (2)');
    expect(html).toContain('หยุด Team Create ชั่วคราว');
    expect(html).toContain('กำลังรอผู้ร่วมงานเข้าร่วม');
    expect(html).toContain('บันทึกเดี๋ยวนี้');
    expect(html).toContain('ซิงก์ใหม่');
  });

  it('localizes collaborator role labels for non-owners in Thai', () => {
    const html = clean(render(
      <StudioTeamPanel
        team={fakeTeam({ isOwner: false, role: 'viewer' })}
        onClose={vi.fn()}
      />, 'th'
    ));
    expect(html).toContain('บทบาทของคุณ: ผู้ชม');
  });

  it('localizes the presence strip and trigger in Japanese and Chinese', () => {
    const jaHtml = clean(render(<StudioTeamPresence team={fakeTeam()} />, 'ja'));
    expect(jaHtml).toContain('オフライン');
    const zhHtml = clean(render(<StudioTeamPresence team={fakeTeam()} />, 'zh'));
    expect(zhHtml).toContain('离线');
    expect(render(<StudioTeamControls team={fakeTeam()} />, 'ja')).toContain('Team Create');
    expect(render(<StudioTeamControls team={fakeTeam()} />, 'zh')).toContain('Team Create');
  });
});
