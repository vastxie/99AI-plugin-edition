<route lang="yaml">
meta:
  title: 微信迁移配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    oldWechatOfficialAppId: '',
    oldWechatOfficialAppSecret: '',
    officialOldAccountSuccessText: '',
    officialOldAccountFailText: '',
    oldWechatMigrationStatus: '',
  });

  const rules = ref<FormRules>({
    oldWechatOfficialAppId: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写旧版微信公众号开发配置 AppId',
      },
    ],
    oldWechatOfficialAppSecret: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写旧版微信公众号开发配置 AppSecret',
      },
    ],
  });
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'oldWechatOfficialAppId',
        'oldWechatOfficialAppSecret',
        'officialOldAccountSuccessText',
        'officialOldAccountFailText',
        'oldWechatMigrationStatus',
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

  onMounted(() => {
    queryAllConfig();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          微信迁移配置
        </div>
      </template>
      <HButton outline text @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="170px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启账号迁移" prop="oldWechatMigrationStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="开启后，用户使用旧版微信账号登录时会尝试关联到新系统账号"
                placement="right"
              >
                <el-switch
                  v-model="formInline.oldWechatMigrationStatus"
                  active-value="1"
                  inactive-value="0"
                />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="旧版AppId" prop="oldWechatOfficialAppId">
              <el-input
                v-model="formInline.oldWechatOfficialAppId"
                placeholder="旧版公众号开发信息 AppId"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="旧版AppSecret" prop="oldWechatOfficialAppSecret">
              <el-input
                v-model="formInline.oldWechatOfficialAppSecret"
                placeholder="旧版公众号开发信息 AppSecret"
                clearable
                type="password"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="账号关联成功提示" prop="officialOldAccountSuccessText">
              <el-input
                v-model="formInline.officialOldAccountSuccessText"
                type="textarea"
                :rows="3"
                placeholder="旧账号关联成功后的提示文本"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="账号关联失败提示" prop="officialOldAccountFailText">
              <el-input
                v-model="formInline.officialOldAccountFailText"
                type="textarea"
                :rows="3"
                placeholder="旧账号关联失败后的提示文本"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
