<route lang="yaml">
meta:
  title: 敏感词配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiBadWords from '@/api/modules/badWords';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    baiduTextStatus: '',
    baiduTextApiKey: '',
    baiduTextSecretKey: '',
    systemSensitiveStatus: '',
    selectedVocabularies: [] as string[],
  });

  const rules = ref<FormRules>({
    baiduTextApiKey: [{ required: true, trigger: 'blur', message: '请填写百度文本审核APIKey' }],
    baiduTextSecretKey: [
      { required: true, trigger: 'blur', message: '请填写百度文本审核SecretKey' },
    ],
  });

  const formRef = ref<FormInstance>();
  const testLoading = ref(false);
  const vocabularies = ref<any[]>([]);
  const vocabStats = ref({ totalVocabularies: 0, totalWords: 0 });

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'baiduTextStatus',
        'baiduTextSecretKey',
        'baiduTextApiKey',
        'systemSensitiveStatus',
        'selectedVocabularies',
      ],
    });
    Object.assign(formInline, res.data);
    // 解析已选择的词库
    if (res.data.selectedVocabularies) {
      try {
        formInline.selectedVocabularies = JSON.parse(res.data.selectedVocabularies);
      } catch {
        formInline.selectedVocabularies = [];
      }
    }
  }

  async function queryVocabularies() {
    try {
      const res = await apiBadWords.queryVocabularies();
      vocabularies.value = res.data.vocabularies || [];
      vocabStats.value = res.data.stats || { totalVocabularies: 0, totalWords: 0 };
    } catch (error) {
      console.error('获取词库列表失败', error);
    }
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          const res = await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
          ElMessage.success('配置保存成功');
        } catch (error: any) {
          ElMessage.error(error.response?.data?.message || '配置保存失败');
        }
        queryAllConfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  async function testBaiduConfig() {
    testLoading.value = true;
    try {
      const res = await apiConfig.testBaiduConfig();
      if (res.data?.success) {
        ElMessage.success({
          message: res.data.message,
          duration: 5000,
          showClose: true,
        });
        if (res.data.detail) {
          // Detail is available but not logged to console
        }
      } else {
        ElMessage.error({
          message: res.data?.message || '配置测试失败',
          duration: 5000,
          showClose: true,
        });
      }
    } catch (error: any) {
      ElMessage.error('测试请求失败，请检查网络连接');
    } finally {
      testLoading.value = false;
    }
  }

  function fotmatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      let value = settings[key];
      // 将数组转换为JSON字符串
      if (key === 'selectedVocabularies' && Array.isArray(value)) {
        value = JSON.stringify(value);
      }
      return {
        configKey: key,
        configVal: value,
      };
    });
  }

  // 计算已选词库的总词数
  const selectedWordCount = computed(() => {
    if (!formInline.selectedVocabularies?.length) return 0;
    return formInline.selectedVocabularies.reduce((sum, id) => {
      const vocab = vocabularies.value.find((v) => v.id === id);
      return sum + (vocab?.count || 0);
    }, 0);
  });

  onMounted(() => {
    queryAllConfig();
    queryVocabularies();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          敏感词配置
        </div>
      </template>
      <div class="flex gap-2">
        <HButton outline @click="handlerUpdateConfig">
          <SvgIcon name="i-ri:file-text-line" />
          保存设置
        </HButton>
        <HButton
          theme="primary"
          outline
          @click="testBaiduConfig"
          :loading="testLoading"
          :disabled="formInline.baiduTextStatus !== '1'"
        >
          <SvgIcon name="i-ri:shield-check-line" />
          测试百度配置
        </HButton>
      </div>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="200px">
        <!-- 敏感词检测开关 -->
        <el-divider content-position="left">敏感词检测</el-divider>

        <!-- 系统内置敏感词 -->
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="使用系统内置敏感词">
              <el-tooltip
                content="开启后将使用系统内置的敏感词库进行检测。白名单中的词语不会被过滤。"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.systemSensitiveStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 词库选择（仅在使用系统内置敏感词时显示） -->
        <template v-if="formInline.systemSensitiveStatus === '1'">
          <el-row>
            <el-col :xs="24" :md="24" :lg="18" :xl="16">
              <el-form-item label="选择词库">
                <div class="w-full">
                  <el-checkbox-group v-model="formInline.selectedVocabularies">
                    <div class="flex flex-wrap gap-3">
                      <el-checkbox
                        v-for="vocab in vocabularies"
                        :key="vocab.id"
                        :label="vocab.id"
                        :value="vocab.id"
                        border
                        class="vocab-checkbox"
                      >
                        <div class="flex items-center gap-2">
                          <span>{{ vocab.name }}</span>
                          <el-tag size="small" type="info"
                            >{{ vocab.count.toLocaleString() }}词</el-tag
                          >
                        </div>
                      </el-checkbox>
                    </div>
                  </el-checkbox-group>
                  <div class="mt-3 text-sm text-gray-500">
                    已选择 {{ formInline.selectedVocabularies?.length || 0 }} 个词库，共
                    {{ selectedWordCount.toLocaleString() }} 个敏感词（合并后去重）
                  </div>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 百度云敏感词 -->
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="使用百度云敏感词">
              <el-tooltip
                content="开启后将使用百度云内容审核API进行检测。优先级高于系统内置敏感词。"
                placement="top"
                :show-after="500"
              >
                <el-switch
                  v-model="formInline.baiduTextStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 百度云配置（仅在使用百度云时显示） -->
        <template v-if="formInline.baiduTextStatus === '1'">
          <el-divider content-position="left">百度云配置</el-divider>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="文本审核ApiKey" prop="baiduTextApiKey">
                <el-input
                  v-model="formInline.baiduTextApiKey"
                  placeholder="请填写百度文本审核ApiKey"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="文本审核SecretKey" prop="baiduTextSecretKey">
                <el-input
                  v-model="formInline.baiduTextSecretKey"
                  placeholder="请填写百度文本审核SecretKey"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 提示信息 -->
        <el-alert title="配置说明" type="info" :closable="false" style="margin-top: 20px">
          <ul style="margin: 5px 0; padding-left: 20px">
            <li>系统内置敏感词和百度云敏感词只能开启一个，同时开启时优先使用百度云</li>
            <li>系统内置敏感词支持多选，多个词库会自动合并去重</li>
            <li>白名单词语不会被系统内置敏感词过滤，可在白名单管理页面配置</li>
            <li>百度云敏感词检测需要有效的API Key和Secret Key</li>
            <li>
              词库总数：{{ vocabStats.totalVocabularies }} 个，共
              {{ vocabStats.totalWords?.toLocaleString() }} 词
            </li>
          </ul>
        </el-alert>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
  .vocab-checkbox {
    margin-right: 0 !important;
  }
</style>
