<route lang="yaml">
meta:
  title: 微信公众号菜单
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiOfficial from '@/api/modules/official';
  import type { FormInstance } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  interface MenuItem {
    type?: string;
    name: string;
    key?: string;
    url?: string;
    appid?: string;
    pagepath?: string;
    media_id?: string;
    article_id?: string;
    content?: string;
    sub_button: MenuItem[];
  }

  interface MenuForm {
    button: MenuItem[];
  }

  const menuForm = reactive<MenuForm>({
    button: [],
  });

  const formRef = ref<FormInstance>();
  const loading = ref(false);
  const wechatConfigured = ref(false);
  const activeMenuIndex = ref<number | null>(null);
  const activeSubMenuIndex = ref<number | null>(null);

  // 素材选择相关
  const materialDialogVisible = ref(false);
  const materialList = ref<any[]>([]);
  const materialLoading = ref(false);
  const materialTotal = ref(0);
  const materialPage = ref({ offset: 0, count: 10 });
  const materialType = ref('news'); // 当前选择的素材类型

  // 菜单类型选项
  const menuTypes = [
    { label: '回复文字', value: 'click', description: '点击后自动回复文字内容' },
    { label: '跳转网页', value: 'view', description: '打开指定网页' },
    { label: '跳转小程序', value: 'miniprogram', description: '打开关联的小程序' },
    { label: '图文素材', value: 'media_id', description: '发送图文消息（需素材ID）' },
    { label: '图文链接', value: 'view_limited', description: '跳转图文消息链接' },
  ];

  // 检查微信公众号配置
  async function checkWechatConfig() {
    try {
      const res = await apiConfig.queryConfig({
        keys: ['wechatOfficialAppId', 'wechatOfficialToken', 'wechatOfficialAppSecret'],
      });

      const { wechatOfficialAppId, wechatOfficialToken, wechatOfficialAppSecret } = res.data;
      wechatConfigured.value = !!(
        wechatOfficialAppId &&
        wechatOfficialToken &&
        wechatOfficialAppSecret
      );

      if (!wechatConfigured.value) {
        ElMessage.warning('请先完成微信公众号基本配置');
      }
    } catch (error) {
      console.error('获取微信配置失败', error);
    }
  }

  // 查询当前菜单配置
  async function queryMenu() {
    loading.value = true;
    try {
      const res = await apiOfficial.queryOfficialMenu();
      if (res.data && res.data.menu && res.data.menu.button) {
        menuForm.button = res.data.menu.button;
      }
    } catch (error) {
      console.error('获取菜单配置失败', error);
    } finally {
      loading.value = false;
    }
  }

  // 自动生成KEY值
  function generateKey(name: string): string {
    return `KEY_${name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')}_${Date.now()}`;
  }

  // 确保菜单项有必要属性
  function ensureMenuItemsHaveRequiredProps(menuItems: MenuItem[]) {
    for (const item of menuItems) {
      if (!item.key || item.key.startsWith('KEY_菜单') || item.key.startsWith('KEY_子菜单')) {
        item.key = generateKey(item.name);
      }

      if (!item.content) item.content = '';
      if (!item.media_id) item.media_id = '';
      if (!item.url) item.url = '';
      if (!item.appid) item.appid = '';
      if (!item.pagepath) item.pagepath = '';
      if (!item.article_id) item.article_id = '';

      if (item.sub_button && item.sub_button.length > 0) {
        ensureMenuItemsHaveRequiredProps(item.sub_button);
      }
    }
  }

  // 保存菜单
  function saveMenu() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }

    // 验证菜单配置
    let hasError = false;
    menuForm.button.forEach((item, index) => {
      if (!item.name || item.name.trim() === '') {
        ElMessage.error(`第 ${index + 1} 个菜单名称不能为空`);
        hasError = true;
        return;
      }

      if (item.sub_button && item.sub_button.length > 0) {
        item.sub_button.forEach((subItem, subIndex) => {
          if (!subItem.name || subItem.name.trim() === '') {
            ElMessage.error(`第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单名称不能为空`);
            hasError = true;
            return;
          }
          if (!subItem.type) {
            ElMessage.error(`第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单未选择类型`);
            hasError = true;
            return;
          }

          // 验证不同类型的必填字段
          const errorPrefix = `第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单`;
          if (subItem.type === 'click' && (!subItem.content || !subItem.content.trim())) {
            ElMessage.error(`${errorPrefix}需要填写回复内容`);
            hasError = true;
            return;
          }
          if (
            subItem.type === 'view' &&
            (!subItem.url || subItem.url === 'http://' || subItem.url === 'https://')
          ) {
            ElMessage.error(`${errorPrefix}需要填写跳转链接`);
            hasError = true;
            return;
          }
          if (subItem.type === 'miniprogram') {
            if (!subItem.appid || !subItem.pagepath) {
              ElMessage.error(`${errorPrefix}需要填写小程序AppID和页面路径`);
              hasError = true;
              return;
            }
          }
          if (subItem.type === 'media_id' && !subItem.media_id) {
            ElMessage.error(`${errorPrefix}需要填写素材ID`);
            hasError = true;
            return;
          }
          if (
            subItem.type === 'view_limited' &&
            (!subItem.url || subItem.url === 'http://' || subItem.url === 'https://')
          ) {
            ElMessage.error(`${errorPrefix}需要填写图文链接`);
            hasError = true;
            return;
          }
        });
      } else {
        if (!item.type) {
          ElMessage.error(`第 ${index + 1} 个菜单未选择类型或添加子菜单`);
          hasError = true;
          return;
        }

        // 验证不同类型的必填字段
        const errorPrefix = `第 ${index + 1} 个菜单`;
        if (item.type === 'click' && (!item.content || !item.content.trim())) {
          ElMessage.error(`${errorPrefix}需要填写回复内容`);
          hasError = true;
          return;
        }
        if (
          item.type === 'view' &&
          (!item.url || item.url === 'http://' || item.url === 'https://')
        ) {
          ElMessage.error(`${errorPrefix}需要填写跳转链接`);
          hasError = true;
          return;
        }
        if (item.type === 'miniprogram') {
          if (!item.appid || !item.pagepath) {
            ElMessage.error(`${errorPrefix}需要填写小程序AppID和页面路径`);
            hasError = true;
            return;
          }
        }
        if (item.type === 'media_id' && !item.media_id) {
          ElMessage.error(`${errorPrefix}需要填写素材ID`);
          hasError = true;
          return;
        }
        if (
          item.type === 'view_limited' &&
          (!item.url || item.url === 'http://' || item.url === 'https://')
        ) {
          ElMessage.error(`${errorPrefix}需要填写图文链接`);
          hasError = true;
          return;
        }
      }
    });

    if (hasError) return;

    loading.value = true;
    ensureMenuItemsHaveRequiredProps(menuForm.button);
    apiOfficial
      .createOfficialMenu(menuForm)
      .then(() => {
        ElMessage.success('菜单保存成功，预计5分钟后生效');
        queryMenu();
      })
      .catch((error: any) => {
        console.error('保存菜单失败', error);
        const errorMsg = error.response?.data?.message || '保存失败，请检查菜单配置';
        ElMessage.error(errorMsg);
      })
      .finally(() => {
        loading.value = false;
      });
  }

  // 删除菜单
  function deleteMenu() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }

    ElMessageBox.confirm('确定要删除所有自定义菜单吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(async () => {
        loading.value = true;
        try {
          await apiOfficial.deleteOfficialMenu();
          ElMessage.success('菜单已删除');
          menuForm.button = [];
          activeMenuIndex.value = null;
          activeSubMenuIndex.value = null;
        } catch (error) {
          console.error('删除菜单失败', error);
          ElMessage.error('删除失败');
        } finally {
          loading.value = false;
        }
      })
      .catch(() => {});
  }

  // 添加一级菜单
  function addFirstLevelMenu() {
    if (menuForm.button.length >= 3) {
      ElMessage.warning('一级菜单最多3个');
      return;
    }
    const newMenu: MenuItem = {
      name: `菜单名称`,
      key: generateKey(`菜单${menuForm.button.length + 1}`),
      type: 'click',
      content: '',
      url: '',
      media_id: '',
      appid: '',
      pagepath: '',
      article_id: '',
      sub_button: [],
    };
    menuForm.button.push(newMenu);
    activeMenuIndex.value = menuForm.button.length - 1;
    activeSubMenuIndex.value = null;
  }

  // 添加二级菜单
  function addSecondLevelMenu(index: number) {
    if (menuForm.button[index].sub_button.length >= 5) {
      ElMessage.warning('子菜单最多5个');
      return;
    }

    const newSubMenu: MenuItem = {
      type: 'click',
      name: `子菜单名称`,
      key: generateKey(`子菜单${menuForm.button[index].sub_button.length + 1}`),
      content: '',
      url: '',
      media_id: '',
      appid: '',
      pagepath: '',
      article_id: '',
      sub_button: [],
    };

    menuForm.button[index].sub_button.push(newSubMenu);
    activeSubMenuIndex.value = menuForm.button[index].sub_button.length - 1;
  }

  // 移除菜单项
  function removeMenuItem(firstIndex: number, secondIndex?: number) {
    ElMessageBox.confirm('确定要删除这个菜单吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
      .then(() => {
        if (secondIndex !== undefined) {
          menuForm.button[firstIndex].sub_button.splice(secondIndex, 1);
          ElMessage.success('子菜单已删除');
          activeSubMenuIndex.value = null;
        } else {
          menuForm.button.splice(firstIndex, 1);
          activeMenuIndex.value = null;
          activeSubMenuIndex.value = null;
          ElMessage.success('菜单已删除');
        }
      })
      .catch(() => {});
  }

  // 选择菜单
  function selectMenu(index: number, subIndex?: number) {
    activeMenuIndex.value = index;
    activeSubMenuIndex.value = subIndex !== undefined ? subIndex : null;
  }

  // 当前选中的菜单项
  const currentMenuItem = computed(() => {
    if (activeMenuIndex.value === null) return null;
    if (activeSubMenuIndex.value !== null) {
      return menuForm.button[activeMenuIndex.value]?.sub_button[activeSubMenuIndex.value];
    }
    return menuForm.button[activeMenuIndex.value];
  });

  // 打开素材选择器
  function openMaterialSelector() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }
    materialDialogVisible.value = true;
    loadMaterialList();
  }

  // 加载素材列表
  async function loadMaterialList() {
    materialLoading.value = true;
    try {
      const res = await apiOfficial.getMaterialList({
        type: materialType.value,
        offset: materialPage.value.offset,
        count: materialPage.value.count,
      });
      materialList.value = res.data.item || [];
      materialTotal.value = res.data.total_count || 0;
    } catch (error: any) {
      console.error('加载素材列表失败', error);
      ElMessage.error(error.response?.data?.message || '加载素材列表失败');
    } finally {
      materialLoading.value = false;
    }
  }

  // 切换素材类型
  function handleMaterialTypeChange() {
    materialPage.value.offset = 0;
    loadMaterialList();
  }

  // 选择素材
  function selectMaterial(material: any) {
    if (currentMenuItem.value) {
      currentMenuItem.value.media_id = material.media_id;
      materialDialogVisible.value = false;
      ElMessage.success('素材选择成功');
    }
  }

  // 分页变化
  function handleMaterialPageChange(offset: number) {
    materialPage.value.offset = offset;
    loadMaterialList();
  }

  // 格式化时间戳
  function formatTime(timestamp: number) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  onMounted(() => {
    checkWechatConfig();
    queryMenu();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          微信公众号菜单
        </div>
      </template>
      <div class="flex gap-2">
        <HButton
          v-if="menuForm.button.length < 3"
          outline
          text
          @click="addFirstLevelMenu"
          :disabled="!wechatConfigured"
        >
          <SvgIcon name="i-ri:add-line" />
          添加菜单
        </HButton>
        <HButton outline text @click="saveMenu" :loading="loading" :disabled="!wechatConfigured">
          <SvgIcon name="i-ri:save-line" />
          保存并发布
        </HButton>
        <HButton
          outline
          text
          @click="deleteMenu"
          :loading="loading"
          type="danger"
          :disabled="!wechatConfigured"
        >
          <SvgIcon name="i-ri:delete-bin-line" />
          删除全部菜单
        </HButton>
      </div>
    </PageHeader>

    <el-card style="margin: 20px" v-loading="loading">
      <el-alert
        v-if="!wechatConfigured"
        title="请先完成微信公众号基本配置"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px"
      >
        <template #default>
          前往<router-link to="/user/wechat">微信登录设置</router-link>页面完成 AppId、Token 和
          AppSecret 的配置后，即可在此管理自定义菜单。
        </template>
      </el-alert>

      <!-- 主体内容区 -->
      <div class="main-content">
        <!-- 左侧手机预览 -->
        <div class="phone-preview-section">
          <div class="phone-wrapper">
            <div class="phone-body">
              <div class="phone-screen">
                <div class="phone-header">
                  <span class="back-btn">
                    <i class="el-icon-arrow-left" />
                  </span>
                  <span class="header-title">公众号名称</span>
                  <span class="menu-icon">
                    <i class="el-icon-more" />
                  </span>
                </div>
                <div class="phone-content">
                  <!-- 显示子菜单弹出层 -->
                  <div
                    v-if="
                      activeMenuIndex !== null &&
                      menuForm.button[activeMenuIndex]?.sub_button &&
                      menuForm.button[activeMenuIndex].sub_button.length > 0
                    "
                    class="submenu-popup"
                  >
                    <div
                      v-for="(subMenu, subIndex) in menuForm.button[activeMenuIndex].sub_button"
                      :key="subIndex"
                      class="submenu-item"
                      :class="{ active: activeSubMenuIndex === subIndex }"
                      @click.stop="selectMenu(activeMenuIndex, subIndex)"
                    >
                      {{ subMenu.name || `子菜单${subIndex + 1}` }}
                    </div>
                  </div>
                  <!-- 默认显示聊天内容区域 -->
                  <div v-else class="chat-placeholder">聊天内容区域</div>
                </div>
                <div class="phone-menu-bar">
                  <div
                    v-for="(menu, index) in menuForm.button"
                    :key="index"
                    class="menu-btn"
                    :class="{ active: activeMenuIndex === index }"
                    @click="selectMenu(index)"
                  >
                    {{ menu.name || '菜单' }}
                  </div>
                  <div v-if="menuForm.button.length === 0" class="menu-btn empty">暂无菜单</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧配置表单 -->
        <div class="config-form-section">
          <div class="form-card" v-if="currentMenuItem">
            <h3 class="form-title">菜单信息</h3>

            <el-form :model="currentMenuItem" label-position="top" size="default">
              <!-- 名称 -->
              <el-form-item label="名称" required>
                <el-input
                  v-model="currentMenuItem.name"
                  placeholder="请输入菜单名称"
                  maxlength="16"
                  show-word-limit
                  @input="currentMenuItem.key = generateKey(currentMenuItem.name)"
                />
                <div class="form-hint">仅支持中文和数字，字数不超过4个汉字或8个字母。</div>
              </el-form-item>

              <!-- 菜单类型 -->
              <el-form-item label="菜单类型" required>
                <el-select v-model="currentMenuItem.type" placeholder="请选择菜单类型">
                  <el-option
                    v-for="item in menuTypes"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  >
                    <span>{{ item.label }}</span>
                    <span style="float: right; color: #8492a6; font-size: 13px">{{
                      item.description
                    }}</span>
                  </el-option>
                </el-select>
              </el-form-item>

              <!-- 回复文字 -->
              <el-form-item label="回复内容" required v-if="currentMenuItem.type === 'click'">
                <el-input
                  v-model="currentMenuItem.content"
                  type="textarea"
                  :rows="4"
                  placeholder="请输入点击菜单后自动回复的文字内容"
                  maxlength="300"
                  show-word-limit
                />
                <div class="form-hint">用户点击该菜单时，将自动回复此处设置的文字内容。</div>
              </el-form-item>

              <!-- 跳转网页 -->
              <el-form-item label="网页链接" required v-if="currentMenuItem.type === 'view'">
                <el-input
                  v-model="currentMenuItem.url"
                  placeholder="请输入完整的网页链接，以 https:// 开头"
                />
                <div class="form-hint-row">
                  <el-link type="primary" :underline="false">从页面模版选择</el-link>
                  <el-link type="primary" :underline="false">从页面模版选择</el-link>
                </div>
              </el-form-item>

              <!-- 跳转小程序 -->
              <template v-if="currentMenuItem.type === 'miniprogram'">
                <el-form-item label="小程序AppID" required>
                  <el-input
                    v-model="currentMenuItem.appid"
                    placeholder="请输入小程序AppID"
                    maxlength="32"
                  />
                </el-form-item>
                <el-form-item label="页面路径" required>
                  <el-input
                    v-model="currentMenuItem.pagepath"
                    placeholder="pages/index/index"
                    maxlength="128"
                  />
                </el-form-item>
                <el-form-item label="备用网页">
                  <el-input v-model="currentMenuItem.url" placeholder="旧版微信打开的网页地址" />
                </el-form-item>
              </template>

              <!-- 图文素材 -->
              <el-form-item label="素材ID" required v-if="currentMenuItem.type === 'media_id'">
                <div style="display: flex; gap: 8px">
                  <el-input
                    v-model="currentMenuItem.media_id"
                    placeholder="请输入或选择图文素材的media_id"
                    style="flex: 1"
                  />
                  <el-button type="primary" @click="openMaterialSelector">选择素材</el-button>
                </div>
              </el-form-item>

              <!-- 图文链接 -->
              <el-form-item
                label="图文链接"
                required
                v-if="currentMenuItem.type === 'view_limited'"
              >
                <el-input
                  v-model="currentMenuItem.url"
                  placeholder="请输入图文消息的链接地址，以 https:// 开头"
                />
                <div class="form-hint">
                  填写已发布图文消息的链接，用户点击菜单后会跳转到该图文页面。链接可从微信公众平台素材库中获取。
                </div>
              </el-form-item>
            </el-form>

            <!-- 删除菜单按钮 -->
            <div class="form-footer">
              <!-- 添加子菜单按钮（只在查看一级菜单且子菜单少于5个时显示） -->
              <el-button
                v-if="
                  activeSubMenuIndex === null &&
                  activeMenuIndex !== null &&
                  (!menuForm.button[activeMenuIndex].sub_button ||
                    menuForm.button[activeMenuIndex].sub_button.length < 5)
                "
                type="primary"
                @click="addSecondLevelMenu(activeMenuIndex)"
              >
                <i class="el-icon-plus" style="margin-right: 4px" />
                添加子菜单
              </el-button>

              <div style="flex: 1"></div>

              <el-button
                type="danger"
                text
                @click="
                  removeMenuItem(
                    activeMenuIndex!,
                    activeSubMenuIndex !== null ? activeSubMenuIndex : undefined,
                  )
                "
              >
                删除当前菜单
              </el-button>
            </div>
          </div>

          <div class="empty-state" v-else>
            <el-empty description="请选择或添加菜单" />
          </div>
        </div>
      </div>
    </el-card>

    <!-- 素材选择对话框 -->
    <el-dialog
      v-model="materialDialogVisible"
      title="选择素材"
      width="800px"
      :close-on-click-modal="false"
    >
      <div v-loading="materialLoading">
        <!-- 素材类型选择器 -->
        <div style="margin-bottom: 16px">
          <el-radio-group v-model="materialType" @change="handleMaterialTypeChange" size="default">
            <el-radio-button label="news">图文消息</el-radio-button>
            <el-radio-button label="image">图片</el-radio-button>
            <el-radio-button label="video">视频</el-radio-button>
            <el-radio-button label="voice">语音</el-radio-button>
          </el-radio-group>
        </div>

        <el-empty
          v-if="materialList.length === 0 && !materialLoading"
          :description="`暂无${materialType === 'news' ? '图文' : materialType === 'image' ? '图片' : materialType === 'video' ? '视频' : '语音'}素材`"
        >
          <template #extra>
            <el-alert type="info" :closable="false" style="margin-top: 10px">
              <p style="margin: 0; font-size: 13px">
                请前往微信公众平台的素材管理页面创建图文素材
              </p>
            </el-alert>
          </template>
        </el-empty>

        <div v-else class="material-list">
          <div
            v-for="(material, index) in materialList"
            :key="index"
            class="material-item"
            @click="selectMaterial(material)"
          >
            <div class="material-content">
              <!-- 图文消息 -->
              <div
                v-if="
                  materialType === 'news' &&
                  material.content &&
                  material.content.news_item &&
                  material.content.news_item[0]
                "
                class="material-info"
              >
                <div class="material-title">
                  {{ material.content.news_item[0].title || '无标题' }}
                </div>
                <div class="material-meta">
                  <span>{{ formatTime(material.update_time) }}</span>
                  <span v-if="material.content.news_item.length > 1" class="news-count">
                    共 {{ material.content.news_item.length }} 篇
                  </span>
                </div>
              </div>

              <!-- 图片素材 -->
              <div v-else-if="materialType === 'image'" class="material-info">
                <div class="material-title">{{ material.name || '未命名图片' }}</div>
                <div class="material-meta">
                  <span>{{ formatTime(material.update_time) }}</span>
                </div>
              </div>

              <!-- 视频素材 -->
              <div v-else-if="materialType === 'video'" class="material-info">
                <div class="material-title">{{ material.name || '未命名视频' }}</div>
                <div class="material-meta">
                  <span>{{ formatTime(material.update_time) }}</span>
                </div>
              </div>

              <!-- 语音素材 -->
              <div v-else-if="materialType === 'voice'" class="material-info">
                <div class="material-title">{{ material.name || '未命名语音' }}</div>
                <div class="material-meta">
                  <span>{{ formatTime(material.update_time) }}</span>
                </div>
              </div>

              <div class="material-id">media_id: {{ material.media_id }}</div>
            </div>
          </div>
        </div>

        <el-pagination
          v-if="materialTotal > materialPage.count"
          :current-page="Math.floor(materialPage.offset / materialPage.count) + 1"
          :page-size="materialPage.count"
          :total="materialTotal"
          layout="total, prev, pager, next"
          @current-change="(page) => handleMaterialPageChange((page - 1) * materialPage.count)"
          style="margin-top: 20px; justify-content: center"
        />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
  /* 主体内容 */
  .main-content {
    display: flex;
    gap: 24px;
    position: relative;
  }

  /* 左侧手机预览 */
  .phone-preview-section {
    flex-shrink: 0;
    width: 320px;
  }

  .phone-wrapper {
    position: sticky;
    top: 20px;
    padding: 24px;
  }

  .phone-body {
    border: 4px solid #1f1f1f;
    border-radius: 32px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    position: relative;
    background: #fff;
  }

  .phone-body::before {
    content: '';
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    width: 50px;
    height: 4px;
    background: #1f1f1f;
    border-radius: 2px;
    z-index: 10;
    opacity: 0.4;
  }

  .phone-screen {
    background: #fff;
    height: 560px;
    display: flex;
    flex-direction: column;
  }

  .phone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 44px 16px 12px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  .back-btn,
  .menu-icon {
    font-size: 18px;
    color: #576b95;
    cursor: pointer;
  }

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: #2c3e50;
  }

  .phone-content {
    flex: 1;
    background: #e8e8e8;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .chat-placeholder {
    color: #999;
    font-size: 13px;
  }

  /* 子菜单弹出层 */
  .submenu-popup {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .submenu-item {
    padding: 16px 20px;
    font-size: 14px;
    color: #2c3e50;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .submenu-item:last-child {
    border-bottom: none;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .submenu-item:hover {
    background: #f5f7fa;
  }

  .submenu-item.active {
    background: #ecf5ff;
    color: #409eff;
    font-weight: 500;
  }

  .phone-menu-bar {
    display: flex;
    border-top: 1px solid #e0e0e0;
    background: #f7f7f7;
  }

  .menu-btn {
    flex: 1;
    padding: 13px 8px;
    text-align: center;
    font-size: 13px;
    color: #2c3e50;
    font-weight: 500;
    border-right: 1px solid #e0e0e0;
    cursor: pointer;
    transition: all 0.3s;
    position: relative;
  }

  .menu-btn:last-child {
    border-right: none;
  }

  .menu-btn:hover {
    background: #ececec;
  }

  .menu-btn.active {
    background: #e0e0e0;
    color: #409eff;
  }

  .menu-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #409eff;
  }

  .menu-btn.empty {
    color: #c0c4cc;
    cursor: default;
  }

  /* 右侧配置表单 */
  .config-form-section {
    flex: 1;
    min-height: 500px;
  }

  .form-card {
    padding: 24px;
  }

  .form-title {
    margin: 0 0 24px 0;
    font-size: 18px;
    font-weight: 600;
    color: #2c3e50;
  }

  .form-hint {
    margin-top: 8px;
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
  }

  .form-hint-row {
    margin-top: 8px;
    display: flex;
    gap: 16px;
  }

  .form-footer {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .empty-state {
    padding: 60px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* 素材选择对话框 */
  .material-list {
    display: grid;
    gap: 12px;
  }

  .material-item {
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .material-item:hover {
    border-color: #409eff;
    background: #f5f9ff;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
    transform: translateY(-2px);
  }

  .material-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 素材信息区域 */
  .material-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 素材标题 */
  .material-title {
    font-size: 14px;
    font-weight: 500;
    color: #303133;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* 素材元数据 */
  .material-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #909399;
  }

  .news-count {
    color: #409eff;
    font-weight: 500;
  }

  .material-id {
    font-size: 12px;
    color: #909399;
    font-family: 'Monaco', 'Menlo', monospace;
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    word-break: break-all;
    transition: all 0.2s;
  }

  .material-item:hover .material-id {
    background: #e7f2ff;
    border-color: #d0e5ff;
  }
</style>
