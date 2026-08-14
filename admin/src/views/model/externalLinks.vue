<route lang="yaml">
meta:
  title: 外链配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { ArrowDown, ArrowUp, Delete, Plus, QuestionFilled } from '@element-plus/icons-vue';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  // 链接类型定义
  interface LinkItem {
    name: string;
    url: string;
    icon: string;
  }

  const formInline = reactive({
    isEnableExternalLinks: 0, // 是否开启外链跳转
    externalLinks: '', // 外链JSON字符串
  });

  const formRef = ref<FormInstance>();
  const previewVisible = ref(false); // 控制预览弹窗的显示
  const iframe = ref(null); // iframe引用
  const iframeVisible = ref(false); // 控制iframe弹窗的显示
  const currentLink = ref<LinkItem | null>(null); // 当前点击的链接
  const addLinkDialogVisible = ref(false); // 控制添加链接弹窗的显示

  // 新链接表单
  const newLink = reactive<LinkItem>({
    name: '',
    url: '',
    icon: '',
  });

  // 链接列表
  const linksList = ref<LinkItem[]>([]);

  const rules = ref<FormRules>({
    isEnableExternalLinks: [{ required: false, trigger: 'blur', message: '是否开启外链跳转' }],
  });

  // 新链接表单验证规则
  const linkRules = ref<FormRules>({
    name: [{ required: true, message: '请输入链接名称', trigger: 'blur' }],
    url: [
      { required: true, message: '请输入链接地址', trigger: 'blur' },
      { pattern: /^https?:\/\/.+/, message: '请输入有效的URL地址', trigger: 'blur' },
    ],
    icon: [
      { required: true, message: '请输入图标地址', trigger: 'blur' },
      { pattern: /^https?:\/\/.+/, message: '请输入有效的URL地址', trigger: 'blur' },
    ],
  });

  const newLinkFormRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: ['isEnableExternalLinks', 'externalLinks'],
    });

    const { isEnableExternalLinks = 0, externalLinks = '' } = res.data;

    Object.assign(formInline, {
      isEnableExternalLinks,
      externalLinks,
    });

    // 解析外链JSON
    try {
      if (externalLinks) {
        linksList.value = JSON.parse(externalLinks);
      } else {
        linksList.value = [];
      }
    } catch (error) {
      console.error('解析外链JSON失败', error);
      linksList.value = [];
    }
  }

  function formatSetting(settings: any) {
    return Object.keys(settings).map((key) => {
      return {
        configKey: key,
        configVal: settings[key],
      };
    });
  }

  function handlerUpdateConfig() {
    formRef.value?.validate(async (valid) => {
      if (valid) {
        try {
          // 将链接列表转换为JSON字符串
          formInline.externalLinks = JSON.stringify(linksList.value);

          await apiConfig.setConfig({ settings: formatSetting(formInline) });
          ElMessage.success('变更配置信息成功');
        } catch (error) {
          ElMessage.error('保存配置失败');
        }
        queryAllConfig();
      } else {
        ElMessage.error('请填写完整信息');
      }
    });
  }

  // 打开预览弹窗
  function openPreview() {
    previewVisible.value = true;
  }

  // 打开链接
  function openLink(link: LinkItem) {
    currentLink.value = link;
    iframeVisible.value = true;
  }

  // 添加新链接
  function addLink() {
    newLinkFormRef.value?.validate(async (valid) => {
      if (valid) {
        linksList.value.push({ ...newLink });

        // 重置表单
        newLink.name = '';
        newLink.url = '';
        newLink.icon = '';

        addLinkDialogVisible.value = false;
        ElMessage.success('添加链接成功');
      }
    });
  }

  // 删除链接
  function removeLink(index: number) {
    ElMessageBox.confirm('确定要删除该链接吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(() => {
        linksList.value.splice(index, 1);
        ElMessage.success('删除成功');
      })
      .catch(() => {});
  }

  // 上移链接
  function moveUp(index: number) {
    if (index > 0) {
      const temp = linksList.value[index];
      linksList.value[index] = linksList.value[index - 1];
      linksList.value[index - 1] = temp;
    }
  }

  // 下移链接
  function moveDown(index: number) {
    if (index < linksList.value.length - 1) {
      const temp = linksList.value[index];
      linksList.value[index] = linksList.value[index + 1];
      linksList.value[index + 1] = temp;
    }
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
          外链配置
        </div>
      </template>
      <HButton text outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
      <HButton text outline class="ml-2" @click="openPreview">
        <SvgIcon name="i-ri:eye-line" />
        预览
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h5>外链配置</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启外链跳转" prop="isEnableExternalLinks" label-width="120">
              <el-switch
                v-model="formInline.isEnableExternalLinks"
                active-value="1"
                inactive-value="0"
              />
              <el-tooltip class="box-item" effect="dark" placement="right">
                <template #content>
                  <div style="width: 250px">
                    开启后，用户可以通过点击外链直接访问外部网站，关闭后将不显示外链
                  </div>
                </template>
                <el-icon class="ml-3 cursor-pointer">
                  <QuestionFilled />
                </el-icon>
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider />

        <h5>外链管理</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <div class="flex justify-between mb-4">
              <span>外链列表</span>
              <el-button type="primary" size="small" @click="addLinkDialogVisible = true">
                <el-icon><Plus /></el-icon>添加链接
              </el-button>
            </div>

            <div class="link-list">
              <div
                v-for="(item, index) in linksList"
                :key="index"
                class="flex items-center p-2 mb-2 border rounded hover:bg-gray-100"
              >
                <div class="w-10 h-10 mr-2 flex-shrink-0 overflow-hidden">
                  <img
                    :src="item.icon"
                    :alt="item.name"
                    class="w-full h-full object-contain"
                    @error="
                      (e: Event) => {
                        if (e.currentTarget) {
                          (e.currentTarget as HTMLImageElement).hidden = true;
                        }
                      }
                    "
                  />
                </div>
                <div class="flex-grow">
                  <div class="font-medium">{{ item.name }}</div>
                  <div class="text-xs text-gray-500 truncate">{{ item.url }}</div>
                </div>
                <div class="flex gap-1">
                  <el-button
                    type="info"
                    size="small"
                    circle
                    :disabled="index === 0"
                    @click="moveUp(index)"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button
                    type="info"
                    size="small"
                    circle
                    :disabled="index === linksList.length - 1"
                    @click="moveDown(index)"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button type="danger" size="small" circle @click="removeLink(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" title="外链预览" width="60%">
      <div class="overflow-y-auto" style="max-height: 50vh">
        <div class="grid grid-cols-3 gap-4">
          <div
            v-for="(link, index) in linksList"
            :key="index"
            class="flex flex-col items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative group"
            @click="openLink(link)"
          >
            <div
              class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2 overflow-hidden"
            >
              <img
                v-if="link.icon"
                :src="link.icon"
                :alt="link.name"
                class="w-8 h-8 object-contain"
                @error="
                  (e: Event) => {
                    if (e.currentTarget) {
                      (e.currentTarget as HTMLImageElement).hidden = true;
                    }
                  }
                "
              />
              <span v-else class="text-xl font-medium">{{ link.name.charAt(0) }}</span>
            </div>
            <div class="text-xs text-center truncate w-full">{{ link.name }}</div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- iframe弹窗 -->
    <el-dialog
      v-if="currentLink"
      v-model="iframeVisible"
      :title="currentLink.name"
      width="80%"
      fullscreen
    >
      <iframe
        ref="iframe"
        :src="currentLink.url"
        class="w-full"
        style="height: 80vh; border: none"
      ></iframe>
    </el-dialog>

    <!-- 添加链接弹窗 -->
    <el-dialog v-model="addLinkDialogVisible" title="添加外链" width="500px">
      <el-form ref="newLinkFormRef" :model="newLink" :rules="linkRules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="newLink.name" placeholder="请输入链接名称"></el-input>
        </el-form-item>
        <el-form-item label="链接" prop="url">
          <el-input
            v-model="newLink.url"
            placeholder="请输入链接地址 (以http或https开头)"
          ></el-input>
        </el-form-item>
        <el-form-item label="图标" prop="icon">
          <el-input
            v-model="newLink.icon"
            placeholder="请输入图标地址 (以http或https开头)"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-end">
          <el-button @click="addLinkDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="addLink">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  .link-list {
    max-height: 500px;
    overflow-y: auto;
  }
</style>
