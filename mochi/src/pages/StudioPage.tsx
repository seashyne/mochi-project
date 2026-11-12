// Mochi Creator Studio root page: owns the document, team, environment and
// publish state, then hands the chrome to StudioShell (menu bar, ribbon,
// toolbox, viewport, explorer, properties, output, status bar).
//
// Viewport surfaces live in ./studio/StudioViewport, the save/publish round-trips
// in ./studio/useStudioSavePublish and the Lua run state in
// ./studio/useStudioScriptRunner, so this file stays wiring only.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GameSummary } from '../api/types';
import { useAuthStore } from '../store/useAuthStore';
import { useI18n } from '../i18n/context';
import { StudioScene } from '../engine/studio/studioScene';
import { DEFAULT_LUA_SCRIPT, INITIAL_STUDIO_OBJECTS } from '../components/studio/studioDefaults';
import { useStudioTeamBridge } from '../components/studio/team/useStudioTeamBridge';
import { StudioTeamPresence } from '../components/studio/team/StudioTeamPresence';
import { StudioTeamControls } from '../components/studio/team/StudioTeamControls';
import { useStudioPublish } from '../components/studio/useStudioPublish';
import { useStudioDocument } from '../components/studio/useStudioDocument';
import { Studio3DCanvas } from '../components/studio/Studio3DCanvas';
import { useStudioAnimations } from '../components/studio/useStudioAnimations';
import { StudioPlaytestModal } from '../components/studio/StudioPlaytestModal';
import { useStudioShortcuts } from '../components/studio/useStudioShortcuts';
import { useStudioEnvironment } from '../components/studio/useStudioEnvironment';
import { useServerManifest } from '../components/studio/useServerManifest';
import { StudioShell } from '../components/studio/shell/StudioShell';
import type { StudioToolboxTab } from '../components/studio/shell/StudioToolboxPanel';
import type { StudioOutputFilter } from '../components/studio/shell/StudioOutputPanel';
import type { StudioPanelName, StudioRibbonTab } from '../components/studio/shell/StudioRibbon';
import { useStudioSystemLog } from '../components/studio/shell/useStudioSystemLog';
import { STUDIO_SERVICES, type StudioServiceId } from '../engine/studio/services';
import { clockTimeFromEnvironment, formatClockTime } from '../engine/environment/timeOfDay';
import { getSkyboxPreset } from '../engine/environment/skyboxPresets';
import type { GizmoMode } from '../engine/studio/transformGizmo';
import type { StudioObject } from '../engine/studio/types';
import { DEFAULT_CONSTRAINT, DEFAULT_TERRAIN_BRUSH, type ConstraintKind, type TerrainBrush, type TerrainData } from '../engine/studio/advancedTypes';
import { StudioViewport, VIEW_BY_TAB } from './studio/StudioViewport';
import { useStudioSavePublish } from './studio/useStudioSavePublish';
import { useStudioScriptRunner } from './studio/useStudioScriptRunner';

export interface StudioPageProps {
  onGamePublished: (newGame: GameSummary) => void;
  initialProjectId?: string | null;
  mapId?: string | null;
  onExit?: () => void;
}

