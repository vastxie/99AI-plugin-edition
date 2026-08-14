<route lang="yaml">
meta:
  title: 微信设置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import apiOfficial from '@/api/modules/official';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    wechatRegisterStatus: '',
    wechatSilentLoginStatus: '',
    wechatOfficialName: '',
    wechatOfficialAppId: '',
    wechatOfficialToken: '',
    wechatOfficialAppSecret: '',
    wechatOpenUrl: '',
    wechatApiUrl: '',
    wechatApiUrlToken: '',
    wechatMpUrl: '',
    officialSubscribeText: '',
    officialBindAccountText: '',
    officialBindAccountFailText: '',
    officialScanLoginText: '',
    officialAutoReplyText: '',
  });

  const rules = ref<FormRules>({
    wechatOfficialName: [{ required: false, trigger: 'blur', message: '请填写微信公众号名称' }],

    wechatOfficialAppId: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 AppId',
      },
    ],
    wechatOfficialToken: [
      {
        required: true,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 Token',
      },
      {
        min: 16,
        trigger: 'blur',
        message: 'Token 至少 16 位，且应使用不可预测的随机值',
      },
    ],
    wechatOfficialAppSecret: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 AppSecret',
      },
    ],
  });
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'wechatOfficialName',
        'wechatOfficialAppId',
        'wechatOfficialToken',
        'wechatOfficialAppSecret',
        'wechatOpenUrl',
        'wechatApiUrl',
        'wechatApiUrlToken',
        'wechatMpUrl',
        'officialSubscribeText',
        'officialBindAccountText',
        'officialBindAccountFailText',
        'officialScanLoginText',
        'officialAutoReplyText',
        'wechatRegisterStatus',
        'wechatSilentLoginStatus',
      ],
    });
    Object.assign(formInline, res.data);
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

  const isUpdatingUnionIds = ref(false);

  async function handleBatchUpdateUnionIds() {
    try {
      await ElMessageBox.confirm(
        '此操作将批量更新所有已绑定微信但未获取 UnionID 的用户信息。如果您的公众号已绑定到微信开放平台，系统将自动获取并更新用户的 UnionID，以实现跨应用账号统一。',
        '批量更新 UnionID',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );

      isUpdatingUnionIds.value = true;
      const res = await apiOfficial.batchUpdateUnionIds();

      if (res.data.success) {
        const { total, updated, skipped, failed } = res.data;
        const message = `更新完成！总计: ${total}，成功: ${updated}${
          skipped > 0 ? `，跳过: ${skipped}` : ''
        }${failed > 0 ? `，失败: ${failed}` : ''}`;
        ElMessage.success(message);
      } else {
        ElMessage.error('批量更新失败');
      }
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.message || '批量更新失败');
      }
    } finally {
      isUpdatingUnionIds.value = false;
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
          微信登录配置
        </div>
      </template>
      <HButton outline text @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
      <HButton
        outline
        text
        class="ml-3"
        :loading="isUpdatingUnionIds"
        :disabled="isUpdatingUnionIds"
        @click="handleBatchUpdateUnionIds"
      >
        <SvgIcon name="i-ri:refresh-line" />
        更新 UnionID
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="170px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启微信登录注册" prop="wechatRegisterStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用微信注册、则用户端则可以通过微信扫码方式注册或登录！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.wechatRegisterStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启微信静默" prop="wechatSilentLoginStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用静默登录、则用户在微信环境打开则直接自动登录！"
                placement="right"
              >
                <el-switch
                  v-model="formInline.wechatSilentLoginStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="公众号名称" prop="wechatOfficialName">
              <el-input
                v-model="formInline.wechatOfficialName"
                placeholder="公众号名称"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <!-- <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="Url" prop="wechatOfficialUrl">
              <el-input
                v-model="formInline.wechatOfficialUrl"
                placeholder="公众号自定义URL https://open.weixin.qq.com，默认无需填写"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row> -->
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AppId" prop="wechatOfficialAppId">
              <el-input
                v-model="formInline.wechatOfficialAppId"
                placeholder="公众号开发信息 AppId"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="Token" prop="wechatOfficialToken">
              <el-input
                v-model="formInline.wechatOfficialToken"
                placeholder="公众号Token配置"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AppSecret" prop="wechatOfficialAppSecret">
              <el-input
                v-model="formInline.wechatOfficialAppSecret"
                placeholder="公众号开发信息 AppSecret"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">第三方代理服务配置（可选）</el-divider>
        <el-alert title="使用说明" type="info" :closable="false" style="margin-bottom: 20px">
          <p style="margin: 0">
            如果您的服务器无法直接访问微信 API，或需要使用代理服务，可以在这里配置。
          </p>
          <p style="margin: 5px 0 0 0">
            留空则使用微信官方地址。支持配置内部网关或第三方代理服务。
          </p>
        </el-alert>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="微信开放平台 URL" prop="wechatOpenUrl">
              <el-input
                v-model="formInline.wechatOpenUrl"
                placeholder="默认: https://open.weixin.qq.com（用于网页授权）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="微信 API 基础 URL" prop="wechatApiUrl">
              <el-input
                v-model="formInline.wechatApiUrl"
                placeholder="默认: https://api.weixin.qq.com（用于所有 API 调用）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="Token 获取 URL" prop="wechatApiUrlToken">
              <el-input
                v-model="formInline.wechatApiUrlToken"
                placeholder="默认: https://api.weixin.qq.com/cgi-bin/token（可选）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="微信公众平台 URL" prop="wechatMpUrl">
              <el-input
                v-model="formInline.wechatMpUrl"
                placeholder="默认: https://mp.weixin.qq.com（用于二维码展示）"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">自动回复消息配置</el-divider>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="订阅公众号欢迎消息" prop="officialSubscribeText">
              <el-input
                v-model="formInline.officialSubscribeText"
                type="textarea"
                :rows="3"
                placeholder="订阅你的公众号后对他的欢迎语！"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绑定账号成功回复消息" prop="officialBindAccountText">
              <el-input
                v-model="formInline.officialBindAccountText"
                type="textarea"
                :rows="3"
                placeholder="非微信登录用户首次绑定微信成功时的欢迎语"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="绑定账号失败回复消息" prop="officialBindAccountFailText">
              <el-input
                v-model="formInline.officialBindAccountFailText"
                type="textarea"
                :rows="3"
                placeholder="绑定微信失败时的回复消息，如：该微信已被其他账号绑定"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="扫码登录回复消息" prop="officialScanLoginText">
              <el-input
                v-model="formInline.officialScanLoginText"
                type="textarea"
                :rows="3"
                placeholder="用户扫码登录成功时自动回复的内容"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="自定义回复的默认信息" prop="officialAutoReplyText">
              <el-input
                v-model="formInline.officialAutoReplyText"
                type="textarea"
                :rows="3"
                placeholder="当用户对公众号发了消息不在自动回复列表时回复的兜底内容"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
