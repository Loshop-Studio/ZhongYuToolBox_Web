<template>
  <div class="login-page">
    <el-card class="login-card" shadow="always">
      <template #header>
        <div class="card-title">{{ auth.isLoggedIn ? '你的账号' : '登录账号' }}</div>
      </template>

      <div v-if="!auth.isLoggedIn">
        <el-form label-position="top" autocomplete="on" @submit.prevent="onLogin">
          <el-form-item label="学校">
            <el-select v-model="schoolSelect" @change="onSchoolChange" style="width: 100%">
              <el-option label="省锡中" value="sxz" />
              <el-option label="其它学校" value="other" />
            </el-select>
          </el-form-item>

          <el-form-item v-if="schoolSelect === 'other'" label="学校代码">
            <el-input v-model="schoolCode" name="schoolCode" autocomplete="off" placeholder="输入学校代码" />
          </el-form-item>

          <el-form-item label="用户名">
            <el-input v-model="account" name="username" autocomplete="username" placeholder="输入用户名" autofocus />
          </el-form-item>

          <el-form-item label="密码">
            <el-input v-model="password" name="password" autocomplete="current-password" type="password" placeholder="输入密码" show-password @keyup.enter="onLogin" />
          </el-form-item>

          <el-button
            type="primary"
            style="width: 100%"
            :loading="loading"
            @click="onLogin"
          >
            {{ auth.token ? '重新登录' : '登录' }}
          </el-button>
        </el-form>

        <el-alert type="info" :closable="false" class="mt">
          <template #title>说明</template>
          本工具用于快捷查看中育账号资源，与中育智慧（无锡）数字技术有限公司及其关联公司无关。
          开发：Loshop。如遇问题请及时联系，QQ群：1067807011
        </el-alert>
      </div>

      <div v-else>
        <h2 class="welcome">
          <el-avatar :size="48" :src="auth.photo" />
          <span style="margin-left: 10px">{{ auth.userName }}</span>
        </h2>
        <el-button type="primary" plain style="width: 100%" @click="onLogout">注销</el-button>

        <el-alert type="info" :closable="false" class="mt">
          <template #title>说明</template>
          本工具用于快捷查看中育账号资源，与中育智慧（无锡）数字技术有限公司及其关联公司无关。
          开发：Loshop。如遇问题请及时联系，QQ群：1067807011
        </el-alert>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { blockState } from '@/stores/block'
import { IS_BROWSER, PLATFORM } from '@/config'
const router = useRouter()
const auth = useAuthStore()

const schoolSelect = ref('sxz')
const schoolCode = ref('')
const account = ref('')
const password = ref('')
const loading = ref(false)

function onSchoolChange() {
  if (schoolSelect.value !== 'other') schoolCode.value = ''
}

async function onLogin() {
  loading.value = true
  try {
    const info = await auth.login(account.value, password.value, schoolSelect.value, schoolCode.value)
    // 登录后若被风控/封禁拦截，不要进入应用，复位登录态（封禁界面会持续展示设备号/QQ群）
    if (blockState.active) {
      auth.logout()
      return
    }
    // 仅浏览器模式检测非学生账号（内嵌 App / Electron 不限制教师账号）
    if (IS_BROWSER && account.value[0] !== '2') {
      ElMessage.warning('你的账号为非学生账号，功能受限(没适配)，仅可查看随身答和下载应用')
    }
    ElMessage.success(`你好，${info.realName || auth.userName}`)
    router.push('/note')
  } catch (e: any) {
    ElMessage.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}

function onLogout() {
  auth.logout()
  ElMessage.info('已注销')
}

onMounted(() => {
  if (auth.isLoggedIn) auth.startRefresh()
})
</script>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 100%;
  max-width: 440px;
}
.card-title {
  font-size: 18px;
  font-weight: 600;
}
.welcome {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}
.mt {
  margin-top: 16px;
}
</style>
