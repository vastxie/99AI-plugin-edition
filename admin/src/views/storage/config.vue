<route lang="yaml">
meta:
  title: 存储配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const loading = ref(false);
  const activeTab = ref('local');

  // 定义字段类型
  interface StorageField {
    key: string;
    label: string;
    type: 'input' | 'password' | 'textarea' | 'select' | 'switch';
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
    showCondition?: (settings: any) => boolean;
  }

  interface StorageConfig {
    name: string;
    description?: string;
    icon?: string;
    iconColor?: string;
    fields: StorageField[];
  }

  // 各存储服务的配置字段
  const storageConfigs: Record<string, StorageConfig> = {
    local: {
      name: '基础配置',
      description: '文件上传基础设置和本地存储配置',
      icon: 'icon-park-outline:cloud-storage',
      iconColor: '#1890ff',
      fields: [
        {
          key: 'localStorageStatus',
          label: '启用本地存储',
          type: 'switch',
          required: false,
          placeholder: '',
        },
        {
          key: 'siteUrl',
          label: '网站地址',
          type: 'input',
          required: true,
          placeholder: 'https://您的域名',
          showCondition: (settings) => settings.localStorageStatus === '1',
        },
        {
          key: 'uploadFileLimit',
          label: '文件上传数量限制',
          type: 'input',
          required: false,
          placeholder: '默认：5个',
        },
        {
          key: 'uploadFileSizeLimit',
          label: '文件大小限制(MB)',
          type: 'input',
          required: false,
          placeholder: '默认：20MB',
        },
      ],
    },
    s3: {
      name: 'S3存储',
      description: '支持Amazon S3及兼容协议的存储服务',
      icon: 'mdi:aws',
      iconColor: '#ff9900',
      fields: [
        {
          key: 's3Status',
          label: '启用状态',
          type: 'switch',
          required: false,
          placeholder: '',
        },
        {
          key: 's3Endpoint',
          label: '端点地址',
          type: 'input',
          required: true,
          placeholder: 'https://s3.amazonaws.com',
          showCondition: (settings) => settings.s3Status === '1',
        },
        {
          key: 's3Region',
          label: '区域',
          type: 'input',
          required: false,
          placeholder: 'us-east-1（可选，部分服务如 R2 不需要）',
          showCondition: (settings) => settings.s3Status === '1',
        },
        {
          key: 's3Bucket',
          label: '存储桶',
          type: 'input',
          required: true,
          placeholder: '存储桶名称',
          showCondition: (settings) => settings.s3Status === '1',
        },
        {
          key: 's3AccessKeyId',
          label: 'Access Key ID',
          type: 'password',
          required: true,
          placeholder: 'Access Key ID',
          showCondition: (settings) => settings.s3Status === '1',
        },
        {
          key: 's3SecretAccessKey',
          label: 'Secret Access Key',
          type: 'password',
          required: true,
          placeholder: 'Secret Access Key',
          showCondition: (settings) => settings.s3Status === '1',
        },
        {
          key: 's3CustomDomain',
          label: '自定义域名',
          type: 'input',
          required: false,
          placeholder: 'cdn.example.com（可选，仅填写域名，无需协议）',
          showCondition: (settings) => settings.s3Status === '1',
        },
      ],
    },
    tencent: {
      name: '腾讯云COS',
      description: '腾讯云对象存储服务',
      icon: 'teenyicons:cost-estimate-outline',
      iconColor: '#00a4ff',
      fields: [
        {
          key: 'tencentCosStatus',
          label: '启用状态',
          type: 'switch',
          required: false,
          placeholder: '',
        },
        {
          key: 'cosBucket',
          label: '存储桶名称',
          type: 'input',
          required: true,
          placeholder: '存储桶名称',
          showCondition: (settings) => settings.tencentCosStatus === '1',
        },
        {
          key: 'cosRegion',
          label: '所属地域',
          type: 'input',
          required: true,
          placeholder: 'ap-guangzhou',
          showCondition: (settings) => settings.tencentCosStatus === '1',
        },
        {
          key: 'cosSecretId',
          label: 'SecretId',
          type: 'password',
          required: true,
          placeholder: 'SecretId',
          showCondition: (settings) => settings.tencentCosStatus === '1',
        },
        {
          key: 'cosSecretKey',
          label: 'SecretKey',
          type: 'password',
          required: true,
          placeholder: 'SecretKey',
          showCondition: (settings) => settings.tencentCosStatus === '1',
        },
        {
          key: 'tencentCosAcceleratedDomain',
          label: '加速域名',
          type: 'input',
          required: false,
          placeholder: 'https://cdn.example.com（可选）',
          showCondition: (settings) => settings.tencentCosStatus === '1',
        },
      ],
    },
    ali: {
      name: '阿里云OSS',
      description: '阿里云对象存储服务',
      icon: 'material-symbols:home-storage-outline',
      iconColor: '#ff6a00',
      fields: [
        {
          key: 'aliOssStatus',
          label: '启用状态',
          type: 'switch',
          required: false,
          placeholder: '',
        },
        {
          key: 'aliOssBucket',
          label: '存储桶名称',
          type: 'input',
          required: true,
          placeholder: '存储桶名称',
          showCondition: (settings) => settings.aliOssStatus === '1',
        },
        {
          key: 'aliOssRegion',
          label: '所属地域',
          type: 'input',
          required: true,
          placeholder: 'oss-cn-shanghai',
          showCondition: (settings) => settings.aliOssStatus === '1',
        },
        {
          key: 'aliOssAccessKeyId',
          label: 'AccessKeyId',
          type: 'password',
          required: true,
          placeholder: 'AccessKeyId',
          showCondition: (settings) => settings.aliOssStatus === '1',
        },
        {
          key: 'aliOssAccessKeySecret',
          label: 'AccessKeySecret',
          type: 'password',
          required: true,
          placeholder: 'AccessKeySecret',
          showCondition: (settings) => settings.aliOssStatus === '1',
        },
        {
          key: 'aliOssAcceleratedDomain',
          label: '加速域名',
          type: 'input',
          required: false,
          placeholder: 'https://cdn.example.com（可选）',
          showCondition: (settings) => settings.aliOssStatus === '1',
        },
      ],
    },
  };

  // 存储设置数据 - 初始化时就创建所有存储的设置对象
  const storageSettings: Record<string, any> = reactive({});

  // 初始化所有存储的空对象
  Object.keys(storageConfigs).forEach((storageKey) => {
    storageSettings[storageKey] = {};
  });

  // 存储状态
  const storageStatus = ref<Record<string, { configured: boolean; missing: string[] }>>({});

  // 获取所有存储配置键
  function getAllStorageKeys() {
    const keys: string[] = [];
    Object.values(storageConfigs).forEach((config) => {
      config.fields.forEach((field) => {
        if (!keys.includes(field.key)) {
          keys.push(field.key);
        }
      });
    });
    return keys;
  }

  // 获取存储配置
  async function fetchStorageConfig() {
    loading.value = true;
    try {
      const keys = getAllStorageKeys();
      const res = await apiConfig.queryConfig({ keys });

      // 填充所有存储的设置值
      Object.keys(storageConfigs).forEach((storageKey) => {
        storageConfigs[storageKey].fields.forEach((field) => {
          storageSettings[storageKey][field.key] = res.data[field.key] || '';
        });
      });
    } catch (error) {
      console.error('获取存储配置失败:', error);
    } finally {
      loading.value = false;
    }
  }

  // 查询存储状态
  async function fetchStorageStatus() {
    try {
      // 查询所有配置并检查存储是否已配置
      const res = await apiConfig.queryAllConfig();
      // 确保 configs 是数组
      let configs = res.data || [];

      // 如果返回的是对象，尝试转换为数组
      if (!Array.isArray(configs)) {
        // 如果是对象，可能是 {rows: [...]} 或 {list: [...]} 格式
        if (configs.rows && Array.isArray(configs.rows)) {
          configs = configs.rows;
        } else if (configs.list && Array.isArray(configs.list)) {
          configs = configs.list;
        } else if (typeof configs === 'object' && configs !== null) {
          // 如果是键值对对象，转换为数组
          configs = Object.entries(configs).map(([key, value]) => ({
            configKey: key,
            configVal: value,
          }));
        } else {
          configs = [];
        }
      }

      const status: Record<string, { configured: boolean; missing: string[] }> = {};

      // 检查每个存储是否已配置
      Object.keys(storageConfigs).forEach((storageKey) => {
        const storage = storageConfigs[storageKey];
        const missingFields: string[] = [];

        // 本地存储不需要检查启用状态
        if (storageKey === 'local') {
          const requiredFields = storage.fields.filter((f) => f.required);
          requiredFields.forEach((field) => {
            const config = configs.find((c: any) => c.configKey === field.key);
            if (!config || !config.configVal) {
              missingFields.push(field.label);
            }
          });
          status[storageKey] = {
            configured: missingFields.length === 0,
            missing: missingFields,
          };
        } else {
          // 其他存储需要检查启用状态
          const statusKey = storage.fields.find((f) => f.type === 'switch')?.key;
          const statusConfig = configs.find((c: any) => c.configKey === statusKey);
          const isEnabled = statusConfig?.configVal === '1';

          if (isEnabled) {
            const requiredFields = storage.fields.filter((f) => f.required && f.key !== statusKey);
            requiredFields.forEach((field) => {
              const config = configs.find((c: any) => c.configKey === field.key);
              if (!config || !config.configVal) {
                missingFields.push(field.label);
              }
            });
            status[storageKey] = {
              configured: missingFields.length === 0,
              missing: missingFields,
            };
          } else {
            // 未启用的存储直接标记为未配置
            status[storageKey] = {
              configured: false,
              missing: [],
            };
          }
        }
      });

      storageStatus.value = status;
    } catch (error) {
      console.error('查询存储状态失败:', error);
    }
  }

  // 保存所有存储配置
  async function saveAllConfig() {
    loading.value = true;
    try {
      const settings: any[] = [];

      // 收集所有存储的配置
      Object.keys(storageConfigs).forEach((storageKey) => {
        storageConfigs[storageKey].fields.forEach((field) => {
          const value = storageSettings[storageKey][field.key];
          settings.push({
            configKey: field.key,
            configVal: value || '',
          });
        });
      });

      await apiConfig.setConfig({ settings });
      ElMessage.success('存储配置保存成功');
      // 重新查询状态
      await fetchStorageStatus();
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败');
    } finally {
      loading.value = false;
    }
  }

  // 清空当前存储配置
  async function clearCurrentConfig() {
    try {
      await ElMessageBox.confirm(
        `确定要清空 ${storageConfigs[activeTab.value].name} 的所有配置吗？`,
        '提示',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );

      const config = storageConfigs[activeTab.value];
      config.fields.forEach((field) => {
        storageSettings[activeTab.value][field.key] = '';
      });

      ElMessage.success('配置已清空，请点击保存按钮生效');
    } catch (error) {
      // 用户取消
    }
  }

  // 显示当前存储帮助信息
  function showCurrentHelp() {
    const helps: Record<string, string> = {
      local:
        '本地存储将文件保存在服务器本地硬盘上。适合小型应用或测试环境。请确保服务器有足够的磁盘空间，并设置合理的文件大小限制。',
      s3: 'S3存储支持Amazon S3及兼容S3协议的存储服务（如MinIO、DigitalOcean Spaces等）。请在服务商处创建存储桶并获取访问凭证。',
      tencent:
        '腾讯云COS对象存储服务。请先在腾讯云控制台创建存储桶，并在访问管理中获取SecretId和SecretKey。建议开启CDN加速以提升访问速度。',
      ali: '阿里云OSS对象存储服务。请先在阿里云控制台创建存储桶，并在RAM访问控制中创建AccessKey。建议配置跨域规则（CORS）以支持前端直传。',
    };

    ElMessageBox.alert(helps[activeTab.value] || '暂无帮助信息', '使用说明', {
      confirmButtonText: '知道了',
    });
  }

  // 优先级说明
  const priorityInfo = computed(() => {
    return '存储优先级：本地存储 > S3存储 > 腾讯云COS > 阿里云OSS。系统会按此顺序选择已启用的存储服务。';
  });

  // 判断字段是否应该显示
  function shouldShowField(field: StorageField, storageKey: string) {
    if (!field.showCondition) {
      return true;
    }
    return field.showCondition(storageSettings[storageKey]);
  }

  onMounted(() => {
    fetchStorageConfig();
    fetchStorageStatus();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          存储配置
        </div>
      </template>
      <HButton outline @click="saveAllConfig" :loading="loading">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="(config, key) in storageConfigs" :key="key" :name="key">
          <template #label>
            <div class="tab-label">
              <svg-icon
                v-if="config.icon"
                :name="config.icon"
                :color="config.iconColor"
                size="16"
              />
              <span>{{ config.name }}</span>
              <el-tag
                v-if="storageStatus[key]"
                :type="storageStatus[key].configured ? 'success' : 'info'"
                size="small"
                class="ml-2"
              >
                {{ storageStatus[key].configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </template>

          <div class="storage-content">
            <el-form label-width="160px">
              <el-row>
                <el-col :xs="24" :md="20" :lg="15" :xl="12">
                  <template v-for="field in config.fields" :key="field.key">
                    <el-form-item
                      v-if="shouldShowField(field, key)"
                      :label="field.label"
                      :required="field.required"
                    >
                      <!-- Switch类型 -->
                      <el-switch
                        v-if="field.type === 'switch'"
                        v-model="storageSettings[key][field.key]"
                        active-value="1"
                        inactive-value="0"
                      />
                      <!-- Select类型 -->
                      <el-select
                        v-else-if="field.type === 'select'"
                        v-model="storageSettings[key][field.key]"
                        :placeholder="field.placeholder"
                      >
                        <el-option
                          v-for="opt in field.options"
                          :key="opt.value"
                          :label="opt.label"
                          :value="opt.value"
                        />
                      </el-select>
                      <!-- Textarea类型 -->
                      <el-input
                        v-else-if="field.type === 'textarea'"
                        v-model="storageSettings[key][field.key]"
                        type="textarea"
                        :rows="4"
                        :placeholder="field.placeholder"
                      />
                      <!-- Password类型 -->
                      <el-input
                        v-else-if="field.type === 'password'"
                        v-model="storageSettings[key][field.key]"
                        type="password"
                        show-password
                        :placeholder="field.placeholder"
                      />
                      <!-- Input类型 -->
                      <el-input
                        v-else
                        v-model="storageSettings[key][field.key]"
                        :placeholder="field.placeholder"
                      />
                    </el-form-item>
                  </template>

                  <!-- 操作按钮 -->
                  <el-form-item label=" ">
                    <div class="flex gap-3">
                      <el-button type="primary" plain @click="showCurrentHelp">
                        <SvgIcon name="i-ri:question-line" class="mr-1" />
                        使用说明
                      </el-button>
                      <el-button plain @click="clearCurrentConfig">
                        <SvgIcon name="i-ri:delete-bin-line" class="mr-1" />
                        清空配置
                      </el-button>
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>

            <!-- 配置说明 -->
            <div v-if="config.description" class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                <SvgIcon name="i-ri:information-line" class="mr-1 inline" />
                {{ config.description }}
              </p>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .storage-content {
    padding-top: 20px;
  }
</style>
