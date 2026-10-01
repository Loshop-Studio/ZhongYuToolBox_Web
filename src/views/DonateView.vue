<template>
  <div class="donate-page">
    <el-card class="block" header="支持作者">
      
      <div class="donate-amounts">
        <el-button
          v-for="p in presetAmounts"
          :key="p"
          :type="donatePrice === p ? 'primary' : 'default'"
          @click="donatePrice = p"
        >
          {{ p }} 元
        </el-button>
      </div>
      <el-input
        v-model.number="donatePrice"
        type="number"
        :min="1"
        class="donate-input"
        placeholder="自定义金额（元）"
      >
        <template #prepend>自定义金额</template>
        <template #append>元</template>
      </el-input>
      <el-button type="primary" class="donate-btn" @click="openDonate">立即捐赠</el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const IFDIAN_USER = 'efb6e4ca447811f0a5875254001e7c00'
const presetAmounts = [10, 50, 100, 200]
const donatePrice = ref(50)

function openDonate() {
  const price = String(donatePrice.value || 50)
  // 将当前账号信息编码进 remark，便于作者核对来源（与旧项目一致）
  const raw = encodeURIComponent(
    `${auth.realName || ''}|${auth.schoolCode || ''}|${auth.userId || ''}`
  )
  const remark = encodeURIComponent(
    btoa(raw)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '*')
  )
  const url = `https://www.ifdian.net/order/create?user_id=${IFDIAN_USER}&remark=${remark}&affiliate_code=&custom_price=${price}`
  window.open(url, '_blank')
}
</script>

<style scoped>
.donate-page {
  max-width: 880px;
  margin: 0 auto;
}
.block {
  margin-bottom: 16px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.donate-desc {
  margin-top: 0;
}
.donate-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.donate-input {
  max-width: 320px;
  margin-bottom: 12px;
}
.donate-btn {
  display: block;
}
@media (max-width: 767px) {
  .donate-page {
    padding: 0 4px;
  }
}
</style>
