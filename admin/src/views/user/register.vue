<route lang="yaml">
meta:
  title: 用户配置
</route>

<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formInline = reactive({
    registerSendStatus: '',
    registerSendModel3Count: '',
    registerSendModel4Count: '',
    registerSendDrawMjCount: '',
    firstRegisterSendStatus: 0,
    firstRegisterSendRank: '',
    firstRegisterSendModel3Count: '',
    firstRegisterSendModel4Count: '',
    firstRegisterSendDrawMjCount: '',
    signInStatus: '',
    signInModel3Count: '',
    signInModel4Count: '',
    signInMjDrawToken: '',
    visitorModel3Num: '',
    visitorModel4Num: '',
    visitorMJNum: '',
    maxDevices: '', // 最大设备登录数限制
  });

  // 访客功能开关（不参与保存）
  const visitorEnabled = ref(false);

  const rules = ref<FormRules>({
    visitorModel3Num: [
      {
        required: true,
        trigger: 'blur',
        message: '请填写每日限制的基础模型积分',
      },
    ],
    visitorModel4Num: [
      {
        required: true,
        trigger: 'blur',
        message: '请填写每日限制的高级模型积分',
      },
    ],
    visitorMJNum: [
      {
        required: true,
        trigger: 'blur',
        message: '请填写每日限制的绘画额度积分',
      },
    ],
    signInStatus: [{ required: true, trigger: 'blur', message: '请选择是否开启签到奖励' }],
    registerSendStatus: [{ required: true, trigger: 'change', message: '请确认是否开启注册赠送' }],
    firstRegisterSendStatus: [
      {
        required: true,
        trigger: 'change',
        message: '请确认是否开启优先注册赠送',
      },
    ],
  });
  const formRef = ref<FormInstance>();
  async function queryAllConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'visitorModel4Num',
        'visitorModel3Num',
        'visitorMJNum',
        'registerSendStatus',
        'registerSendModel3Count',
        'registerSendModel4Count',
        'registerSendDrawMjCount',
        'firstRegisterSendStatus',
        'firstRegisterSendRank',
        'firstRegisterSendModel3Count',
        'firstRegisterSendModel4Count',
        'firstRegisterSendDrawMjCount',
        'signInModel3Count',
        'signInModel4Count',
        'signInMjDrawToken',
        'signInStatus',
        'maxDevices',
      ],
    });
    res.data.firstRegisterSendStatus &&
      (res.data.firstRegisterSendStatus = Number(res.data.firstRegisterSendStatus));
    res.data.registerSendStatus &&
      (res.data.registerSendStatus = Number(res.data.registerSendStatus));

    Object.assign(formInline, res.data);

    // 根据访客额度参数设置开关状态
    const hasVisitorQuota =
      Number(formInline.visitorModel3Num) > 0 ||
      Number(formInline.visitorModel4Num) > 0 ||
      Number(formInline.visitorMJNum) > 0;
    visitorEnabled.value = hasVisitorQuota;
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

  const firstSendRules = computed(() => {
    return [
      {
        required: Number(formInline.firstRegisterSendStatus) === 1,
        message: '开启优先注册赠送选项后需填写此项',
        trigger: 'change',
      },
    ];
  });
  const registerSendRules = computed(() => {
    return [
      {
        required: Number(formInline.registerSendStatus) === 1,
        message: '开启注册赠送选项后需填写此项',
        trigger: 'change',
      },
    ];
  });
  const signInRules = computed(() => [
    {
      required: Number(formInline.signInStatus) === 1,
      message: '开启签到奖励后需填写此项',
      trigger: 'blur',
    },
  ]);

  // 处理访客功能开关变化
  function handleVisitorToggle(enabled: string | number | boolean) {
    if (enabled) {
      // 开启访客功能时，将所有访客额度设为1
      formInline.visitorModel3Num = '1';
      formInline.visitorModel4Num = '1';
      formInline.visitorMJNum = '1';
    } else {
      // 关闭访客功能时，将所有访客额度设为0
      formInline.visitorModel3Num = '0';
      formInline.visitorModel4Num = '0';
      formInline.visitorMJNum = '0';
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
          用户配置
        </div>
      </template>
      <HButton outline text @click="handlerUpdateConfig">
        <SvgIcon name="i-ri:file-text-line" />
        保存设置
      </HButton>
    </PageHeader>
    <el-card style="margin: 20px">
      <el-form ref="formRef" :rules="rules" :model="formInline" label-width="220px">
        <h5>注册赠送</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="是否开启注册赠送" prop="registerSendStatus">
              <el-switch
                v-model="formInline.registerSendStatus"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="注册赠送基础模型对话额度" prop="registerSendModel3Count" :rules="registerSendRules">
              <el-input
                v-model="formInline.registerSendModel3Count"
                placeholder="首次注册赠基础模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="注册赠送高级模型对话额度" prop="registerSendModel4Count" :rules="registerSendRules">
              <el-input
                v-model="formInline.registerSendModel4Count"
                placeholder="首次注册赠高级模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="注册赠送绘画额度" prop="registerSendDrawMjCount" :rules="registerSendRules">
              <el-input
                v-model="formInline.registerSendDrawMjCount"
                placeholder="首次注册赠送MJ额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <!-- <el-divider />
        <h5>限定注册赠送</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启优先注册赠送" prop="firstRegisterSendStatus">
              <el-switch
                v-model="formInline.firstRegisterSendStatus"
                :active-value="1"
                :inactive-value="0"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="前多少名获得奖励" prop="firstRegisterSendRank">
              <el-input
                v-model="formInline.firstRegisterSendRank"
                placeholder="设置优先注册前N名可以获得奖励"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="优先赠基础模型送对话额度" prop="firstRegisterSendModel3Count">
              <el-input
                v-model="formInline.firstRegisterSendModel3Count"
                placeholder="优先注册用户额外赠送基础模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="优先赠高级模型送对话额度" prop="firstRegisterSendModel4Count">
              <el-input
                v-model="formInline.firstRegisterSendModel4Count"
                placeholder="优先注册用户额外赠送高级模型对话额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="优先赠送绘画额度" prop="firstRegisterSendDrawMjCount">
              <el-input
                v-model="formInline.firstRegisterSendDrawMjCount"
                placeholder="优先注册用户额外赠送MJ额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row> -->
        <el-divider />
        <h5>设备限制</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="最大登录设备数" prop="maxDevices">
              <el-input
                v-model="formInline.maxDevices"
                type="number"
                placeholder="默认为3个设备"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <h5>签到奖励</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启签到奖励" prop="signInStatus">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用签到奖励、则用户端则可以通过每日签到获取额度！"
                placement="right"
              >
                <el-switch v-model="formInline.signInStatus" active-value="1" inactive-value="0" />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送基础模型额度" prop="signInModel3Count" :rules="signInRules">
              <el-input
                v-model="formInline.signInModel3Count"
                type="number"
                placeholder="请填写签到赠送的基础模型额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送高级模型额度" prop="signInModel4Count" :rules="signInRules">
              <el-input
                v-model="formInline.signInModel4Count"
                type="number"
                placeholder="请填写签到赠送的高级模型额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="赠送绘画额度" prop="signInMjDrawToken" :rules="signInRules">
              <el-input
                v-model="formInline.signInMjDrawToken"
                type="number"
                placeholder="请填写签到赠送绘画额度"
                clearable
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider />
        <h5>访客设置</h5>
        <el-row>
          <el-col :xs="24" :md="20" :lg="15" :xl="12">
            <el-form-item label="开启访客功能">
              <el-tooltip
                class="box-item"
                effect="dark"
                content="如您启用访客功能，则未登录用户可以使用限定的额度体验平台功能！"
                placement="right"
              >
                <el-switch v-model="visitorEnabled" @change="handleVisitorToggle" />
              </el-tooltip>
            </el-form-item>
          </el-col>
        </el-row>
        <template v-if="visitorEnabled">
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="基础模型额度" prop="visitorModel3Num">
                <el-input
                  v-model="formInline.visitorModel3Num"
                  type="number"
                  placeholder="请填写每日限制基础模型积分"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="高级模型额度" prop="visitorModel4Num">
                <el-input
                  v-model="formInline.visitorModel4Num"
                  type="number"
                  placeholder="请填写每日限制的高级模型积分"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :xs="24" :md="20" :lg="15" :xl="12">
              <el-form-item label="绘画积分额度" prop="visitorMJNum">
                <el-input
                  v-model="formInline.visitorMJNum"
                  type="number"
                  placeholder="请填写每日限制的绘画额度积分"
                  clearable
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>
    </el-card>
  </div>
</template>

<style>
  .tips {
    font-size: 12px;
    color: #7a7474;
    margin-left: 14px;
  }
</style>
