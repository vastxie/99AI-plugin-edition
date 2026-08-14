<route lang="yaml">
meta:
  title: 应用中心
</route>

<script lang="ts" setup>
  import ApiApp from '@/api/modules/app';
  import ApiModels from '@/api/modules/models';
  import uploadApi from '@/api/modules/upload';
  import knowledgeApi from '@/api/modules/knowledge';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { MagicStick, Plus, Refresh } from '@element-plus/icons-vue';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { v4 as uuidv4 } from 'uuid';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

  import PromptTemplateEditor from '@/components/PromptTemplateEditor/index.vue';
  import { QUESTION_STATUS_MAP, ENABLE_STATUS_OPTIONS } from '@/constants/index';
  import axios from 'axios';
  import api from '@/api';
  import { buildAppOptimizationMessage, parseAppOptimizationResponse } from '@/utils/appAiOptimize';

  // Tab control
  const activeTab = ref('application');

  // ========== 应用管理相关 ==========
  const formRef = ref<FormInstance>();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);
  const aiOptimizing = ref(false);

  const formInline = reactive({
    name: '',
    catId: '',
    page: 1,
    size: 10,
  });

  const formPackageRef = ref<FormInstance>();
  const activeAppCatId = ref(0);
  const isUserApp = ref(false);
  const userAppStatus = ref(0);
  const formPackage = reactive({
    id: '',
    name: '',
    catId: [] as string[],
    des: '',
    preset: '',
    coverImg: '',
    order: 100,
    status: 1,
    isGPTs: 0,
    gizmoID: '',
    isFixedModel: 0,
    appModel: '',
    isFlowith: 0,
    flowithId: '',
    flowithName: '',
    flowithKey: '',
    backgroundImg: '',
    prompt: '',
    // 知识库配置
    knowledgeBaseUrls: [] as string[], // 关联的系统知识库URL列表
  });

  // 添加特殊模型类型
  const specialModelType = ref('none'); // none, gpts, flowith

  // 监听特殊模型类型变化
  watch(specialModelType, (newValue) => {
    if (newValue === 'none') {
      formPackage.isGPTs = 0;
      formPackage.isFlowith = 0;
    } else if (newValue === 'gpts') {
      formPackage.isGPTs = 1;
      formPackage.isFlowith = 0;
    } else if (newValue === 'flowith') {
      formPackage.isGPTs = 0;
      formPackage.isFlowith = 1;
    }
  });

  const rules = reactive<FormRules>({
    catId: [{ required: true, message: '请选择App分类', trigger: 'change' }],
    name: [{ required: true, message: '请填写App名称', trigger: 'blur' }],
    preset: [{ required: false, message: '请填写App预设信息', trigger: 'blur' }],
    des: [{ required: true, message: '请填写App描述', trigger: 'blur' }],
    coverImg: [{ required: false, message: '请填写App封面图片地址', trigger: 'blur' }],
    isGPTs: [{ required: true, message: '是否GPTs', trigger: 'blur' }],
    gizmoID: [{ required: false, message: 'GPTs 的ID', trigger: 'blur' }],
    order: [{ required: false, message: '请填写排序ID', trigger: 'blur' }],
    status: [{ required: true, message: '请选择App状态', trigger: 'change' }],
    isFixedModel: [{ required: true, message: '请选择App是否固定模型', trigger: 'blur' }],
    appModel: [{ required: false, message: '请选择App使用的模型', trigger: 'change' }],
    isFlowith: [{ required: true, message: '请选择是否使用flowith模型', trigger: 'blur' }],
    flowithId: [{ required: false, message: '请填写flowith模型ID', trigger: 'blur' }],
    flowithName: [{ required: false, message: '请填写flowith模型名称', trigger: 'blur' }],
    flowithKey: [{ required: false, message: '请填写flowith模型密钥', trigger: 'blur' }],
    backgroundImg: [{ required: false, message: '请填写App背景图URL', trigger: 'blur' }],
    prompt: [{ required: false, message: '请填写App提问模版', trigger: 'blur' }],
  });

  const tableData = ref([]);

  interface CatItem {
    id: number;
    name: string;
  }
  const catList: Ref<CatItem[]> = ref([]);

  const dialogTitle = computed(() => {
    return activeAppCatId.value ? '更新应用' : '新增应用';
  });

  const dialogButton = computed(() => {
    return activeAppCatId.value ? '确认更新' : '确认新增';
  });

  const modelOptions = ref<string[]>([]);

  // 知识库相关状态
  const knowledgeBaseList = ref<any[]>([]); // 系统知识库列表
  const knowledgeBaseLoading = ref(false);
  const uploadFileDialogVisible = ref(false);
  const uploadFileLoading = ref(false);

  // 获取系统知识库列表
  async function fetchSystemKnowledgeList() {
    try {
      knowledgeBaseLoading.value = true;
      const res: any = await knowledgeApi.getList('system', 1, 100);
      knowledgeBaseList.value = res.data.data || [];
    } catch (error) {
      console.error('获取系统知识库列表失败:', error);
      ElMessage.error('获取系统知识库列表失败');
    } finally {
      knowledgeBaseLoading.value = false;
    }
  }

  async function queryAppList() {
    try {
      loading.value = true;
      // 处理catId，不再需要将数组转换为逗号分隔的字符串
      const params = { ...formInline };
      const res = await ApiApp.queryApp(params);
      const { rows, count } = res.data;
      loading.value = false;
      total.value = count;
      tableData.value = rows.sort(
        (a: { order: number }, b: { order: number }) => b.order - a.order,
      );
    } catch (error) {
      loading.value = false;
    }
  }

  async function queryCatList() {
    const res = await ApiApp.queryCats({ size: 100 });
    const { rows } = res.data;
    catList.value = rows;
  }

  // Helper function to check if a string is valid JSON template
  function isValidJsonTemplate(str: string): boolean {
    if (!str || !str.startsWith('[')) {
      return false;
    }
    try {
      const parsed = JSON.parse(str);
      // Basic check: is it an array? Does the first item look like our structure?
      return (
        Array.isArray(parsed) &&
        (!parsed.length ||
          (parsed[0] &&
            typeof parsed[0].type === 'string' &&
            typeof parsed[0].placeholder === 'string'))
      );
    } catch (e) {
      return false;
    }
  }

  function handleUpdatePackage(row: any) {
    activeAppCatId.value = row.id;
    isUserApp.value = row.role === 'user';
    userAppStatus.value = row.status;
    const {
      name,
      status,
      des,
      order,
      coverImg,
      catId,
      preset,
      isGPTs,
      gizmoID,
      isFixedModel,
      appModel,
      isFlowith,
      flowithId,
      flowithName,
      flowithKey,
      backgroundImg,
      prompt,
    } = row;

    // 设置特殊模型类型
    if (isGPTs === 1) {
      specialModelType.value = 'gpts';
    } else if (isFlowith === 1) {
      specialModelType.value = 'flowith';
    } else {
      specialModelType.value = 'none';
    }

    // 处理catId，确保它是字符串数组
    let processedCatId: string[] = [];
    if (typeof catId === 'string') {
      // 如果是逗号分隔的字符串，则拆分为数组
      processedCatId = catId.split(',').filter((id) => id.trim() !== '');
    } else if (Array.isArray(catId)) {
      // 如果已经是数组，则确保所有元素都是字符串
      processedCatId = catId.map((id) => id.toString());
    } else if (catId) {
      // 如果是单个值，则转换为包含一个元素的数组
      processedCatId = [catId.toString()];
    }

    nextTick(() => {
      Object.assign(formPackage, {
        name,
        status,
        des,
        order,
        coverImg,
        catId: processedCatId,
        preset,
        isGPTs,
        gizmoID,
        isFixedModel,
        appModel,
        isFlowith,
        flowithId,
        flowithName,
        flowithKey,
        backgroundImg,
        prompt,
        knowledgeBaseUrls: row.knowledgeBaseUrls ? JSON.parse(row.knowledgeBaseUrls) : [], // 解析JSON字符串为数组
      });

      // --- 新增：处理 prompt 模板 ---
      if (isValidJsonTemplate(formPackage.prompt)) {
        try {
          templateFields.value = JSON.parse(formPackage.prompt);
          templateFields.value.forEach((field) => {
            if (!field.id) field.id = uuidv4();
            if (field.title === undefined) field.title = '';
            if (field.type === 'select' && !field.options) field.options = [];
          });
          usePromptTemplate.value = 'template';
        } catch (e) {
          console.error('Failed to parse prompt template:', e);
          // 解析失败，回退到普通模式
          templateFields.value = [];
          usePromptTemplate.value = 'plain';
          // formPackage.prompt 保持原样，让用户看到原始文本
        }
      } else {
        templateFields.value = [];
        usePromptTemplate.value = 'plain';
      }
      // --- 结束：处理 prompt 模板 ---

      // 获取系统知识库列表
      fetchSystemKnowledgeList();
    });

    visible.value = true;
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeAppCatId.value = 0;
    formEl?.resetFields();
    // --- 新增：重置模板状态 ---
    usePromptTemplate.value = 'plain';
    templateFields.value = [];
    // --- 结束：重置模板状态 ---
  }

  async function handleDeletePackage(row: any) {
    await ApiApp.deleteApp({ id: row.id });
    ElMessage.success('删除应用成功');
    queryAppList();
  }

  async function handleStatusChange(row: any) {
    try {
      await ApiApp.updateApp({ id: row.id, status: row.status });
      ElMessage.success('状态更新成功');
    } catch (error) {
      ElMessage.error('状态更新失败');
      row.status = row.status === 1 ? 0 : 1; // 恢复原状态
    }
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    formInline.catId = '';
    queryAppList();
  }

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    if (response && response.data) {
      formPackage.coverImg = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  const handleBackgroundSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    if (response && response.data) {
      formPackage.backgroundImg = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  async function reuploadAppAvatar() {
    if (formPackage.coverImg) {
      try {
        ElMessage.info('正在重新上传应用图标...');
        const originalValue = formPackage.coverImg; // 保存原始值
        const file = await downloadFile(formPackage.coverImg);
        uploadFile(file, handleAvatarSuccess, originalValue);
      } catch (error) {
        console.error('下载应用图标文件失败', error);
        ElMessage.error('重新上传应用图标失败，请检查链接是否有效');
      }
    }
  }

  async function reuploadBackgroundImg() {
    if (formPackage.backgroundImg) {
      try {
        ElMessage.info('正在重新上传背景图片...');
        const originalValue = formPackage.backgroundImg; // 保存原始值
        const file = await downloadFile(formPackage.backgroundImg);
        uploadFile(file, handleBackgroundSuccess, originalValue);
      } catch (error) {
        console.error('下载背景图片文件失败', error);
        ElMessage.error('重新上传背景图片失败，请检查链接是否有效');
      }
    }
  }

  function uploadFile(file: any, successHandler: any, originalValue?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/app')
      .then((response) => {
        // 创建模拟的响应对象，与el-upload期望的结构一致
        successHandler({
          data: response.data,
        });

        // 如果是重新上传场景（有原始值），显示成功消息
        if (originalValue) {
          if (successHandler === handleAvatarSuccess) {
            ElMessage.success('重新上传应用图标成功');
          } else if (successHandler === handleBackgroundSuccess) {
            ElMessage.success('重新上传背景图片成功');
          }
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue) {
          if (successHandler === handleAvatarSuccess) {
            formPackage.coverImg = originalValue;
          } else if (successHandler === handleBackgroundSuccess) {
            formPackage.backgroundImg = originalValue;
          }
        }
      });
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    const form = new FormData();
    form.append('file', file);

    return uploadApi
      .uploadFile(form, 'system/app')
      .then((response) => {
        if (onSuccess) {
          // 对于普通上传（而非重新上传）显示上传成功的消息
          ElMessage.success('上传成功');
          onSuccess(response);
        }
        return response;
      })
      .catch((error) => {
        if (onError) {
          onError(error);
        }
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        return Promise.reject(error);
      });
  };

  async function downloadFile(url: string) {
    const response = await axios.get(url, { responseType: 'blob' });
    let fileName = 'downloaded_file';

    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename="([^"]+)"/.exec(contentDisposition);
      if (matches != null && matches[1]) {
        fileName = matches[1];
      }
    } else {
      fileName = getFileNameFromUrl(url);
    }

    return new File([response.data], fileName, { type: response.data.type });
  }

  function getFileNameFromUrl(url: string | URL) {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  }

  function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        // --- 新增：处理 prompt 模板提交 ---
        let finalPrompt = formPackage.prompt; // 默认使用文本框内容
        if (usePromptTemplate.value === 'template') {
          // 过滤掉选项为空的下拉框 和 占位符为空的字段（可选）
          const cleanedFields = templateFields.value
            .map((field) => ({
              ...field,
              options:
                field.type === 'select'
                  ? (field.options || []).filter((opt) => opt && opt.trim() !== '')
                  : undefined,
            }))
            .filter(
              (field) =>
                field.title &&
                field.title.trim() !== '' &&
                field.placeholder &&
                field.placeholder.trim() !== '',
            );

          if (cleanedFields.length > 0) {
            finalPrompt = JSON.stringify(cleanedFields);
          } else {
            finalPrompt = ''; // 如果模板为空，则提交空字符串
          }
        }
        // --- 结束：处理 prompt 模板提交 ---

        if (activeAppCatId.value) {
          const params = {
            ...formPackage,
            prompt: finalPrompt,
            id: activeAppCatId.value,
            knowledgeBaseUrls: JSON.stringify(formPackage.knowledgeBaseUrls), // 转换为JSON字符串
          }; // 使用处理后的 prompt
          params.catId = params.catId.join(',') as any;
          isUserApp.value && Object.assign(params, { status: userAppStatus.value });
          await ApiApp.updateApp(params);
          ElMessage({ type: 'success', message: '更新应用成功！' });
        } else {
          const newApp = {
            ...formPackage,
            prompt: finalPrompt,
            knowledgeBaseUrls: JSON.stringify(formPackage.knowledgeBaseUrls), // 转换为JSON字符串
          }; // 使用处理后的 prompt
          newApp.catId = newApp.catId.join(',') as any;
          await ApiApp.createApp(newApp);
          ElMessage({ type: 'success', message: '创建新的应用成功！' });
        }
        visible.value = false;
        queryAppList();
      }
    });
  }

  // 获取分类名称
  function getCategoryName(catId: string): string {
    const category = catList.value.find((item) => item.id.toString() === catId);
    return category ? category.name : '';
  }

  // 检查分类是否已被选择
  function isCategorySelected(catId: string): boolean {
    return formPackage.catId.includes(catId);
  }

  // 选择分类
  function selectCategory(catId: string): void {
    if (!isCategorySelected(catId)) {
      formPackage.catId.push(catId);
    }
  }

  // 移除特定分类
  function removeCategory(catId: string): void {
    const index = formPackage.catId.indexOf(catId);
    if (index !== -1) {
      formPackage.catId.splice(index, 1);
    }
  }

  // 清除所有分类选择
  function clearCategory(): void {
    formPackage.catId = [];
  }

  // 检查搜索分类是否已被选择
  function isSearchCategorySelected(catId: string): boolean {
    return formInline.catId === catId;
  }

  // 选择搜索分类
  function selectSearchCategory(catId: string): void {
    formInline.catId = catId;
  }

  // 移除特定搜索分类
  function removeSearchCategory(catId: string): void {
    if (formInline.catId === catId) {
      formInline.catId = '';
    }
  }

  // 清除所有搜索分类
  function clearSearchCategory(): void {
    formInline.catId = '';
  }

  // 获取模型列表
  async function fetchModelList() {
    try {
      const res = await ApiModels.queryModels({
        page: 1,
        size: 1000, // 获取较大的数量以确保获取所有模型
      });
      const { rows } = res.data;
      const uniqueModels = new Set<string>();
      rows.forEach((row: any) => {
        if (row.model) {
          uniqueModels.add(row.model);
        }
      });
      modelOptions.value = Array.from(uniqueModels);
    } catch (error) {
      console.error('获取模型列表失败:', error);
    }
  }

  // --- 新增状态 ---
  const usePromptTemplate = ref<'plain' | 'template'>('plain');
  const templateFields = ref<
    Array<{
      id: string;
      title: string;
      type: 'input' | 'select';
      placeholder: string;
      options?: string[];
    }>
  >([]);
  // --- 结束：新增状态 ---

  // --- Synchronization Watchers ---
  let isUpdatingInternally = false; // Flag to prevent recursive updates

  // Watch for changes in the template editor data
  watch(
    templateFields,
    (newFields) => {
      if (isUpdatingInternally) return;
      if (usePromptTemplate.value === 'template') {
        isUpdatingInternally = true;
        try {
          const cleanedFields = newFields
            .map(({ id, ...rest }) => ({
              // <-- Destructure to exclude id
              ...rest,
              options:
                rest.type === 'select'
                  ? (rest.options || []).filter((opt) => opt != null && opt.trim() !== '')
                  : undefined,
              title: rest.title || '',
              placeholder: rest.placeholder || '',
            }))
            .filter(
              (field) => field.type && field.title.trim() !== '' && field.placeholder.trim() !== '',
            ); // ID is no longer needed here

          if (cleanedFields.length > 0) {
            formPackage.prompt = JSON.stringify(cleanedFields, null, 2); // <-- Use pretty print with 2 spaces
          } else {
            formPackage.prompt = '';
          }
        } catch (e) {
          console.error('Error stringifying template fields:', e);
          formPackage.prompt = '';
        } finally {
          nextTick(() => {
            isUpdatingInternally = false;
          });
        }
      }
    },
    { deep: true },
  );

  // Watch for changes in the plain text prompt
  watch(
    () => formPackage.prompt,
    (newPrompt) => {
      if (isUpdatingInternally) return;
      if (usePromptTemplate.value === 'plain') {
        if (isValidJsonTemplate(newPrompt)) {
          isUpdatingInternally = true;
          try {
            const parsedFields = JSON.parse(newPrompt);
            if (Array.isArray(parsedFields)) {
              parsedFields.forEach((field) => {
                if (!field.id) field.id = uuidv4();
                if (field.title === undefined) field.title = '';
                if (field.placeholder === undefined) field.placeholder = '';
                if (field.type === 'select' && !Array.isArray(field.options)) field.options = [];
              });
              templateFields.value = parsedFields;
            } // else: Parsed but not array, do nothing to templateFields
          } catch (e) {
            console.error('Error parsing prompt JSON for template fields:', e);
            // templateFields.value = []; // Optionally clear on error
          } finally {
            nextTick(() => {
              isUpdatingInternally = false;
            });
          }
        }
        // else { // Optionally clear templateFields if plain text is not valid JSON
        //     templateFields.value = [];
        // }
      }
    },
  );

  // Refine the mode switch watcher for initial sync on switch
  watch(usePromptTemplate, (newValue, oldValue) => {
    isUpdatingInternally = true;
    if (newValue === 'template') {
      // Switching to template mode: Try to parse plain text content
      if (isValidJsonTemplate(formPackage.prompt)) {
        try {
          const parsedFields = JSON.parse(formPackage.prompt);
          if (Array.isArray(parsedFields)) {
            parsedFields.forEach((field) => {
              if (!field.id) field.id = uuidv4();
              if (field.title === undefined) field.title = '';
              if (field.placeholder === undefined) field.placeholder = '';
              if (field.type === 'select' && !Array.isArray(field.options)) field.options = [];
            });
            templateFields.value = parsedFields;
          } else {
            templateFields.value = [];
          }
        } catch (e) {
          templateFields.value = [];
        }
      } // else: Keep existing templateFields if plain text is invalid/empty
    } else {
      // newValue === 'plain'
      // Switching to plain mode: Stringify template editor content
      const cleanedFields = templateFields.value
        .map(({ id, ...rest }) => ({
          // <-- Destructure to exclude id
          ...rest,
          options:
            rest.type === 'select'
              ? (rest.options || []).filter((opt) => opt != null && opt.trim() !== '')
              : undefined,
          title: rest.title || '',
          placeholder: rest.placeholder || '',
        }))
        .filter(
          (field) => field.type && field.title.trim() !== '' && field.placeholder.trim() !== '',
        ); // ID is no longer needed here

      if (cleanedFields.length > 0) {
        formPackage.prompt = JSON.stringify(cleanedFields, null, 2); // <-- Use pretty print with 2 spaces
      } else {
        formPackage.prompt = '';
      }
    }
    nextTick(() => {
      isUpdatingInternally = false;
    });
  });
  // --- 结束：监听模板模式切换 ---

  // --- Computed property for placeholder ---
  const plainModePlaceholder = computed(() => {
    return `请按以下JSON格式输入模板，或切换到"模板模式"进行可视化编辑：
[
  {
    "type": "input",
    "title": "字段名称",
    "placeholder": "输入提示文字"
  },
  {
    "type": "select",
    "title": "下拉框名称",
    "placeholder": "下拉提示",
    "options": ["选项1", "选项2"]
  }
]`;
  });
  // --- End computed property ---

  // --- AI优化功能 ---
  async function optimizeAppWithAI() {
    if (!formPackage.name || !formPackage.name.trim()) {
      ElMessage.warning('请先输入应用名称');
      return;
    }

    aiOptimizing.value = true;

    try {
      const existingApp = {
        name: formPackage.name,
        des: formPackage.des,
        preset: formPackage.preset,
        prompt: formPackage.prompt,
      };

      const { system, messages } = buildAppOptimizationMessage(existingApp);
      const response = await api.post('chatgpt/system-chat', { system, messages });
      const aiContent = response.data.choices[0].message.content;
      const optimizedConfig = parseAppOptimizationResponse(aiContent);

      // 填充表单
      formPackage.name = optimizedConfig.name;
      formPackage.des = optimizedConfig.description;
      formPackage.preset = optimizedConfig.preset;

      // 处理提问模板（JSON数组格式）
      if (Array.isArray(optimizedConfig.prompt) && optimizedConfig.prompt.length > 0) {
        // 为每个字段添加 id
        optimizedConfig.prompt.forEach((field: any) => {
          if (!field.id) field.id = uuidv4();
        });
        templateFields.value = optimizedConfig.prompt;

        // 生成清理后的 JSON 字符串（去除 id 字段）
        const cleanedFields = optimizedConfig.prompt.map(({ id, ...rest }: any) => rest);
        formPackage.prompt = JSON.stringify(cleanedFields, null, 2);
        usePromptTemplate.value = 'template';
      }

      ElMessage.success('AI优化成功，已自动填充表单');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        ElMessage.error('AI优化功能需要超级管理员权限');
      } else if (error?.response?.status === 401) {
        ElMessage.error('登录已过期，请重新登录');
      } else {
        ElMessage.error('AI优化失败：' + (error?.message || '未知错误'));
      }
    } finally {
      aiOptimizing.value = false;
    }
  }
  // --- 结束：AI优化功能 ---

  // ========== 分类管理相关 ==========
  const classifyFormRef = ref<FormInstance>();
  const classifyTotal = ref(0);
  const classifyVisible = ref(false);
  const classifyLoading = ref(false);

  const classifyFormInline = reactive({
    name: '',
    status: '',
    page: 1,
    size: 10,
  });

  const classifyFormPackageRef = ref<FormInstance>();
  const activeClassifyId = ref(0);
  const classifyFormPackage = reactive({
    name: '',
    des: '',
    coverImg: '',
    order: 100,
    status: 0,
    isMember: 0,
    hideFromNonMember: 0,
  });

  const classifyRules = reactive<FormRules>({
    name: [{ required: true, message: '请填写分类名称', trigger: 'blur' }],
    des: [{ required: false, message: '请填写分类描述', trigger: 'blur' }],
    coverImg: [{ required: false, message: '请填写分类封面图片地址', trigger: 'blur' }],
    order: [{ required: false, message: '请填写排序ID', trigger: 'blur' }],
    status: [{ required: true, message: '请选择分类状态', trigger: 'change' }],
  });

  const classifyTableData = ref([]);

  const classifyDialogTitle = computed(() => {
    return activeClassifyId.value ? '更新分类' : '新增分类';
  });

  const classifyDialogButton = computed(() => {
    return activeClassifyId.value ? '确认更新' : '确认新增';
  });

  async function queryClassifyList() {
    try {
      classifyLoading.value = true;
      const res = await ApiApp.queryCats(classifyFormInline);
      const { rows, count } = res.data;
      classifyLoading.value = false;
      classifyTotal.value = count;
      classifyTableData.value = rows;
    } catch (error) {
      classifyLoading.value = false;
    }
  }

  function handleUpdateClassify(row: any) {
    activeClassifyId.value = row.id;
    const { name, status, des, order, coverImg, isMember, hideFromNonMember } = row;
    nextTick(() => {
      Object.assign(classifyFormPackage, {
        name,
        status,
        des,
        order,
        coverImg,
        isMember,
        hideFromNonMember,
      });
    });
    classifyVisible.value = true;
  }

  function handlerCloseClassifyDialog(formEl: FormInstance | undefined) {
    activeClassifyId.value = 0;
    formEl?.resetFields();
  }

  async function handleDeleteClassify(row: any) {
    await ApiApp.deleteCats({ id: row.id });
    ElMessage.success('删除分类成功');
    queryClassifyList();
  }

  async function handleClassifyStatusChange(row: any) {
    try {
      await ApiApp.updateCats({ id: row.id, status: row.status });
      ElMessage.success('状态更新成功');
    } catch (error) {
      ElMessage.error('状态更新失败');
      row.status = row.status === 1 ? 0 : 1;
    }
  }

  function handlerResetClassify(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryClassifyList();
  }

  async function handlerSubmitClassify(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        if (activeClassifyId.value) {
          const params = { ...classifyFormPackage, id: activeClassifyId.value };
          await ApiApp.updateCats(params);
          ElMessage({ type: 'success', message: '更新分类成功！' });
        } else {
          await ApiApp.createCats(classifyFormPackage);
          ElMessage({ type: 'success', message: '创建新的分类成功！' });
        }
        classifyVisible.value = false;
        queryClassifyList();
      }
    });
  }

  // Watch tab changes
  watch(activeTab, (newTab) => {
    if (newTab === 'application') {
      queryAppList();
      queryCatList();
      fetchModelList();
    } else if (newTab === 'classify') {
      queryClassifyList();
    }
  });

  // 知识库相关函数
  // 判断知识库是否已选择
  function isKnowledgeBaseSelected(fileUrl: string): boolean {
    return formPackage.knowledgeBaseUrls.includes(fileUrl);
  }

  // 切换知识库选择状态
  function toggleKnowledgeBase(fileUrl: string) {
    const index = formPackage.knowledgeBaseUrls.indexOf(fileUrl);
    if (index > -1) {
      formPackage.knowledgeBaseUrls.splice(index, 1);
    } else {
      formPackage.knowledgeBaseUrls.push(fileUrl);
    }
  }

  // 移除已选择的知识库
  function removeKnowledgeBase(index: number) {
    formPackage.knowledgeBaseUrls.splice(index, 1);
  }

  // 获取知识库名称
  function getKnowledgeBaseName(fileUrl: string): string {
    const kb = knowledgeBaseList.value.find((item) => item.fileUrl === fileUrl);
    return kb ? kb.originalFileName || kb.fileName : fileUrl;
  }

  // 打开上传文件对话框
  const selectedFile = ref<File | null>(null);

  function openUploadFileDialog() {
    selectedFile.value = null;
    uploadFileDialogVisible.value = true;
  }

  // 处理文件选择
  function handleFileChange(file: any) {
    selectedFile.value = file.raw;
  }

  // 上传文件到知识库
  async function handleUploadFile() {
    if (!selectedFile.value) {
      ElMessage.warning('请先选择文件');
      return;
    }

    try {
      uploadFileLoading.value = true;

      // 先上传文件获取URL
      const formData = new FormData();
      formData.append('file', selectedFile.value);

      const uploadRes: any = await uploadApi.uploadFile(formData, 'system/knowledge');

      // 检查上传响应
      if (uploadRes?.data) {
        const fileUrl = uploadRes.data; // 直接使用返回的 URL 字符串
        const originalFileName = selectedFile.value.name;
        ElMessage.success('文件上传成功，正在向量化...');

        // 调用知识库API进行自动向量化
        const vectorRes: any = await knowledgeApi.uploadAndVectorize(fileUrl, originalFileName);

        if (vectorRes.success) {
          ElMessage.success(vectorRes.message || '文件向量化完成！');
          uploadFileDialogVisible.value = false;

          // 刷新知识库列表
          await fetchSystemKnowledgeList();

          // 自动选择刚上传的文件
          if (fileUrl && !formPackage.knowledgeBaseUrls.includes(fileUrl)) {
            formPackage.knowledgeBaseUrls.push(fileUrl);
          }
        } else {
          throw new Error(vectorRes.message || '向量化失败');
        }
      } else {
        ElMessage.error('文件上传失败：未获取到文件URL');
      }
    } catch (error: any) {
      console.error('上传错误:', error);
      ElMessage.error(error.message || error.data?.message || '文件上传失败');
    } finally {
      uploadFileLoading.value = false;
    }
  }

  onMounted(() => {
    if (activeTab.value === 'application') {
      queryAppList();
      queryCatList();
      fetchModelList();
    } else {
      queryClassifyList();
    }
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          应用中心
        </div>
      </template>
      <HButton v-if="activeTab === 'application'" outline @click="visible = true">
        <SvgIcon name="ic:baseline-plus" />
        新增应用
      </HButton>
      <HButton v-if="activeTab === 'classify'" outline @click="classifyVisible = true">
        <SvgIcon name="ic:baseline-plus" />
        新增分类
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <!-- 查询表单区域 -->
      <div class="mb-4">
        <!-- 应用管理查询表单 -->
        <el-form
          v-if="activeTab === 'application'"
          ref="formRef"
          :inline="true"
          :model="formInline"
        >
          <el-form-item label="App分类" prop="catId">
            <el-select
              v-model="formInline.catId"
              placeholder="请选择App分类"
              clearable
              style="width: 240px"
            >
              <el-option
                v-for="item in catList"
                :key="item.id"
                :label="item.name"
                :value="item.id.toString()"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="App名称" prop="name">
            <el-input
              v-model="formInline.name"
              placeholder="App名称[模糊搜索]"
              clearable
              @keydown.enter.prevent="queryAppList"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryAppList">查询</el-button>
            <el-button @click="handlerReset(formRef)">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 分类管理查询表单 -->
        <el-form
          v-if="activeTab === 'classify'"
          ref="classifyFormRef"
          :inline="true"
          :model="classifyFormInline"
        >
          <el-form-item label="分类名称" prop="name">
            <el-input
              v-model="classifyFormInline.name"
              placeholder="分类名称[模糊搜索]"
              clearable
              @keydown.enter.prevent="queryClassifyList"
            />
          </el-form-item>
          <el-form-item label="分类状态" prop="status">
            <el-select
              v-model="classifyFormInline.status"
              placeholder="请选择分类状态"
              clearable
              style="width: 160px"
            >
              <el-option
                v-for="item in ENABLE_STATUS_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryClassifyList">查询</el-button>
            <el-button @click="handlerResetClassify(classifyFormRef)">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- Tab 切换区域 -->
      <el-tabs v-model="activeTab">
        <el-tab-pane label="应用管理" name="application">
          <el-table
            v-loading="loading"
            border
            :data="tableData"
            style="width: 100%; margin-top: 16px"
            size="large"
          >
            <el-table-column prop="coverImg" label="应用封面" width="100">
              <template #default="scope">
                <el-image style="height: 50px" :src="scope.row.coverImg" fit="fill" />
              </template>
            </el-table-column>
            <el-table-column prop="catName" label="应用分类" width="120">
              <template #default="scope">
                <el-tooltip
                  v-if="scope.row.catName && scope.row.catName.includes(',')"
                  class="box-item"
                  effect="dark"
                  placement="top-start"
                >
                  <template #content>
                    <div :style="{ maxWidth: '250px' }">
                      {{ scope.row.catName }}
                    </div>
                  </template>
                  <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                    {{ scope.row.catName }}
                  </div>
                </el-tooltip>
                <span v-else>{{ scope.row.catName }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="应用名称" width="120" />
            <!-- <el-table-column prop="public" label="是否共享" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.public ? 'success' : 'info'">
              {{ scope.row.public ? '共享' : '私有' }}
            </el-tag>
          </template>
        </el-table-column> -->
            <!-- <el-table-column prop="public" label="应用创建角色" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.role === 'system' ? 'success' : 'info'">
              {{ scope.row.role === 'system' ? '系统' : '用户' }}
            </el-tag>
          </template>
        </el-table-column> -->
            <el-table-column prop="order" label="排序ID" /> />
            <el-table-column prop="preset" label="预设信息" width="400">
              <template #default="scope">
                <el-tooltip class="box-item" effect="dark" placement="top-start">
                  <template #content>
                    <div :style="{ maxWidth: '350px' }">
                      {{ scope.row.preset }}
                    </div>
                  </template>
                  <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                    {{ scope.row.preset }}
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>

            <el-table-column prop="des" label="描述信息" width="300">
              <template #default="scope">
                <el-tooltip class="box-item" effect="dark" placement="top-start">
                  <template #content>
                    <div :style="{ maxWidth: '350px' }">
                      {{ scope.row.des }}
                    </div>
                  </template>
                  <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
                    {{ scope.row.des }}
                  </div>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-switch
                  v-model="row.status"
                  :active-value="1"
                  :inactive-value="0"
                  @change="handleStatusChange(row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right" align="center">
              <template #default="scope">
                <el-button
                  v-if="scope.row.role === 'system' || scope.row.public"
                  link
                  type="primary"
                  size="small"
                  @click="handleUpdatePackage(scope.row)"
                >
                  编辑
                </el-button>
                <el-popconfirm
                  v-if="scope.row.role === 'system'"
                  title="确认删除此应用么?"
                  width="200"
                  icon-color="red"
                  @confirm="handleDeletePackage(scope.row)"
                >
                  <template #reference>
                    <el-button link type="danger" size="small"> 删除应用 </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <el-row class="mt-5 flex justify-end">
            <el-pagination
              v-model:current-page="formInline.page"
              v-model:page-size="formInline.size"
              class="mr-5"
              :page-sizes="[10, 20, 30, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="total"
              @size-change="queryAppList"
              @current-change="queryAppList"
            />
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="应用分类" name="classify">
          <el-table
            v-loading="classifyLoading"
            border
            :data="classifyTableData"
            style="width: 100%; margin-top: 16px"
            size="large"
          >
            <el-table-column prop="name" label="分类名称" />
            <el-table-column prop="des" label="分类描述">
              <template #default="scope">
                <span>{{ scope.row.des || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="order" label="排序ID" />
            <el-table-column prop="isMember" label="会员分类" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.isMember ? 'warning' : 'info'">
                  {{ scope.row.isMember ? '会员' : '普通' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="hideFromNonMember" label="仅会员可见" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.hideFromNonMember ? 'danger' : 'success'">
                  {{ scope.row.hideFromNonMember ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" align="center">
              <template #default="{ row }">
                <el-switch
                  v-model="row.status"
                  :active-value="1"
                  :inactive-value="0"
                  @change="handleClassifyStatusChange(row)"
                />
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间">
              <template #default="scope">
                <span>{{ utcToShanghaiTime(scope.row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" fixed="right" align="center">
              <template #default="scope">
                <el-button
                  link
                  type="primary"
                  size="small"
                  @click="handleUpdateClassify(scope.row)"
                >
                  编辑
                </el-button>
                <el-popconfirm
                  title="确认删除此分类么?"
                  width="200"
                  icon-color="red"
                  @confirm="handleDeleteClassify(scope.row)"
                >
                  <template #reference>
                    <el-button link type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <el-row class="mt-5 flex justify-end">
            <el-pagination
              v-model:current-page="classifyFormInline.page"
              v-model:page-size="classifyFormInline.size"
              class="mr-5"
              :page-sizes="[10, 20, 30, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="classifyTotal"
              @size-change="queryClassifyList"
              @current-change="queryClassifyList"
            />
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 应用管理对话框 -->
    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      fullscreen
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
        class="app-form-container"
      >
        <el-row :gutter="24">
          <!-- 左栏：基础信息 + 模型配置 -->
          <el-col :span="12" class="left-column">
            <!-- App名称（带AI优化） -->
            <el-form-item label="App名称" prop="name">
              <div class="flex gap-2 w-full">
                <el-input v-model="formPackage.name" placeholder="请填写App名称" class="flex-1" />
                <el-button
                  type="primary"
                  :icon="MagicStick"
                  :disabled="!formPackage.name || aiOptimizing"
                  :loading="aiOptimizing"
                  @click="optimizeAppWithAI"
                >
                  AI优化
                </el-button>
              </div>
            </el-form-item>

            <!-- App状态和排序ID -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item v-if="!isUserApp" label="App状态" prop="status">
                  <el-switch v-model="formPackage.status" :active-value="1" :inactive-value="0" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="排序ID" prop="order">
                  <el-input v-model.number="formPackage.order" placeholder="排序ID" />
                </el-form-item>
              </el-col>
            </el-row>

            <!-- App分类 -->
            <el-form-item label="App分类" prop="catId">
              <div class="category-selector">
                <div class="selected-categories mb-2">
                  <el-tag
                    v-for="catId in formPackage.catId"
                    :key="catId"
                    closable
                    class="mr-1 mb-1"
                    @close="removeCategory(catId)"
                  >
                    {{ getCategoryName(catId) }}
                  </el-tag>
                  <div v-if="formPackage.catId.length === 0" class="text-gray-400 text-sm">
                    请选择分类
                  </div>
                </div>
                <div class="category-options p-2 border rounded-md max-h-32 overflow-y-auto">
                  <div class="text-sm text-gray-500 mb-2">可选分类：</div>
                  <el-tag
                    v-for="item in catList"
                    :key="item.id"
                    :class="[
                      'mr-1 mb-1 cursor-pointer',
                      isCategorySelected(item.id.toString()) ? 'is-disabled' : '',
                    ]"
                    :effect="isCategorySelected(item.id.toString()) ? 'plain' : 'dark'"
                    @click="selectCategory(item.id.toString())"
                  >
                    {{ item.name }}
                  </el-tag>
                </div>
              </div>
            </el-form-item>

            <!-- App描述 -->
            <el-form-item label="App描述" prop="des">
              <el-input
                v-model="formPackage.des"
                type="textarea"
                placeholder="请填写App介绍信息..."
                :rows="3"
              />
            </el-form-item>

            <!-- App预设 -->
            <el-form-item v-if="specialModelType !== 'gpts'" label="App预设" prop="preset">
              <el-input
                v-model="formPackage.preset"
                type="textarea"
                placeholder="请填写App预设信息..."
                :rows="3"
              />
            </el-form-item>

            <!-- 模型配置区 -->
            <div class="form-section">
              <!-- 特殊模型选择 -->
              <el-form-item v-if="!isUserApp" label="特殊模型" prop="specialModel">
                <el-radio-group v-model="specialModelType">
                  <el-radio label="none">不使用</el-radio>
                  <el-radio label="gpts">GPTs</el-radio>
                  <el-radio label="flowith">Flowith</el-radio>
                </el-radio-group>
              </el-form-item>

              <!-- 普通模型配置 -->
              <template v-if="specialModelType === 'none'">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="固定模型" prop="isFixedModel">
                      <el-switch
                        v-model="formPackage.isFixedModel"
                        :active-value="1"
                        :inactive-value="0"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item
                      label="使用模型"
                      prop="appModel"
                      v-if="Number(formPackage.isFixedModel) === 1"
                    >
                      <el-select
                        v-model="formPackage.appModel"
                        filterable
                        allow-create
                        placeholder="选择模型"
                        clearable
                      >
                        <el-option
                          v-for="item in modelOptions"
                          :key="item"
                          :label="item"
                          :value="item"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </template>

              <!-- GPTs模型配置 -->
              <el-form-item v-if="specialModelType === 'gpts'" label="gizmoID" prop="gizmoID">
                <el-input v-model="formPackage.gizmoID" placeholder="请填写 GPTs 使用的 gizmoID" />
              </el-form-item>

              <!-- Flowith模型配置 -->
              <template v-if="specialModelType === 'flowith'">
                <el-form-item label="模型ID" prop="flowithId">
                  <el-input v-model="formPackage.flowithId" placeholder="Flowith模型ID" />
                </el-form-item>
                <el-form-item label="模型名称" prop="flowithName">
                  <el-input v-model="formPackage.flowithName" placeholder="Flowith模型名称" />
                </el-form-item>
                <el-form-item label="模型密钥" prop="flowithKey">
                  <el-input v-model="formPackage.flowithKey" placeholder="Flowith模型密钥" />
                </el-form-item>
              </template>
            </div>
          </el-col>

          <!-- 右栏：视觉资源 + 知识库 + 提问模板 -->
          <el-col :span="12" class="right-column">
            <!-- 视觉资源区 -->
            <div class="form-section">
              <el-form-item label="应用图标" prop="coverImg">
                <el-input v-model="formPackage.coverImg" placeholder="填写或上传图标" clearable>
                  <template #append>
                    <el-upload
                      class="avatar-uploader"
                      :http-request="customUpload"
                      :show-file-list="false"
                      :on-success="handleAvatarSuccess"
                      :before-upload="beforeAvatarUpload"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon"
                      style="
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        vertical-align: middle;
                      "
                    >
                      <img
                        v-if="formPackage.coverImg"
                        :src="formPackage.coverImg"
                        style="
                          max-width: 1.5rem;
                          max-height: 1.5rem;
                          margin: 5px 0;
                          object-fit: contain;
                        "
                      />
                      <el-icon v-else style="width: 1rem">
                        <Plus />
                      </el-icon>
                    </el-upload>
                    <el-icon
                      v-if="formPackage.coverImg"
                      @click="reuploadAppAvatar"
                      style="
                        margin-left: 10px;
                        width: 1rem;
                        cursor: pointer;
                        vertical-align: middle;
                      "
                      class="hover:text-primary"
                    >
                      <Refresh />
                    </el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="App背景图" prop="backgroundImg">
                <el-input
                  v-model="formPackage.backgroundImg"
                  placeholder="填写或上传背景图"
                  clearable
                >
                  <template #append>
                    <el-upload
                      class="avatar-uploader"
                      :http-request="customUpload"
                      :show-file-list="false"
                      :on-success="handleBackgroundSuccess"
                      :before-upload="beforeAvatarUpload"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon"
                      style="
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        vertical-align: middle;
                      "
                    >
                      <img
                        v-if="formPackage.backgroundImg"
                        :src="formPackage.backgroundImg"
                        style="
                          max-width: 1.5rem;
                          max-height: 1.5rem;
                          margin: 5px 0;
                          object-fit: contain;
                        "
                      />
                      <el-icon v-else style="width: 1rem">
                        <Plus />
                      </el-icon>
                    </el-upload>
                    <el-icon
                      v-if="formPackage.backgroundImg"
                      @click="reuploadBackgroundImg"
                      style="
                        margin-left: 10px;
                        width: 1rem;
                        cursor: pointer;
                        vertical-align: middle;
                      "
                      class="hover:text-primary"
                    >
                      <Refresh />
                    </el-icon>
                  </template>
                </el-input>
              </el-form-item>
            </div>

            <!-- 知识库配置区 -->
            <div class="form-section">
              <el-form-item label="知识库文件">
                <div class="w-full">
                  <div class="mb-2 flex items-center gap-2">
                    <el-button size="small" @click="openUploadFileDialog">
                      <Plus class="mr-1" />
                      上传新文件
                    </el-button>
                    <el-button size="small" @click="fetchSystemKnowledgeList">
                      <Refresh class="mr-1" />
                      刷新列表
                    </el-button>
                  </div>

                  <!-- 已选择的知识库列表 -->
                  <div v-if="formPackage.knowledgeBaseUrls.length > 0" class="mb-2">
                    <div class="text-sm text-gray-500 mb-1">已选择的知识库：</div>
                    <div class="flex flex-wrap gap-2">
                      <el-tag
                        v-for="(url, index) in formPackage.knowledgeBaseUrls"
                        :key="index"
                        closable
                        @close="removeKnowledgeBase(index)"
                        class="max-w-md"
                      >
                        {{ getKnowledgeBaseName(url) }}
                      </el-tag>
                    </div>
                  </div>

                  <!-- 知识库选择列表 -->
                  <div
                    v-loading="knowledgeBaseLoading"
                    class="border rounded-md p-3 max-h-48 overflow-y-auto bg-gray-50"
                  >
                    <div
                      v-if="knowledgeBaseList.length === 0"
                      class="text-center text-gray-400 py-4"
                    >
                      暂无系统知识库，请先上传文件
                    </div>
                    <div v-else>
                      <div
                        v-for="item in knowledgeBaseList"
                        :key="item.id"
                        class="flex items-center justify-between p-2 mb-2 bg-white rounded hover:bg-gray-100"
                      >
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium truncate">
                            {{ item.originalFileName || item.fileName }}
                          </div>
                          <div class="text-xs text-gray-500 truncate">
                            {{ item.fileUrl }}
                          </div>
                        </div>
                        <el-button
                          size="small"
                          :type="isKnowledgeBaseSelected(item.fileUrl) ? 'primary' : 'default'"
                          @click="toggleKnowledgeBase(item.fileUrl)"
                        >
                          {{ isKnowledgeBaseSelected(item.fileUrl) ? '已选择' : '选择' }}
                        </el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </el-form-item>
            </div>

            <!-- 提问模版区 -->
            <div class="form-section flex-1">
              <el-form-item label="模版类型" prop="prompt">
                <el-radio-group v-model="usePromptTemplate" size="small">
                  <el-radio-button label="plain">普通模式</el-radio-button>
                  <el-radio-button label="template">模板模式</el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="模版内容">
                <!-- Plain Mode Textarea -->
                <el-input
                  v-show="usePromptTemplate === 'plain'"
                  v-model="formPackage.prompt"
                  type="textarea"
                  :placeholder="plainModePlaceholder"
                  :rows="10"
                />
                <!-- Template Mode Editor -->
                <div v-show="usePromptTemplate === 'template'" class="template-editor-wrapper">
                  <PromptTemplateEditor v-model="templateFields" />
                </div>
              </el-form-item>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button size="large" @click="visible = false">取消</el-button>
          <el-button type="primary" size="large" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 上传文件到知识库对话框 -->
    <el-dialog
      v-model="uploadFileDialogVisible"
      title="上传文件到系统知识库"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="选择文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :on-change="handleFileChange"
            :limit="1"
            accept=".pdf,.doc,.docx,.txt,.md"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="text-xs text-gray-500 mt-1">
                支持 PDF、Word、TXT、Markdown 格式，文件将被上传到系统知识库并自动向量化
              </div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <span>
          <el-button @click="uploadFileDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="uploadFileLoading" @click="handleUploadFile">
            确认上传
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 分类管理对话框 -->
    <el-dialog
      v-model="classifyVisible"
      :close-on-click-modal="false"
      :title="classifyDialogTitle"
      width="50%"
      @close="handlerCloseClassifyDialog(classifyFormPackageRef)"
    >
      <el-form
        ref="classifyFormPackageRef"
        :model="classifyFormPackage"
        :rules="classifyRules"
        label-position="right"
        label-width="100px"
      >
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="classifyFormPackage.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="分类描述" prop="des">
          <el-input
            v-model="classifyFormPackage.des"
            :rows="3"
            type="textarea"
            placeholder="请输入分类描述"
          />
        </el-form-item>
        <el-form-item label="封面图片" prop="coverImg">
          <el-input v-model="classifyFormPackage.coverImg" placeholder="请输入封面图片地址" />
        </el-form-item>
        <el-form-item label="排序ID" prop="order">
          <el-input-number v-model="classifyFormPackage.order" :min="0" :max="1000" />
        </el-form-item>
        <el-form-item label="会员分类" prop="isMember">
          <el-switch v-model="classifyFormPackage.isMember" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="仅会员可见" prop="hideFromNonMember">
          <el-switch
            v-model="classifyFormPackage.hideFromNonMember"
            :active-value="1"
            :inactive-value="0"
          />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch v-model="classifyFormPackage.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="classifyVisible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmitClassify(classifyFormPackageRef)">
            {{ classifyDialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .category-selector {
    width: 100%;
  }

  .selected-categories {
    min-height: 32px;
    padding: 4px 0;
  }

  .category-options .el-tag {
    transition: all 0.3s;
  }

  .category-options .el-tag:not(.is-disabled):hover {
    transform: scale(1.05);
  }

  .category-options .el-tag.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* 全屏表单容器样式 */
  .app-form-container {
    height: calc(100vh - 120px);
    overflow-y: auto;
    padding: 0 12px;
  }

  .app-form-container :deep(.el-form-item__label) {
    font-weight: 500;
  }

  /* 左右两栏布局 */
  .left-column,
  .right-column {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
  }

  /* 表单分组区块 */
  .form-section {
    padding: 0;
  }

  /* 模板编辑器样式 */
  .template-editor-wrapper {
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    background: #fff;
    /* 减少内边距，让编辑器更宽 */
    padding: 8px;
    min-height: 200px;
    max-height: 400px;
    overflow-y: auto;
    /* 确保容器占满整个表单项内容区的宽度 */
    width: 100%;
  }

  /* 确保表单项内容区占满宽度 */
  .form-section .el-form-item__content {
    width: 100%;
  }

  /* 优化滚动条样式 */
  .app-form-container::-webkit-scrollbar,
  .category-options::-webkit-scrollbar,
  .template-editor-wrapper::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .app-form-container::-webkit-scrollbar-thumb,
  .category-options::-webkit-scrollbar-thumb,
  .template-editor-wrapper::-webkit-scrollbar-thumb {
    background: #dcdfe6;
    border-radius: 3px;
  }

  .app-form-container::-webkit-scrollbar-thumb:hover,
  .category-options::-webkit-scrollbar-thumb:hover,
  .template-editor-wrapper::-webkit-scrollbar-thumb:hover {
    background: #c0c4cc;
  }
</style>
