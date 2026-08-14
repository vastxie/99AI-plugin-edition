<route lang="yaml">
meta:
  title: 插件管理
</route>

<script lang="ts" setup>
  import ApiModels from '@/api/modules/models';
  import ApiPlugin from '@/api/modules/plugin';
  import uploadApi from '@/api/modules/upload';
  import { Plus, Refresh } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules, UploadProps } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, type Ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { sanitizeSvgContent } from '@/utils/sanitizeMarkdown';

  import { QUESTION_STATUS_MAP } from '@/constants/index';
  import axios from 'axios';

  const router = useRouter();
  const formRef = ref<FormInstance>();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);

  // 动态参数选项列表
  const parameterOptions = ref<string[]>(['mind-map', 'mermaid', 'ppt-generation']);

  const formInline = reactive({
    name: '',
    pluginImg: '',
    description: '',
    demoData: '',
    isEnabled: 1,
    parameters: '',
    sortOrder: 100,
    page: 1,
    size: 10,
  });
  // const uploadUrl = ref(`${import.meta.env.VITE_APP_API_BASEURL}/upload/file`);
  const uploadUrl = ref(
    `${import.meta.env.VITE_APP_API_BASEURL}/upload/file?dir=${encodeURIComponent(
      'system/plugin',
    )}`,
  );

  const formPackageRef = ref<FormInstance>();
  const activeAppCatId = ref(0);
  const isUserApp = ref(false);
  const userAppStatus = ref(0);
  const formPackage = reactive({
    name: '',
    pluginImg: '',
    description: '',
    demoData: '',
    isEnabled: 1,
    parameters: '',
    sortOrder: 100,
    uploadTypes: [] as string[], // 添加 uploadTypes 字段
  });

  // 上传类型选项
  const uploadTypeOptions = [
    { label: '文件', value: 'file' },
    { label: '图片', value: 'image' },
    { label: '视频', value: 'video' },
  ];

  // SVG 源码检测和处理
  const isSvgCode = (content: string): boolean => {
    if (!content) return false;
    const trimmed = content.trim();
    return trimmed.startsWith('<svg') && trimmed.includes('</svg>');
  };

  const isSvgUrl = (url: string): boolean => {
    if (!url) return false;
    const urlWithoutQuery = url.split('?')[0].toLowerCase();
    return urlWithoutQuery.endsWith('.svg');
  };

  const sanitizeSvg = (svgText: string): string => {
    return sanitizeSvgContent(svgText);
  };

  const pluginImgPreview = computed(() => {
    if (!formPackage.pluginImg) return '';
    if (isSvgCode(formPackage.pluginImg)) {
      return sanitizeSvg(formPackage.pluginImg);
    }
    return formPackage.pluginImg;
  });

  const shouldRenderSvg = computed(() => {
    return isSvgCode(formPackage.pluginImg);
  });

  const rules = reactive<FormRules>({
    name: [{ required: true, message: '请填写App名称', trigger: 'blur' }],
    description: [
      {
        required: true,
        message: '请填写App介绍信息、用于对外展示',
        trigger: 'blur',
      },
    ],
    pluginImg: [{ required: false, message: '请上传插件封面', trigger: 'blur' }],
    demoData: [{ required: false, message: '请填写演示数据', trigger: 'blur' }],
    isEnabled: [
      {
        required: true,
        type: 'number',
        message: '请选择插件状态',
        trigger: 'change',
      },
    ],
    parameters: [{ required: true, message: '请填写调用参数', trigger: 'blur' }],
    sortOrder: [
      {
        required: true,
        type: 'number',
        message: '请填写排序值',
        trigger: 'change',
      },
    ],
  });

  const tableData = ref([]);

  interface CatItem {
    id: number;
    name: string;
  }
  const catList: Ref<CatItem[]> = ref([]);

  const dialogTitle = computed(() => {
    return activeAppCatId.value ? '更新插件' : '新增插件';
  });

  const dialogButton = computed(() => {
    return activeAppCatId.value ? '确认更新' : '确认新增';
  });

  async function queryAppList() {
    try {
      loading.value = true;
      const res = await ApiPlugin.pluginList(formInline);
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

  function handleUpdatePackage(row: any) {
    activeAppCatId.value = row.id;
    isUserApp.value = row.role === 'user';
    userAppStatus.value = row.status;
    const {
      name,
      pluginImg,
      description,
      demoData,
      isEnabled,
      parameters,
      sortOrder,
      uploadTypes,
    } = row;
    nextTick(() => {
      Object.assign(formPackage, {
        name,
        pluginImg,
        description,
        demoData,
        isEnabled,
        parameters,
        sortOrder,
        uploadTypes: uploadTypes ? uploadTypes.split(',').map((t: string) => t.trim()) : [], // 解析 uploadTypes
      });
    });
    visible.value = true;
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeAppCatId.value = 0;
    formEl?.resetFields();
  }

  async function handleDeletePackage(row: any) {
    await ApiPlugin.delPlugin({ id: row.id });
    ElMessage.success('删除分类成功');
    queryAppList();
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryAppList();
  }

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    if (response && response.data) {
      formPackage.pluginImg = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  async function reuploadPluginAvatar() {
    if (formPackage.pluginImg) {
      try {
        ElMessage.info('正在重新上传插件图标...');
        const originalValue = formPackage.pluginImg; // 保存原始值
        const file = await downloadFile(formPackage.pluginImg);
        uploadFile(file, handleAvatarSuccess, originalValue);
      } catch (error) {
        console.error('下载插件图标文件失败', error);
        ElMessage.error('重新上传插件图标失败，请检查链接是否有效');
      }
    }
  }

  function uploadFile(file: any, successHandler: any, originalValue?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/plugin')
      .then((response) => {
        // 创建模拟的响应对象，与el-upload期望的结构一致
        successHandler({
          data: response.data,
        });

        // 如果是重新上传场景（有原始值），显示成功消息
        if (originalValue) {
          ElMessage.success('重新上传插件图标成功');
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue && successHandler === handleAvatarSuccess) {
          formPackage.pluginImg = originalValue;
        }
      });
  }

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

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/svg+xml',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP、ICO 和 SVG 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  // 自定义上传请求处理函数
  const customUpload: UploadProps['httpRequest'] = (options) => {
    if (options.file) {
      const form = new FormData();
      form.append('file', options.file);

      return uploadApi
        .uploadFile(form, 'system/plugin')
        .then((response) => {
          if (options.onSuccess) {
            // 对于普通上传（而非重新上传）显示上传成功的消息
            ElMessage.success('上传成功');
            options.onSuccess(response);
          }
          return response;
        })
        .catch((error) => {
          if (options.onError) {
            options.onError(error);
          }
          console.error('上传失败', error);
          ElMessage.error('文件上传失败');
          throw error;
        });
    }
    return Promise.reject(new Error('没有文件'));
  };

  function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        // 将 uploadTypes 数组转换为逗号分隔的字符串
        const submitData = {
          ...formPackage,
          uploadTypes:
            formPackage.uploadTypes.length > 0 ? formPackage.uploadTypes.join(',') : null,
        };

        if (activeAppCatId.value) {
          const params = { id: activeAppCatId.value, ...submitData };
          /* 如果是用户的app 不能修改状态 保持原样返回 */
          await ApiPlugin.updatePlugin(params);
          ElMessage({ type: 'success', message: '更新插件成功！' });
        } else {
          await ApiPlugin.createPlugin(submitData);
          ElMessage({ type: 'success', message: '创建新的插件成功！' });
        }
        visible.value = false;
        queryAppList();
      }
    });
  }

  async function handleStatusChange(row: any) {
    try {
      await ApiPlugin.updatePlugin({ id: row.id, isEnabled: row.isEnabled });
      ElMessage.success('状态更新成功');
    } catch (error) {
      ElMessage.error('状态更新失败');
      row.isEnabled = row.isEnabled === 1 ? 0 : 1;
    }
  }

  // 获取创意模型列表
  async function fetchCreativeModels() {
    try {
      // 并行查询多种创意模型类型：图片生成(2)、视频生成(3)、音乐生成(4)、通用创意(6)
      const keyTypes = [2, 3, 4, 6];
      const promises = keyTypes.map((keyType) =>
        ApiModels.queryModels({
          keyType,
          page: 1,
          size: 1000,
          status: 1, // 只获取启用的模型
        }),
      );

      const results = await Promise.all(promises);

      // 合并所有类型的模型
      const creativeModels = results.flatMap((res) =>
        res.data.rows.map((model: any) => model.model),
      );

      // 合并内置参数和创意模型
      const defaultOptions = ['mind-map', 'mermaid', 'ppt-generation'];
      const allOptions = new Set([...defaultOptions, ...creativeModels]);
      parameterOptions.value = Array.from(allOptions);
    } catch (error) {
      console.error('获取创意模型失败：', error);
    }
  }

  onMounted(() => {
    queryAppList();
    fetchCreativeModels();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          插件管理
        </div>
      </template>
      <HButton outline @click="visible = true">
        <SvgIcon name="ic:baseline-plus" />
        添加插件
      </HButton>
    </PageHeader>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column prop="pluginImg" label="封面" width="100">
          <template #default="scope">
            <el-image style="height: 50px" :src="scope.row.pluginImg" fit="fill" />
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="120" /> />
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="parameters" label="调用参数" width="120" />
        <el-table-column prop="description" label="描述信息">
          <template #default="scope">
            <template>
              <div :style="{ maxWidth: '350px' }">
                {{ scope.row.description }}
              </div>
            </template>
            <div :style="{ maxHeight: '50px', cursor: 'pointer' }">
              {{ scope.row.description }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="isEnabled" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.isEnabled"
              :active-value="1"
              :inactive-value="0"
              @change="handleStatusChange(row)"
            />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleUpdatePackage(scope.row)">
              编辑
            </el-button>
            <el-popconfirm
              title="确认删除此插件么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-row class="flex justify-end mt-5">
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
    </page-main>
    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="570"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="100px"
        :model="formPackage"
        :rules="rules"
      >
        <el-form-item label="插件名称" prop="name">
          <el-input v-model="formPackage.name" placeholder="请填写插件名称" />
        </el-form-item>
        <el-form-item label="插件状态" prop="isEnabled">
          <el-switch v-model="formPackage.isEnabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="插件描述" prop="description">
          <el-input
            v-model="formPackage.description"
            type="textarea"
            placeholder="请填写插件描述、用于对外展示..."
            :rows="4"
          />
        </el-form-item>
        <el-form-item label="插件参数" prop="parameters">
          <el-select
            v-model="formPackage.parameters"
            placeholder="请选择或填写插件参数"
            filterable
            allow-create
            default-first-option
            clearable
          >
            <el-option
              v-for="item in parameterOptions"
              :key="item"
              :label="item"
              :value="item"
            ></el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="插件图标" prop="pluginImg">
          <el-input v-model="formPackage.pluginImg" placeholder="请填写或上传插件图标" clearable>
            <template #append>
              <el-upload
                class="avatar-uploader"
                :http-request="customUpload"
                :show-file-list="false"
                :on-success="handleAvatarSuccess"
                :before-upload="beforeAvatarUpload"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.svg"
                style="display: flex; align-items: center; justify-content: center"
              >
                <!-- SVG 源码渲染 -->
                <div
                  v-if="formPackage.pluginImg && shouldRenderSvg"
                  v-html="pluginImgPreview"
                  style="
                    max-width: 1.5rem;
                    max-height: 1.5rem;
                    margin: 5px 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                />
                <!-- 普通图片 URL 渲染 -->
                <img
                  v-else-if="formPackage.pluginImg && !shouldRenderSvg"
                  :src="formPackage.pluginImg"
                  style="max-width: 1.5rem; max-height: 1.5rem; margin: 5px 0; object-fit: contain"
                />
                <!-- 默认上传图标 -->
                <el-icon v-else style="width: 1rem">
                  <Plus />
                </el-icon>
              </el-upload>
              <el-icon
                v-if="formPackage.pluginImg"
                @click="reuploadPluginAvatar"
                style="margin-left: 35px; width: 1rem"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="排序ID" prop="sortOrder">
          <el-input
            v-model.number="formPackage.sortOrder"
            placeholder="请填写排序ID[数字越大越靠前]"
          />
        </el-form-item>

        <el-form-item label="支持上传类型" prop="uploadTypes">
          <el-select
            v-model="formPackage.uploadTypes"
            placeholder="请选择支持的上传类型"
            multiple
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="item in uploadTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <div style="color: #909399; font-size: 12px; margin-top: 4px">
            选择该插件支持的上传文件类型，可多选
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="flex justify-end mr-5">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>
