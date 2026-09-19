export type WorkspaceView = 'overview' | 'markets' | 'investigations' | 'sources' | 'system';
export interface WorkspaceState {
  view: WorkspaceView;
  selectedSymbol: string | null;
  investigationSymbol: string | null;
}
export type WorkspaceAction =
  | { type: 'navigate'; view: WorkspaceView }
  | { type: 'select'; symbol: string }
  | { type: 'investigate'; symbol: string }
  | { type: 'return-to-market' };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'navigate': return { ...state, view: action.view };
    case 'select': return { ...state, selectedSymbol: action.symbol, view: state.view === 'overview' ? 'overview' : 'markets' };
    case 'investigate': return { ...state, view: 'investigations', investigationSymbol: action.symbol };
    case 'return-to-market': return { ...state, view: 'markets' };
  }
}
