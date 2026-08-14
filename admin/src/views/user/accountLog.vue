<route lang="yaml">
meta:
  title: 账户变更记录
</route>

<script lang="ts" setup>
  import ApiUser from '@/api/modules/user';
  import { RECHARGE_TYPE_MAP, ALL_ACCOUNT_TYPE_OPTIONS } from '@/constants/index';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance, FormRules } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const formRef = ref<FormInstance>();
  const total = ref(0);
  const loading = ref(false);

  const formInline = reactive({
    userId: '',
    rechargeType: '',
    packageId: '',
    page: 1,
    size: 15,
  });

  type RechargeType = keyof typeof RECHARGE_TYPE_MAP;

  interface BalanceInfo {
    drawMjCount: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    model4Count: number;
    useChats: number;
    usePaints: number;
    useTokens: number;
    userId: number;
    model3Count: number;
  }

  interface UserItem {
    avatar: string;
    email: string;
    id: number;
    inviteCode: string;
    lastLoginIp: string;
    role: string;
    sign: string;
    status: 1 | 2 | 3;
    username: string;
    createdAt: Date;
    updatedAt: Date;
    balanceInfo: BalanceInfo;
    nickname: string;
    rechargeType: number;
    model3Count: number;
    model4Count: number;
    drawMjCount: number;
    days: number;
    uid: string;
    extent: string;
    relatedId: number;
  }

  const rules = reactive<FormRules>({
    model3Count: [{ required: true, message: '请填写赠送基础模型额度', trigger: 'blur' }],
    model4Count: [{ required: true, message: '请填写赠送高级模型额度', trigger: 'blur' }],
    drawMjCount: [{ required: true, message: '请填写赠送绘画积分额度', trigger: 'blur' }],
  });

  const userList = ref();
  const tableData = ref<UserItem[]>([]);

  async function queryAllAccountLog() {
    try {
      loading.value = true;
      const res = await ApiUser.queryUserAccountLog(formInline);
      const { rows, count } = res.data;
      loading.value = false;
      total.value = count;
      tableData.value = rows;
    } catch (error) {
      loading.value = false;
    }
  }

  async function handlerSearchUser(val: string) {
    const res = await ApiUser.queryAllUser({ size: 30, keyword: val });
    userList.value = res.data.rows;
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryAllAccountLog();
  }

  // 格式化积分显示
  function formatCredit(row: UserItem) {
    if (row.model3Count > 0) return `基础模型: ${row.model3Count}`;
    if (row.model4Count > 0) return `高级模型: ${row.model4Count}`;
    if (row.drawMjCount > 0) return `绘画积分: ${row.drawMjCount}`;
    if (row.model3Count < 0) return `基础模型: ${row.model3Count}`;
    if (row.model4Count < 0) return `高级模型: ${row.model4Count}`;
    if (row.drawMjCount < 0) return `绘画积分: ${row.drawMjCount}`;
    return '0';
  }

  // 根据类型返回标签类型
  function getTagType(rechargeType: number) {
    // 1-9: 充值类型（绿色）
    // 10-14: 消费类型（红色）
    return rechargeType >= 10 ? 'danger' : 'success';
  }

  onMounted(() => queryAllAccountLog());
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          账户明细
        </div>
      </template>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="用户名称" prop="userId">
          <el-select
            v-model="formInline.userId"
            filterable
            clearable
            remote
            reserve-keyword
            placeholder="昵称|手机号|邮箱[模糊搜索]"
            remote-show-suffix
            :remote-method="handlerSearchUser"
            style="width: 200px"
          >
            <el-option
              v-for="item in userList"
              :key="item.id"
              :label="item.username"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="变更类型" prop="rechargeType">
          <el-select
            v-model="formInline.rechargeType"
            placeholder="请选择变更类型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in ALL_ACCOUNT_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryAllAccountLog"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column label="用户信息" width="200" fixed>
          <template #default="scope">
            <span
              >{{ scope.row.username
              }}{{ scope.row.nickname ? `（${scope.row.nickname}）` : '' }}</span
            >
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户ID" width="90" align="center" />
        <el-table-column label="记录ID" width="140" align="center">
          <template #default="scope">
            <el-link v-if="scope.row.relatedId || scope.row.uid" type="primary" :underline="false">
              {{ scope.row.relatedId || scope.row.uid }}
            </el-link>
            <span v-else class="text-gray-400">---</span>
          </template>
        </el-table-column>
        <el-table-column prop="rechargeType" label="变更类型" width="140" align="center">
          <template #default="scope">
            <el-tag :type="getTagType(scope.row?.rechargeType)">
              {{
                scope.row?.rechargeType
                  ? RECHARGE_TYPE_MAP[scope.row?.rechargeType as RechargeType]
                  : '---'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变更积分" width="150" align="center">
          <template #default="scope">
            <el-tag :type="getTagType(scope.row?.rechargeType)">
              {{ formatCredit(scope.row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="extent" label="变更说明" width="200" align="center">
          <template #default="scope">
            <span class="text-gray-600">{{ scope.row.extent || '---' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="变更时间" width="180" align="center" fixed="right">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[15, 30, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAllAccountLog"
          @current-change="queryAllAccountLog"
        />
      </el-row>
    </page-main>
  </div>
</template>
