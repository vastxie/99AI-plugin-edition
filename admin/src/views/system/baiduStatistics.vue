<route lang="yaml">
meta:
  title: 百度统计
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    baiduSiteId: '',
    baiduToken: '',
    baiduApiKey: '',
    baiduSecretKey: '',
    baiduRefreshToken: '',
  });
  const rules = ref<FormRules>({});
  const formRef = ref<FormInstance>();

  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'baiduSiteId',
        'baiduToken',
        'baiduApiKey',
        'baiduSecretKey',
        'baiduRefreshToken',
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
          统计设置
        </div>
      </template>
      <HButton outline @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="120px">
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="siteId" prop="baiduSiteId">
              <el-input
                v-model="formInline.baiduSiteId"
                placeholder="请填写百度site_id"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="ApiKey" prop="baiduApiKey">
              <el-input v-model="formInline.baiduApiKey" placeholder="请填写百度apiKey" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="SecretKey" prop="baiduSecretKey">
              <el-input
                v-model="formInline.baiduSecretKey"
                placeholder="请填写百度 secretKey"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="AccessToken" prop="baiduToken">
              <el-input
                v-model="formInline.baiduToken"
                placeholder="请填写百度 access_token"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="RefreshToken" prop="baiduRefreshToken">
              <el-input
                v-model="formInline.baiduRefreshToken"
                placeholder="请填写百度 refresh_token"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </el-card>
  </div>
</template>
