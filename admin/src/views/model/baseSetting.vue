<route lang="yaml">
meta:
  title: 基础设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    openaiBaseUrl: '',
    openaiBaseKey: '',
    deepThinkingModel: 'deepseek-reasoner',
    deepThinkingUrl: '',
    deepThinkingKey: '',
    openaiBaseModel: 'gpt-4o-mini',
    isGeneratePromptReference: 0,
    systemPreMessage: '',
    isModelInherited: 1,
    pluginUrl: '',
    pluginKey: '',
    maxToolCallsPerRequest: 5,
    openaiTemperature: 1,
    maxInputLength: 20000,
    toolCallUrl: '',
    toolCallKey: '',
    toolCallModel: '',
    imageAnalysisUrl: '',
    imageAnalysisKey: '',
    imageAnalysisModel: '',
  });

  const options = [
    {
      value: 'https://api.deepseek.com',
      label: '【DeepSeek 官方】https://api.deepseek.com',
    },
    {
      value: 'https://dashscope.aliyuncs.com/compatible-mode',
      label: '【阿里云百炼】https://dashscope.aliyuncs.com/compatible-mode',
    },
    {
      value: 'https://api.lkeap.cloud.tencent.com',
      label: '【腾讯云知识引擎】https://api.lkeap.cloud.tencent.com',
    },
    {
      value: '',
      label: '【其他】填写后选择',
    },
  ];

  const netWorkOptions = [
    {
      value: 'https://open.bigmodel.cn/api/paas/v4/tools',
      label: '【智谱 web-search-pro】',
    },
    {
      value: 'https://api.bochaai.com/v1/web-search',
      label: '【博查 web-search】',
    },
    {
      value: 'https://api.tavily.com/search',
      label: '【Tavily 1000 次/月（免费）】',
    },
  ];

  type VoiceOption = { label: string; value: string };

  const rules = ref<FormRules>({
    openaiBaseUrl: [{ required: true, trigger: 'blur', message: '请填写 AI 的请求地址' }],
    openaiBaseKey: [{ required: true, trigger: 'blur', message: '请填写模型全局 Key' }],
    openaiBaseModel: [
      { required: true, trigger: 'blur', message: '请填写全局模型，用于后台一些静默性赋能操作' },
    ],
    isGeneratePromptReference: [
      { required: false, trigger: 'blur', message: '是否生成提示词参考' },
    ],
    isModelInherited: [{ required: false, trigger: 'blur', message: '是否继承模型' }],
    pluginUrl: [{ required: false, trigger: 'blur', message: '请填写联网插件地址' }],
    pluginKey: [{ required: false, trigger: 'blur', message: '请填写联网插件 Key' }],
    maxToolCallsPerRequest: [{ required: false, trigger: 'blur', message: '请填写单次调用上限' }],
    openaiTemperature: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写模型 Temperature 设置，默认1',
      },
    ],
    deepThinkingUrl: [{ required: false, trigger: 'blur', message: '请填写深度思考模型地址' }],
    deepThinkingKey: [{ required: false, trigger: 'blur', message: '请填写深度思考模型 Key' }],
    deepThinkingModel: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写深度思考模型名称',
      },
    ],
    maxInputLength: [{ required: false, trigger: 'blur', message: '请填写输入框字符上限' }],
    toolCallUrl: [{ required: false, trigger: 'blur', message: '请填写工具调用模型地址' }],
    toolCallKey: [{ required: false, trigger: 'blur', message: '请填写工具调用模型 Key' }],
    toolCallModel: [{ required: false, trigger: 'blur', message: '请填写工具调用模型名称' }],
    imageAnalysisUrl: [{ required: false, trigger: 'blur', message: '请填写图片解析模型地址' }],
    imageAnalysisKey: [{ required: false, trigger: 'blur', message: '请填写图片解析模型 Key' }],
    imageAnalysisModel: [{ required: false, trigger: 'blur', message: '请填写图片解析模型名称' }],
  });
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiBaseModel',
        'systemPreMessage',
        'isGeneratePromptReference',
        'isModelInherited',
        'pluginUrl',
        'pluginKey',
        'maxToolCallsPerRequest',
        'openaiTemperature',
        'deepThinkingUrl',
        'deepThinkingKey',
        'deepThinkingModel',
        'maxInputLength',
        'toolCallUrl',
        'toolCallKey',
        'toolCallModel',
        'imageAnalysisUrl',
        'imageAnalysisKey',
        'imageAnalysisModel',
      ],
    });
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiBaseModel = 'gpt-4o-mini',
      isGeneratePromptReference = 0,
      systemPreMessage,
      pluginUrl,
      pluginKey,
      maxToolCallsPerRequest = 5,
      openaiTemperature = 1,
      deepThinkingUrl,
      deepThinkingKey,
      deepThinkingModel,
      isModelInherited,
      maxInputLength = 20000,
      toolCallUrl,
      toolCallKey,
      toolCallModel = '',
      imageAnalysisUrl,
      imageAnalysisKey,
      imageAnalysisModel = '',
    } = res.data;
    Object.assign(formInline, {
      openaiBaseUrl,
      openaiBaseKey,
      isGeneratePromptReference,
      openaiBaseModel,
      systemPreMessage,
      pluginUrl,
      pluginKey,
      maxToolCallsPerRequest: Number(maxToolCallsPerRequest) || 5,
      openaiTemperature: Number(openaiTemperature) || 1,
      deepThinkingKey,
      deepThinkingUrl,
      deepThinkingModel,
      isModelInherited,
      maxInputLength: Number(maxInputLength) || 20000,
      toolCallUrl,
      toolCallKey,
      toolCallModel,
      imageAnalysisUrl,
      imageAnalysisKey,
      imageAnalysisModel,
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
  const actualOpenaiBaseUrl = computed(() => correctApiBaseUrl(formInline.openaiBaseUrl));
  const actualDeepThinkingUrl = computed(() => correctApiBaseUrl(formInline.deepThinkingUrl));
  const actualToolCallUrl = computed(() => correctApiBaseUrl(formInline.toolCallUrl));
  const actualImageAnalysisUrl = computed(() => correctApiBaseUrl(formInline.imageAnalysisUrl));
  const actualPluginUrl = computed(() => correctApiBaseUrl(formInline.pluginUrl));
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          基础配置
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h3 class="font-bold text-lg mb-4">基础配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局地址" prop="openaiBaseUrl" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseUrl"
                placeholder="例如 https://api.openai.com，未显式指定 /v1 等版本时将自动添加 /v1"
                clearable
              />
              <div v-if="actualOpenaiBaseUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualOpenaiBaseUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局 Key" prop="openaiBaseKey" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseKey"
                placeholder="请填写模型全局 Key 信息，当模型 Key 为空时调用"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="全局模型" prop="openaiBaseModel" label-width="120px" required>
              <el-input
                v-model="formInline.openaiBaseModel"
                placeholder="全局模型配置，用于后台一些静默赋能操作"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">深度思考配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考地址" prop="deepThinkingUrl" label-width="120px">
              <el-select
                v-model="formInline.deepThinkingUrl"
                placeholder="选择或输入地址，未指定 /v1 等版本时将自动添加 /v1"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="option in options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <div v-if="actualDeepThinkingUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualDeepThinkingUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考 Key" prop="deepThinkingKey" label-width="120px">
              <el-input
                v-model="formInline.deepThinkingKey"
                placeholder="请填写深度思考模型 Key"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="深度思考模型" prop="deepThinkingModel" label-width="120px">
              <el-input
                v-model="formInline.deepThinkingModel"
                placeholder="请选择深度思考模型"
                clearable
              >
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">
          工具调用模型配置（需支持 function calling）<el-divider />
        </h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="工具调用地址" prop="toolCallUrl" label-width="120px">
              <el-input
                v-model="formInline.toolCallUrl"
                placeholder="请填写工具调用模型地址，未指定 /v1 等版本时将自动添加 /v1"
                clearable
              />
              <div v-if="actualToolCallUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualToolCallUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="工具调用 Key" prop="toolCallKey" label-width="120px">
              <el-input
                v-model="formInline.toolCallKey"
                placeholder="请填写工具调用模型 Key"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="工具调用模型" prop="toolCallModel" label-width="120px">
              <el-input
                v-model="formInline.toolCallModel"
                placeholder="请填写工具调用模型"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">图片解析模型配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="图片解析地址" prop="imageAnalysisUrl" label-width="120px">
              <el-input
                v-model="formInline.imageAnalysisUrl"
                placeholder="请填写图片解析模型地址，未指定 /v1 等版本时将自动添加 /v1"
                clearable
              />
              <div v-if="actualImageAnalysisUrl" class="text-xs text-gray-400 mt-1">
                实际调用地址：{{ actualImageAnalysisUrl }}
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="图片解析 Key" prop="imageAnalysisKey" label-width="120px">
              <el-input
                v-model="formInline.imageAnalysisKey"
                placeholder="请填写图片解析模型 Key"
                type="password"
                show-password
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="图片解析模型" prop="imageAnalysisModel" label-width="120px">
              <el-input
                v-model="formInline.imageAnalysisModel"
                placeholder="请填写图片解析模型名称，默认gpt-4-vision-preview"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">联网配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="联网搜索地址" label-width="120" prop="pluginUrl">
              <el-select
                v-model="formInline.pluginUrl"
                placeholder="请选择或输入联网搜索使用的地址"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="option in netWorkOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="联网搜索 Key" label-width="120" prop="pluginKey">
              <el-input
                v-model="formInline.pluginKey"
                placeholder="插件 Key"
                clearable
                password
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="单次调用上限" label-width="120" prop="maxToolCallsPerRequest">
              <el-input-number
                v-model="formInline.maxToolCallsPerRequest"
                controls-position="right"
                :min="1"
                :max="10"
                :step="1"
                placeholder="单次工具调用最大次数，默认5"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>单次对话中工具（如联网搜索）的最大调用次数，默认5次</p>
                    <p>增加次数可以获取更全面的信息，但会增加响应时间和成本</p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">其他配置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="继承对话模型" prop="isModelInherited" label-width="120">
              <el-switch
                v-model="formInline.isModelInherited"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，新建对话模型将继承上一次对话所使用的模型</p>
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
            <el-form-item label="生成提问建议" prop="isGeneratePromptReference" label-width="120">
              <el-switch
                v-model="formInline.isGeneratePromptReference"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将使用全局模型在每次对话后，生成提问建议</p>
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
            <el-form-item label="Temperature" prop="openaiTemperature" label-width="120px">
              <el-input-number
                v-model="formInline.openaiTemperature"
                controls-position="right"
                :min="0"
                :max="2"
                :step="0.1"
                placeholder="模型 Temperature 设置，默认1"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>模型 Temperature 设置，一般情况无需调整</p>
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
            <el-form-item label="输入框字符上限" prop="maxInputLength" label-width="120px">
              <el-input-number
                v-model="formInline.maxInputLength"
                controls-position="right"
                :min="1000"
                :max="100000"
                :step="1000"
                placeholder="输入框字符上限，默认20000"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>用户输入框字符数上限，防止过长的输入导致系统错误</p>
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
            <el-form-item label="全局头部预设" prop="systemPreMessage" label-width="120px">
              <el-input
                v-model="formInline.systemPreMessage"
                type="textarea"
                :rows="8"
                placeholder="请填写模型全局头部预设信息！"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
