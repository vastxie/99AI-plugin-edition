<route lang="yaml">
meta:
  title: MCP服务管理
</route>

<script lang="ts" setup>
  import ApiMCP from '@/api/modules/mcp';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

  const visible = ref(false);
  const loading = ref(false);
  const formMCPRef = ref<FormInstance>();
  const activeMCPId = ref(0);
  const formMCP = reactive({
    name: '',
    isActive: true,
    type: 1, // 新增字段：1=stdio, 2=sse
    command: 'npx',
    args: '',
    env: {} as Record<string, string>,
    envInput: '',
    url: '', // 新增字段
    headers: {} as Record<string, string>,
    headersInput: '',
  });

  const rules = reactive<FormRules>({
    name: [{ required: true, message: '请填写配置名称', trigger: 'blur' }],
    type: [{ required: true, message: '请选择类型', trigger: 'change' }],
    command: [
      {
        required: true,
        message: '请填写命令',
        trigger: 'blur',
        validator: (rule, value, callback) => {
          if (formMCP.type === 1 && !value) {
            callback(new Error('请填写命令'));
          } else {
            callback();
          }
        },
      },
    ],
    url: [
      {
        required: true,
        message: '请填写SSE连接URL',
        trigger: 'blur',
        validator: (rule, value, callback) => {
          if (formMCP.type === 2 && !value) {
            callback(new Error('请填写SSE连接URL'));
          } else {
            callback();
          }
        },
      },
    ],
    isActive: [{ required: true, message: '请选择是否启用', trigger: 'change' }],
  });

  interface ApiResponse {
    code: number;
    data: MCPConfig[];
    success: boolean;
    message?: string;
  }

  interface MCPConfig {
    id: number;
    name: string;
    isActive: boolean;
    type: number;
    command: string;
    args: string[];
    env: Record<string, string>;
    url: string;
    headers: Record<string, string>;
    connectionStatus: string;
    toolsCount: number;
    resourcesCount: number;
    promptsCount: number;
    lastConnectedAt: string;
    createdAt: string;
    updatedAt: string;
  }

  const tableData = ref<MCPConfig[]>([]);

  const dialogTitle = computed(() => {
    return activeMCPId.value ? '更新MCP配置' : '新增MCP配置';
  });

  const dialogButton = computed(() => {
    return activeMCPId.value ? '确认更新' : '确认新增';
  });

  const importVisible = ref(false);
  const importContent = ref('');
  const exportVisible = ref(false);
  const exportContent = ref('');
  const copySuccess = ref(false);

  async function queryMCPList() {
    try {
      loading.value = true;
      const res = await ApiMCP.queryMcpConfig({});

      const response = res as unknown as ApiResponse;
      if (response && response.code === 200 && response.success) {
        tableData.value = response.data;
      } else {
        console.error('数据获取失败:', response.message || '未知错误');
        ElMessage.error(response.message || '获取数据失败');
      }
    } catch (error: any) {
      console.error('查询出错:', error);
      ElMessage.error('获取数据失败');
    } finally {
      loading.value = false;
    }
  }

  function handleUpdateMCP(row: any) {
    activeMCPId.value = row.id;
    const { name, isActive, type, command, args, env, url, headers } = row;

    // 确保环境变量对象的正确解析
    let parsedEnv = {};
    try {
      if (typeof env === 'string') {
        parsedEnv = JSON.parse(env);
      } else if (env && typeof env === 'object') {
        parsedEnv = env;
      }
    } catch (error) {
      console.error('解析环境变量失败:', error);
      parsedEnv = {};
    }

    // 将环境变量对象转换为字符串格式
    const envString = Object.entries(parsedEnv)
      .map(([key, value]) => `${key} = ${value}`)
      .join('\n');

    nextTick(() => {
      Object.assign(formMCP, {
        name,
        isActive,
        type: type || 1,
        command,
        args: Array.isArray(args) ? args.join(' ') : args,
        env: parsedEnv,
        envInput: envString,
        url: url || '',
        headers: headers || {},
        // 直接使用原始 headers 字符串，不做任何转换
        headersInput:
          typeof headers === 'string' ? headers : JSON.stringify(headers || {}, null, 2),
      });
    });
    visible.value = true;
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeMCPId.value = 0;
    formEl?.resetFields();
  }

  async function handleDeleteMCP(row: any) {
    await ApiMCP.deleteMcpConfig(row.id);
    ElMessage.success('删除配置成功');
    queryMCPList();
  }

  function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        try {
          // 从formMCP创建一个新对象，只包含需要的属性
          const submitData: any = {
            name: formMCP.name,
            isActive: formMCP.isActive,
            type: formMCP.type,
          };

          if (formMCP.type === 1) {
            // Stdio类型
            // 将args转换为JSON数组字符串格式
            const argsArray = formMCP.args
              .trim()
              .split(/\s+/)
              .filter((arg) => arg !== '');
            const argsJson = JSON.stringify(argsArray);

            // 构建环境变量对象并转换为JSON字符串
            const envObject: Record<string, string> = {};
            if (formMCP.envInput) {
              const lines = formMCP.envInput.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                // 处理 KEY = VALUE 或 KEY=VALUE 格式
                const match =
                  trimmedLine.match(/^([^=]+)=\s*(.*)$/) ||
                  trimmedLine.match(/^([^=]+)\s+=\s*(.*)$/);
                if (match) {
                  const key = match[1].trim();
                  const value = match[2].trim();
                  if (key) {
                    envObject[key] = value;
                  }
                }
              }
            }
            const envJson = JSON.stringify(envObject);

            submitData.command = formMCP.command;
            submitData.args = argsJson;
            submitData.env = envJson;
          } else if (formMCP.type === 2) {
            // SSE类型
            submitData.url = formMCP.url;

            // 直接透传用户输入的 JSON 字符串，不做任何处理
            submitData.headers = formMCP.headersInput || '{}';
          }


          if (activeMCPId.value) {
            await ApiMCP.updateMcpConfig(activeMCPId.value, submitData);
            ElMessage({ type: 'success', message: '更新配置成功！' });
          } else {
            await ApiMCP.setMcpConfig(submitData);
            ElMessage({ type: 'success', message: '创建新的配置成功！' });
          }
          visible.value = false;
          queryMCPList();
        } catch (error) {
          console.error('提交失败:', error);
          ElMessage.error('提交失败，请检查数据格式');
        }
      }
    });
  }

  function handleEnvChange() {
    const env: Record<string, string> = {};
    const lines = formMCP.envInput.split('\n');

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // 修改正则表达式以适应 KEY = VALUE 和 KEY=VALUE 两种格式
      const match =
        trimmedLine.match(/^([^=]+)=\s*(.*)$/) || trimmedLine.match(/^([^=]+)\s+=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (key) {
          env[key] = value;
        }
      }
    });

    formMCP.env = env;
  }

  function handleRemoveEnv(key: string) {
    delete formMCP.env[key];
    // 更新输入框的内容
    const envString = Object.entries(formMCP.env)
      .map(([k, v]) => `${k} = ${v}`)
      .join('\n');
    formMCP.envInput = envString;
  }

  function handleBatchImport() {
    try {
      const data = JSON.parse(importContent.value);
      if (!data.mcpServers || typeof data.mcpServers !== 'object') {
        throw new Error('无效的导入格式，请确保包含 mcpServers 对象');
      }

      // 转换并导入配置
      const importPromises = Object.entries(data.mcpServers).map(
        async ([name, config]: [string, any]) => {
          try {
            // 基础配置
            const mcpConfig: any = {
              name,
              isActive: true,
            };

            // 判断是SSE还是Stdio类型
            if (config.url) {
              // SSE类型
              mcpConfig.type = 2;
              mcpConfig.url = config.url;

              // 处理headers
              let headersJson = '{}';
              if (typeof config.headers === 'object' && config.headers !== null) {
                headersJson = JSON.stringify(config.headers);
              } else if (typeof config.headers === 'string') {
                headersJson = config.headers.startsWith('{') ? config.headers : '{}';
              }
              mcpConfig.headers = headersJson;
            } else {
              // Stdio类型
              mcpConfig.type = 1;
              mcpConfig.command = config.command || '';

              // 确保args是JSON字符串
              let argsJson = '';
              if (Array.isArray(config.args)) {
                argsJson = JSON.stringify(config.args);
              } else if (typeof config.args === 'string') {
                // 如果已经是字符串，但不是JSON格式，则转换为JSON格式
                if (!config.args.startsWith('[')) {
                  const argsArray = config.args
                    .trim()
                    .split(/\s+/)
                    .filter((arg: string) => arg !== '');
                  argsJson = JSON.stringify(argsArray);
                } else {
                  argsJson = config.args;
                }
              }
              mcpConfig.args = argsJson;

              // 确保env是JSON字符串
              let envJson = '{}';
              if (typeof config.env === 'object' && config.env !== null) {
                envJson = JSON.stringify(config.env);
              } else if (typeof config.env === 'string') {
                // 如果已经是字符串但不是JSON格式，保持原样
                if (!config.env.startsWith('{')) {
                  envJson = '{}';
                } else {
                  envJson = config.env;
                }
              }
              mcpConfig.env = envJson;
            }

            await ApiMCP.setMcpConfig(mcpConfig);
            return name;
          } catch (error) {
            console.error(`导入 ${name} 失败:`, error);
            throw error;
          }
        },
      );

      Promise.all(importPromises)
        .then((names) => {
          ElMessage.success(`成功导入 ${names.length} 个配置`);
          importVisible.value = false;
          importContent.value = '';
          queryMCPList();
        })
        .catch((error) => {
          ElMessage.error('部分配置导入失败，请检查格式');
        });
    } catch (error) {
      console.error('导入失败:', error);
      ElMessage.error('导入失败，请检查JSON格式是否正确');
    }
  }

  function handleExport() {
    // 构建导出数据
    const exportData = {
      mcpServers: {} as Record<string, any>,
    };

    tableData.value.forEach((config) => {
      if (config.type === 2) {
        // SSE类型
        // 确保headers以对象形式导出，如果是字符串则解析为对象
        let headersObj = config.headers;
        if (typeof headersObj === 'string') {
          try {
            headersObj = JSON.parse(headersObj);
          } catch (e) {
            headersObj = {};
          }
        }

        exportData.mcpServers[config.name] = {
          url: config.url,
          headers: headersObj,
        };
      } else {
        // Stdio类型
        // 确保环境变量以对象形式导出，如果是字符串则解析为对象
        let envObj = config.env;
        if (typeof envObj === 'string') {
          try {
            envObj = JSON.parse(envObj);
          } catch (e) {
            envObj = {};
          }
        }

        exportData.mcpServers[config.name] = {
          command: config.command,
          args: config.args,
          env: envObj,
        };
      }
    });

    exportContent.value = JSON.stringify(exportData, null, 2);
    exportVisible.value = true;
  }

  function copyToClipboard() {
    navigator.clipboard
      .writeText(exportContent.value)
      .then(() => {
        copySuccess.value = true;
        setTimeout(() => {
          copySuccess.value = false;
        }, 2000);
      })
      .catch(() => {
        ElMessage.error('复制失败，请手动复制');
      });
  }

  watch(() => formMCP.envInput, handleEnvChange);

  onMounted(() => {
    queryMCPList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">
          MCP服务配置
        </div>
      </template>
      <div class="flex gap-2">
        <HButton outline @click="handleExport">
          <SvgIcon name="ic:baseline-download" />
          一键导出
        </HButton>
        <HButton outline @click="importVisible = true">
          <SvgIcon name="ic:baseline-upload" />
          批量导入
        </HButton>
        <HButton outline @click="visible = true">
          <SvgIcon name="ic:baseline-plus" />
          新增配置
        </HButton>
      </div>
    </PageHeader>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column prop="name" label="配置名称" />
        <el-table-column label="MCP类型" width="120">
          <template #default="scope">
            <el-tag
              :type="scope.row.type === 1 ? 'primary' : 'success'"
              size="small"
              effect="plain"
            >
              {{ scope.row.type === 1 ? 'Stdio' : 'HTTP' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="command" label="命令">
          <template #default="scope">
            {{ scope.row.type === 1 ? scope.row.command : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="参数" min-width="200">
          <template #default="scope">
            <template v-if="scope.row.type === 1">
              {{ Array.isArray(scope.row.args) ? scope.row.args.join(' ') : scope.row.args }}
            </template>
            <template v-else>-</template>
          </template>
        </el-table-column>
        <el-table-column label="环境变量" min-width="300">
          <template #default="scope">
            <template v-if="scope.row.type === 1">
              <div class="flex flex-wrap gap-2">
                <template v-if="typeof scope.row.env === 'string' && scope.row.env">
                  <template v-for="(value, key) in JSON.parse(scope.row.env)" :key="key">
                    <el-tag size="small" class="!px-2 !py-1">
                      <span class="font-medium">{{ key }}</span>
                      <span class="mx-1">=</span>
                      <span class="text-gray-600">{{ value }}</span>
                    </el-tag>
                  </template>
                </template>
                <template
                  v-else-if="typeof scope.row.env === 'object'"
                  v-for="(value, key) in scope.row.env"
                  :key="key"
                >
                  <el-tag size="small" class="!px-2 !py-1">
                    <span class="font-medium">{{ key }}</span>
                    <span class="mx-1">=</span>
                    <span class="text-gray-600">{{ value }}</span>
                  </el-tag>
                </template>
              </div>
            </template>
            <template v-else>-</template>
          </template>
        </el-table-column>
        <el-table-column label="SSE连接URL" min-width="300">
          <template #default="scope">
            <template v-if="scope.row.type === 2">
              <el-tag type="info" size="small" effect="plain" class="break-all">
                {{ scope.row.url }}
              </el-tag>
            </template>
            <template v-else>-</template>
          </template>
        </el-table-column>
        <el-table-column label="请求头" min-width="300">
          <template #default="scope">
            <template v-if="scope.row.type === 2 && scope.row.headers">
              <!-- 直接显示原始 JSON 字符串，使用 code 标签保持格式 -->
              <code class="text-xs bg-gray-100 px-2 py-1 rounded break-all">{{
                scope.row.headers
              }}</code>
            </template>
            <template v-else>-</template>
          </template>
        </el-table-column>
        <el-table-column label="状态信息" min-width="300">
          <template #default="scope">
            <div class="flex flex-wrap gap-2">
              <el-tag :type="scope.row.isActive ? 'success' : 'danger'" size="small" effect="dark">
                {{ scope.row.isActive ? '启用' : '禁用' }}
              </el-tag>
              <el-tag
                :type="scope.row.connectionStatus === 'connected' ? 'success' : 'danger'"
                size="small"
                effect="dark"
              >
                {{ scope.row.connectionStatus === 'connected' ? '已连接' : '未连接' }}
              </el-tag>
              <el-tag type="primary" size="small" effect="plain">
                工具: {{ scope.row.toolsCount }}
              </el-tag>
              <el-tag type="warning" size="small" effect="plain">
                资源: {{ scope.row.resourcesCount }}
              </el-tag>
              <el-tag type="info" size="small" effect="plain">
                提示: {{ scope.row.promptsCount }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleUpdateMCP(scope.row)">
              编辑
            </el-button>
            <el-popconfirm
              title="确认删除此配置么?"
              width="200"
              icon-color="red"
              @confirm="handleDeleteMCP(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除配置 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="570"
      @close="handlerCloseDialog(formMCPRef)"
    >
      <el-form
        ref="formMCPRef"
        label-position="right"
        label-width="100px"
        :model="formMCP"
        :rules="rules"
      >
        <el-form-item label="配置名称" prop="name">
          <el-input v-model="formMCP.name" placeholder="请填写配置名称" />
        </el-form-item>
        <el-form-item label="启用状态" prop="isActive">
          <el-switch v-model="formMCP.isActive" :active-value="true" :inactive-value="false" />
        </el-form-item>
        <el-form-item label="MCP类型" prop="type">
          <el-radio-group v-model="formMCP.type">
            <el-radio :label="1">Stdio</el-radio>
            <el-radio :label="2">HTTP</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- Stdio类型表单项 -->
        <template v-if="formMCP.type === 1">
          <el-form-item label="命令" prop="command">
            <el-input v-model="formMCP.command" placeholder="请填写命令" />
          </el-form-item>
          <el-form-item label="参数" prop="args">
            <el-input
              v-model="formMCP.args"
              type="textarea"
              :rows="3"
              placeholder="请填写参数，多个参数用空格分隔"
            />
          </el-form-item>
          <el-form-item label="环境变量">
            <el-input
              v-model="formMCP.envInput"
              type="textarea"
              :rows="3"
              placeholder="请输入环境变量，例如：
GITHUB_PERSONAL_ACCESS_TOKEN = your-token
OTHER_ENV = other-value"
            />
          </el-form-item>
        </template>
        <!-- HTTP类型表单项 -->
        <template v-else>
          <el-form-item label="HTTP URL" prop="url">
            <el-input
              v-model="formMCP.url"
              placeholder="请填写HTTP URL，例如：https://open.bigmodel.cn/api/mcp/web_search_prime/mcp"
              type="textarea"
              :rows="3"
            />
          </el-form-item>
          <el-form-item label="请求头">
            <el-input
              v-model="formMCP.headersInput"
              type="textarea"
              :rows="5"
              placeholder='请输入JSON格式的HTTP请求头，例如：
{
  "Authorization": "Bearer your_api_key",
  "Content-Type": "application/json"
}'
            />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <span class="mr-5 flex justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formMCPRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="批量导入MCP配置" width="600">
      <el-form>
        <el-form-item>
          <el-input
            v-model="importContent"
            type="textarea"
            :rows="10"
            placeholder='请输入JSON格式的配置数据，例如：
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    },
    "web-search-prime": {
      "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer your_api_key"
      }
    }
  }
}'
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="flex justify-end gap-2">
          <el-button @click="importVisible = false">取消</el-button>
          <el-button type="primary" @click="handleBatchImport"> 确认导入 </el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="exportVisible" title="导出MCP配置" width="600">
      <el-form>
        <el-form-item>
          <el-input v-model="exportContent" type="textarea" :rows="10" readonly />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="flex justify-end gap-2">
          <el-button @click="exportVisible = false">关闭</el-button>
          <el-button type="primary" @click="copyToClipboard">
            {{ copySuccess ? '复制成功' : '复制' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>
