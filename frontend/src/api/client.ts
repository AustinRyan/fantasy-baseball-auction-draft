import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const projectionsApi = {
  upload: (file: File, fileType?: string) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/projections/upload', form, { params: { file_type: fileType } });
  },
  getPlayers: (params?: Record<string, unknown>) => api.get('/projections/players', { params }),
  getFiles: () => api.get('/projections/files'),
  deleteFile: (filename: string) => api.delete(`/projections/files/${filename}`),
  clearAll: (deleteFiles = true) => api.delete('/projections/clear', { params: { delete_files: deleteFiles } }),
  uploadStatcast: (file: File, playerType: 'hitter' | 'pitcher') => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/projections/statcast', form, { params: { player_type: playerType } });
  },
};

export const valuationsApi = {
  calculate: (inflationRate?: number) =>
    api.post('/valuations/calculate', null, { params: { inflation_rate: inflationRate } }),
  getResults: (params?: Record<string, unknown>) => api.get('/valuations/results', { params }),
};

export const keepersApi = {
  getTeams: () => api.get('/keepers/teams'),
  setKeepers: (teamId: string, keepers: unknown[]) => api.post(`/keepers/teams/${teamId}`, keepers),
  updateTeam: (teamId: string, data: unknown) => api.put(`/keepers/teams/${teamId}`, data),
  getInflation: () => api.get('/keepers/inflation'),
  importKeepers: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/keepers/import', form);
  },
  linkKeepers: () => api.post('/keepers/link'),
};

export const draftApi = {
  getState: () => api.get('/draft/state'),
  start: () => api.post('/draft/start'),
  reset: () => api.post('/draft/reset'),
  recordPick: (data: { player_id: string; team_id: string; price: number }) =>
    api.post('/draft/pick', data),
  undoPick: (pickId: string) => api.delete(`/draft/pick/${pickId}`),
  getMyRoster: () => api.get('/draft/my-roster'),
  getTeamRoster: (teamId: string) => api.get(`/draft/team/${teamId}/roster`),
  getRecommendations: () => api.get('/draft/recommendations'),
  getAlerts: () => api.get('/draft/alerts'),
  save: () => api.post('/draft/save'),
  load: () => api.post('/draft/load'),
};

export const exportApi = {
  preDraft: (format: 'csv' | 'xlsx') =>
    api.get('/export/pre-draft', { params: { format }, responseType: 'blob' }),
};

export default api;
