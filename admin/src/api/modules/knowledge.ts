import api from '../index';

/**
 * 知识库管理 API
 */
export default {
  /**
   * 获取缓存统计信息
   */
  getStats: () => api.get('fileVectorCache/stats'),

  /**
   * 获取缓存列表
   */
  getList: (fileType: 'user' | 'system', page: number, pageSize: number) =>
    api.get('fileVectorCache/list', { params: { fileType, page, pageSize } }),

  /**
   * 检查文件缓存是否存在
   */
  checkExists: (fileUrl: string) => {
    const url = `fileVectorCache/exists?fileUrl=${encodeURIComponent(fileUrl)}`;
    return api.get(url);
  },

  /**
   * 删除指定文件的缓存
   */
  deleteCache: (fileUrl: string) => {
    const url = `fileVectorCache/delete?fileUrl=${encodeURIComponent(fileUrl)}`;
    return api.delete(url);
  },

  /**
   * 删除指定用户的所有向量缓存
   */
  deleteUserVectors: (userId: number) => api.delete(`fileVectorCache/user/${userId}`),

  /**
   * 手动清理过期缓存
   */
  cleanExpired: () => api.post('fileVectorCache/clean'),

  /**
   * 上传并自动向量化文件
   */
  uploadAndVectorize: (fileUrl: string, originalFileName?: string) =>
    api.post('fileVectorCache/uploadAndVectorize', { fileUrl, originalFileName }),
};
