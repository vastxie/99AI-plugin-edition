<route lang="yaml">
meta:
  title: 知识库管理
</route>

<script lang="ts" setup>
  import knowledgeApi from '@/api/modules/knowledge';
  import uploadApi from '@/api/modules/upload';
  import PageHeader from '@/components/PageHeader/index.vue';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';

  const activeTab = ref('system');
  const loading = ref(false);
  const uploadDialogVisible = ref(false);
  const uploading = ref(false);

  // 系统知识库列表
  const systemKnowledgeList = ref<any[]>([]);
  const systemPagination = reactive({
    page: 1,
    size: 10,
    total: 0,
  });

  // 用户知识库列表
  const userKnowledgeList = ref<any[]>([]);
  const userPagination = reactive({
    page: 1,
    size: 10,
    total: 0,
  });

  // 上传表单
  const uploadForm = reactive({
    fileUrl: '',
    fileName: '',
    vectorizing: false,
  });

  // 获取系统知识库列表
  async function fetchSystemKnowledge() {
    loading.value = true;
    try {
      const res: any = await knowledgeApi.getList(
        'system',
        systemPagination.page,
        systemPagination.size,
      );


      if (res.success) {
        // 处理嵌套的 data 结构
        const innerData = res.data;
        const dataList = Array.isArray(innerData?.data) ? innerData.data : [];
        const total = innerData?.total || 0;

        systemKnowledgeList.value = dataList;
        systemPagination.total = total;
      } else {
        ElMessage.error(res.message || '获取系统知识库失败');
      }
    } catch (error: any) {
      console.error('获取系统知识库错误:', error);
      ElMessage.error(error.message || '获取系统知识库失败');
    } finally {
      loading.value = false;
    }
  }

  // 获取用户知识库列表
  async function fetchUserKnowledge() {
    loading.value = true;
    try {
      const res: any = await knowledgeApi.getList('user', userPagination.page, userPagination.size);

      if (res.success) {
        // 处理嵌套的 data 结构
        const innerData = res.data;
        const dataList = Array.isArray(innerData?.data) ? innerData.data : [];
        const total = innerData?.total || 0;

        userKnowledgeList.value = dataList;
        userPagination.total = total;
      } else {
        ElMessage.error(res.message || '获取用户知识库失败');
      }
    } catch (error: any) {
      console.error('获取用户知识库错误:', error);
      ElMessage.error(error.message || '获取用户知识库失败');
    } finally {
      loading.value = false;
    }
  }

  // Tab 切换处理
  function handleTabChange(tabName: string | number) {
    const tabNameStr = String(tabName);
    if (tabNameStr === 'system') {
      fetchSystemKnowledge();
    } else if (tabNameStr === 'user') {
      fetchUserKnowledge();
    }
  }

  // 打开上传对话框
  function openUploadDialog() {
    uploadDialogVisible.value = true;
    uploadForm.fileUrl = '';
    uploadForm.fileName = '';
  }

  // 文件上传
  async function handleFileUpload(uploadFile: any) {
    uploading.value = true;
    try {
      const form = new FormData();
      form.append('file', uploadFile.raw);

      const uploadRes = await uploadApi.uploadFile(form, 'system/knowledge');

      if (uploadRes?.data) {
        const fileUrl = uploadRes.data;
        uploadForm.fileName = uploadFile.name;
        ElMessage.success('文件上传成功，正在向量化...');

        uploading.value = false;
        uploadForm.vectorizing = true;

        // 调用后端接口进行文件提取和向量化
        const vectorRes: any = await knowledgeApi.uploadAndVectorize(fileUrl, uploadFile.name);

        if (vectorRes.success) {
          ElMessage.success(vectorRes.message || '文件向量化完成！');
          uploadDialogVisible.value = false;
          fetchSystemKnowledge();
        } else {
          throw new Error(vectorRes.message || '向量化失败');
        }
      }
    } catch (error: any) {
      ElMessage.error(error.message || '文件上传失败');
    } finally {
      uploading.value = false;
      uploadForm.vectorizing = false;
    }
  }

  // 删除系统文件缓存
  async function deleteSystemCache(fileUrl: string) {
    try {
      await ElMessageBox.confirm('确定要删除该文件的向量缓存吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      const res: any = await knowledgeApi.deleteCache(fileUrl);

      if (res.success) {
        ElMessage.success('删除成功');
        fetchSystemKnowledge();
      } else {
        ElMessage.error(res.message || '删除失败');
      }
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.message || '删除失败');
      }
    }
  }

  // 删除用户文件缓存
  async function deleteUserCache(fileUrl: string) {
    try {
      await ElMessageBox.confirm('确定要删除该文件的向量缓存吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      const res: any = await knowledgeApi.deleteCache(fileUrl);

      if (res.success) {
        ElMessage.success('删除成功');
        fetchUserKnowledge();
      } else {
        ElMessage.error(res.message || '删除失败');
      }
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.message || '删除失败');
      }
    }
  }

  // 删除用户知识库
  async function deleteUserKnowledge(userId: number) {
    try {
      await ElMessageBox.confirm(`确定要删除用户 ${userId} 的所有向量缓存吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      const res: any = await knowledgeApi.deleteUserVectors(userId);

      if (res.success) {
        ElMessage.success(res.message || '删除成功');
        fetchUserKnowledge();
      } else {
        ElMessage.error(res.message || '删除失败');
      }
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.message || '删除失败');
      }
    }
  }

  // 清理过期缓存
  async function cleanExpiredCache() {
    try {
      await ElMessageBox.confirm('确定要立即清理所有过期的向量缓存吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      const res: any = await knowledgeApi.cleanExpired();

      if (res.success) {
        ElMessage.success(res.message || '清理完成');
        // 刷新当前标签页的数据
        if (activeTab.value === 'system') {
          fetchSystemKnowledge();
        } else if (activeTab.value === 'user') {
          fetchUserKnowledge();
        }
      } else {
        ElMessage.error(res.message || '清理失败');
      }
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.message || '清理失败');
      }
    }
  }

  onMounted(() => {
    fetchSystemKnowledge();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          知识库管理
        </div>
      </template>
      <div class="flex gap-3">
        <HButton text outline @click="cleanExpiredCache">
          <SvgIcon name="mdi:delete-sweep-outline" />
          清理过期缓存
        </HButton>
        <HButton text outline @click="openUploadDialog">
          <SvgIcon name="i-ri:upload-cloud-line" />
          上传文件
        </HButton>
      </div>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- 系统知识库 Tab -->
        <el-tab-pane name="system">
          <template #label>
            <div class="tab-label">
              <SvgIcon name="mdi:folder-network-outline" size="16" />
              <span>系统知识库</span>
            </div>
          </template>

          <div class="table-section">
            <el-table
              :data="systemKnowledgeList"
              v-loading="loading"
              border
              style="width: 100%"
              size="large"
            >
              <el-table-column label="文件名" min-width="200">
                <template #default="scope">
                  <a
                    v-if="scope.row.fileUrl"
                    :href="scope.row.fileUrl"
                    target="_blank"
                    style="color: #409eff; text-decoration: none"
                  >
                    {{ scope.row.originalFileName || scope.row.fileName || '-' }}
                  </a>
                  <span v-else>{{ scope.row.originalFileName || scope.row.fileName || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="fileSize" label="数据库大小" width="120" />
              <el-table-column prop="modelInfo" label="向量化模型" width="180" />
              <el-table-column label="创建时间" width="180">
                <template #default="scope">
                  {{
                    scope.row.createdAt
                      ? new Date(scope.row.createdAt).toLocaleString('zh-CN')
                      : '-'
                  }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="scope">
                  <el-button
                    link
                    type="danger"
                    size="small"
                    @click="deleteSystemCache(scope.row.fileUrl)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-container flex justify-end mt-4">
              <el-pagination
                v-model:current-page="systemPagination.page"
                v-model:page-size="systemPagination.size"
                :total="systemPagination.total"
                :page-sizes="[10, 20, 50, 100]"
                layout="total, sizes, prev, pager, next"
                @size-change="fetchSystemKnowledge"
                @current-change="fetchSystemKnowledge"
              />
            </div>
          </div>
        </el-tab-pane>

        <!-- 用户知识库 Tab -->
        <el-tab-pane name="user">
          <template #label>
            <div class="tab-label">
              <SvgIcon name="mdi:account-multiple-outline" size="16" />
              <span>用户知识库</span>
            </div>
          </template>

          <div class="table-section">
            <el-table
              :data="userKnowledgeList"
              v-loading="loading"
              border
              style="width: 100%"
              size="large"
            >
              <el-table-column prop="userId" label="用户ID" width="100" />
              <el-table-column label="文件名" min-width="200">
                <template #default="scope">
                  <a
                    v-if="scope.row.fileUrl"
                    :href="scope.row.fileUrl"
                    target="_blank"
                    style="color: #409eff; text-decoration: none"
                  >
                    {{ scope.row.originalFileName || scope.row.fileName || '-' }}
                  </a>
                  <span v-else>{{ scope.row.originalFileName || scope.row.fileName || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="fileSize" label="数据库大小" width="120" />
              <el-table-column prop="modelInfo" label="向量化模型" width="180" />
              <el-table-column label="过期时间" width="180">
                <template #default="scope">
                  {{
                    scope.row.expiresAt
                      ? new Date(scope.row.expiresAt).toLocaleString('zh-CN')
                      : '永久'
                  }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="scope">
                  <el-button
                    link
                    type="danger"
                    size="small"
                    @click="deleteUserCache(scope.row.fileUrl)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-container flex justify-end mt-4">
              <el-pagination
                v-model:current-page="userPagination.page"
                v-model:page-size="userPagination.size"
                :total="userPagination.total"
                :page-sizes="[10, 20, 50, 100]"
                layout="total, sizes, prev, pager, next"
                @size-change="fetchUserKnowledge"
                @current-change="fetchUserKnowledge"
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 上传文件对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传系统文件" width="600px">
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleFileUpload"
        :disabled="uploading || uploadForm.vectorizing"
        accept=".pdf,.doc,.docx,.txt,.md"
      >
        <SvgIcon
          v-if="!uploading && !uploadForm.vectorizing"
          name="mdi:cloud-upload-outline"
          size="60"
        />
        <el-icon v-else class="is-loading" :size="60"><Loading /></el-icon>
        <div class="el-upload__text mt-4">
          {{
            uploading
              ? '正在上传文件...'
              : uploadForm.vectorizing
                ? '正在向量化，请稍候...'
                : '拖拽文件到此处或点击上传'
          }}
        </div>
        <template #tip>
          <div class="el-upload__tip">支持 PDF、Word、TXT、Markdown 格式，文件向量化后永久保存</div>
        </template>
      </el-upload>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .table-section {
    padding: 20px 0;
  }

  :deep(.el-tabs__content) {
    padding: 0;
  }
</style>
