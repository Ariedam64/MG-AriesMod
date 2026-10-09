// The Manager tab of the Pets menu: the team list on the left, the selected
// team's editor on the right.

import { onActivePetsStructuralChangeNow } from "../../game/player";
import type { Menu } from "../../ui/kit/menu";
import { PetsService, type PetTeam } from "./pets";
import { createTeamEditor } from "./teamEditor";
import { createTeamList } from "./teamList";

export function renderManagerTab(view: HTMLElement, ui: Menu): void {
  view.replaceChildren();

  let teams: PetTeam[] = [];
  let selectedId: string | null = null;
  let activeTeamId: string | null = null;
  /** While a team is being equipped, pet changes do not repaint: the list shows the target already. */
  let applyingTeam = false;

  const selectedTeam = () => teams.find((t) => t.id === selectedId) ?? null;

  const layout = document.createElement("div");
  Object.assign(layout.style, {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
    gap: "10px",
    alignItems: "stretch",
    height: "54vh",
    overflow: "hidden",
  });
  view.appendChild(layout);

  const list = createTeamList({
    onSelect(teamId) {
      if (selectedId !== teamId) {
        selectedId = teamId;
        void refreshList(true);
      }
      void editor.show(selectedTeam());
    },
    onReorder(teamIds) {
      PetsService.setTeamsOrder(teamIds);
    },
    onCreate() {
      selectedId = PetsService.createTeam("New Team").id;
      void refreshList();
      void editor.show(selectedTeam());
    },
    onDelete() {
      if (selectedId) PetsService.deleteTeam(selectedId);
    },
    isSyncEnabled: () => PetsService.isTeamSyncEnabled(),
    setSyncEnabled: (on) => PetsService.setTeamSyncEnabled(on),
  });

  const editor = createTeamEditor({
    selectedTeam,
    onRenamed: () => void refreshList(true),
    onUseTeam: useTeam,
    setWindowVisible: (visible) => ui.setWindowVisible(visible),
  });

  layout.append(list.root, editor.root);

  /** Marks the team the equipped pets form, if any. */
  async function detectActiveTeam(): Promise<void> {
    activeTeamId = null;
    try {
      const pets = await PetsService.getPets();
      const equipped = new Set((Array.isArray(pets) ? pets : []).map((p) => String(p?.slot?.id || "")).filter(Boolean));
      const match = teams.find((t) => {
        const ids = t.slots.filter((x): x is string => !!x);
        return ids.length === equipped.size && ids.every((id) => equipped.has(id));
      });
      activeTeamId = match?.id ?? null;
    } catch {}
  }

  async function refreshList(keepActiveTeam = false): Promise<void> {
    if (!keepActiveTeam) await detectActiveTeam();
    const pets = await PetsService.getPetLookup();
    list.render({ teams, selectedId, activeTeamId, pets });
    if (!teams.length) void editor.show(null);
  }

  // A rebuild drops the sprites the previous one was still loading. Team
  // changes and pet changes both ask for one, back to back on mount, so a
  // request arriving mid-rebuild queues a single follow-up pass instead of
  // starting a competing one; otherwise icons could stay blank.
  let refreshing: Promise<void> | null = null;
  let refreshQueued = false;
  function scheduleRefresh(): Promise<void> {
    if (refreshing) {
      refreshQueued = true;
      return refreshing;
    }
    const run = async () => {
      await refreshList();
      while (refreshQueued) {
        refreshQueued = false;
        await refreshList();
      }
    };
    refreshing = run().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function useTeam(team: PetTeam): Promise<void> {
    try {
      applyingTeam = true;
      activeTeamId = team.id;
      await refreshList(true);
      await PetsService.useTeam(team.id);
      await PetsService.waitForTeamEquipped(team.id);
      await editor.show(selectedTeam());
      await refreshList();
    } catch (e) {
      console.warn("[Pets] Use this team failed:", e);
      await refreshList();
    } finally {
      applyingTeam = false;
    }
  }

  PetsService.onTeamsChange((all) => {
    teams = all.slice();
    if (selectedId && !teams.some((t) => t.id === selectedId)) selectedId = null;
    if (!selectedId && teams.length) selectedId = teams[0].id;
    void scheduleRefresh();
    void editor.show(selectedTeam());
  });

  void (async () => {
    try {
      await onActivePetsStructuralChangeNow(async () => {
        if (applyingTeam) return;
        await editor.repaint(selectedTeam());
        await scheduleRefresh();
      });
    } catch {}
  })();
}
