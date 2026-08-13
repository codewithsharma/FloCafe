import api from './api';

/** Minimal platform composition projection (Phase 2.4). */
export interface PlatformCompositionResponse {
  verticalId: string;
  verticalName: string;
  enabledModules: string[];
  diagnostics: {
    valid: boolean;
  };
}

/** Read-only composition snapshot for support/platform tooling. */
export async function fetchPlatformComposition(): Promise<PlatformCompositionResponse> {
  const res = await api.get<PlatformCompositionResponse>('/platform/composition');
  return res.data;
}
