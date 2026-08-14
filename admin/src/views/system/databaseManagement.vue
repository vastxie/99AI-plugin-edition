<route lang="yaml">
meta:
  title: 数据库管理
</route>

<script lang="ts" setup>
  import { Warning } from '@element-plus/icons-vue';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { onMounted, ref } from 'vue';
  import apiDatabase from '@/api/modules/database';

  interface UnusedTableInfo {
    tableName: string;
    tableRows: number;
    dataSize: string;
  }

  interface FailedTableInfo {
    tableName: string;
    reason: string;
  }

  const loading = ref(false);
  const unusedTables = ref<UnusedTableInfo[]>([]);
  const selectedTables = ref<string[]>([]);
  const isProduction =
    window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  // 获取未使用的表
  async function fetchUnusedTables() {
    try {
      loading.value = true;
      const res = await apiDatabase.detectUnused();
      // 处理嵌套的响应结构
      const unusedTablesData = res.data?.data?.unusedTables || res.data?.unusedTables || [];
      unusedTables.value = unusedTablesData;
      loading.value = false;
    } catch (error) {
      loading.value = false;
    }
  }

  // 刷新
  function handleRefresh() {
    fetchUnusedTables();
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (!unusedTables.value || unusedTables.value.length === 0) {
      return;
    }
    if (selectedTables.value.length === unusedTables.value.length) {
      selectedTables.value = [];
    } else {
      selectedTables.value = unusedTables.value.map((t) => t.tableName);
    }
  }

  // 删除选中的表
  async function handleDropTables() {
    if (selectedTables.value.length === 0) {
      ElMessage.warning('请先选择要删除的表');
      return;
    }

    const envLabel = isProduction ? '生产环境' : '开发环境';

    try {
      // 第一步：确认弹窗，显示环境信息
      await ElMessageBox.confirm(
        `[${envLabel}] 确定要删除 ${selectedTables.value.length} 个表吗? 此操作不可逆!`,
        '危险操作',
        {
          confirmButtonText: '继续',
          cancelButtonText: '取消',
          type: 'error',
        },
      );

      // 第二步：要求用户输入"确认删除"进行二次确认
      const { value } = await ElMessageBox.prompt(
        `请输入"确认删除"以确认删除 ${selectedTables.value.length} 个表（${envLabel}）`,
        '二次确认',
        {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          inputPattern: /^确认删除$/,
          inputErrorMessage: '请输入"确认删除"以确认操作',
          type: 'warning',
        },
      );

      if (value !== '确认删除') {
        return;
      }

      loading.value = true;
      const res = await apiDatabase.dropTables({ tableNames: selectedTables.value });
      // 处理嵌套的响应结构
      const resultData = res.data?.data || res.data;
      const { dropped, failed, denied } = resultData;
      loading.value = false;

      if (denied && denied.length > 0) {
        ElMessage.error(`以下核心表被保护，禁止删除: ${denied.join(', ')}`);
      }
      if (dropped.length > 0) {
        ElMessage.success(`成功删除 ${dropped.length} 个表`);
      }
      if (failed && failed.length > 0) {
        // 展示失败明细
        const failDetails: string[] = failed.map(
          (f: FailedTableInfo) => `${f.tableName} (${f.reason || '未知原因'})`,
        );
        ElMessageBox.alert(
          `以下 ${failed.length} 个表删除失败：\n\n${failDetails.join('\n')}`,
          '删除失败明细',
          {
            type: 'warning',
          },
        );
      }
      selectedTables.value = [];
      await fetchUnusedTables();
    } catch (error) {
      loading.value = false;
    }
  }

  onMounted(() => {
    fetchUnusedTables();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">数据库管理</div>
      </template>
      <HButton class="mr-2" outline @click="handleRefresh" :loading="loading">
        <SvgIcon name="i-ri:refresh-line" />
        刷新
      </HButton>
      <HButton
        outline
        type="danger"
        :disabled="selectedTables.length === 0"
        @click="handleDropTables"
      >
        <SvgIcon name="i-ri:delete-bin-line" />
        删除选中的表 ({{ selectedTables.length }})
      </HButton>
    </PageHeader>

    <el-card style="margin: 20px">
      <!-- 未使用的表列表 -->
      <div v-if="unusedTables.length > 0">
        <div
          style="
            margin-bottom: 15px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          <el-icon><Warning /></el-icon>
          未使用的表 ({{ unusedTables.length }})
        </div>

        <el-table
          v-loading="loading"
          :data="unusedTables"
          style="width: 100%"
          @selection-change="
            (selection: any) => (selectedTables = selection.map((s: any) => s.tableName))
          "
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="tableName" label="表名" min-width="200" />
          <el-table-column prop="tableRows" label="行数" width="120" align="right">
            <template #default="{ row }">
              {{ row.tableRows.toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column prop="dataSize" label="数据大小" width="120" align="right" />
        </el-table>
      </div>

      <el-empty v-else description="没有发现未使用的表" />
    </el-card>
  </div>
</template>

<style lang="scss" scoped></style>
