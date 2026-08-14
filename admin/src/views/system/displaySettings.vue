<route lang="yaml">
meta:
  title: 显示设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { onMounted, reactive, ref, computed, watch } from 'vue';


  const formInline = reactive({
    isHideModel3Point: '',
    isHideModel4Point: '',
    isHideDrawMjPoint: '',
    isHideDefaultPreset: '',
    model3Name: '',
    model4Name: '',
    drawMjName: '',
    showWatermark: '',
    ttsMode: '1', // 0-不显示播放按钮, 1-默认TTS, 2-浏览器TTS
    pluginFirst: '1',
    isHidePlugin: '0',
    isHideSidebarApps: '0',
    showCrami: '0',
    clearCacheEnabled: '0',
    streamCacheEnabled: '0',
    homeWelcomeContent: '',
    enableHtmlRender: '0',
    defaultLanguage: 'zh-CN',
    enabledLanguages: ['zh-CN', 'en-US'],
    modelSelectorPosition: 'header', // header-顶部, footer-底部
  });
  const rules = ref<FormRules>({
    model3Name: [{ required: true, message: '请输入普通积分名称', trigger: 'blur' }],
    model4Name: [{ required: true, message: '请输入高级积分名称', trigger: 'blur' }],
    drawMjName: [{ required: true, message: '请输入绘画积分名称', trigger: 'blur' }],
    enabledLanguages: [
      {
        required: true,
        type: 'array',
        min: 1,
        message: '请至少选择一种语言',
        trigger: 'change',
      },
    ],
    defaultLanguage: [{ required: true, message: '请选择默认语言', trigger: 'change' }],
  });
  const formRef = ref<FormInstance>();

  // 所有可用的语言选项
  const allLanguages = [
    { label: '简体中文', value: 'zh-CN' },
    { label: '繁體中文', value: 'zh-TW' },
    { label: 'English', value: 'en-US' },
    { label: '日本語', value: 'ja-JP' },
    { label: '한국어', value: 'ko-KR' },
    { label: 'Русский', value: 'ru-RU' },
    { label: 'Français', value: 'fr-FR' },
    { label: 'Deutsch', value: 'de-DE' },
    { label: 'Español', value: 'es-ES' },
    { label: 'العربية', value: 'ar-SA' },
    { label: 'Italiano', value: 'it-IT' },
    { label: 'Português', value: 'pt-PT' },
    { label: 'हिन्दी', value: 'hi-IN' },
    { label: 'ภาษาไทย', value: 'th-TH' },
    { label: 'Tiếng Việt', value: 'vi-VN' },
  ];

  // 计算属性：根据启用的语言动态生成默认语言的选项
  const availableDefaultLanguages = computed(() => {
    if (!formInline.enabledLanguages || formInline.enabledLanguages.length === 0) {
      return [];
    }
    return allLanguages.filter((lang) => formInline.enabledLanguages.includes(lang.value));
  });

  // 监听启用的语言变化，自动调整默认语言
  watch(
    () => formInline.enabledLanguages,
    (newVal) => {
      // 如果当前的默认语言不在启用列表中，自动选择第一个启用的语言
      if (newVal && newVal.length > 0 && !newVal.includes(formInline.defaultLanguage)) {
        formInline.defaultLanguage = newVal[0];
      }
      // 如果没有启用任何语言，清空默认语言
      if (!newVal || newVal.length === 0) {
        formInline.defaultLanguage = '';
      }
    },
  );

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'isHideModel3Point',
        'isHideModel4Point',
        'isHideDrawMjPoint',
        'isHideDefaultPreset',
        'model3Name',
        'model4Name',
        'drawMjName',
        'showWatermark',
        'ttsMode',
        'pluginFirst',
        'isHidePlugin',
        'isHideSidebarApps',
        'showCrami',
        'clearCacheEnabled',
        'streamCacheEnabled',
        'homeWelcomeContent',
        'enableHtmlRender',
        'defaultLanguage',
        'enabledLanguages',
        'modelSelectorPosition',
      ],
    });
    Object.assign(formInline, res.data);
    // 处理enabledLanguages，确保是数组
    if (typeof formInline.enabledLanguages === 'string') {
      try {
        formInline.enabledLanguages = JSON.parse(formInline.enabledLanguages);
      } catch {
        formInline.enabledLanguages = ['zh-CN', 'en-US'];
      }
    }
    if (!Array.isArray(formInline.enabledLanguages)) {
      formInline.enabledLanguages = ['zh-CN', 'en-US'];
    }
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          await apiConfig.setConfig({ settings: formatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {}
        queryAllConfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  function formatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      let configVal = settings[key];
      // 如果是enabledLanguages数组，转换为JSON字符串
      if (key === 'enabledLanguages' && Array.isArray(configVal)) {
        configVal = JSON.stringify(configVal);
      }
      return {
        configKey: key,
        configVal: configVal,
      };
    });
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
          显示设置
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="150px">
        <h3 class="font-bold text-lg mb-4">性能与缓存设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="清除缓存" prop="clearCacheEnabled">
              <el-switch
                v-model="formInline.clearCacheEnabled"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将启用缓存清除功能，有助于解决页面数据显示异常问题</p>
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
            <el-form-item label="流式对话缓存" prop="streamCacheEnabled">
              <el-switch
                v-model="formInline.streamCacheEnabled"
                active-value="1"
                inactive-value="0"
              />

              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>
                      开启后，会对 AI 对话进行缓存输出，优化输出平滑性。关闭则完全依赖 API 流式输出
                    </p>
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">语言设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="启用的语言" prop="enabledLanguages">
              <el-checkbox-group v-model="formInline.enabledLanguages">
                <el-checkbox v-for="lang in allLanguages" :key="lang.value" :label="lang.value">
                  {{ lang.label }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="默认语言" prop="defaultLanguage">
              <el-select
                v-model="formInline.defaultLanguage"
                placeholder="请选择默认语言"
                :disabled="!formInline.enabledLanguages || formInline.enabledLanguages.length === 0"
              >
                <el-option
                  v-for="lang in availableDefaultLanguages"
                  :key="lang.value"
                  :label="lang.label"
                  :value="lang.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">功能与界面设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏插件" prop="isHidePlugin">
              <el-switch v-model="formInline.isHidePlugin" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将在用户界面隐藏所有插件功能入口</p>
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
            <el-form-item label="插件优先显示" prop="pluginFirst">
              <el-switch v-model="formInline.pluginFirst" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，对话页面将默认优先显示插件面板而非对话记录</p>
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
            <el-form-item label="隐藏侧边应用" prop="isHideSidebarApps">
              <el-switch
                v-model="formInline.isHideSidebarApps"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，将隐藏对话页面侧边栏的"我的应用"区域</p>
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
            <el-form-item label="显示全局水印" prop="showWatermark">
              <el-switch v-model="formInline.showWatermark" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后将在对话页面显示用户名水印，增强内容安全性</p>
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
            <el-form-item label="模型选择器位置" prop="modelSelectorPosition">
              <el-select
                v-model="formInline.modelSelectorPosition"
                placeholder="请选择模型选择器位置"
              >
                <el-option label="顶部标题栏" value="header" />
                <el-option label="底部输入框" value="footer" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="渲染HTML内容" prop="enableHtmlRender">
              <el-switch
                v-model="formInline.enableHtmlRender"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，允许在用户内容中渲染HTML标签，但可能影响页面样式，建议按需开启</p>
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
            <el-form-item label="隐藏首页默认预设" prop="isHideDefaultPreset">
              <el-switch
                v-model="formInline.isHideDefaultPreset"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，首页将不显示默认预设提示，使界面更简洁</p>
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
            <el-form-item label="TTS语音播放模式" prop="ttsMode">
              <el-select v-model="formInline.ttsMode" placeholder="请选择TTS模式">
                <el-option label="不显示播放按钮" value="0" />
                <el-option label="默认TTS（系统内置）" value="1" />
                <el-option label="浏览器TTS" value="2" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="显示卡密兑换" prop="showCrami">
              <el-switch v-model="formInline.showCrami" active-value="1" inactive-value="0" />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    <p>开启后，在用户界面将显示卡密兑换功能入口</p>
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
            <el-form-item label="首页欢迎提示" prop="homeWelcomeContent">
              <el-input
                v-model="formInline.homeWelcomeContent"
                type="text"
                placeholder="请输入首页欢迎提示内容，将在用户访问时显示"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <h3 class="font-bold text-lg mt-8 mb-4">积分显示设置 <el-divider /></h3>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏普通积分" prop="isHideModel3Point">
              <el-switch
                v-model="formInline.isHideModel3Point"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="普通积分名称" prop="model3Name">
              <el-input v-model="formInline.model3Name" placeholder="普通积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏高级积分" prop="isHideModel4Point">
              <el-switch
                v-model="formInline.isHideModel4Point"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="高级积分名称" prop="model4Name">
              <el-input v-model="formInline.model4Name" placeholder="高级积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="隐藏绘画积分" prop="isHideDrawMjPoint">
              <el-switch
                v-model="formInline.isHideDrawMjPoint"
                active-value="1"
                inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绘画积分名称" prop="drawMjName">
              <el-input v-model="formInline.drawMjName" placeholder="绘画积分名称" clearable />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
