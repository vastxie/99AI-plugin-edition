<route lang="yaml">
meta:
  title: 白名单管理
</route>

<script lang="ts" setup>
  import apiBadWords from '@/api/modules/badWords';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';


  const tableLoading = ref(false);
  const saveLoading = ref(false);
  const tableData = ref([]);
  const total = ref(0);
  const visible = ref(false);
  const dialogTitle = ref('添加白名单');

  const formData = reactive({
    id: undefined,
    word: '',
    remark: '',
  });

  const queryForm = reactive({
    page: 1,
    size: 10,
    word: '',
  });

  const batchVisible = ref(false);
  const batchWords = ref('');

  function resetQuery() {
    queryForm.page = 1;
    queryForm.word = '';
    queryWhitelist();
  }

  async function queryWhitelist() {
    tableLoading.value = true;
    try {
      const res = await apiBadWords.queryWhitelist(queryForm);
      tableData.value = res.data.rows;
      total.value = res.data.count;
    } catch (error) {
      console.error('查询白名单失败:', error);
    } finally {
      tableLoading.value = false;
    }
  }

  function openDialog() {
    dialogTitle.value = '添加白名单';
    formData.id = undefined;
    formData.word = '';
    formData.remark = '';
    visible.value = true;
  }

  function openEdit(row: any) {
    dialogTitle.value = '编辑白名单';
    formData.id = row.id;
    formData.word = row.word;
    formData.remark = row.remark || '';
    visible.value = true;
  }

  async function saveWhitelist() {
    if (!formData.word || formData.word.trim().length === 0) {
      ElMessage.error('请输入白名单词语');
      return;
    }

    saveLoading.value = true;
    try {
      if (formData.id) {
        await apiBadWords.updateWhitelist({
          id: formData.id,
          word: formData.word,
          remark: formData.remark,
        });
        ElMessage.success('修改成功');
      } else {
        await apiBadWords.addWhitelist({
          word: formData.word,
          remark: formData.remark,
        });
        ElMessage.success('添加成功');
      }
      visible.value = false;
      queryWhitelist();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.message || '操作失败');
    } finally {
      saveLoading.value = false;
    }
  }

  async function deleteWhitelist(row: any) {
    try {
      await ElMessageBox.confirm(`确认删除白名单词语"${row.word}"吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      await apiBadWords.delWhitelist({ id: row.id });
      ElMessage.success('删除成功');
      queryWhitelist();
    } catch (error: any) {
      if (error !== 'cancel') {
        ElMessage.error(error.response?.data?.message || '删除失败');
      }
    }
  }

  function openBatchDialog() {
    batchWords.value = '';
    batchVisible.value = true;
  }

  async function handleBatchAdd() {
    if (!batchWords.value || batchWords.value.trim().length === 0) {
      ElMessage.error('请输入白名单词语');
      return;
    }

    saveLoading.value = true;
    try {
      const res = await apiBadWords.batchAddWhitelist({ words: batchWords.value });
      const { message, total, success, skipped } = res.data;
      ElMessage.success(`${message}，共${total}个，成功${success}个，跳过${skipped}个`);
      batchVisible.value = false;
      queryWhitelist();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.message || '批量添加失败');
    } finally {
      saveLoading.value = false;
    }
  }

  onMounted(() => {
    queryWhitelist();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          白名单管理
        </div>
      </template>
      <div class="flex gap-2">
        <HButton outline @click="openDialog">
          <SvgIcon name="i-ri:add-line" />
          添加词语
        </HButton>
        <HButton theme="primary" outline @click="openBatchDialog">
          <SvgIcon name="i-ri:file-list-3-line" />
          批量添加
        </HButton>
      </div>
    </PageHeader>

    <page-main v-loading="tableLoading">
      <!-- 搜索栏 -->
      <el-form :inline="true" :model="queryForm" class="search-form">
        <el-form-item label="词语">
          <el-input
            v-model="queryForm.word"
            placeholder="请输入词语"
            clearable
            @keyup.enter="queryWhitelist"
            @clear="queryWhitelist"
          />
        </el-form-item>
        <el-form-item>
          <HButton type="primary" @click="queryWhitelist">
            <SvgIcon name="i-ri:search-line" />
            搜索
          </HButton>
          <HButton @click="resetQuery">
            <SvgIcon name="i-ri:refresh-line" />
            重置
          </HButton>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="tableData" border stripe style="width: 100%; margin-top: 20px">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="word" label="白名单词语" min-width="200" />
        <el-table-column prop="remark" label="备注" min-width="200">
          <template #default="{ row }">
            {{ row.remark || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteWhitelist(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="queryForm.page"
        v-model:page-size="queryForm.size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: center"
        @change="queryWhitelist"
      />
    </page-main>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="visible" :title="dialogTitle" width="500px" :close-on-click-modal="false">
      <el-form :model="formData" label-width="100px">
        <el-form-item label="白名单词语" required>
          <el-input v-model="formData.word" placeholder="请输入白名单词语" clearable />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="formData.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveWhitelist"> 确定 </el-button>
      </template>
    </el-dialog>

    <!-- 批量添加对话框 -->
    <el-dialog
      v-model="batchVisible"
      title="批量添加白名单"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="白名单词语" required>
          <el-input
            v-model="batchWords"
            type="textarea"
            :rows="10"
            placeholder="请输入白名单词语，多个词语可用空格或换行分隔（单次最多添加10000个）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="handleBatchAdd"> 确定 </el-button>
      </template>
    </el-dialog>
  </div>
</template>
