<route lang="yaml">
meta:
  title: 向量配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    vectorUrl: '',
    vectorKey: '',
    vectorModel: 'text-embedding-3-small',
    vectorAnalysisThreshold: 1000,
    maxUrlTextLength: 100000,
    vectorMaxTokens: 512,
    vectorOverlapTokens: 50,
    vectorCacheExpiresDays: 3,
  });

  const vectorOptions = [
    {
      value: 'text-embedding-3-small',
      label: 'text-embedding-3-small',
    },
    {
      value: 'text-embedding-3-large',
      label: 'text-embedding-3-large',
    },
    {
      value: 'text-embedding-ada-002',
      label: 'text-embedding-ada-002',
    },
  ];

  const rules = ref<FormRules>({
    vectorUrl: [{ required: false, trigger: 'blur', message: '请填写向量模型地址' }],
    vectorKey: [{ required: false, trigger: 'blur', message: '请填写向量模型 Key' }],
    vectorModel: [{ required: false, trigger: 'blur', message: '请填写向量模型名称' }],
    vectorAnalysisThreshold: [
      { required: false, trigger: 'blur', message: '请填写文件启用向量分析阈值' },
    ],
    maxUrlTextLength: [{ required: false, trigger: 'blur', message: '请填写文件最大字符限制' }],
    vectorMaxTokens: [{ required: false, trigger: 'blur', message: '请填写向量切片最大token数' }],
    vectorOverlapTokens: [
      { required: false, trigger: 'blur', message: '请填写向量切片重叠token数' },
    ],
    vectorCacheExpiresDays: [
      { required: false, trigger: 'blur', message: '请填写向量缓存有效期（天）' },
    ],
  });
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'vectorUrl',
        'vectorKey',
        'vectorModel',
        'vectorAnalysisThreshold',
        'maxUrlTextLength',
        'vectorMaxTokens',
        'vectorOverlapTokens',
        'vectorCacheExpiresDays',
      ],
    });
    const {
      vectorUrl,
      vectorKey,
      vectorModel = 'text-embedding-3-small',
      vectorAnalysisThreshold = 10000,
      maxUrlTextLength = 500000,
      vectorMaxTokens = 512,
      vectorOverlapTokens = 50,
      vectorCacheExpiresDays = 3,
    } = res.data;
    Object.assign(formInline, {
      vectorUrl,
      vectorKey,
      vectorModel,
      vectorAnalysisThreshold: Number(vectorAnalysisThreshold) || 10000,
      maxUrlTextLength: Number(maxUrlTextLength) || 500000,
      vectorMaxTokens: Number(vectorMaxTokens) || 512,
      vectorOverlapTokens: Number(vectorOverlapTokens) || 50,
      vectorCacheExpiresDays: Number(vectorCacheExpiresDays) || 3,
    });
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          await apiConfig.setConfig({ settings: fotmatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {}
        queryAllConfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  function fotmatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      return {
        configKey: key,
        configVal: settings[key],
      };
    });
  }

  onMounted(() => {
    queryAllConfig();
  });

  /**
   * 规范化API基础URL
   * @param baseUrl - 需要规范化的API基础URL
   * @returns 规范化后的URL字符串
   */
  const correctApiBaseUrl = (baseUrl: string): string => {
    if (!baseUrl) return '';

    // 去除两端空格
    let url = baseUrl.trim();

    // 如果URL以斜杠'/'结尾，则移除这个斜杠
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // 检查URL是否已包含任何版本标记，包括常见的模式如/v1, /v1beta, /v1alpha等
    if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
      // 如果不包含任何版本号，添加 /v1
      return `${url}/v1`;
    }

    return url;
  };

  // Computed properties for actual URLs
  const actualVectorUrl = computed(() => correctApiBaseUrl(formInline.vectorUrl));
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          向量配置
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h3 class="font-bold text-lg mb-4">向量模型配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="向量模型地址" prop="vectorUrl" label-width="120px">
              <el-input
                v-model="formInline.vectorUrl"
                placeholder="请填写向量模型地址，未指定 /v1 等版本时将自动添加 /v1"
                clearable
              />
              <div v-if="actualVectorUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualVectorUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="向量模型 Key" prop="vectorKey" label-width="120px">
              <el-input
                v-model="formInline.vectorKey"
                placeholder="请填写向量模型 Key"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="向量模型名称" prop="vectorModel" label-width="120px">
              <el-select
                v-model="formInline.vectorModel"
                placeholder="请选择或输入向量模型名称"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="option in vectorOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">切片策略配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="向量分析阈值" prop="vectorAnalysisThreshold" label-width="120px">
              <el-input-number
                v-model="formInline.vectorAnalysisThreshold"
                controls-position="right"
                :min="100"
                :max="10000"
                :step="100"
                placeholder="文件启用向量分析阈值，默认1000"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>文件字符数超过此阈值才会启动向量分析，避免对小文件进行不必要的分析</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="文件字符限制" prop="maxUrlTextLength" label-width="120px">
              <el-input-number
                v-model="formInline.maxUrlTextLength"
                controls-position="right"
                :min="1000"
                :max="1000000"
                :step="1000"
                placeholder="文件最大字符限制，默认50000"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>向量模型处理的文件最大字符数限制，超过此限制将会被截断</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="切片最大token数" prop="vectorMaxTokens" label-width="120px">
              <el-input-number
                v-model="formInline.vectorMaxTokens"
                controls-position="right"
                :min="128"
                :max="2048"
                :step="64"
                placeholder="向量切片的最大token数，默认512"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>控制文件切片的最大token数量，默认512 tokens</p>
                    <p>• 较小的值（256-384）：提高检索精度，适合精确问答</p>
                    <p>• 中等值（512）：平衡性能和质量，推荐用于大多数场景</p>
                    <p>• 较大的值（768-1024）：保留更多上下文，适合长文档总结</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="切片重叠token数" prop="vectorOverlapTokens" label-width="120px">
              <el-input-number
                v-model="formInline.vectorOverlapTokens"
                controls-position="right"
                :min="0"
                :max="200"
                :step="10"
                placeholder="向量切片间的重叠token数，默认50"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>相邻切片之间重叠的token数量，默认50 tokens（约10%）</p>
                    <p>• 确保关键信息不会在切片边界丢失</p>
                    <p>• 建议设置为切片大小的10%左右</p>
                    <p>• 设为0可节省token，但可能降低检索质量</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">缓存配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item
              label="缓存有效期（天）"
              prop="vectorCacheExpiresDays"
              label-width="120px"
            >
              <el-input-number
                v-model="formInline.vectorCacheExpiresDays"
                controls-position="right"
                :min="1"
                :max="30"
                :step="1"
                placeholder="向量缓存有效期，默认3天"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 280px">
                    <p>用户上传文件的向量缓存有效期（单位：天），默认3天</p>
                    <p><strong>⚠️ 重要权衡：</strong></p>
                    <p>• 延长有效期（如7-30天）→ 减少重复向量化，节省API成本</p>
                    <p>• 但会增加数据库存储压力和查询时间</p>
                    <p>• 系统知识库文件不受此限制，永久保存</p>
                    <p>• 建议：高频使用文件设7-14天，临时文件设1-3天</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>

<style lang="scss" scoped></style>
