// Access sharing dialog for a single asset: grant read/write to creators or
// create a share link token, then review and revoke existing grants.

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Link2, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import {
  assetLibraryApi,
  type AccessGrant,
  type AssetFile,
  type GranteeType,
  type GrantPermission
} from '@/api/assetLibrary';

export interface AssetAccessDialogProps {
  file: AssetFile;
  token?: string | null;
  onClose: () => void;
}

export const AssetAccessDialog: React.FC<AssetAccessDialogProps> = ({ file, token, onClose }) => {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [granteeType, setGranteeType] = useState<GranteeType>('user');
  const [granteeId, setGranteeId] = useState('');
  const [permission, setPermission] = useState<GrantPermission>('read');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await assetLibraryApi.listGrants(file.id, token);
      setGrants(result.grants);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load grants.');
    } finally {
      setIsLoading(false);
    }
  }, [file.id, token]);

  useEffect(() => {
    void loadGrants();
  }, [loadGrants]);

  const handleCreateGrant = async () => {
    if (!token) return;
    if (granteeType === 'user' && !granteeId.trim()) {
      setErrorMessage('Enter the creator ID to grant access to.');
      return;
    }
    try {
      const result = await assetLibraryApi.createGrant(
        file.id,
        {
          granteeType,
          granteeId: granteeType === 'user' ? granteeId.trim() : null,
          permission,
          withToken: granteeType === 'public'
        },
        token
      );
      if (result.token) setIssuedToken(result.token);
      setGranteeId('');
      await loadGrants();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not create grant.');
    }
  };

  const handleRevoke = async (grantId: string) => {
    if (!token) return;
    try {
      await assetLibraryApi.revokeGrant(file.id, grantId, token);
      await loadGrants();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not revoke grant.');
    }
  };

  const copyToken = () => {
    if (!issuedToken) return;
    void navigator.clipboard?.writeText(issuedToken);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-studio-overlay/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-studio-panel border border-studio-border shadow-xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-studio-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-studio-accent" />
            <h3 className="text-sm font-bold text-studio-text">Share Access</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-[11px] font-mono text-studio-muted truncate">
            {file.name} - visibility: {file.visibility}
          </p>

          {errorMessage && (
            <div className="px-2 py-1.5 rounded-lg bg-studio-danger/10 border border-studio-danger/30 text-[10px] text-studio-danger">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-mono text-studio-muted">Grant to</span>
              <select
                value={granteeType}
                onChange={(e) => setGranteeType(e.target.value as GranteeType)}
                className="w-full px-2 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[11px] font-mono text-studio-text"
              >
                <option value="user">Creator</option>
                <option value="public">Share link</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono text-studio-muted">Permission</span>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as GrantPermission)}
                className="w-full px-2 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[11px] font-mono text-studio-text"
              >
                <option value="read">Read</option>
                <option value="write">Write</option>
              </select>
            </label>
          </div>

          {granteeType === 'user' && (
            <label className="space-y-1 block">
              <span className="text-[10px] font-mono text-studio-muted">Creator ID</span>
              <input
                value={granteeId}
                onChange={(e) => setGranteeId(e.target.value)}
                placeholder="user UUID"
                className="w-full px-2 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[11px] font-mono text-studio-text focus:outline-none focus:border-studio-accent"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => void handleCreateGrant()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-studio-accent/20 border border-studio-accent/40 text-[11px] font-mono font-bold text-studio-text hover:bg-studio-accent/30"
          >
            {granteeType === 'user' ? <UserPlus className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {granteeType === 'user' ? 'Grant Access' : 'Create Share Link'}
          </button>

          {issuedToken && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-studio-success/10 border border-studio-success/30">
              <KeyRound className="w-3.5 h-3.5 text-studio-success shrink-0" />
              <code className="flex-1 text-[10px] font-mono text-studio-success truncate">{issuedToken}</code>
              <button
                type="button"
                onClick={copyToken}
                className="p-1 rounded text-studio-success hover:bg-studio-success/20"
                title="Copy token"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="pt-1">
            <h4 className="text-[10px] font-mono text-studio-muted mb-1">
              Active grants {isLoading ? '...' : `(${grants.length})`}
            </h4>
            {grants.length === 0 && !isLoading ? (
              <p className="text-[10px] font-mono text-studio-muted py-2">No grants yet.</p>
            ) : (
              <ul className="space-y-1">
                {grants.map((grant) => (
                  <li key={grant.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-studio-card/60">
                    <span className="flex-1 min-w-0 text-[10px] font-mono text-studio-text truncate">
                      {grant.granteeType === 'user' ? grant.granteeId : 'share link'} - {grant.permission}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(grant.id)}
                      className="p-1 rounded text-studio-muted hover:text-studio-danger"
                      title="Revoke"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
