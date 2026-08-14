<route lang="yaml">
meta:
  title: 基础配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import uploadApi from '@/api/modules/upload';
  import { Plus, Refresh } from '@element-plus/icons-vue';
  import axios from 'axios';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    siteName: '',
    userDefaultAvatar: '',
    filingNumber: '',
    publicSecurityFilingNumber: '',
    companyName: '',
    buyCramiAddress: '',
    siteUrl: '',
    isShowAppCatIcon: '',
    clientFaviconPath: '',
    clientLogoPath: '',
    siteTitle: '',
    siteDescription: '',
    siteKeywords: '',
  });
  const rules = ref<FormRules>({
    siteName: [{ required: true, trigger: 'blur', message: '请填写网站名称' }],
  });
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'siteName',
        'userDefaultAvatar',
        'filingNumber',
        'publicSecurityFilingNumber',
        'companyName',
        'isShowAppCatIcon',
        'clientLogoPath',
        'clientFaviconPath',
        'siteUrl',
        'siteTitle',
        'siteDescription',
        'siteKeywords',
      ],
    });
    Object.assign(formInline, res.data);
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

  function uploadFile(file: any, successHandler: any, originalValue?: string, successMsg?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/others')
      .then((response) => {
        // 创建模拟的响应对象，结构与el-upload期望的一致
        successHandler({
          data: response.data,
        });

        // 如果提供了成功消息，则显示它（用于重新上传场景）
        if (successMsg) {
          ElMessage.success(successMsg);
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue && successHandler === handleLogoSuccess) {
          formInline.clientLogoPath = originalValue;
        } else if (originalValue && successHandler === handleFaviconSuccess) {
          formInline.clientFaviconPath = originalValue;
        } else if (originalValue && successHandler === handleUserDefaultAvatarSuccess) {
          formInline.userDefaultAvatar = originalValue;
        }
      });
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    const form = new FormData();
    form.append('file', file);

    return uploadApi
      .uploadFile(form, 'system/others')
      .then((response) => {
        // 直接传递整个response，而不仅仅是response.data
        if (onSuccess) {
          onSuccess(response);
          // 在这里添加上传成功的提示
          ElMessage.success('上传成功');
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

  const handleLogoSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    // 确保从正确的响应结构中获取URL
    if (response && response.data) {
      formInline.clientLogoPath = response.data;
      // 移除这里的提示，避免重复提示
    } else {
      ElMessage.error('上传成功但未获取到图片地址');
    }
  };

  async function reuploadLogo() {
    if (formInline.clientLogoPath) {
      try {
        ElMessage.info('正在重新上传 LOGO...');
        const originalValue = formInline.clientLogoPath; // 保存原始值
        const file = await downloadFile(formInline.clientLogoPath);
        uploadFile(file, handleLogoSuccess, originalValue, '重新上传 LOGO 成功');
      } catch (error) {
        console.error('下载 LOGO 文件失败', error);
        ElMessage.error('重新上传 LOGO 失败，请检查图片链接是否有效');
      }
    }
  }

  async function reuploadFavicon() {
    if (formInline.clientFaviconPath) {
      try {
        ElMessage.info('正在重新上传网站图标...');
        const originalValue = formInline.clientFaviconPath; // 保存原始值
        const file = await downloadFile(formInline.clientFaviconPath);
        uploadFile(file, handleFaviconSuccess, originalValue, '重新上传网站图标成功');
      } catch (error) {
        console.error('下载网站图标文件失败', error);
        ElMessage.error('重新上传网站图标失败，请检查图片链接是否有效');
      }
    }
  }

  async function reuploadUserDefaultAvatar() {
    if (formInline.userDefaultAvatar) {
      try {
        ElMessage.info('正在重新上传用户默认头像...');
        const originalValue = formInline.userDefaultAvatar; // 保存原始值
        const file = await downloadFile(formInline.userDefaultAvatar);
        uploadFile(file, handleUserDefaultAvatarSuccess, originalValue, '重新上传用户默认头像成功');
      } catch (error) {
        console.error('下载用户默认头像文件失败', error);
        ElMessage.error('重新上传默认头像失败，请检查图片链接是否有效');
      }
    }
  }

  const handleFaviconSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    // 确保从正确的响应结构中获取URL
    if (response && response.data) {
      formInline.clientFaviconPath = response.data;
      // 移除这里的提示，避免重复提示
    } else {
      ElMessage.error('上传成功但未获取到图片地址');
    }
  };

  const handleUserDefaultAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    // 确保从正确的响应结构中获取URL
    if (response && response.data) {
      formInline.userDefaultAvatar = response.data;
      // 移除这里的提示，避免重复提示
    } else {
      ElMessage.error('上传成功但未获取到图片地址');
    }
  };

  const beforeLogoUpload: UploadProps['beforeUpload'] = (rawFile) => {
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
      ElMessage.error('仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片文件');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('文件大小不能超过 3MB');
      return false;
    }
    return true;
  };

  function formatSetting(settings: any) {
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
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          基础配置
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="150px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站名称" prop="siteName">
              <el-input
                v-model="formInline.siteName"
                placeholder="请输入网站名称，如：99AI"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站地址" prop="siteUrl">
              <el-input
                v-model="formInline.siteUrl"
                placeholder="请输入网站完整地址，如：https://www.example.com"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="公司/组织名称" prop="companyName">
              <el-input
                v-model="formInline.companyName"
                placeholder="请输入公司或组织的完整名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站备案号" prop="filingNumber">
              <el-input
                v-model="formInline.filingNumber"
                placeholder="请输入备案号，如：京ICP备2023000001号"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="公安备案号" prop="publicSecurityFilingNumber">
              <el-input
                v-model="formInline.publicSecurityFilingNumber"
                placeholder="请输入公安备案号，如：浙公网安备33090202000608号"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站 LOGO" prop="clientLogoPath">
              <el-input
                v-model="formInline.clientLogoPath"
                placeholder="请输入 LOGO 图片链接或点击右侧上传"
                clearable
              >
                <template #append>
                  <el-upload
                    class="avatar-uploader"
                    :show-file-list="false"
                    :http-request="customUpload"
                    :on-success="handleLogoSuccess"
                    :before-upload="beforeLogoUpload"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico"
                    style="display: flex; align-items: center; justify-content: center"
                  >
                    <img
                      v-if="formInline.clientLogoPath"
                      :src="formInline.clientLogoPath"
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
                    v-if="formInline.clientLogoPath"
                    @click="reuploadLogo"
                    style="margin-left: 35px; width: 1rem"
                  >
                    <Refresh />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站图标 (Favicon)" prop="clientFaviconPath">
              <el-input
                v-model="formInline.clientFaviconPath"
                placeholder="请输入网站图标链接或点击右侧上传"
                clearable
              >
                <template #append>
                  <el-upload
                    class="avatar-uploader"
                    :show-file-list="false"
                    :http-request="customUpload"
                    :on-success="handleFaviconSuccess"
                    :before-upload="beforeLogoUpload"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,image/x-icon,image/vnd.microsoft.icon"
                    style="display: flex; align-items: center; justify-content: center"
                  >
                    <img
                      v-if="formInline.clientFaviconPath"
                      :src="formInline.clientFaviconPath"
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
                    v-if="formInline.clientFaviconPath"
                    @click="reuploadFavicon"
                    style="margin-left: 35px; width: 1rem"
                  >
                    <Refresh />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站标题" prop="siteTitle">
              <el-input
                v-model="formInline.siteTitle"
                placeholder="请输入网站标题，将显示在浏览器标签页，如：99AI Plugin Edition"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站描述" prop="siteDescription">
              <el-input
                v-model="formInline.siteDescription"
                type="textarea"
                :rows="3"
                placeholder="请输入网站描述，用于搜索引擎优化(SEO)，如：这是一个可自托管的 AI 服务平台。"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="网站关键词" prop="siteKeywords">
              <el-input
                v-model="formInline.siteKeywords"
                placeholder="请输入网站关键词，多个关键词用逗号分隔，如：AI, 助手, 智能助手, 任务管理, 高效, 知识库"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="用户默认头像" prop="userDefaultAvatar">
              <el-input
                v-model="formInline.userDefaultAvatar"
                placeholder="请输入默认头像链接或点击右侧上传"
                clearable
              >
                <template #append>
                  <el-upload
                    class="avatar-uploader"
                    :show-file-list="false"
                    :http-request="customUpload"
                    :on-success="handleUserDefaultAvatarSuccess"
                    :before-upload="beforeLogoUpload"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                    style="display: flex; align-items: center; justify-content: center"
                  >
                    <img
                      v-if="formInline.userDefaultAvatar"
                      :src="formInline.userDefaultAvatar"
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
                    v-if="formInline.userDefaultAvatar"
                    @click="reuploadUserDefaultAvatar"
                    style="margin-left: 35px; width: 1rem"
                  >
                    <Refresh />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
