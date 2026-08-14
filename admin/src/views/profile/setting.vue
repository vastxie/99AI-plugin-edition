<route lang="yaml">
name: personalSetting
meta:
  title: 个人设置
  cache: personal-edit.password
</route>

<script lang="ts" setup name="PersonalSetting">
  import useUserStore from '@/store/modules/user';
  import type { FormInstance } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';

  const router = useRouter();
  const userStore = useUserStore();

  // 获取当前用户昵称
  const currentNickname = computed(() => userStore.username);
  function editPassword() {
    router.push({
      name: 'personalEditPassword',
    });
  }

  async function editUsername() {
    try {
      const { value: newUsername } = await ElMessageBox.prompt('请输入新的用户名', '编辑用户名', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: currentNickname.value,
        inputValidator: (value) => {
          if (!value) {
            return '用户名不能为空';
          }
          if (value.length < 2) {
            return '用户名最少2个字符';
          }
          if (value.length > 20) {
            return '用户名最多20个字符';
          }
          return true;
        },
      });

      await userStore.updateProfile({ username: newUsername });
      ElMessage.success('用户名修改成功');
    } catch (error) {
      // 用户取消操作
    }
  }
</script>

<template>
  <div>
    <page-main>
      <el-tabs tab-position="left" style="height: 600px">
        <el-tab-pane label="安全设置" class="security">
          <h2>安全设置</h2>
          <div class="setting-list">
            <div class="item">
              <div class="content">
                <div class="title">用户名</div>
                <div class="desc">当前用户名：{{ currentNickname }}</div>
              </div>
              <div class="action">
                <el-button type="primary" text @click="editUsername"> 修改 </el-button>
              </div>
            </div>
            <div class="item">
              <div class="content">
                <div class="title">账户密码</div>
                <div class="desc">当前密码强度：强</div>
              </div>
              <div class="action">
                <el-button type="primary" text @click="editPassword"> 修改 </el-button>
              </div>
            </div>
            <!-- <div class="item">
              <div class="content">
                <div class="title">
                  密保手机
                </div>
                <div class="desc">
                  已绑定手机：187****3441
                </div>
              </div>
              <div class="action">
                <el-button type="primary" text>
                  修改
                </el-button>
              </div>
            </div>
            <div class="item">
              <div class="content">
                <div class="title">
                  备用邮箱
                </div>
                <div class="desc">
                  当前未绑定备用邮箱
                </div>
              </div>
              <div class="action">
                <el-button type="primary" text>
                  绑定
                </el-button>
              </div>
            </div> -->
          </div>
        </el-tab-pane>
      </el-tabs>
    </page-main>
  </div>
</template>

<style lang="scss" scoped>
  :deep(.el-tabs) {
    .el-tabs__header .el-tabs__nav {
      .el-tabs__active-bar {
        z-index: 0;
        width: 100%;
        background-color: var(--el-color-primary-light-9);
        border-right: 2px solid var(--el-color-primary);
        transition:
          transform 0.3s,
          background-color 0.3s,
          var(--el-transition-border);
      }

      .el-tabs__item {
        text-align: left;
        padding-right: 100px;
      }
    }

    .el-tab-pane {
      padding: 0 20px 0 30px;
    }
  }

  h2 {
    margin: 0;
    margin-bottom: 30px;
    font-weight: normal;
  }

  .basic {
    :deep(.headimg-upload) {
      text-align: center;

      .el-upload-dragger {
        border-radius: 50%;
      }
    }
  }

  .security {
    .setting-list {
      .item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
        transition: var(--el-transition-border);

        .content {
          .title {
            margin-bottom: 5px;
            color: var(--el-text-color-primary);
            transition: var(--el-transition-color);
          }

          .desc {
            font-size: 14px;
            color: var(--el-text-color-secondary);
            transition: var(--el-transition-color);
          }
        }

        &:last-child {
          border-bottom: 0;
        }
      }
    }
  }
</style>
