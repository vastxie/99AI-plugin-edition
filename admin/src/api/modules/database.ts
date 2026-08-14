import api from '../index';

export default {
  detectUnused: () => api.get('database/detect-unused'),
  dropTables: (data: { tableNames: string[] }) => api.post('database/drop-tables', data),
};
