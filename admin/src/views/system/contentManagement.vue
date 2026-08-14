<route lang="yaml">
meta:
  title: 公告配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import uploadApi from '@/api/modules/upload';
  import useSettingsStore from '@/store/modules/settings';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { MdEditor } from 'md-editor-v3';
  import 'md-editor-v3/lib/style.css';
  import { computed, onMounted, reactive, ref } from 'vue';


  const settingsStore = useSettingsStore();
  const activeTab = ref('notice');
  const loading = ref(false);

  // 公告表单数据
  const noticeForm = reactive({
    isAutoOpenNotice: 0, // 默认为 0（关闭）
    noticeInfo: '',
    noticeTitle: '',
  });

  // 用户协议表单数据
  const agreementForm = reactive({
    isAutoOpenAgreement: 0, // 默认为 0（关闭）
    agreementInfo: '',
    agreementTitle: '',
  });

  const theme = computed(() => {
    const scheme = settingsStore.settings.app.colorScheme;
    return scheme === '' ? undefined : scheme;
  });

  // 公告表单验证规则
  const noticeRules = ref<FormRules>({
    noticeTitle: [{ required: true, trigger: 'blur', message: '请填写公告标题' }],
    noticeInfo: [{ required: true, trigger: 'blur', message: '请填写公告具体信息' }],
  });

  // 用户协议表单验证规则
  const agreementRules = ref<FormRules>({
    agreementTitle: [{ required: true, trigger: 'blur', message: '请填写用户协议标题' }],
    agreementInfo: [{ required: true, trigger: 'blur', message: '请填写用户协议具体内容' }],
  });

  const noticeFormRef = ref<FormInstance>();
  const agreementFormRef = ref<FormInstance>();

  // 内容配置状态
  interface ContentStatus {
    configured: boolean;
    title?: string;
    missing: string[];
  }

  const contentStatus = ref<Record<string, ContentStatus>>({
    notice: {
      configured: false,
      missing: [],
    },
    agreement: {
      configured: false,
      missing: [],
    },
  });

  // 查询所有配置
  async function queryAllConfig() {
    loading.value = true;
    try {
      const res = await apiConfig.queryConfig({
        keys: [
          'noticeInfo',
          'noticeTitle',
          'isAutoOpenNotice',
          'agreementInfo',
          'agreementTitle',
          'isAutoOpenAgreement',
        ],
      });

      const {
        noticeInfo,
        noticeTitle,
        isAutoOpenNotice,
        agreementInfo,
        agreementTitle,
        isAutoOpenAgreement,
      } = res.data;

      // 更新公告表单
      Object.assign(noticeForm, {
        noticeInfo: noticeInfo || '',
        noticeTitle: noticeTitle || '',
        // 转换为数字类型，如果是字符串 "1" 转为 1，"0" 转为 0，空值默认为 0
        isAutoOpenNotice: isAutoOpenNotice ? Number(isAutoOpenNotice) : 0,
      });

      // 更新用户协议表单
      Object.assign(agreementForm, {
        agreementInfo: agreementInfo || '',
        agreementTitle: agreementTitle || '',
        // 转换为数字类型，如果是字符串 "1" 转为 1，"0" 转为 0，空值默认为 0
        isAutoOpenAgreement: isAutoOpenAgreement ? Number(isAutoOpenAgreement) : 0,
      });

      // 更新配置状态
      updateContentStatus();
    } finally {
      loading.value = false;
    }
  }

  // 更新内容配置状态
  function updateContentStatus() {
    // 检查公告配置
    const noticeMissing = [];
    if (!noticeForm.noticeTitle) noticeMissing.push('标题');
    if (!noticeForm.noticeInfo) noticeMissing.push('内容');

    contentStatus.value.notice = {
      configured: noticeMissing.length === 0,
      title: noticeForm.noticeTitle,
      missing: noticeMissing,
    };

    // 检查用户协议配置
    const agreementMissing = [];
    if (!agreementForm.agreementTitle) agreementMissing.push('标题');
    if (!agreementForm.agreementInfo) agreementMissing.push('内容');

    contentStatus.value.agreement = {
      configured: agreementMissing.length === 0,
      title: agreementForm.agreementTitle,
      missing: agreementMissing,
    };
  }

  // 保存所有配置
  async function saveAllConfig() {
    loading.value = true;
    try {
      // 根据当前 tab 进行不同的验证和保存
      if (activeTab.value === 'notice') {
        await saveNoticeConfig();
      } else if (activeTab.value === 'agreement') {
        await saveAgreementConfig();
      }
    } finally {
      loading.value = false;
    }
  }

  // 保存公告配置
  async function saveNoticeConfig() {
    const valid = await noticeFormRef.value?.validate().catch(() => false);
    if (!valid) {
      ElMessage.error('请填写完整的公告信息');
      return;
    }

    try {
      await apiConfig.setConfig({ settings: formatSetting(noticeForm) });
      ElMessage.success('公告配置保存成功');
      await queryAllConfig();
    } catch (error) {
      ElMessage.error('保存失败，请重试');
    }
  }

  // 保存用户协议配置
  async function saveAgreementConfig() {
    const valid = await agreementFormRef.value?.validate().catch(() => false);
    if (!valid) {
      ElMessage.error('请填写完整的用户协议信息');
      return;
    }

    try {
      await apiConfig.setConfig({ settings: formatSetting(agreementForm) });
      ElMessage.success('用户协议配置保存成功');
      await queryAllConfig();
    } catch (error) {
      ElMessage.error('保存失败，请重试');
    }
  }

  // 格式化设置数据
  function formatSetting(settings: any) {
    return Object.keys(settings).map((key) => ({
      configKey: key,
      configVal: settings[key],
    }));
  }

  // 图片上传处理
  async function onUploadImg(
    files: Iterable<Blob> | ArrayLike<Blob>,
    callback: (arg0: unknown[]) => void,
  ) {
    const res = await Promise.all(
      Array.from(files).map((file) => {
        return new Promise(async (resolve, reject) => {
          const form = new FormData();
          form.append('file', file);
          try {
            const response = await uploadApi.uploadFile(form, 'system/others');
            if (!response?.data?.data) {
              ElMessage.error('图片上传失败，请检查您的配置信息！');
              reject(new Error('Upload failed'));
            }
            resolve(response.data.data);
          } catch (error) {
            reject(error);
          }
        });
      }),
    );
    callback(res);
  }

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          公告配置
        </div>
      </template>
      <HButton outline @click="saveAllConfig" :loading="loading">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-tabs v-model="activeTab">
        <!-- 公告设置 Tab -->
        <el-tab-pane name="notice">
          <template #label>
            <div class="tab-label">
              <svg-icon name="mdi:notice-board" size="16" />
              <span>公告设置</span>
              <el-tag
                v-if="contentStatus.notice"
                :type="contentStatus.notice.configured ? 'success' : 'info'"
                size="small"
                class="ml-2"
              >
                {{ contentStatus.notice.configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>

          <div class="content-panel">
            <el-form
              ref="noticeFormRef"
              :model="noticeForm"
              :rules="noticeRules"
              label-width="160px"
            >
              <el-row>
                <el-col :xs="24" :md="24" :lg="20" :xl="18">
                  <el-form-item label="公告标题" prop="noticeTitle">
                    <el-input
                      v-model="noticeForm.noticeTitle"
                      placeholder="请输入公告标题"
                      clearable
                    />
                  </el-form-item>

                  <el-form-item label="自动弹出" prop="isAutoOpenNotice">
                    <el-switch
                      v-model="noticeForm.isAutoOpenNotice"
                      :active-value="1"
                      :inactive-value="0"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <div class="form-tip">开启后，用户进入系统时将自动弹出公告</div>
                  </el-form-item>

                  <el-form-item label="公告内容" prop="noticeInfo" class="editor-form-item">
                    <div class="editor-wrapper">
                      <MdEditor
                        v-model="noticeForm.noticeInfo"
                        :theme="theme"
                        :preview="true"
                        :toolbars-exclude="['github']"
                        @on-upload-img="onUploadImg"
                      />
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- 用户协议 Tab -->
        <el-tab-pane name="agreement">
          <template #label>
            <div class="tab-label">
              <svg-icon name="hugeicons:access" size="16" />
              <span>用户协议</span>
              <el-tag
                v-if="contentStatus.agreement"
                :type="contentStatus.agreement.configured ? 'success' : 'info'"
                size="small"
                class="ml-2"
              >
                {{ contentStatus.agreement.configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>

          <div class="content-panel">
            <el-form
              ref="agreementFormRef"
              :model="agreementForm"
              :rules="agreementRules"
              label-width="160px"
            >
              <el-row>
                <el-col :xs="24" :md="24" :lg="20" :xl="18">
                  <el-form-item label="协议标题" prop="agreementTitle">
                    <el-input
                      v-model="agreementForm.agreementTitle"
                      placeholder="请输入用户协议标题"
                      clearable
                    />
                  </el-form-item>

                  <el-form-item label="开启用户协议" prop="isAutoOpenAgreement">
                    <el-switch
                      v-model="agreementForm.isAutoOpenAgreement"
                      :active-value="1"
                      :inactive-value="0"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                    <div class="form-tip">
                      开启后，用户在登录/注册时必须勾选同意用户协议才能继续
                    </div>
                  </el-form-item>

                  <el-form-item label="协议内容" prop="agreementInfo" class="editor-form-item">
                    <div class="editor-wrapper">
                      <MdEditor
                        v-model="agreementForm.agreementInfo"
                        :theme="theme"
                        :preview="true"
                        :toolbars-exclude="['github']"
                        @on-upload-img="onUploadImg"
                      />
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .content-panel {
    padding: 20px 0;
  }

  .editor-form-item {
    :deep(.el-form-item__content) {
      display: block;
    }
  }

  .editor-wrapper {
    width: 100%;
    min-height: 500px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    overflow: hidden;

    :deep(.md-editor) {
      height: 500px;
    }
  }

  .form-tip {
    margin-left: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  :deep(.el-tabs__content) {
    padding: 0;
  }

  :deep(.el-form-item) {
    margin-bottom: 22px;
  }

  :deep(.el-form-item__label) {
    font-weight: 500;
  }
</style>
