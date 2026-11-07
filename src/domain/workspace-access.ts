export type WorkspaceChoice<T extends { id: string }> = T;

export function resolveActiveWorkspace<T extends { id: string }>(authorizedWorkspaces: readonly T[], requestedId?: string): WorkspaceChoice<T> | null {
  return authorizedWorkspaces.find((workspace) => workspace.id === requestedId) ?? authorizedWorkspaces[0] ?? null;
}
