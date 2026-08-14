<route lang="yaml">
meta:
  title: 其他设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiModel from '@/api/modules/models';
  import { QuestionFilled, Rank } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    mjProxyImgUrl: '',
    openaiVoice: '',
    sideDrawingEditModel: '',
    fileTransferFormat: 'url',
  });

  type VoiceOption = { label: string; value: string };
  const voiceOptions = ref<VoiceOption[]>([
    { label: 'Alloy', value: 'alloy' },
    { label: 'Echo', value: 'echo' },
    { label: 'Fable', value: 'fable' },
    { label: 'Onyx', value: 'onyx' },
    { label: 'Nova', value: 'nova' },
    { label: 'Shimmer', value: 'shimmer' },
  ]);

  const rules = ref<FormRules>({
    isMjTranslate: [{ required: false, trigger: 'blur', message: '是否开启翻译/联想' }],
    isGeneratePromptReference: [
      { required: false, trigger: 'blur', message: '是否生成提示词参考' },
    ],
    openaiTemperature: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写温度',
      },
    ],
    openaiVoice: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写openai的语音音色',
      },
    ],
    sideDrawingEditModel: [
      {
        required: false,
        trigger: 'blur',
        message: '侧边绘画编辑模型方式',
      },
    ],
  });
  // 编辑预览模型相关状态
  interface ModelItem {
    label: string;
    value: string;
    id?: string; // 添加唯一ID用于拖拽识别
  }

  const sideDrawingEditModelList = ref<ModelItem[]>([]); // 编辑预览模型列表
  const draggedIndex = ref(-1); // 拖拽中的元素索引

  // 从数据库查询的模型列表（keyType=6 通用创意）
  const drawingModels = ref<ModelItem[]>([]);

  const formRef = ref<FormInstance>();

  // 查询图片生成模型列表（keyType=6 通用创意）
  async function queryDrawingModels() {
    try {
      const res = await apiModel.queryDrawingModels();
      if (res.data && Array.isArray(res.data)) {
        drawingModels.value = res.data.map((item: any) => ({
          label: item.label,
          value: item.value,
        }));
      }
    } catch (error) {
      console.error('查询图片生成模型失败:', error);
    }
  }

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiTimeout',
        'openaiBaseModel',
        'openaiTemperature',
        'mjProxyImgUrl',
        'systemPreMessage',
        'isGeneratePromptReference',
        'openaiVoice',
        'sideDrawingEditModel',
        'fileTransferFormat',
      ],
    });

    // 解析编辑预览模型列表
    if (res.data.sideDrawingEditModel) {
      const modelString = res.data.sideDrawingEditModel.trim();
      if (modelString) {
        const models = modelString.split(',').filter((item: string) => item.trim());
        sideDrawingEditModelList.value = models.map((model: string, index: number) => {
          const parts = model.split(':');
          if (parts.length >= 2) {
            // 格式：名称:模型值（兼容旧的 名称:模型值:drawingType 格式）
            return {
              label: parts[0].trim(),
              value: parts[1].trim(),
              id: generateId(),
            };
          } else {
            // 兼容更旧格式（只有模型值）
            return {
              label: model.trim(),
              value: model.trim(),
              id: generateId(),
            };
          }
        });
      } else {
        sideDrawingEditModelList.value = [];
      }
    } else {
      sideDrawingEditModelList.value = [];
    }
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiTimeout = 300,

      openaiTemperature = 1,
      isGeneratePromptReference = 0,
      mjProxyImgUrl = '',

      openaiVoice = '',
      sideDrawingEditModel = '',
      fileTransferFormat = 'url',
    } = res.data;
    Object.assign(formInline, {
      openaiBaseUrl,
      openaiBaseKey,
      openaiTimeout,
      isGeneratePromptReference,
      openaiTemperature,
      mjProxyImgUrl,
      openaiVoice,
      sideDrawingEditModel,
      fileTransferFormat,
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
    // 转换为 name:value,name:value 格式
    formInline.sideDrawingEditModel = sideDrawingEditModelList.value
      .filter((item) => item.label.trim() && item.value.trim())
      .map((item) => {
        return `${item.label.trim()}:${item.value.trim()}`;
      })
      .join(',');
    return Object.keys(settings).map((key) => {
      return {
        configKey: key,
        configVal: settings[key],
      };
    });
  }

  // 生成唯一ID
  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // 编辑预览模型相关函数
  // 移除模型
  function handleModelRemove(index: number) {
    sideDrawingEditModelList.value.splice(index, 1);
  }

  // 添加新模型
  function addNewModel() {
    const newModel: ModelItem = {
      label: '',
      value: '',
      id: generateId(),
    };
    sideDrawingEditModelList.value.push(newModel);
  }

  // 从数据库选择模型时自动填充（已不再需要 drawingType）
  function handleModelSelect(item: ModelItem) {
    // 选择数据库模型后无需额外操作
  }

  // 拖拽相关函数
  function handleDragStart(index: number) {
    draggedIndex.value = index;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();

    if (draggedIndex.value !== -1 && draggedIndex.value !== dropIndex) {
      const draggedItem = sideDrawingEditModelList.value[draggedIndex.value];
      const newList = [...sideDrawingEditModelList.value];

      // 移除拖拽的元素
      newList.splice(draggedIndex.value, 1);

      // 在新位置插入
      newList.splice(dropIndex, 0, draggedItem);

      sideDrawingEditModelList.value = newList;
    }

    draggedIndex.value = -1;
  }

  function handleDragEnd() {
    draggedIndex.value = -1;
  }

  onMounted(() => {
    queryAllConfig();
    queryDrawingModels(); // 查询图片生成模型列表
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          其他配置
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h5>绘画配置</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="反代地址" prop="mjProxyImgUrl" label-width="120px">
              <el-input
                v-model="formInline.mjProxyImgUrl"
                placeholder="Midjourney CDN 反代地址（仅对包含 cdn.midjourney.com 的链接生效）"
                clearable
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 300px">
                    仅当图片链接包含 cdn.midjourney.com 时，才会使用此反代地址替换原链接。
                    支持两种格式：域名替换（如 https://proxy.example.com）或路径反代（如
                    https://proxy.example.com/https/cdn.midjourney.com）
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row class="mt-2">
          <el-col :xs="36" :md="36" :lg="30" :xl="27">
            <el-form-item label="编辑预览模型" prop="sideDrawingEditModel" label-width="120">
              <div>
                <!-- 已添加的模型列表 -->
                <div style="margin-bottom: 10px" v-if="sideDrawingEditModelList.length > 0">
                  <div
                    v-for="(item, index) in sideDrawingEditModelList"
                    :key="item.id"
                    draggable="true"
                    @dragstart="handleDragStart(index)"
                    @dragover="handleDragOver"
                    @drop="handleDrop($event, index)"
                    @dragend="handleDragEnd"
                    style="
                      display: flex;
                      align-items: center;
                      gap: 10px;
                      margin-bottom: 8px;
                      padding: 8px;
                      border: 1px solid #ddd;
                      border-radius: 4px;
                      background: #fafafa;
                      cursor: move;
                    "
                    :style="{
                      opacity: draggedIndex === index ? 0.5 : 1,
                      background: draggedIndex === index ? '#e6f7ff' : '#fafafa',
                    }"
                  >
                    <!-- 拖拽图标 -->
                    <el-icon style="color: #999; cursor: move; flex-shrink: 0">
                      <Rank />
                    </el-icon>

                    <!-- 左侧输入框：名称 -->
                    <div style="flex: 1; display: flex; align-items: center; gap: 4px">
                      <span style="font-size: 12px; color: #666; flex-shrink: 0">名称</span>
                      <el-input
                        v-model="item.label"
                        size="small"
                        placeholder="显示名称"
                        style="flex: 1"
                        class="w-[260px]"
                      />
                    </div>

                    <!-- 右侧下拉框：模型 -->
                    <div style="flex: 1; display: flex; align-items: center; gap: 4px">
                      <span style="font-size: 12px; color: #666; flex-shrink: 0">模型</span>
                      <el-select
                        v-model="item.value"
                        size="small"
                        placeholder="选择或输入模型"
                        style="flex: 1"
                        filterable
                        allow-create
                        clearable
                        class="w-[260px]"
                        @change="handleModelSelect(item)"
                      >
                        <el-option
                          v-for="model in drawingModels"
                          :key="model.value"
                          :label="`${model.label} (${model.value})`"
                          :value="model.value"
                        >
                          <span style="float: left">{{ model.label }}</span>
                        </el-option>
                      </el-select>
                    </div>

                    <!-- 删除按钮 -->
                    <div style="flex-shrink: 0">
                      <el-button
                        size="small"
                        text
                        type="danger"
                        @click="handleModelRemove(index)"
                        style="padding: 4px 8px"
                      >
                        删除
                      </el-button>
                    </div>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center">
                  <el-button size="small" @click="addNewModel"> + 添加模型 </el-button>
                  <el-tooltip class="box-item" effect="dark" placement="right">
                    <template #content>
                      <div style="width: 300px">
                        <p>• 每个模型包含显示名称和实际模型值两部分</p>
                        <p>• 可从数据库选择已配置的图片生成模型，或手动输入自定义模型</p>
                        <p>• 可添加多个编辑预览模型，为空则关闭侧边全局编辑及预览功能</p>
                        <p style="color: #f56c6c">• 注意：在模型设置中配置支持绘图模型</p>
                      </div>
                    </template>
                    <el-icon class="cursor-pointer">
                      <QuestionFilled />
                    </el-icon>
                  </el-tooltip>
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider />
        <h5>其他配置</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="TTS 音色" prop="openaiVoice" label-width="120px">
              <el-select
                v-model="formInline.openaiVoice"
                placeholder="选择或输入 openai 语音合成的默认发音人"
                clearable
                filterable
                allow-create
              >
                <!-- 预定义选项 -->
                <el-option
                  v-for="voice in voiceOptions"
                  :key="voice.value"
                  :label="voice.label"
                  :value="voice.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
