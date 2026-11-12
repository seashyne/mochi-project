// Groups page: create community groups and join or leave them

import React, { useState } from 'react';
import { Globe2, Plus, Users } from 'lucide-react';
import { PageHeader } from '../components/pages/PageHeader';
import { PageEmpty } from '../components/pages/PageEmpty';
import { useI18n } from '../i18n/context';
import { useSocialStore } from '../store/useSocialStore';

export const GroupsPage: React.FC = () => {
  const { t } = useI18n();
  const p = t.pages;
  const groups = useSocialStore((state) => state.groups);
  const createGroup = useSocialStore((state) => state.createGroup);
  const toggleGroup = useSocialStore((state) => state.toggleGroup);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createGroup(name, description);
    setName('');
    setDescription('');
  };

  return (
    <div className="mochi-page">
      <PageHeader
        eyebrow="MOCHI // COMMUNITY"
        title={p.groupsTitle}
        subtitle={p.groupsSubtitle}
        icon={Globe2}
        badge={<span className="mochi-chip">{groups.length}</span>}
      />

      <form onSubmit={handleCreate} className="mochi-panel grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={p.groupNamePlaceholder}
          className="mochi-input-soft"
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={p.groupDescPlaceholder}
          className="mochi-input-soft"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="mochi-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          <span>{p.createGroup}</span>
        </button>
      </form>

      {groups.length === 0 ? (
        <PageEmpty icon={Globe2} title={p.groupsEmpty} hint={p.localOnly} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {groups.map((group) => (
            <div key={group.id} className="mochi-card-soft flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="mochi-icon-badge">
                  <Users className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[color:var(--mochi-text)] truncate">{group.name}</p>
                  <p className="mochi-meta">
                    {group.members} {p.members}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[color:var(--mochi-text-sub)] line-clamp-2 min-h-[2rem]">
                {group.description || p.groupsSubtitle}
              </p>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                  group.joined ? 'mochi-btn-secondary' : 'mochi-btn-primary'
                }`}
              >
                {group.joined ? p.leaveGroup : p.joinGroup}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mochi-meta">{p.localOnly}</p>
    </div>
  );
};

export default GroupsPage;