export const StudioPage: React.FC<StudioPageProps> = ({ onGamePublished, initialProjectId, mapId, onExit }) => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const activeMapId = mapId || initialProjectId || null;

  const [ribbonTab, setRibbonTab] = useState<StudioRibbonTab>('home');
  const [panels, setPanels] = useState<Record<StudioPanelName, boolean>>({
    toolbox: true, explorer: true, properties: true, output: true
  });
  const [toolboxTab, setToolboxTab] = useState<StudioToolboxTab>('assets');
  const [outputFilter, setOutputFilter] = useState<StudioOutputFilter>('all');
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [snapping, setSnapping] = useState(false);
  const [selectedService, setSelectedService] = useState<StudioServiceId | null>('lighting');
  const [isPlaytestOpen, setIsPlaytestOpen] = useState(false);
  const [brush, setBrush] = useState<TerrainBrush>(DEFAULT_TERRAIN_BRUSH);
  const [isSculpting, setIsSculpting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(activeMapId);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const view = VIEW_BY_TAB[ribbonTab];

  const sceneEngine = useMemo(() => {
    const engine = new StudioScene();
    INITIAL_STUDIO_OBJECTS.forEach((obj) => engine.addObject(obj));
    return engine;
  }, []);

  const doc = useStudioDocument(sceneEngine, INITIAL_STUDIO_OBJECTS);
  const animation = useStudioAnimations(sceneEngine, doc.objects);
  const {
    objects, selectedIds, selectedId, isDirty, markSaved, addObject, updateObject,
    transformObject, deleteObjects, duplicateObjects, toggleAnchor, groupSelected,
    select, toggleSelect, selectAll, undo, redo
  } = doc;

  const [scriptCode, setScriptCode] = useState<string>(DEFAULT_LUA_SCRIPT);
  const { environment, updateEnvironment, resetEnvironment, replaceEnvironment } = useStudioEnvironment();
  const serverManifest = useServerManifest();
  const [title, setTitle] = useState('My Cyber Obby');
  const [slug, setSlug] = useState('my-cyber-obby');
  const [versionNumber, setVersionNumber] = useState('1.0.0');
  const [description, setDescription] = useState('Fast-paced parkour course built with Mochi 3D Studio.');

  const clockHours = clockTimeFromEnvironment(environment);
  const skybox = getSkyboxPreset(environment.skyboxId);
  const log = useStudioSystemLog([
    { level: 'info', source: 'Studio', message: `Opened project with ${STUDIO_SERVICES.length} services` },
    { level: 'info', source: 'Workspace', message: `${INITIAL_STUDIO_OBJECTS.length} parts, baseplate at y=0` },
    { level: 'info', source: 'Lighting', message: `ClockTime ${formatClockTime(clockHours)} | ${skybox.label} skybox` },
    { level: 'success', source: 'Renderer', message: 'WebGL viewport ready' }
  ]);
  const scriptRunner = useStudioScriptRunner(log);
  const { publishNotice, publishError, setPublishError, isPublishing, publishProgress, publish } = useStudioPublish(t, onGamePublished);

  useEffect(() => () => sceneEngine.destroy(), [sceneEngine]);

  const team = useStudioTeamBridge({
    mapId: activeMapId, token, selfId: user?.id ?? null, doc,
    scriptCode, environment, setScriptCode, setTitle, setSlug, setDescription,
    setDraftId, setLastSavedAt, replaceEnvironment, replaceAnimations: animation.replaceClips, serverManifest, markSaved
  });

  const persistence = useStudioSavePublish({
    token, userId: user?.id ?? null, activeMapId, draftId, setDraftId, setLastSavedAt, setIsSaving: setIsSavingDraft,
    target: { title, slug, description, versionNumber, objects, scriptCode, environment, animations: animation.clips },
    serverManifest, log, markSaved, isTeamLive: team.isLive, saveToTeam: team.save, publish, setPublishError
  });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useStudioShortcuts({
    enabled: view === 'builder',
    selectedId, selectedIds,
    onDuplicate: duplicateObjects, onDelete: deleteObjects, onGroup: groupSelected,
    onToggleAnchor: toggleAnchor, onUndo: undo, onRedo: redo, onSelectAll: selectAll
  });

  const togglePanel = useCallback((panel: StudioPanelName) => {
    setPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const openToolboxTab = useCallback((tab: string) => {
    setToolboxTab(tab as StudioToolboxTab);
    setPanels((prev) => ({ ...prev, toolbox: true }));
  }, []);

  const handleSelectService = useCallback((id: StudioServiceId) => {
    setSelectedService(id);
    select([]);
  }, [select]);

  const handleSelectObject = useCallback((id: string) => {
    setSelectedService(null);
    select([id]);
  }, [select]);

  const handleToggleObjectSelect = useCallback((id: string) => {
    setSelectedService(null);
    toggleSelect(id);
  }, [toggleSelect]);

  const handleBrushChange = useCallback((patch: Partial<TerrainBrush>) => {
    setBrush((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleTerrainEdit = useCallback((id: string, terrain: TerrainData) => {
    updateObject(id, { terrain }, { mergeKey: `terrain:${id}` });
  }, [updateObject]);

  const handleCreateConstraint = useCallback((kind: ConstraintKind) => {
    if (selectedIds.length < 2) return;
    const preset: StudioObject = {
      id: `obj_constraint_${Date.now()}_${objects.length + 1}`,
      name: `Joint_${kind}_${objects.length + 1}`,
      type: 'constraint',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#c084fc',
      constraint: { ...DEFAULT_CONSTRAINT, kind, attachment0: selectedIds[0], attachment1: selectedIds[1] }
    };
    addObject('constraint', preset);
    log.push('success', 'Physics', `Created ${kind} joint between two parts`);
  }, [selectedIds, objects.length, addObject, log]);

  const handleCommand = (command: string) => {
    const normalized = command.trim().toLowerCase();
    if (normalized === 'play') { setIsPlaytestOpen(true); return; }
    if (normalized === 'save') { void persistence.saveDraft(); return; }
    if (normalized === 'clear') { log.clear(); return; }
    if (normalized === 'select all') { selectAll(); return; }
    log.push('warn', 'Command', `Unknown command: ${command}`);
  };

  const canvas = (
    <Studio3DCanvas
      sceneEngine={sceneEngine}
      variant="docked"
      onSelect={(id) => id && handleSelectObject(id)}
      onSelectionSet={select}
      onTransform={transformObject}
      environment={environment}
      brush={isSculpting ? brush : null}
      onTerrainEdit={handleTerrainEdit}
      gizmoMode={gizmoMode}
      onGizmoModeChange={setGizmoMode}
      snapping={snapping}
      onSnappingChange={setSnapping}
      objects={objects}
    />
  );

  const viewport = (
    <StudioViewport
      view={view}
      canvas={canvas}
      objects={objects}
      animation={animation}
      script={{ ...scriptRunner, code: scriptCode, onCodeChange: setScriptCode }}
      publish={{
        title, slug, versionNumber, description,
        notice: publishNotice, error: publishError, isPublishing, progress: publishProgress,
        onTitleChange: setTitle, onSlugChange: setSlug, onVersionChange: setVersionNumber,
        onDescriptionChange: setDescription, onSubmit: persistence.submitPublish
      }}
    />
  );

  return (
    <>
      <StudioShell
        title={title}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        isSaving={isSavingDraft}
        doc={doc}
        environment={environment}
        onEnvironmentChange={updateEnvironment}
        onEnvironmentReset={resetEnvironment}
        serverManifest={serverManifest}
        token={token}
        logs={log.logs}
        onClearLogs={log.clear}
        outputFilter={outputFilter}
        onOutputFilter={setOutputFilter}
        outputCollapsed={outputCollapsed}
        onToggleOutputCollapse={() => setOutputCollapsed((prev) => !prev)}
        panels={panels}
        onTogglePanel={togglePanel}
        ribbonTab={ribbonTab}
        onRibbonTab={setRibbonTab}
        toolboxTab={toolboxTab}
        onToolboxTab={setToolboxTab}
        onOpenToolboxTab={openToolboxTab}
        gizmoMode={gizmoMode}
        onGizmoMode={setGizmoMode}
        snapping={snapping}
        onToggleSnap={() => setSnapping((prev) => !prev)}
        brush={brush}
        onBrushChange={handleBrushChange}
        isSculpting={isSculpting}
        onToggleSculpting={() => setIsSculpting((prev) => !prev)}
        selectedService={selectedService}
        onSelectService={handleSelectService}
        onSelectObject={handleSelectObject}
        onToggleObjectSelect={handleToggleObjectSelect}
        onCreateConstraint={handleCreateConstraint}
        onSave={() => void persistence.saveDraft()}
        onPlaytest={() => { setIsPlaytestOpen(true); log.push('info', 'Test', 'Playtest session started'); }}
        onPublish={() => setRibbonTab('publish')}
        onRunScript={() => { setRibbonTab('script'); void scriptRunner.runTest(scriptCode); }}
        onCommand={handleCommand}
        onFocusSelection={() => sceneEngine.focusSelection?.()}
        onExit={onExit}
        teamAccessory={<StudioTeamPresence team={team} />}
        viewport={viewport}
        clockLabel={formatClockTime(clockHours)}
        skyLabel={skybox.label}
      />
      <StudioPlaytestModal isOpen={isPlaytestOpen} onClose={() => setIsPlaytestOpen(false)} objects={objects} worldTitle={title} />
      <StudioTeamControls team={team} />
    </>
  );
};

export default StudioPage;
